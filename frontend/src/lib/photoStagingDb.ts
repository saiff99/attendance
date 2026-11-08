/**
 * Offline-First Classroom Photo Staging via IndexedDB (ADR-052)
 * 
 * Provides persistent client-side storage for queued classroom attendance photos.
 * Ensures zero data loss across page refreshes, mobile app switches, and
 * background browser tab evictions, with automatic offline queueing and
 * TTL draft cleanup.
 */

import type { QualityAssessment } from "./frameQuality";

export interface StoredStagedPhoto {
  id: string;
  sessionId: string;
  file: Blob;
  optimizedBlob?: Blob;
  name: string;
  type: string;
  size: number;
  timestamp: number;
  label: string;
  quality?: QualityAssessment;
  compressionStatus?: "ready" | "compressing" | "error";
  rawPurged?: boolean;
}

const DB_NAME = "MedAttendClassroomDB";
const DB_VERSION = 1;
const STORE_NAME = "staged_photos";

/**
 * Check if IndexedDB is available in the current environment
 */
export function isIndexedDBAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

/**
 * Open or initialize the classroom photo staging IndexedDB
 */
export function openStagingDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      return reject(new Error("IndexedDB is not available in this environment."));
    }

    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("sessionId", "sessionId", { unique: false });
          store.createIndex("timestamp", "timestamp", { unique: false });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error || new Error("Failed to open IndexedDB"));
      };

      request.onblocked = () => {
        console.warn("[photoStagingDb] Database upgrade blocked by another open tab.");
      };
    } catch (err) {
      reject(err);
    }
  });
}

export interface StagedPhotoUpdateOptions extends Partial<StoredStagedPhoto> {
  purgeRawBlob?: boolean;
}

/**
 * Save or update a staged photo in IndexedDB.
 * Safely converts File to Blob to prevent DataCloneError on mobile Safari.
 */
export async function saveStagedPhoto(photo: StoredStagedPhoto): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openStagingDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      // Ensure Blob storage for maximum cross-browser reliability
      let safeBlob = photo.file instanceof Blob ? photo.file : new Blob([photo.file], { type: photo.type });
      const safeOptimizedBlob = photo.optimizedBlob
        ? (photo.optimizedBlob instanceof Blob ? photo.optimizedBlob : new Blob([photo.optimizedBlob], { type: photo.type }))
        : undefined;
      let safeSize = photo.size;
      let rawPurged = photo.rawPurged || false;

      // If photo is already pre-optimized on initial save, store only the optimized blob (ADR-058)
      if (photo.compressionStatus === "ready" && safeOptimizedBlob) {
        safeBlob = safeOptimizedBlob;
        safeSize = safeOptimizedBlob.size;
        rawPurged = true;
      }

      const record: StoredStagedPhoto = {
        ...photo,
        file: safeBlob,
        optimizedBlob: safeOptimizedBlob,
        size: safeSize,
        rawPurged,
      };

      const request = store.put(record);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.warn("[photoStagingDb] Error putting staged photo:", request.error);
        reject(request.error);
      };

      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.warn("[photoStagingDb] saveStagedPhoto fallback:", err);
  }
}

/**
 * Update an existing staged photo's fields (e.g. when pre-compression completes)
 */
export async function updateStagedPhoto(
  id: string,
  updates: StagedPhotoUpdateOptions
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openStagingDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const existing = getReq.result as StoredStagedPhoto | undefined;
        if (!existing) {
          resolve();
          return;
        }

        let updatedFile = existing.file;
        let updatedSize = existing.size;
        let isRawPurged = existing.rawPurged || false;

        // Post-Optimization Memory & Storage Hygiene (ADR-058):
        // When pre-compression completes successfully and optimizedBlob is available,
        // purge the redundant large camera raw blob (8-12MB) by replacing existing.file
        // with the compact optimized blob (WebP / JPEG), reclaiming 85-90% client disk space.
        if (
          (updates.purgeRawBlob !== false && updates.compressionStatus === "ready") &&
          updates.optimizedBlob
        ) {
          const safeOptimized = updates.optimizedBlob instanceof Blob
            ? updates.optimizedBlob
            : new Blob([updates.optimizedBlob], { type: updates.type || existing.type });
          updatedFile = safeOptimized;
          updatedSize = safeOptimized.size;
          isRawPurged = true;
        }

        const merged: StoredStagedPhoto = {
          ...existing,
          ...updates,
          file: updatedFile,
          size: updatedSize,
          rawPurged: isRawPurged,
        };

        const putReq = store.put(merged);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };

      getReq.onerror = () => reject(getReq.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.warn("[photoStagingDb] updateStagedPhoto fallback:", err);
  }
}

/**
 * Retrieve all staged photos belonging to a specific lecture session
 */
export async function getStagedPhotosForSession(sessionId: string): Promise<StoredStagedPhoto[]> {
  if (!isIndexedDBAvailable() || !sessionId) return [];

  try {
    const db = await openStagingDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("sessionId");
      const request = index.getAll(sessionId);

      request.onsuccess = () => {
        const results = (request.result || []) as StoredStagedPhoto[];
        // Sort chronologically by capture timestamp
        results.sort((a, b) => a.timestamp - b.timestamp);
        resolve(results);
      };

      request.onerror = () => {
        console.warn("[photoStagingDb] Error reading staged photos:", request.error);
        reject(request.error);
      };

      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.warn("[photoStagingDb] getStagedPhotosForSession fallback:", err);
    return [];
  }
}

/**
 * Delete a single staged photo by its ID
 */
export async function deleteStagedPhoto(id: string): Promise<void> {
  if (!isIndexedDBAvailable() || !id) return;

  try {
    const db = await openStagingDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);

      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.warn("[photoStagingDb] deleteStagedPhoto fallback:", err);
  }
}

/**
 * Purge all staged photos for a session (e.g. after successful attendance upload)
 */
export async function clearStagedPhotosForSession(sessionId: string): Promise<number> {
  if (!isIndexedDBAvailable() || !sessionId) return 0;

  try {
    const db = await openStagingDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("sessionId");
      const request = index.getAllKeys(sessionId);

      request.onsuccess = () => {
        const keys = request.result || [];
        keys.forEach((key) => store.delete(key));
        resolve(keys.length);
      };

      request.onerror = () => reject(request.error);

      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.warn("[photoStagingDb] clearStagedPhotosForSession fallback:", err);
    return 0;
  }
}

/**
 * Housekeeping: Purge stale draft photos older than maxAgeHours (default: 24h)
 */
export async function cleanupStaleStagedPhotos(maxAgeHours: number = 24): Promise<number> {
  if (!isIndexedDBAvailable()) return 0;

  try {
    const db = await openStagingDb();
    const cutoffTimestamp = Date.now() - maxAgeHours * 60 * 60 * 1000;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("timestamp");
      const range = IDBKeyRange.upperBound(cutoffTimestamp);
      const request = index.openCursor(range);

      let purgedCount = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;
        if (cursor) {
          cursor.delete();
          purgedCount++;
          cursor.continue();
        } else {
          resolve(purgedCount);
        }
      };

      request.onerror = () => reject(request.error);

      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.warn("[photoStagingDb] cleanupStaleStagedPhotos fallback:", err);
    return 0;
  }
}
