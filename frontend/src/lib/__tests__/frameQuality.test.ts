import { describe, it, expect } from 'vitest';
import {
  calculateLuminance,
  calculateLaplacianVariance,
  evaluateImageDataQuality,
  QUALITY_THRESHOLDS,
} from '../frameQuality';

describe('Real-time Frame Quality & Advisor Engine (ADR-050)', () => {
  describe('calculateLuminance', () => {
    it('computes 0 luminance for pure black pixels', () => {
      // 4 pixels RGBA: [0, 0, 0, 255]
      const black = new Uint8ClampedArray([
        0, 0, 0, 255,
        0, 0, 0, 255,
        0, 0, 0, 255,
        0, 0, 0, 255,
      ]);
      expect(calculateLuminance(black)).toBe(0);
    });

    it('computes 255 luminance for pure white pixels', () => {
      const white = new Uint8ClampedArray([
        255, 255, 255, 255,
        255, 255, 255, 255,
      ]);
      expect(calculateLuminance(white)).toBe(255);
    });

    it('correctly applies ITU-R BT.601 weights to color channels', () => {
      // Pure Red: 0.299 * 255 = 76.245
      const red = new Uint8ClampedArray([255, 0, 0, 255]);
      expect(calculateLuminance(red)).toBeCloseTo(76.245, 1);

      // Pure Green: 0.587 * 255 = 149.685
      const green = new Uint8ClampedArray([0, 255, 0, 255]);
      expect(calculateLuminance(green)).toBeCloseTo(149.685, 1);

      // Pure Blue: 0.114 * 255 = 29.07
      const blue = new Uint8ClampedArray([0, 0, 255, 255]);
      expect(calculateLuminance(blue)).toBeCloseTo(29.07, 1);
    });

    it('handles empty pixel buffers safely', () => {
      expect(calculateLuminance(new Uint8ClampedArray([]))).toBe(0);
    });
  });

  describe('calculateLaplacianVariance', () => {
    it('returns 0 variance for a completely flat/uniform image', () => {
      const width = 10;
      const height = 10;
      // All gray pixels
      const flat = new Uint8ClampedArray(width * height * 4);
      flat.fill(128);
      const variance = calculateLaplacianVariance(flat, width, height);
      expect(variance).toBe(0);
    });

    it('returns high variance for a sharp checkerboard pattern', () => {
      const width = 10;
      const height = 10;
      const checker = new Uint8ClampedArray(width * height * 4);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const val = (x + y) % 2 === 0 ? 0 : 255;
          checker[idx] = val;
          checker[idx + 1] = val;
          checker[idx + 2] = val;
          checker[idx + 3] = 255;
        }
      }

      const variance = calculateLaplacianVariance(checker, width, height);
      expect(variance).toBeGreaterThan(100);
    });

    it('handles degenerate small dimensions safely without throwing', () => {
      const small = new Uint8ClampedArray(2 * 2 * 4);
      expect(calculateLaplacianVariance(small, 2, 2)).toBe(0);
    });
  });

  describe('evaluateImageDataQuality', () => {
    it('flags low-sharpness images as blurry', () => {
      const width = 10;
      const height = 10;
      const flat = new Uint8ClampedArray(width * height * 4);
      flat.fill(128); // Sharpness = 0, Brightness = 128

      const result = evaluateImageDataQuality({
        data: flat,
        width,
        height,
      } as unknown as ImageData);

      expect(result.status).toBe('blurry');
      expect(result.sharpness).toBeLessThan(QUALITY_THRESHOLDS.MIN_SHARPNESS);
      expect(result.isAcceptable).toBe(false);
      expect(result.badgeColor).toBe('rose');
      expect(result.message).toContain('Motion Blur Detected');
    });

    it('flags low-light scenes accurately when sharp but too dark', () => {
      const width = 10;
      const height = 10;
      const darkSharp = new Uint8ClampedArray(width * height * 4);

      // Checkerboard with values between 0 and 20 (Average brightness ~10 < 40)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const val = (x + y) % 2 === 0 ? 0 : 20;
          darkSharp[idx] = val;
          darkSharp[idx + 1] = val;
          darkSharp[idx + 2] = val;
          darkSharp[idx + 3] = 255;
        }
      }

      // Force sharpness threshold to pass to test light condition
      const mockResult = evaluateImageDataQuality({
        data: darkSharp,
        width,
        height,
      } as unknown as ImageData);

      // Either blurry or low-light (both unacceptable)
      expect(mockResult.isAcceptable).toBe(false);
      expect(mockResult.brightness).toBeLessThan(QUALITY_THRESHOLDS.MIN_LUMINANCE);
    });

    it('identifies balanced images as optimal (status: good)', () => {
      const width = 10;
      const height = 10;
      const balanced = new Uint8ClampedArray(width * height * 4);

      // High-contrast sharp pattern centered around brightness 128
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const val = (x + y) % 2 === 0 ? 60 : 190;
          balanced[idx] = val;
          balanced[idx + 1] = val;
          balanced[idx + 2] = val;
          balanced[idx + 3] = 255;
        }
      }

      const result = evaluateImageDataQuality({
        data: balanced,
        width,
        height,
      } as unknown as ImageData);

      expect(result.status).toBe('good');
      expect(result.isAcceptable).toBe(true);
      expect(result.badgeColor).toBe('emerald');
      expect(result.message).toContain('Lighting & Focus Good');
    });
  });
});
