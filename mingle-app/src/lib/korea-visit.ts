/**
 * The Korea trip (owner, 2026-11-23, reworked 2026-11-25), asked on the first
 * run of someone who is not Korean. First "한국 여행 올 일정이 정해졌나요?":
 * - planned: a calendar with two fields, 오는 날 then 떠나는 날 (the second
 *   opens once the first is picked; the arrival alone is enough to go on);
 * - undecided: nothing more;
 * - visited: roughly how long ago (a month, six months, a year, longer), not
 *   a date, since people forget the exact days.
 * Kept on the device for now; there is no profile column for it yet.
 */
const STORAGE_KEY = "mingle.koreaVisit.v1";

/** Days as "YYYY-MM-DD" in the device's time zone. */
export type IsoDay = string;

export type KoreaVisitRange = { start: IsoDay | null; end: IsoDay | null };

export type KoreaVisitPlan = "planned" | "undecided" | "visited";

/** How long ago the last trip was, as the person remembers it. */
export type KoreaVisitAgo = "month" | "half_year" | "year" | "older";
export const KOREA_VISIT_AGO_OPTIONS: readonly KoreaVisitAgo[] = ["month", "half_year", "year", "older"];

export type KoreaVisitAnswer =
  | { kind: "dates"; start: IsoDay; end: IsoDay | null }
  | { kind: "undecided" }
  | { kind: "visited"; ago: KoreaVisitAgo };

export function toIsoDay(date: Date): IsoDay {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function fromIsoDay(day: IsoDay): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

export type KoreaVisitField = "start" | "end";

/**
 * A tap on a day while 오는 날 (start) or 떠나는 날 (end) is the field being
 * picked. The arrival moves the picking on to the departure; a departure
 * before the arrival is taken as a new arrival.
 */
export function pickKoreaVisitDay(
  range: KoreaVisitRange,
  day: IsoDay,
  field: KoreaVisitField,
): { range: KoreaVisitRange; field: KoreaVisitField } {
  if (field === "start" || !range.start || day < range.start) {
    const end = field === "start" && range.end && range.end >= day ? range.end : null;
    return { range: { start: day, end }, field: "end" };
  }
  return { range: { start: range.start, end: day }, field: "end" };
}

/** Months shown, as offsets from this month: from this month (only future trips are picked) to two years ahead. */
export const KOREA_VISIT_MONTHS_BACK = 0;
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
    const value = JSON.parse(raw) as Partial<{ kind: string; start: string; end: string | null; ago: string }>;
    if (value?.kind === "undecided") return { kind: "undecided" };
    if (value?.kind === "visited") {
      const ago = KOREA_VISIT_AGO_OPTIONS.find((option) => option === value.ago);
      return ago ? { kind: "visited", ago } : null;
    }
    const isDay = (entry: unknown): entry is IsoDay => typeof entry === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry);
    if (value?.kind === "dates" && isDay(value.start)) {
      if (value.end == null) return { kind: "dates", start: value.start, end: null };
      if (isDay(value.end) && value.start <= value.end) return { kind: "dates", start: value.start, end: value.end };
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
  if (answer.kind === "visited") return { answer: "visited", ago: answer.ago };
  const properties: Record<string, string | number | boolean> = {
    answer: "dates",
    start: answer.start,
    days_until_start: daysBetween(today, answer.start),
    has_end: answer.end !== null,
  };
  if (answer.end) {
    properties.end = answer.end;
    properties.trip_days = daysBetween(answer.start, answer.end) + 1;
  }
  return properties;
}
