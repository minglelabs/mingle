/**
 * "When are you coming to Korea?" (owner, 2026-11-23): asked on the first
 * screen right after "Are you Korean?" when the answer is no. Two taps on the
 * calendar pick the trip (a past trip counts too), or "not decided yet" skips.
 * Kept on the device for now; there is no profile column for it yet.
 */
const STORAGE_KEY = "mingle.koreaVisit.v1";

/** Days as "YYYY-MM-DD" in the device's time zone. */
export type IsoDay = string;

export type KoreaVisitRange = { start: IsoDay | null; end: IsoDay | null };

export type KoreaVisitAnswer =
  | { kind: "dates"; start: IsoDay; end: IsoDay }
  | { kind: "undecided" };

export function toIsoDay(date: Date): IsoDay {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function fromIsoDay(day: IsoDay): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

/**
 * One tap on a day: the first tap starts a trip, the second ends it (an
 * earlier day becomes the start), a third starts over. The same day twice is
 * a one-day trip.
 */
export function pickKoreaVisitDay(range: KoreaVisitRange, day: IsoDay): KoreaVisitRange {
  if (!range.start || range.end) return { start: day, end: null };
  return day < range.start ? { start: day, end: range.start } : { start: range.start, end: day };
}

/** Months shown, as offsets from this month: a year back (a recent trip) to two years ahead. */
export const KOREA_VISIT_MONTHS_BACK = 12;
export const KOREA_VISIT_MONTHS_AHEAD = 24;

/** The weeks of a month, Sunday first; null pads the days of other months. */
export function monthGrid(year: number, monthIndex: number): Array<Array<IsoDay | null>> {
  const first = new Date(year, monthIndex, 1);
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const cells: Array<IsoDay | null> = Array.from({ length: first.getDay() }, () => null);
  for (let day = 1; day <= days; day += 1) cells.push(toIsoDay(new Date(year, monthIndex, day)));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<IsoDay | null>> = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: IsoDay, to: IsoDay): number {
  return Math.round((fromIsoDay(to).getTime() - fromIsoDay(from).getTime()) / 86_400_000);
}

export function parseKoreaVisitAnswer(raw: string | null): KoreaVisitAnswer | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<{ kind: string; start: string; end: string }>;
    if (value?.kind === "undecided") return { kind: "undecided" };
    const isDay = (entry: unknown): entry is IsoDay => typeof entry === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry);
    if (value?.kind === "dates" && isDay(value.start) && isDay(value.end) && value.start <= value.end) {
      return { kind: "dates", start: value.start, end: value.end };
    }
    return null;
  } catch {
    return null;
  }
}

export function readKoreaVisitAnswer(): KoreaVisitAnswer | null {
  try {
    return typeof window === "undefined" ? null : parseKoreaVisitAnswer(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeKoreaVisitAnswer(answer: KoreaVisitAnswer): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(answer));
  } catch {
    // Not kept: asked again on the next first run, which is harmless.
  }
}

/** PostHog properties for the answer (relative to today, so cohorts compare). */
export function koreaVisitEventProperties(answer: KoreaVisitAnswer, today: IsoDay): Record<string, string | number | boolean> {
  if (answer.kind === "undecided") return { answer: "undecided" };
  return {
    answer: "dates",
    start: answer.start,
    end: answer.end,
    days_until_start: daysBetween(today, answer.start),
    trip_days: daysBetween(answer.start, answer.end) + 1,
    past_trip: answer.end < today,
  };
}
