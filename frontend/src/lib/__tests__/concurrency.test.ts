import { describe, it, expect } from 'vitest';
import { runConcurrentPool } from '../concurrency';

describe('runConcurrentPool (Controlled Concurrency Pipeline)', () => {
  it('handles empty items array gracefully', async () => {
    const results = await runConcurrentPool([], 2, async (x) => x);
    expect(results).toEqual([]);
  });

  it('strictly respects concurrency limit (never exceeds limit)', async () => {
    const items = [1, 2, 3, 4, 5, 6];
    const concurrencyLimit = 2;
    let activeWorkers = 0;
    let maxObservedWorkers = 0;

    await runConcurrentPool(items, concurrencyLimit, async (item) => {
      activeWorkers++;
      maxObservedWorkers = Math.max(maxObservedWorkers, activeWorkers);

      // Simulate variable network/AI latency
      await new Promise((resolve) => setTimeout(resolve, 15));

      activeWorkers--;
      return item * 2;
    });

    expect(maxObservedWorkers).toBeLessThanOrEqual(concurrencyLimit);
    expect(maxObservedWorkers).toBe(2);
  });

  it('guarantees exact in-order results even with out-of-order completions', async () => {
    const items = ['photo-1', 'photo-2', 'photo-3', 'photo-4'];
    // Make photo-1 slow (30ms), photo-2 fast (5ms), photo-3 fast (5ms), photo-4 medium (15ms)
    const delays = [30, 5, 5, 15];

    const results = await runConcurrentPool(items, 2, async (item, idx) => {
      await new Promise((resolve) => setTimeout(resolve, delays[idx]));
      return `processed-${item}`;
    });

    expect(results).toEqual([
      'processed-photo-1',
      'processed-photo-2',
      'processed-photo-3',
      'processed-photo-4',
    ]);
  });

  it('handles single-item queue correctly without deadlocks', async () => {
    const results = await runConcurrentPool(['single-shot'], 2, async (item) => {
      return item.toUpperCase();
    });
    expect(results).toEqual(['SINGLE-SHOT']);
  });

  it('handles concurrency limit of 1 (strictly sequential)', async () => {
    const items = [10, 20, 30];
    let active = 0;
    let maxActive = 0;

    const results = await runConcurrentPool(items, 1, async (item) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      return item + 5;
    });

    expect(maxActive).toBe(1);
    expect(results).toEqual([15, 25, 35]);
  });

  it('propagates task error immediately and rejects', async () => {
    const items = ['valid-1', 'fail-me', 'valid-2'];

    await expect(
      runConcurrentPool(items, 2, async (item) => {
        if (item === 'fail-me') {
          throw new Error('Upload error: network dropped');
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
        return item;
      })
    ).rejects.toThrow('Upload error: network dropped');
  });
});
