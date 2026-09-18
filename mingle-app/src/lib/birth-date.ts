export const MINIMUM_SIGNUP_AGE = 12;
export const EARLIEST_SIGNUP_BIRTH_YEAR = 1900;

export type BirthDateParts = {
  year: number;
  month: number;
  day: number;
};

export function getDaysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return 0;
  }
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidBirthDateParts(value: BirthDateParts): boolean {
  return Number.isInteger(value.year)
    && Number.isInteger(value.month)
    && Number.isInteger(value.day)
    && value.year >= EARLIEST_SIGNUP_BIRTH_YEAR
    && value.month >= 1
    && value.month <= 12
    && value.day >= 1
    && value.day <= getDaysInMonth(value.year, value.month);
}

export function formatBirthDate(value: BirthDateParts): string | null {
  if (!isValidBirthDateParts(value)) return null;
  return `${String(value.year).padStart(4, "0")}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}

export function parseBirthDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [year, month, day] = value.split("-").map(Number);
  const parts = { year, month, day } satisfies BirthDateParts;
  if (!isValidBirthDateParts(parts)) return null;

  return new Date(Date.UTC(year, month - 1, day));
}

export function getLatestEligibleBirthDate(now = new Date()): BirthDateParts {
  return {
    year: now.getUTCFullYear() - MINIMUM_SIGNUP_AGE,
    month: now.getUTCMonth() + 1,
    day: now.getUTCDate(),
  };
}

export function isOldEnoughForSignup(
  value: BirthDateParts,
  now = new Date(),
): boolean {
  if (!isValidBirthDateParts(value)) return false;

  const latestEligible = getLatestEligibleBirthDate(now);
  if (value.year !== latestEligible.year) return value.year < latestEligible.year;
  if (value.month !== latestEligible.month) return value.month < latestEligible.month;
  return value.day <= latestEligible.day;
}

export function getSignupBirthYearOptions(
  now = new Date(),
  earliestYear = EARLIEST_SIGNUP_BIRTH_YEAR,
): number[] {
  const latestYear = getLatestEligibleBirthDate(now).year;
  return Array.from(
    { length: Math.max(0, latestYear - earliestYear + 1) },
    (_, index) => latestYear - index,
  );
}

export function getSignupBirthMonthOptions(
  year: number,
  now = new Date(),
): number[] {
  const latestEligible = getLatestEligibleBirthDate(now);
  const latestMonth = year === latestEligible.year ? latestEligible.month : 12;
  return Array.from({ length: latestMonth }, (_, index) => index + 1);
}

export function getSignupBirthDayOptions(
  year: number,
  month: number,
  now = new Date(),
): number[] {
  const latestEligible = getLatestEligibleBirthDate(now);
  const daysInMonth = getDaysInMonth(year, month);
  const latestDay = year === latestEligible.year && month === latestEligible.month
    ? latestEligible.day
    : daysInMonth;
  return Array.from({ length: Math.max(0, Math.min(daysInMonth, latestDay)) }, (_, index) => index + 1);
}
