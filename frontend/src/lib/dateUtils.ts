/**
 * Central Date & Timezone utilities for MedAttend
 * Default Institute Timezone: Asia/Kolkata (IST, UTC+5:30)
 */

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/**
 * Returns the current date in YYYY-MM-DD string format in the target timezone (IST).
 */
export function getTodayDateStr(timeZone = DEFAULT_TIMEZONE): string {
  const now = new Date();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Returns the ISO UTC string for the exact midnight (00:00:00.000) of today in the institute timezone.
 */
export function getStartOfTodayISO(timeZone = DEFAULT_TIMEZONE): string {
  const dateStr = getTodayDateStr(timeZone);
  // Construct midnight in local IST timezone (+05:30)
  const midnightLocal = new Date(`${dateStr}T00:00:00+05:30`);
  return midnightLocal.toISOString();
}
