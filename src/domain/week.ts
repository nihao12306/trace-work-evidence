import type { ISODate, WeekRange } from "./model";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateOnly(value: ISODate): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`无效日期：${value}`);
  }

  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function formatDateOnly(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function getWeekRange(date: ISODate, weekStartsOn: 0 | 1): WeekRange {
  const parsed = parseDateOnly(date);
  const day = parsed.getUTCDay();
  const daysSinceStart = (day - weekStartsOn + 7) % 7;
  const start = new Date(parsed.getTime() - daysSinceStart * DAY_MS);
  const end = new Date(start.getTime() + 6 * DAY_MS);

  return { start: formatDateOnly(start), end: formatDateOnly(end) };
}
