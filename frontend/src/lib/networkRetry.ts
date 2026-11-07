/**
 * Network Resilience & Exponential Backoff Utilities
 * 
 * Provides per-request intelligent retry with exponential backoff and jitter
 * for mobile network flakes, Wi-Fi roaming drops, and transient HTTP 5xx errors.
 * 
 * Architectural Highlights:
 * 1. Smart Error Discrimination: Retries on transient network drops (fetch TypeError, 502/503/504),
 *    while failing fast on non-retryable client errors (400, 401, 403, 413, 422).
 * 2. Exponential Backoff with Jitter: Prevents thundering herd retries against campus backend.
 * 3. Real-Time UI Hooks: Notifies faculty UI during retry transitions so progress never looks stalled.
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
  onRetry?: (attempt: number, maxRetries: number, delayMs: number, error: unknown) => void;
}

/**
 * Determines whether an error is transient and safe to retry.
 */
export function isRetryableError(error: unknown): boolean {
  if (!error) return false;

  // Check HTTP response status if available
  const errWithStatus = error as { status?: number; message?: string };
  if (typeof errWithStatus.status === "number") {
    const s = errWithStatus.status;
    // 408 Request Timeout, 429 Too Many Requests, or 500-599 Server Errors (502, 503, 504)
    if (s === 408 || s === 429 || (s >= 500 && s <= 599)) {
      return true;
    }
    // Deterministic 4xx client errors (400, 401, 403, 404, 413, 422) are non-retryable
    return false;
  }

  // Native fetch network errors (TypeError on network drops, offline, DNS failure)
  if (error instanceof TypeError) {
    return true;
  }

  // Error message heuristics for common mobile network failures
  const msg = String(errWithStatus.message || "").toLowerCase();
  if (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("load failed") ||
    msg.includes("abort") ||
    msg.includes("connection reset")
  ) {
    return true;
  }

  return false;
}

/**
 * Executes an asynchronous function with exponential backoff retries on transient errors.
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  const initialDelay = options.initialDelayMs ?? 500;
  const backoffFactor = options.backoffFactor ?? 2.0;

  let attempt = 0;
  let currentDelay = initialDelay;

  while (true) {
    try {
      return await fn();
    } catch (err: unknown) {
      attempt++;
      if (attempt > maxRetries || !isRetryableError(err)) {
        throw err;
      }

      // Add 0-100ms random jitter to avoid synchronized retry spikes
      const jitter = Math.floor(Math.random() * 100);
      const waitMs = currentDelay + jitter;

      if (options.onRetry) {
        options.onRetry(attempt, maxRetries, waitMs, err);
      }

      await new Promise((resolve) => setTimeout(resolve, waitMs));
      currentDelay = Math.round(currentDelay * backoffFactor);
    }
  }
}

/**
 * Uploads a classroom photo with automatic exponential backoff retry on network flakes.
 */
export async function uploadPhotoWithRetry(
  file: File,
  sessionId: string,
  label: string,
  options: RetryOptions = {}
): Promise<{ recognized?: Array<{ name: string; confidence?: number }>; [key: string]: unknown }> {
  return executeWithRetry(async () => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("session_id", sessionId);

    const response = await fetch("/api/process-attendance", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message =
        errorData.detail || errorData.error || `HTTP ${response.status}: Failed to process ${label}`;
      const error = new Error(message) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }

    return await response.json();
  }, options);
}
