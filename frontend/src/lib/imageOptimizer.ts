/**
 * Image Optimization Utilities for Classroom Batch Attendance
 * 
 * Automatically scales down and compresses high-resolution smartphone/camera photos
 * (12MP - 48MP) using a dedicated background Web Worker via OffscreenCanvas and
 * createImageBitmap to prevent main UI thread blocking, stutter, and frame drops.
 * 
 * Architectural Highlights:
 * 1. Zero UI Freezes: Heavy canvas pixel manipulation runs off-thread in a dedicated Web Worker.
 * 2. Prevents Vercel 4.5MB Limits: Shrinks 10MB-15MB raw photos down to ~400KB-800KB before upload.
 * 3. Preserves Face Precision: Keeps 2560px max dimension, providing ~200-300px per face,
 *    far exceeding InsightFace ArcFace's 112x112 minimum input requirement for 99.8% precision.
 * 4. Resilient Fallback: Gracefully falls back to in-thread HTMLCanvasElement in environments
 *    without OffscreenCanvas or Web Worker support (e.g. older iOS Safari < 16.4, SSR, Vitest).
 */

export interface OptimizedPhotoResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
  wasCompressed: boolean;
}

const WORKER_CODE = `
self.onmessage = async function(e) {
  const data = e.data;
  if (!data || !data.id) return;
  const { id, fileOrBlob, maxDimension = 2560, quality = 0.88 } = data;

  try {
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
      throw new Error('OffscreenCanvas or createImageBitmap is not supported in Worker');
    }

    // Decode image bitmap off the main thread with EXIF orientation handling
    let bitmap;
    try {
      bitmap = await createImageBitmap(fileOrBlob, { imageOrientation: 'from-image' });
    } catch {
      bitmap = await createImageBitmap(fileOrBlob);
    }

    let width = bitmap.width;
    let height = bitmap.height;

    if (!width || !height) {
      if (bitmap && typeof bitmap.close === 'function') bitmap.close();
      throw new Error('Invalid bitmap dimensions');
    }

    let needsDownscale = false;
    if (width > maxDimension || height > maxDimension) {
      needsDownscale = true;
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    // If file is already small (< 500KB) and doesn't need downscaling, preserve as is
    if (!needsDownscale && fileOrBlob.size < 500 * 1024) {
      if (bitmap && typeof bitmap.close === 'function') bitmap.close();
      self.postMessage({
        id,
        success: true,
        blob: fileOrBlob,
        width,
        height,
        wasCompressed: false
      });
      return;
    }

    // OffscreenCanvas allocation and 2D downscaling
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      if (bitmap && typeof bitmap.close === 'function') bitmap.close();
      throw new Error('Failed to acquire 2d context on OffscreenCanvas');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);

    // Free GPU/RAM bitmap resources immediately
    if (typeof bitmap.close === 'function') {
      bitmap.close();
    }

    // Convert offscreen canvas to JPEG blob
    const compressedBlob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: quality || 0.88,
    });

    if (!compressedBlob) {
      throw new Error('OffscreenCanvas.convertToBlob produced empty blob');
    }

    self.postMessage({
      id,
      success: true,
      blob: compressedBlob,
      width,
      height,
      wasCompressed: true
    });
  } catch (err) {
    self.postMessage({
      id,
      success: false,
      error: err && err.message ? err.message : String(err)
    });
  }
};
`;

let optimizerWorker: Worker | null = null;
let workerFailed = false;
let workerBlobUrl: string | null = null;

interface WorkerTask {
  resolve: (res: { blob: Blob; width: number; height: number; wasCompressed: boolean }) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pendingTasks = new Map<string, WorkerTask>();

/**
 * Checks if the current environment supports background OffscreenCanvas Web Workers.
 */
export function isOffscreenWorkerSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof Worker !== "undefined" &&
    typeof Blob !== "undefined" &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap !== "undefined"
  );
}

/**
 * Returns a singleton background Web Worker instance for offloaded image compression.
 */
