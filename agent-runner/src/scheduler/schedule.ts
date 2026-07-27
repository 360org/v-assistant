/**
 * Schedule matching for scheduled tasks.
 *
 * Tasks store a human recurrence ("Every day at 9:00", "Hàng ngày lúc 09:30",
 * "26/07 08:30"). The scheduler ticks and asks `isDue` whether a task should run
 * now, given when it last ran. Pure and self-contained so it can be unit-tested
 * directly (see scripts/scheduler-check.mjs).
 *
 * The assistant writes these strings itself, in whatever language the user was
 * speaking, so parsing has to cover what it actually produces. It previously
 * only understood the English `at HH:MM` — the Vietnamese `lúc HH:MM` that the
 * tool's own description suggests fell through to "daily at 09:00", and a dated
 * one-off became a daily job that ran forever at the wrong time.
 */

const WEEKDAYS = [
  ['sunday', 'chủ nhật', 'chu nhat', 'cn'],
  ['monday', 'thứ hai', 'thu hai', 't2'],
  ['tuesday', 'thứ ba', 'thu ba', 't3'],
  ['wednesday', 'thứ tư', 'thu tu', 't4'],
  ['thursday', 'thứ năm', 'thu nam', 't5'],
  ['friday', 'thứ sáu', 'thu sau', 't6'],
  ['saturday', 'thứ bảy', 'thu bay', 't7'],
];

/**
 * Extract the time of day. Accepts `at 9:00`, `lúc 09:30`, `9h30`, or a bare
 * `08:30` — but never digits that belong to a date, which the caller strips
 * first.
 */
function parseTime(s: string): { h: number; m: number } | null {
  const match =
    s.match(/(?:at|lúc|luc)\s+(\d{1,2})[:h](\d{2})/) ??
    s.match(/(\d{1,2})[:h](\d{2})/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}

/**
 * A specific calendar date, if the schedule names one: `26/07`, `26/07/2026`,
 * or `2026-07-26`. Returns the date at midnight; the time comes from
 * `parseTime`. A `DD/MM` without a year means the next such date.
 */
function parseDate(s: string, now: Date): Date | null {
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const dmy = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  if (!dmy) return null;
  const day = Number(dmy[1]);
  const month = Number(dmy[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  if (dmy[3]) return new Date(Number(dmy[3]), month - 1, day);

  // No year: this year, or next year if that date has already gone by.
  const candidate = new Date(now.getFullYear(), month - 1, day);
  if (candidate.getTime() < now.getTime() - 86_400_000) {
    return new Date(now.getFullYear() + 1, month - 1, day);
  }
  return candidate;
}

/** Remove date-looking digits so they cannot be mistaken for a time. */
function withoutDate(s: string): string {
  return s.replace(/\d{4}-\d{2}-\d{2}/g, ' ').replace(/\b\d{1,2}\/\d{1,2}(\/\d{4})?/g, ' ');
}

/** Due if `now` has reached today's target time and we haven't run since. */
function dueAtTime(now: Date, h: number, m: number, lastRun: number | undefined): boolean {
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  if (now.getTime() < target.getTime()) return false;
  return lastRun === undefined || lastRun < target.getTime();
}

/**
 * Whether a task with `schedule` should run at `now`, given `lastRun` (ms).
 *
 * Recognises, in English and Vietnamese: a one-off date, hourly, daily at a
 * time, weekdays, a named weekday, and monthly. Unknown text is treated as
 * daily, which is the safest default for a recurring job.
 */
export function isDue(schedule: string, now: Date, lastRun?: number): boolean {
  const s = schedule.toLowerCase();
  const dateless = withoutDate(s);
  const time = parseTime(dateless);

  // --- a one-off on a named date ---------------------------------------------
  const onDate = parseDate(s, now);
  if (onDate) {
    const target = new Date(onDate);
    target.setHours(time?.h ?? 9, time?.m ?? 0, 0, 0);
    // Compared against the target rather than "has any stamp", because a task
    // carries a creation stamp: treating that as a run would mean a one-off
    // never fired at all. A stamp later than the target is a real run, so it
    // never fires twice — and a date already past does not fire retroactively.
    if (lastRun !== undefined && lastRun >= target.getTime()) return false;
    return now.getTime() >= target.getTime();
  }

  if (/every hour|hourly|hàng giờ|hang gio|mỗi giờ|moi gio/.test(s)) {
    // Allow a small skew so a minute-granularity tick still fires on time.
    return lastRun === undefined || now.getTime() - lastRun >= 3_600_000 - 30_000;
  }

  if (/month|hàng tháng|hang thang|mỗi tháng|moi thang/.test(s)) {
    if (now.getDate() !== 1) return false;
    return dueAtTime(now, time?.h ?? 9, time?.m ?? 0, lastRun);
  }

  const namedDay = WEEKDAYS.findIndex((names) => names.some((name) => s.includes(name)));
  if (namedDay >= 0) {
    if (now.getDay() !== namedDay) return false;
    return dueAtTime(now, time?.h ?? 9, time?.m ?? 0, lastRun);
  }

  if (/weekday|ngày làm việc|ngay lam viec/.test(s)) {
    const dow = now.getDay();
    if (dow === 0 || dow === 6) return false;
    return dueAtTime(now, time?.h ?? 8, time?.m ?? 0, lastRun);
  }

  // Default: daily at the given time (or 9:00).
  return dueAtTime(now, time?.h ?? 9, time?.m ?? 0, lastRun);
}
