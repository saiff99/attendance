import { describe, it, expect } from 'vitest';
import {
  createLivenessWorker,
  processLivenessFallback
} from '../livenessWorker';

describe('Liveness Worker & Fallback Engine', () => {
  it('safely handles createLivenessWorker in test/SSR environment without throwing', () => {
    const worker = createLivenessWorker();
    // In node/jsdom environment without native Worker or Blob URLs, it should gracefully return null or a worker
    expect(worker === null || typeof worker.postMessage === 'function').toBe(true);
  });

  it('rejects too dark frames with positioning guidance', () => {
    const darkPixels = new Uint8ClampedArray(64 * 64 * 4); // All zeros -> avgLum = 0
    const history: number[] = [];
    const res = processLivenessFallback(darkPixels, 64, 64, history, 0, 0);

    expect(res.phase).toBe('positioning');
    expect(res.prompt).toContain('lighting');
    expect(res.action).toBe('UPDATE_STATUS');
  });

  it('rejects too bright/overexposed frames with positioning guidance', () => {
    const brightPixels = new Uint8ClampedArray(64 * 64 * 4);
    brightPixels.fill(255); // 255 across all RGBA -> avgLum = 255
    const history: number[] = [];
    const res = processLivenessFallback(brightPixels, 64, 64, history, 0, 0);

    expect(res.phase).toBe('positioning');
    expect(res.prompt).toContain('lighting');
    expect(res.action).toBe('UPDATE_STATUS');
  });

  it('guides user to hold steady until history accumulates 5 frames', () => {
    const normalPixels = new Uint8ClampedArray(64 * 64 * 4);
    normalPixels.fill(128); // Mid-gray
    const history: number[] = [];

    const res = processLivenessFallback(normalPixels, 64, 64, history, 0, 0);
    expect(res.phase).toBe('positioning');
    expect(res.prompt).toContain('Hold steady');
    expect(history.length).toBe(1);
  });

  it('progresses to ready phase after stabilization', () => {
    const normalPixels = new Uint8ClampedArray(64 * 64 * 4);
    normalPixels.fill(128);
    const history = [128, 128, 128, 128, 128]; // Pre-filled history >= 5

    // Needs 4 stable frames
    let stableFrames = 0;
    let res = processLivenessFallback(normalPixels, 64, 64, history, stableFrames, 0);
    expect(res.phase).toBe('ready');
    expect(res.stableFrames).toBe(1);

    stableFrames = 4; // Already stable
    res = processLivenessFallback(normalPixels, 64, 64, history, stableFrames, 0);
    expect(res.phase).toBe('ready');
  });

  it('detects blink deviation and verifies upon eye reopening', () => {
    const history = [100, 100, 100, 100, 100]; // baseline = 100
    const stableFrames = 4;

    // Simulate eyelid closure dipping eye luminance to 90 (deviation = 10)
    const blinkPixels = new Uint8ClampedArray(64 * 64 * 4);
    blinkPixels.fill(100);
    // Darken eye region
    for (let y = 18; y <= 36; y++) {
      for (let x = 14; x <= 50; x++) {
        const idx = (y * 64 + x) * 4;
        blinkPixels[idx] = 90;
        blinkPixels[idx + 1] = 90;
        blinkPixels[idx + 2] = 90;
      }
    }

    const blinkRes = processLivenessFallback(blinkPixels, 64, 64, history, stableFrames, 0);
    expect(blinkRes.phase).toBe('blinking');
    expect(blinkRes.blinkStage).toBe(1);

    // Now eyes reopen: eye luminance returns to 100 (deviation from baseline 100 is < 2.5)
    const openPixels = new Uint8ClampedArray(64 * 64 * 4);
    openPixels.fill(100);

    const verifiedRes = processLivenessFallback(openPixels, 64, 64, history, stableFrames, 1);
    expect(verifiedRes.action).toBe('VERIFIED');
    expect(verifiedRes.phase).toBe('verified');
    expect(verifiedRes.blinkStage).toBe(2);
    expect(verifiedRes.prompt).toContain('Live Human Verified');
  });
});