export function getOrCreateOptimizerWorker(): Worker | null {
  if (workerFailed || !isOffscreenWorkerSupported()) {
    return null;
  }

  if (optimizerWorker) {
    return optimizerWorker;
  }

  try {
    const blob = new Blob([WORKER_CODE], { type: "application/javascript" });
    workerBlobUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerBlobUrl);
    // Note: Do NOT revokeObjectURL synchronously here! Safari WebKit requires the blob URL to remain
    // valid during initial script compilation in the worker thread. Revoke on cleanup in resetOptimizerWorker.

    worker.onmessage = (e: MessageEvent) => {
      const { id, success, blob: resultBlob, width, height, wasCompressed, error } = e.data || {};
      if (!id) return;
      const task = pendingTasks.get(id);
      if (!task) return;

      clearTimeout(task.timer);
      pendingTasks.delete(id);

      if (success && resultBlob) {
        task.resolve({ blob: resultBlob, width, height, wasCompressed });
      } else {
        task.reject(new Error(error || "Worker image optimization failed"));
      }
    };

    worker.onerror = (errEvent) => {
      console.warn("[ImageOptimizerWorker] Worker error encountered:", errEvent);
      for (const [, task] of pendingTasks) {
        clearTimeout(task.timer);
        task.reject(new Error("Image optimizer worker encountered an error"));
      }
      pendingTasks.clear();
      try {
        worker.terminate();
      } catch {
        // Ignore termination error
      }
      optimizerWorker = null;
      workerFailed = true;
    };

    optimizerWorker = worker;
    return optimizerWorker;
  } catch (err) {
    console.warn("[ImageOptimizer] Failed to instantiate worker, falling back to in-thread:", err);
    workerFailed = true;
    return null;
  }
}

/**
 * Resets the worker singleton (useful for testing and memory cleanup).
 */
export function resetOptimizerWorker(): void {
  if (optimizerWorker) {
    try {
      optimizerWorker.terminate();
    } catch {
      // Ignore
    }
    optimizerWorker = null;
  }
  if (workerBlobUrl) {
    try {
      URL.revokeObjectURL(workerBlobUrl);
    } catch {
      // Ignore
    }
    workerBlobUrl = null;
  }
  for (const [, task] of pendingTasks) {
    clearTimeout(task.timer);
  }
  pendingTasks.clear();
  workerFailed = false;
}

/**
 * Sends an optimization job to the background Web Worker.
 */
function optimizeWithWorker(
  file: File,
  maxDimension: number,
  quality: number
): Promise<{ blob: Blob; width: number; height: number; wasCompressed: boolean }> {
  return new Promise((resolve, reject) => {
    const worker = getOrCreateOptimizerWorker();
    if (!worker) {
      return reject(new Error("Worker not available"));
    }

    const taskId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // 2-second timeout for background worker response before gracefully falling back
    const timer = setTimeout(() => {
      pendingTasks.delete(taskId);
      if (optimizerWorker) {
        try { optimizerWorker.terminate(); } catch {}
        optimizerWorker = null;
      }
      workerFailed = true;
      reject(new Error("Worker optimization timed out after 2000ms"));
    }, 2000);

    pendingTasks.set(taskId, { resolve, reject, timer });

    worker.postMessage({
      id: taskId,
      fileOrBlob: file,
      maxDimension,
      quality,
    });
  });
}

/**
 * In-thread fallback using standard HTMLCanvasElement for environments without
 * OffscreenCanvas or Web Worker support (e.g., older iOS Safari < 16.4 or Node/Vitest).
 */
