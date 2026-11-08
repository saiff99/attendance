/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, @typescript-eslint/ban-ts-comment */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isIndexedDBAvailable,
  saveStagedPhoto,
  updateStagedPhoto,
  getStagedPhotosForSession,
  deleteStagedPhoto,
  clearStagedPhotosForSession,
  cleanupStaleStagedPhotos,
  StoredStagedPhoto,
} from "../photoStagingDb";

describe("Offline-First Classroom Photo Staging via IndexedDB (ADR-052)", () => {
  const originalIndexedDB = globalThis.indexedDB;

  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-ignore
    globalThis.indexedDB = originalIndexedDB;
  });

  describe("Environment Detection & Fallbacks", () => {
    it("reports availability safely based on window.indexedDB", () => {
      // In typical test environment without mock
      const initial = isIndexedDBAvailable();
      expect(typeof initial).toBe("boolean");
    });

    it("falls back gracefully when IndexedDB is not available without throwing", async () => {
      // @ts-ignore
      delete globalThis.indexedDB;
      expect(isIndexedDBAvailable()).toBe(false);

      const mockPhoto: StoredStagedPhoto = {
        id: "p1",
        sessionId: "s1",
        file: new Blob(["sample"], { type: "image/jpeg" }),
        name: "snap.jpg",
        type: "image/jpeg",
        size: 6,
        timestamp: Date.now(),
        label: "Photo 1",
      };

      // These operations should not throw even if indexedDB is absent
      await expect(saveStagedPhoto(mockPhoto)).resolves.not.toThrow();
      await expect(updateStagedPhoto("p1", { label: "Updated" })).resolves.not.toThrow();
      await expect(getStagedPhotosForSession("s1")).resolves.toEqual([]);
      await expect(deleteStagedPhoto("p1")).resolves.not.toThrow();
      await expect(clearStagedPhotosForSession("s1")).resolves.toBe(0);
      await expect(cleanupStaleStagedPhotos(24)).resolves.toBe(0);
    });
  });

  describe("In-Memory Mock IndexedDB Operations", () => {
    let mockStorage: Map<string, StoredStagedPhoto>;

    beforeEach(() => {
      mockStorage = new Map();

      // Lightweight mock IDB Database simulating real browser transactions
      const mockDb = {
        objectStoreNames: {
          contains: () => true,
        },
        createObjectStore: vi.fn(),
        transaction: (storeName: string, mode: string) => {
          const tx: any = {
            oncomplete: null,
            onerror: null,
            objectStore: () => ({
              put: (item: StoredStagedPhoto) => {
                mockStorage.set(item.id, { ...item });
                const req: any = { onsuccess: null, onerror: null };
                setTimeout(() => {
                  if (req.onsuccess) req.onsuccess({ target: req });
                  if (tx.oncomplete) tx.oncomplete();
                }, 0);
                return req;
              },
              get: (id: string) => {
                const item = mockStorage.get(id);
                const req: any = { result: item, onsuccess: null, onerror: null };
                setTimeout(() => {
                  if (req.onsuccess) req.onsuccess({ target: req });
                  if (tx.oncomplete) tx.oncomplete();
                }, 0);
                return req;
              },
              delete: (id: string) => {
                mockStorage.delete(id);
                const req: any = { onsuccess: null, onerror: null };
                setTimeout(() => {
                  if (req.onsuccess) req.onsuccess({ target: req });
                  if (tx.oncomplete) tx.oncomplete();
                }, 0);
                return req;
              },
              index: (indexName: string) => ({
                getAll: (val: string) => {
                  const matches = Array.from(mockStorage.values()).filter((item) => {
                    if (indexName === "sessionId") return item.sessionId === val;
                    return true;
                  });
                  const req: any = { result: matches, onsuccess: null, onerror: null };
                  setTimeout(() => {
                    if (req.onsuccess) req.onsuccess({ target: req });
                    if (tx.oncomplete) tx.oncomplete();
                  }, 0);
                  return req;
                },
                getAllKeys: (val: string) => {
                  const keys = Array.from(mockStorage.entries())
                    .filter(([_, item]) => item.sessionId === val)
                    .map(([k]) => k);
                  const req: any = { result: keys, onsuccess: null, onerror: null };
                  setTimeout(() => {
                    if (req.onsuccess) req.onsuccess({ target: req });
                    if (tx.oncomplete) tx.oncomplete();
                  }, 0);
                  return req;
                },
                openCursor: (range: any) => {
                  // Cursor mock for TTL cleanup
                  const items = Array.from(mockStorage.entries()).filter(([_, item]) => {
                    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
                    return item.timestamp < cutoff;
                  });

                  let index = 0;
                  const req: any = { onsuccess: null, onerror: null };

                  const advanceCursor = () => {
                    if (index < items.length) {
                      const [key, val] = items[index];
                      const cursor: any = {
                        key,
                        value: val,
                        delete: () => {
                          mockStorage.delete(key);
                        },
                        continue: () => {
                          index++;
                          advanceCursor();
                        },
                      };
                      req.result = cursor;
                    } else {
                      req.result = null;
                    }
                    if (req.onsuccess) req.onsuccess({ target: req });
                  };

                  setTimeout(() => {
                    advanceCursor();
                    if (tx.oncomplete) tx.oncomplete();
                  }, 0);

                  return req;
                },
              }),
            }),
          };
          return tx;
        },
        close: vi.fn(),
      };

      const mockOpenRequest: any = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        result: mockDb,
      };

      // @ts-ignore
      globalThis.indexedDB = {
        open: vi.fn().mockImplementation(() => {
          setTimeout(() => {
            if (mockOpenRequest.onsuccess) {
              mockOpenRequest.onsuccess({ target: mockOpenRequest });
            }
          }, 0);
          return mockOpenRequest;
        }),
      };
    });

    it("saves and retrieves staged classroom photos by sessionId chronologically", async () => {
      const photo1: StoredStagedPhoto = {
        id: "p1",
        sessionId: "session-abc",
        file: new Blob(["data1"], { type: "image/jpeg" }),
        name: "snap-1.jpg",
        type: "image/jpeg",
        size: 5,
        timestamp: 1000,
        label: "Photo 1",
      };

      const photo2: StoredStagedPhoto = {
        id: "p2",
        sessionId: "session-abc",
        file: new Blob(["data2"], { type: "image/jpeg" }),
        name: "snap-2.jpg",
        type: "image/jpeg",
        size: 5,
        timestamp: 2000,
        label: "Photo 2",
      };

      const otherSessionPhoto: StoredStagedPhoto = {
        id: "p3",
        sessionId: "session-other",
        file: new Blob(["data3"], { type: "image/jpeg" }),
        name: "snap-3.jpg",
        type: "image/jpeg",
        size: 5,
        timestamp: 1500,
        label: "Photo 1",
      };

      await saveStagedPhoto(photo2);
      await saveStagedPhoto(photo1);
      await saveStagedPhoto(otherSessionPhoto);

      const staged = await getStagedPhotosForSession("session-abc");
      expect(staged.length).toBe(2);
      // Verify chronological sorting (timestamp 1000 before 2000)
      expect(staged[0].id).toBe("p1");
      expect(staged[1].id).toBe("p2");
    });

    it("updates staged photo fields when background pre-compression completes", async () => {
      const initial: StoredStagedPhoto = {
        id: "p-comp",
        sessionId: "session-comp",
        file: new Blob(["original-uncompressed"], { type: "image/jpeg" }),
        name: "highres.jpg",
        type: "image/jpeg",
        size: 21,
        timestamp: Date.now(),
        label: "Photo 1",
        compressionStatus: "compressing",
      };

      await saveStagedPhoto(initial);

      const optimizedBlob = new Blob(["compressed"], { type: "image/jpeg" });
      await updateStagedPhoto("p-comp", {
        optimizedBlob,
        compressionStatus: "ready",
      });

      const staged = await getStagedPhotosForSession("session-comp");
      expect(staged.length).toBe(1);
      expect(staged[0].compressionStatus).toBe("ready");
      expect(staged[0].optimizedBlob).toBeDefined();
    });

    it("deletes a single staged photo when removed by user", async () => {
      const photo: StoredStagedPhoto = {
        id: "p-del",
        sessionId: "session-del",
        file: new Blob(["test"], { type: "image/jpeg" }),
        name: "test.jpg",
        type: "image/jpeg",
        size: 4,
        timestamp: Date.now(),
        label: "Photo 1",
      };

      await saveStagedPhoto(photo);
      let staged = await getStagedPhotosForSession("session-del");
      expect(staged.length).toBe(1);

      await deleteStagedPhoto("p-del");
      staged = await getStagedPhotosForSession("session-del");
      expect(staged.length).toBe(0);
    });

    it("clears all staged photos for a session after attendance processing", async () => {
      await saveStagedPhoto({
        id: "p1",
        sessionId: "session-clear",
        file: new Blob(["1"], { type: "image/jpeg" }),
        name: "1.jpg",
        type: "image/jpeg",
        size: 1,
        timestamp: 100,
        label: "Photo 1",
      });
      await saveStagedPhoto({
        id: "p2",
        sessionId: "session-clear",
        file: new Blob(["2"], { type: "image/jpeg" }),
        name: "2.jpg",
        type: "image/jpeg",
        size: 1,
        timestamp: 200,
        label: "Photo 2",
      });

      const deletedCount = await clearStagedPhotosForSession("session-clear");
      expect(deletedCount).toBe(2);

      const staged = await getStagedPhotosForSession("session-clear");
      expect(staged.length).toBe(0);
    });

    it("purges stale drafts older than 24 hours during housekeeping cleanup", async () => {
      const staleTimestamp = Date.now() - 30 * 60 * 60 * 1000; // 30 hours ago
      const recentTimestamp = Date.now() - 10 * 60 * 1000; // 10 minutes ago

      // Mock IDBKeyRange if not present in test environment
      if (typeof globalThis.IDBKeyRange === "undefined") {
        // @ts-ignore
        globalThis.IDBKeyRange = {
          upperBound: (v: any) => ({ upperBound: v } as any as IDBKeyRange),
        };
      }

      await saveStagedPhoto({
        id: "stale-photo",
        sessionId: "old-session",
        file: new Blob(["old"], { type: "image/jpeg" }),
        name: "old.jpg",
        type: "image/jpeg",
        size: 3,
        timestamp: staleTimestamp,
        label: "Photo 1",
      });

      await saveStagedPhoto({
        id: "fresh-photo",
        sessionId: "new-session",
        file: new Blob(["fresh"], { type: "image/jpeg" }),
        name: "fresh.jpg",
        type: "image/jpeg",
        size: 5,
        timestamp: recentTimestamp,
        label: "Photo 1",
      });

      const purgedCount = await cleanupStaleStagedPhotos(24);
      expect(purgedCount).toBe(1);

      const staleResult = await getStagedPhotosForSession("old-session");
      expect(staleResult.length).toBe(0);

      const freshResult = await getStagedPhotosForSession("new-session");
      expect(freshResult.length).toBe(1);
    });
  });
});
