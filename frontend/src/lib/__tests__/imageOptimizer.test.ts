import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  optimizeClassroomPhoto,
  fallbackOptimizeClassroomPhoto,
  isOffscreenWorkerSupported,
  getOrCreateOptimizerWorker,
  resetOptimizerWorker,
} from '../imageOptimizer';

describe('Image Optimizer & Web Worker Offloading', () => {
  beforeEach(() => {
    resetOptimizerWorker();
    vi.restoreAllMocks();
  });

  it('safely evaluates isOffscreenWorkerSupported without throwing in test/SSR environment', () => {
    const supported = isOffscreenWorkerSupported();
    expect(typeof supported).toBe('boolean');
  });

  it('safely attempts getOrCreateOptimizerWorker in test environment without throwing', () => {
    const worker = getOrCreateOptimizerWorker();
    expect(worker === null || typeof worker.postMessage === 'function').toBe(true);
  });

  it('safely resets optimizer worker singleton', () => {
    expect(() => resetOptimizerWorker()).not.toThrow();
  });

  it('passes through non-image files unchanged without attempting compression', async () => {
    const textBlob = new Blob(['sample text'], { type: 'text/plain' });
    const textFile = new File([textBlob], 'sample.txt', { type: 'text/plain' });

    const result = await optimizeClassroomPhoto(textFile, 2560, 0.88);
    expect(result.wasCompressed).toBe(false);
    expect(result.file.name).toBe('sample.txt');
    expect(result.compressedSize).toBe(textFile.size);
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });

  it('fallbackOptimizeClassroomPhoto safely handles non-image files', async () => {
    const pdfBlob = new Blob(['fake pdf'], { type: 'application/pdf' });
    const pdfFile = new File([pdfBlob], 'document.pdf', { type: 'application/pdf' });

    const result = await fallbackOptimizeClassroomPhoto(pdfFile, 2560, 0.88);
    expect(result.wasCompressed).toBe(false);
    expect(result.file.name).toBe('document.pdf');
    expect(result.compressedSize).toBe(pdfFile.size);
  });

  it('falls back safely when image decoding encounters error', async () => {
    const originalImage = window.Image;
    try {
      class MockBrokenImage {
        onload: () => void = () => {};
        onerror: () => void = () => {};
        set src(_: string) {
          setTimeout(() => this.onerror(), 5);
        }
      }
      Object.defineProperty(window, 'Image', {
        value: MockBrokenImage,
        configurable: true,
        writable: true,
      });

      const file = new File([new Blob(['invalid image data'])], 'corrupt.jpg', {
        type: 'image/jpeg',
      });
      const result = await fallbackOptimizeClassroomPhoto(file, 2560, 0.88);

      expect(result.wasCompressed).toBe(false);
      expect(result.file.name).toBe('corrupt.jpg');
    } finally {
      Object.defineProperty(window, 'Image', {
        value: originalImage,
        configurable: true,
        writable: true,
      });
    }
  });

  it('preserves small images under 500KB that do not exceed maxDimension in fallback', async () => {
    const originalImage = window.Image;
    try {
      class MockSmallImage {
        onload: () => void = () => {};
        onerror: () => void = () => {};
        naturalWidth = 800;
        naturalHeight = 600;
        set src(_: string) {
          setTimeout(() => this.onload(), 5);
        }
      }
      Object.defineProperty(window, 'Image', {
        value: MockSmallImage,
        configurable: true,
        writable: true,
      });

      const smallBlob = new Blob([new Uint8Array(100)], { type: 'image/jpeg' });
      const smallFile = new File([smallBlob], 'tiny.jpg', { type: 'image/jpeg' });

      const result = await fallbackOptimizeClassroomPhoto(smallFile, 2560, 0.88);
      expect(result.file.name).toBe('tiny.jpg');
      expect(result.wasCompressed).toBe(false);
      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
    } finally {
      Object.defineProperty(window, 'Image', {
        value: originalImage,
        configurable: true,
        writable: true,
      });
    }
  });

  it('correctly calculates proportional downscaling dimensions for large images', async () => {
    const originalImage = window.Image;
    const originalCreateElement = document.createElement.bind(document);

    try {
      class MockLargeImage {
        onload: () => void = () => {};
        onerror: () => void = () => {};
        naturalWidth = 4000;
        naturalHeight = 3000;
        set src(_: string) {
          setTimeout(() => this.onload(), 5);
        }
      }
      Object.defineProperty(window, 'Image', {
        value: MockLargeImage,
        configurable: true,
        writable: true,
      });

      let capturedCanvasWidth = 0;
      let capturedCanvasHeight = 0;

      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'canvas') {
          const fakeCanvas = {
            width: 0,
            height: 0,
            getContext: () => ({
              imageSmoothingEnabled: false,
              imageSmoothingQuality: 'low',
              drawImage: () => {},
            }),
            toBlob: (callback: (b: Blob | null) => void) => {
              capturedCanvasWidth = fakeCanvas.width;
              capturedCanvasHeight = fakeCanvas.height;
              callback(new Blob(['fake compressed data'], { type: 'image/jpeg' }));
            },
          };
          return fakeCanvas as unknown as HTMLCanvasElement;
        }
        return originalCreateElement(tagName);
      });

      // Large photo (> 500KB)
      const bigBlob = new Blob([new Uint8Array(600 * 1024)], { type: 'image/jpeg' });
      const bigFile = new File([bigBlob], 'classroom_shot.jpg', { type: 'image/jpeg' });

      const result = await fallbackOptimizeClassroomPhoto(bigFile, 2560, 0.88);
      expect(result.wasCompressed).toBe(true);
      expect(result.file.name).toBe('classroom_shot_optimized.jpg');
      expect(capturedCanvasWidth).toBe(2560);
      // 3000 * 2560 / 4000 = 1920
      expect(capturedCanvasHeight).toBe(1920);
    } finally {
      Object.defineProperty(window, 'Image', {
        value: originalImage,
        configurable: true,
        writable: true,
      });
    }
  });
});