export function fallbackOptimizeClassroomPhoto(
  file: File,
  maxDimension: number = 2560,
  quality: number = 0.88
): Promise<OptimizedPhotoResult> {
  const originalSize = file.size;

  if (typeof window === "undefined" || !file.type.startsWith("image/")) {
    return Promise.resolve({
      file,
      originalSize,
      compressedSize: originalSize,
      width: 0,
      height: 0,
      wasCompressed: false,
    });
  }

  return new Promise((resolve) => {
    let settled = false;
    const safeResolve = (res: OptimizedPhotoResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(safetyTimer);
      resolve(res);
    };

    // 2-second safety watchdog against frozen image decoding in sluggish or mock DOMs
    const safetyTimer = setTimeout(() => {
      console.warn("[ImageOptimizerFallback] Image decoding timed out, preserving original file");
      safeResolve({
        file,
        originalSize,
        compressedSize: originalSize,
        width: 0,
        height: 0,
        wasCompressed: false,
      });
    }, 2000);

    const reader = new FileReader();

    reader.onerror = () => {
      console.warn("[ImageOptimizerFallback] FileReader failed, falling back to original file");
      safeResolve({
        file,
        originalSize,
        compressedSize: originalSize,
        width: 0,
        height: 0,
        wasCompressed: false,
      });
    };

    reader.onload = () => {
      const img = new Image();

      img.onerror = () => {
        console.warn("[ImageOptimizerFallback] Image element failed to parse, falling back to original file");
        safeResolve({
          file,
          originalSize,
          compressedSize: originalSize,
          width: 0,
          height: 0,
          wasCompressed: false,
        });
      };

      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (!width || !height) {
          return safeResolve({
            file,
            originalSize,
            compressedSize: originalSize,
            width: 0,
            height: 0,
            wasCompressed: false,
          });
        }

        let needsDownscale = false;
        if (width > maxDimension || height > maxDimension) {
          needsDownscale = true;
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        if (!needsDownscale && originalSize < 500 * 1024) {
          return safeResolve({
            file,
            originalSize,
            compressedSize: originalSize,
            width,
            height,
            wasCompressed: false,
          });
        }

        try {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            return safeResolve({
              file,
              originalSize,
              compressedSize: originalSize,
              width,
              height,
              wasCompressed: false,
            });
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                return safeResolve({
                  file,
                  originalSize,
                  compressedSize: originalSize,
                  width,
                  height,
                  wasCompressed: false,
                });
              }

              const fileName = file.name.replace(/\.[^/.]+$/, "") + "_optimized.jpg";
              const optimizedFile = new File([blob], fileName, {
                type: "image/jpeg",
                lastModified: Date.now(),
              });

              safeResolve({
                file: optimizedFile,
                originalSize,
                compressedSize: optimizedFile.size,
                width,
                height,
                wasCompressed: true,
              });
            },
            "image/jpeg",
            quality
          );
        } catch (canvasErr) {
          console.warn("[ImageOptimizerFallback] Canvas processing failed, falling back:", canvasErr);
          safeResolve({
            file,
            originalSize,
            compressedSize: originalSize,
            width,
            height,
            wasCompressed: false,
          });
        }
      };

      img.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Main entrance: Downscales and compresses classroom photos before upload.
 * Attempts background execution in a Web Worker first; seamlessly falls back
 * to in-thread HTMLCanvasElement if workers or OffscreenCanvas are unsupported.
 */
export async function optimizeClassroomPhoto(
  file: File,
  maxDimension: number = 2560,
  quality: number = 0.88
): Promise<OptimizedPhotoResult> {
  const originalSize = file.size;

  // Pass-through for non-browser / non-image files
  if (typeof window === "undefined" || !file.type.startsWith("image/")) {
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      width: 0,
      height: 0,
      wasCompressed: false,
    };
  }

  // Fast-Path: If file is already compact (<= 600KB), it's well below Vercel's 4.5MB limit
  // and does not require costly re-encoding cycles.
  if (file.size <= 600 * 1024) {
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      width: 0,
      height: 0,
      wasCompressed: false,
    };
  }

  // 1. Try background Web Worker with OffscreenCanvas
  if (isOffscreenWorkerSupported()) {
    try {
      const result = await optimizeWithWorker(file, maxDimension, quality);
      let optimizedFile: File;
      if (result.wasCompressed) {
        const fileName = file.name.replace(/\.[^/.]+$/, "") + "_optimized.jpg";
        optimizedFile = new File([result.blob], fileName, {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
      } else {
        optimizedFile = file;
      }

      return {
        file: optimizedFile,
        originalSize,
        compressedSize: optimizedFile.size,
        width: result.width,
        height: result.height,
        wasCompressed: result.wasCompressed,
      };
    } catch (workerErr) {
      console.warn("[ImageOptimizer] Background worker failed, falling back to in-thread canvas:", workerErr);
    }
  }

  // 2. Fallback to in-thread canvas if Web Worker is unavailable or errored
  return fallbackOptimizeClassroomPhoto(file, maxDimension, quality);
}
