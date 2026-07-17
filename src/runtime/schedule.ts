/**
 * Schedule matching for scheduled tasks.
 *
 * Tasks store a human recurrence ("Every day at 9:00", "Every hour", …). The
 * scheduler ticks once a minute and asks `isDue` whether a task should run
 * now, given when it last ran. Pure and self-contained so it is unit-tested
 * directly (see scripts/schedule-check.mjs).
 */

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/** Extract "at HH:MM" from a schedule; defaults applied by the caller. */
function parseTime(s: string): { h: number; m: number } | null {
  const at = s.match(/at\s+(\d{1,2}):(\d{2})/);
  if (!at) return null;
  return { h: Math.min(23, +at[1]), m: Math.min(59, +at[2]) };
}

/** Due if `now` has reached today's target time and we haven't run since. */
function dueAtTime(
  now: Date,
  h: number,
  m: number,
  lastRun: number | undefined,
): boolean {
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  if (now.getTime() < target.getTime()) return false;
  return lastRun === undefined || lastRun < target.getTime();
}

/**
 * Whether a task with `schedule` should run at `now`, given `lastRun` (ms).
 * Recognises: hourly, daily "at HH:MM", weekdays, a named weekday, and
 * monthly ("1st of each month"). Unknown text is treated as daily.
 */
export function isDue(
  schedule: string,
  now: Date,
  lastRun?: number,
): boolean {
  const s = schedule.toLowerCase();
  const time = parseTime(s);

  if (s.includes("every hour") || s.includes("hourly")) {
    // Allow a small skew so a minute-granularity tick still fires on time.
    return lastRun === undefined || now.getTime() - lastRun >= 3_600_000 - 30_000;
  }

  if (s.includes("month")) {
    if (now.getDate() !== 1) return false;
    return dueAtTime(now, time?.h ?? 9, time?.m ?? 0, lastRun);
  }

  const namedDay = WEEKDAYS.findIndex((d) => s.includes(d));
  if (namedDay >= 0) {
    if (now.getDay() !== namedDay) return false;
    return dueAtTime(now, time?.h ?? 9, time?.m ?? 0, lastRun);
  }

  if (s.includes("weekday")) {
    const dow = now.getDay();
    if (dow === 0 || dow === 6) return false;
    return dueAtTime(now, time?.h ?? 8, time?.m ?? 0, lastRun);
  }

  // Default: daily at the given time (or 9:00).
  return dueAtTime(now, time?.h ?? 9, time?.m ?? 0, lastRun);
}
