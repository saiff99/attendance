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
  lockedBaseline: number;
  blinkFramesInStage: number;
}

const WORKER_CODE = `
let history = [];
let stableFrames = 0;
let blinkStage = 0; // 0 = waiting for blink, 1 = eye dip detected, 2 = eye reopened (completed)
let lockedBaseline = 0;
let blinkFramesInStage = 0;

self.onmessage = function(e) {
  const data = e.data;
  if (!data) return;

  if (data.type === 'RESET') {
    history = [];
    stableFrames = 0;
    blinkStage = 0;
    lockedBaseline = 0;
    blinkFramesInStage = 0;
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

    const curr = history[history.length - 1];

    if (blinkStage === 0) {
      // Rolling pre-blink baseline from the 5 preceding frames
      const preceding = history.slice(-6, -1);
      const baseline = preceding.reduce((a, b) => a + b, 0) / Math.max(1, preceding.length);
      const deviation = Math.abs(curr - baseline);

      // Eyelid closure causes temporary luminance dip (deviation >= 2.8 units)
      if (deviation >= 2.8 && deviation <= 45.0) {
        blinkStage = 1;
        lockedBaseline = baseline;
        blinkFramesInStage = 0;
        self.postMessage({
          action: 'UPDATE_STATUS',
          phase: 'blinking',
          prompt: 'Blinking detected... Reopen eyes',
        });
      }
    } else if (blinkStage === 1) {
      blinkFramesInStage++;

      // Eyelid reopening check: luminance returns near locked pre-blink baseline
      const diffFromBaseline = Math.abs(curr - lockedBaseline);
      const tolerance = Math.max(4.5, lockedBaseline * 0.08);

      if (diffFromBaseline <= tolerance && blinkFramesInStage >= 1) {
        blinkStage = 2;
        self.postMessage({
          action: 'VERIFIED',
          phase: 'verified',
          prompt: '✅ Live Human Verified! Capturing...',
        });
      } else if (blinkFramesInStage > 14) {
        // TIMEOUT SAFEGUARD: If eyes are not verified within ~1s (14 frames @ 75ms),
        // gracefully reset back to ready so the user never gets stuck!
        blinkStage = 0;
        blinkFramesInStage = 0;
        self.postMessage({
          action: 'UPDATE_STATUS',
          phase: 'ready',
          prompt: '👁️ Please Blink Your Eyes Naturally',
        });
      }
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
  blinkStage: number,
  lockedBaseline: number = 0,
  blinkFramesInStage: number = 0
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
      lockedBaseline,
      blinkFramesInStage,
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
      lockedBaseline,
      blinkFramesInStage,
    };
  }

  if (stableFrames < 4) {
    return {
      action: 'UPDATE_STATUS',
      phase: 'ready',
      prompt: '👁️ Please Blink Your Eyes Naturally',
      stableFrames: stableFrames + 1,
      blinkStage,
      lockedBaseline,
      blinkFramesInStage,
    };
  }

  const curr = history[history.length - 1];

  if (blinkStage === 0) {
    const preceding = history.slice(-6, -1);
    const baseline = preceding.reduce((a, b) => a + b, 0) / Math.max(1, preceding.length);
    const deviation = Math.abs(curr - baseline);

    if (deviation >= 2.8 && deviation <= 45.0) {
      return {
        action: 'UPDATE_STATUS',
        phase: 'blinking',
        prompt: 'Blinking detected... Reopen eyes',
        stableFrames,
        blinkStage: 1,
        lockedBaseline: baseline,
        blinkFramesInStage: 0,
      };
    }
  } else if (blinkStage === 1) {
    const nextFrames = blinkFramesInStage + 1;
    const diffFromBaseline = Math.abs(curr - lockedBaseline);
    const tolerance = Math.max(4.5, lockedBaseline * 0.08);

    if (diffFromBaseline <= tolerance && nextFrames >= 1) {
      return {
        action: 'VERIFIED',
        phase: 'verified',
        prompt: '✅ Live Human Verified! Capturing...',
        stableFrames,
        blinkStage: 2,
        lockedBaseline,
        blinkFramesInStage: nextFrames,
      };
    } else if (nextFrames > 14) {
      // Timeout reset to ready
      return {
        action: 'UPDATE_STATUS',
        phase: 'ready',
        prompt: '👁️ Please Blink Your Eyes Naturally',
        stableFrames,
        blinkStage: 0,
        lockedBaseline: 0,
        blinkFramesInStage: 0,
      };
    } else {
      return {
        action: 'UPDATE_STATUS',
        phase: 'blinking',
        prompt: 'Blinking detected... Reopen eyes',
        stableFrames,
        blinkStage: 1,
        lockedBaseline,
        blinkFramesInStage: nextFrames,
      };
    }
  }

  return {
    action: 'UPDATE_STATUS',
    phase: 'ready',
    prompt: '👁️ Please Blink Your Eyes Naturally',
    stableFrames,
    blinkStage: 0,
    lockedBaseline,
    blinkFramesInStage,
  };
}

