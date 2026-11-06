/**
 * 👁️ Dedicated Web Worker for Real-time Active Liveness & Blink Detection
 * Offloads 64x64 pixel luminance matrix analysis and eyelid delta math
 * from the browser main thread to a background Web Worker.
 *
 * Prevents UI jank, eliminates GPU readback micro-stutters, and saves battery.
 */

export type LivenessPhase = 'positioning' | 'ready' | 'blinking' | 'verified';

export interface LivenessWorkerResponse {
  action: 'UPDATE_STATUS' | 'VERIFIED';
  phase: LivenessPhase;
  prompt: string;
}

export interface FallbackResult {
  action: 'UPDATE_STATUS' | 'VERIFIED';
  phase: LivenessPhase;
  prompt: string;
  stableFrames: number;
  blinkStage: number;
}

const WORKER_CODE = `
let history = [];
let stableFrames = 0;
let blinkStage = 0; // 0 = waiting for blink, 1 = eye dip detected, 2 = eye reopened (completed)

self.onmessage = function(e) {
  const data = e.data;
  if (!data) return;

  if (data.type === 'RESET') {
    history = [];
    stableFrames = 0;
    blinkStage = 0;
    return;
  }

  if (data.type === 'PROCESS_FRAME') {
    const buffer = data.buffer;
    const width = data.width || 64;
    const height = data.height || 64;
    if (!buffer) return;

    const pixels = new Uint8ClampedArray(buffer);
    let totalLum = 0;
    let eyeLum = 0;
    let eyeCount = 0;
    let faceCount = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        totalLum += lum;
        faceCount++;

        if (y >= 18 && y <= 36 && x >= 14 && x <= 50) {
          eyeLum += lum;
          eyeCount++;
        }
      }
    }

    const avgFaceLum = totalLum / faceCount;
    const avgEyeLum = eyeLum / (eyeCount || 1);

    // Check brightness bounds
    if (avgFaceLum < 18 || avgFaceLum > 242) {
      self.postMessage({
        action: 'UPDATE_STATUS',
        phase: 'positioning',
        prompt: 'Center face in good lighting',
      });
      return;
    }

    history.push(avgEyeLum);
    if (history.length > 25) history.shift();

    if (history.length < 5) {
      self.postMessage({
        action: 'UPDATE_STATUS',
        phase: 'positioning',
        prompt: 'Hold steady in frame...',
      });
      return;
    }

    if (stableFrames < 4) {
      stableFrames++;
      self.postMessage({
        action: 'UPDATE_STATUS',
        phase: 'ready',
        prompt: '👁️ Please Blink Your Eyes Naturally',
      });
      return;
    }

    const baseline = history.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    const curr = history[history.length - 1];
    const deviation = Math.abs(curr - baseline);

    // Blink dynamic: eyelid closure creates a temporary luminance dip/shift of 3.0 to 38.0
    if (deviation >= 3.0 && deviation <= 38.0 && blinkStage === 0) {
      blinkStage = 1;
      self.postMessage({
        action: 'UPDATE_STATUS',
        phase: 'blinking',
        prompt: 'Blinking detected... Reopen eyes',
      });
    } else if (blinkStage === 1 && Math.abs(curr - baseline) < 2.5) {
      blinkStage = 2;
      self.postMessage({
        action: 'VERIFIED',
        phase: 'verified',
        prompt: '✅ Live Human Verified! Capturing...',
      });
    }
  }
};
`;

/**
 * Creates an inline Web Worker instance from a Blob URL.
 * Automatically falls back to null if Web Workers or Blobs are unsupported.
 */
export function createLivenessWorker(): Worker | null {
  if (typeof window === 'undefined' || typeof Worker === 'undefined' || typeof Blob === 'undefined') {
    return null;
  }
  try {
    const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    return worker;
  } catch (err) {
    console.warn('[Liveness] Web Worker initialization failed, defaulting to in-thread fallback:', err);
    return null;
  }
}

/**
 * Synchronous in-thread fallback for environments without Web Worker support (e.g. Vitest / Node / legacy WebViews).
 */
export function processLivenessFallback(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  history: number[],
  stableFrames: number,
  blinkStage: number
): FallbackResult {
  let totalLum = 0;
  let eyeLum = 0;
  let eyeCount = 0;
  let faceCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      totalLum += lum;
      faceCount++;

      if (y >= 18 && y <= 36 && x >= 14 && x <= 50) {
        eyeLum += lum;
        eyeCount++;
      }
    }
  }

  const avgFaceLum = totalLum / faceCount;
  const avgEyeLum = eyeLum / (eyeCount || 1);

  if (avgFaceLum < 18 || avgFaceLum > 242) {
    return {
      action: 'UPDATE_STATUS',
      phase: 'positioning',
      prompt: 'Center face in good lighting',
      stableFrames,
      blinkStage,
    };
  }

  history.push(avgEyeLum);
  if (history.length > 25) history.shift();

  if (history.length < 5) {
    return {
      action: 'UPDATE_STATUS',
      phase: 'positioning',
      prompt: 'Hold steady in frame...',
      stableFrames,
      blinkStage,
    };
  }

  if (stableFrames < 4) {
    return {
      action: 'UPDATE_STATUS',
      phase: 'ready',
      prompt: '👁️ Please Blink Your Eyes Naturally',
      stableFrames: stableFrames + 1,
      blinkStage,
    };
  }

  const baseline = history.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  const curr = history[history.length - 1];
  const deviation = Math.abs(curr - baseline);

  if (deviation >= 3.0 && deviation <= 38.0 && blinkStage === 0) {
    return {
      action: 'UPDATE_STATUS',
      phase: 'blinking',
      prompt: 'Blinking detected... Reopen eyes',
      stableFrames,
      blinkStage: 1,
    };
  } else if (blinkStage === 1 && Math.abs(curr - baseline) < 2.5) {
    return {
      action: 'VERIFIED',
      phase: 'verified',
      prompt: '✅ Live Human Verified! Capturing...',
      stableFrames,
      blinkStage: 2,
    };
  }

  return {
    action: 'UPDATE_STATUS',
    phase: blinkStage === 1 ? 'blinking' : 'ready',
    prompt: blinkStage === 1 ? 'Blinking detected... Reopen eyes' : '👁️ Please Blink Your Eyes Naturally',
    stableFrames,
    blinkStage,
  };
}
