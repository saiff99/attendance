/**
 * Concurrency Utilities for Asynchronous Batch Pipelines
 * 
 * Provides a lightweight, zero-dependency async worker pool to execute tasks
 * with a strictly bounded concurrency ceiling (e.g., dual-connection 2x concurrency).
 * 
 * Prevents mobile HTTP socket exhaustion, eliminates cellular packet contention,
 * and respects backend inference concurrency limits (e.g. AI_CONCURRENCY_LIMIT).
 */

export async function runConcurrentPool<T, R>(
  items: T[],
  limit: number,
  iteratorFn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const total = items.length;
  if (total === 0) return [];

  const results: R[] = new Array(total);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < total) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await iteratorFn(items[currentIndex], currentIndex);
    }
  };

  const workerCount = Math.max(1, Math.min(limit, total));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
