/**
 * Korean Standard Time (UTC+9, no DST) for the admin post pages.
 *
 * Built by hand instead of `Intl`, so the server render and the phone render
 * produce the same string (no hydration mismatch, whatever the server's time
 * zone or ICU version), and schedule times read the same for every staff
 * member whatever their phone is set to.
 */
const KST_OFFSET_MS = 9 * 60 * 60_000
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const
const INPUT_VALUE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

type KstParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number }

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

function kstParts(value: string | Date): KstParts | null {
  const time = toDate(value).getTime()
  if (Number.isNaN(time)) return null
  const shifted = new Date(time + KST_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  }
}

const pad = (value: number) => String(value).padStart(2, '0')

/** "21:30" */
export function formatKstTime(value: string | Date): string {
  const parts = kstParts(value)
  return parts ? `${pad(parts.hour)}:${pad(parts.minute)}` : ''
}

/** "10월 1일 (수)" */
export function formatKstDay(value: string | Date): string {
  const parts = kstParts(value)
  return parts ? `${parts.month}월 ${parts.day}일 (${WEEKDAYS[parts.weekday]})` : ''
}

/** "10월 1일 (수) 21:30" */
export function formatKstDateTime(value: string | Date): string {
  const day = formatKstDay(value)
  return day ? `${day} ${formatKstTime(value)}` : ''
}

function sameKstDay(a: string | Date, b: string | Date): boolean {
  const left = kstParts(a)
  const right = kstParts(b)
  return !!left && !!right && left.year === right.year && left.month === right.month && left.day === right.day
}

/** "10월 1일 (수) 14:07 ~ 19:52", or both full when the range crosses midnight; one time when equal. */
export function formatKstRange(first: string | Date, last: string | Date): string {
  if (toDate(first).getTime() === toDate(last).getTime()) return formatKstDateTime(first)
  if (sameKstDay(first, last)) return `${formatKstDateTime(first)} ~ ${formatKstTime(last)}`
  return `${formatKstDateTime(first)} ~ ${formatKstDateTime(last)}`
}

/** The `<input type="datetime-local">` value for a moment, as KST wall time: "2026-10-01T21:30". */
export function toKstInputValue(value: Date): string {
  const parts = kstParts(value)
  if (!parts) return ''
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`
}

/** The moment a KST wall time names, or null for anything that is not "YYYY-MM-DDTHH:mm". */
export function parseKstInputValue(value: string): Date | null {
  const match = INPUT_VALUE.exec(value.trim())
  if (!match) return null
  const [, year, month, day, hour, minute] = match.map(Number)
  const utc = Date.UTC(year, month - 1, day, hour, minute) - KST_OFFSET_MS
  const date = new Date(utc)
  // Reject rolled-over dates such as 02-31.
  return toKstInputValue(date) === value.trim() ? date : null
}

/** A KST wall time rounded UP to the next `stepMinutes` boundary. */
export function roundUpToMinutes(value: Date, stepMinutes: number): Date {
  const step = stepMinutes * 60_000
  return new Date(Math.ceil(value.getTime() / step) * step)
}
