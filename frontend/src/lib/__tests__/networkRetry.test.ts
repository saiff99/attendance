import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isRetryableError,
  executeWithRetry,
  uploadPhotoWithRetry,
} from '../networkRetry';

describe('Network Retry & Exponential Backoff Engine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('isRetryableError', () => {
    it('identifies transient network errors as retryable', () => {
      expect(isRetryableError(new TypeError('Failed to fetch'))).toBe(true);
      expect(isRetryableError(new Error('Network request failed'))).toBe(true);
      expect(isRetryableError(new Error('Connection reset by peer ECONNRESET'))).toBe(true);
      expect(isRetryableError(new Error('The operation was aborted'))).toBe(true);
    });

    it('identifies HTTP 5xx and 429 server errors as retryable', () => {
      const err502 = Object.assign(new Error('Bad Gateway'), { status: 502 });
      const err503 = Object.assign(new Error('Service Unavailable'), { status: 503 });
      const err504 = Object.assign(new Error('Gateway Timeout'), { status: 504 });
      const err429 = Object.assign(new Error('Too Many Requests'), { status: 429 });

      expect(isRetryableError(err502)).toBe(true);
      expect(isRetryableError(err503)).toBe(true);
      expect(isRetryableError(err504)).toBe(true);
      expect(isRetryableError(err429)).toBe(true);
    });

    it('identifies HTTP 4xx deterministic client errors as non-retryable', () => {
      const err400 = Object.assign(new Error('Bad Request'), { status: 400 });
      const err401 = Object.assign(new Error('Unauthorized'), { status: 401 });
      const err403 = Object.assign(new Error('Forbidden'), { status: 403 });
      const err413 = Object.assign(new Error('Payload Too Large'), { status: 413 });
      const err422 = Object.assign(new Error('Unprocessable Entity'), { status: 422 });

      expect(isRetryableError(err400)).toBe(false);
      expect(isRetryableError(err401)).toBe(false);
      expect(isRetryableError(err403)).toBe(false);
      expect(isRetryableError(err413)).toBe(false);
      expect(isRetryableError(err422)).toBe(false);
    });

    it('returns false for null/undefined safely', () => {
      expect(isRetryableError(null)).toBe(false);
      expect(isRetryableError(undefined)).toBe(false);
    });
  });

  describe('executeWithRetry', () => {
    it('returns result immediately on first attempt without retrying', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const onRetry = vi.fn();

      const result = await executeWithRetry(fn, { onRetry });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(onRetry).not.toHaveBeenCalled();
    });

    it('recovers on 2nd attempt after a transient network error', async () => {
      let calls = 0;
      const fn = vi.fn().mockImplementation(async () => {
        calls++;
        if (calls === 1) {
          throw new TypeError('Failed to fetch');
        }
        return 'recovered-data';
      });

      const onRetry = vi.fn();
      const result = await executeWithRetry(fn, {
        maxRetries: 2,
        initialDelayMs: 10,
        backoffFactor: 2,
        onRetry,
      });

      expect(result).toBe('recovered-data');
      expect(fn).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, 2, expect.any(Number), expect.any(TypeError));
    });

    it('fails immediately without retry when encountering a 403 Forbidden error', async () => {
      const forbiddenErr = Object.assign(new Error('Faculty session expired'), { status: 403 });
      const fn = vi.fn().mockRejectedValue(forbiddenErr);
      const onRetry = vi.fn();

      await expect(
        executeWithRetry(fn, { maxRetries: 3, initialDelayMs: 10, onRetry })
      ).rejects.toThrow('Faculty session expired');

      expect(fn).toHaveBeenCalledTimes(1);
      expect(onRetry).not.toHaveBeenCalled();
    });

    it('exhausts all retries and rethrows error if failure persists', async () => {
      const persistentErr = Object.assign(new Error('504 Gateway Timeout'), { status: 504 });
      const fn = vi.fn().mockRejectedValue(persistentErr);
      const onRetry = vi.fn();

      await expect(
        executeWithRetry(fn, { maxRetries: 2, initialDelayMs: 10, onRetry })
      ).rejects.toThrow('504 Gateway Timeout');

      // 1 initial + 2 retries = 3 total attempts
      expect(fn).toHaveBeenCalledTimes(3);
      expect(onRetry).toHaveBeenCalledTimes(2);
    });
  });

  describe('uploadPhotoWithRetry', () => {
    it('handles successful API upload response', async () => {
      const fakeFile = new File([new Blob(['test'])], 'test.jpg', { type: 'image/jpeg' });
      const fakeSessionId = 'sess-123';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          recognized: [{ name: 'Dr. John Doe', confidence: 0.95 }],
        }),
      });
      global.fetch = mockFetch;

      const res = await uploadPhotoWithRetry(fakeFile, fakeSessionId, 'Photo 1');
      expect(res.recognized).toBeDefined();
      expect(res.recognized?.length).toBe(1);
      expect(mockFetch).toHaveBeenCalledWith('/api/process-attendance', expect.objectContaining({
        method: 'POST',
      }));
    });
  });
});
