const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MIN_RELATIVE_TIMESTAMP_REFRESH_DELAY_MS = 50;

function normalizeLocale(locale: string): string {
  const trimmed = locale.trim();
  return trimmed || "en";
}

function formatRelativeAgoShort(elapsedMs: number): string {
  const secondsAgo = Math.max(0, Math.floor(elapsedMs / 1000));
  if (secondsAgo < 60) return `${secondsAgo}s ago`;

  const minutesAgo = Math.floor(secondsAgo / 60);
  if (minutesAgo < 60) return `${minutesAgo}m ago`;

  const hoursAgo = Math.floor(minutesAgo / 60);
  return `${hoursAgo}h ago`;
}

function formatDate(date: Date, locale: string, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return new Intl.DateTimeFormat("en", options).format(date);
  }
}

function formatDateLine(date: Date, includeYear: boolean): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (!includeYear) return `${month}/${day}`;
  return `${date.getFullYear()}/${month}/${day}`;
}

function formatTimeLines(date: Date, locale: string): string[] {
  try {
    const timeLine = new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date).trim();

    return timeLine ? [timeLine] : [];
  } catch {
    return [formatDate(date, "en", { hour: "numeric", minute: "2-digit" })];
  }
}

export function formatChatBubbleTimestampLines(
  createdAtMs: number | undefined,
  locale: string,
): string[] {
  if (!hasRenderableChatBubbleTimestamp(createdAtMs)) return [];

  const normalizedLocale = normalizeLocale(locale);
  const now = Date.now();
  const created = new Date(createdAtMs);
  const current = new Date(now);

  if (Number.isNaN(created.getTime())) return [];

  const sameYear = created.getFullYear() === current.getFullYear();
  const elapsedMs = Math.max(0, now - createdAtMs);

  if (elapsedMs < DAY_MS) {
    return [formatRelativeAgoShort(elapsedMs)];
  }

  const dateLine = formatDateLine(created, !sameYear);
  return [dateLine, ...formatTimeLines(created, normalizedLocale)];
}

export function hasRenderableChatBubbleTimestamp(
  createdAtMs: number | undefined,
): createdAtMs is number {
  return typeof createdAtMs === "number" && Number.isFinite(createdAtMs) && createdAtMs > 0;
}

export function getNextChatBubbleTimestampUpdateDelayMs(
  createdAtMs: number | undefined,
  now = Date.now(),
): number | null {
  if (!hasRenderableChatBubbleTimestamp(createdAtMs)) return null;

  const elapsedMs = Math.max(0, now - createdAtMs);
  if (elapsedMs >= DAY_MS) return null;

  const unitMs = elapsedMs < MINUTE_MS
    ? SECOND_MS
    : elapsedMs < HOUR_MS
      ? MINUTE_MS
      : HOUR_MS;
  const remainder = elapsedMs % unitMs;
  const nextDelayMs = remainder === 0 ? unitMs : unitMs - remainder;

  return Math.max(MIN_RELATIVE_TIMESTAMP_REFRESH_DELAY_MS, Math.ceil(nextDelayMs));
}

export function formatChatBubbleTimestamp(
  createdAtMs: number | undefined,
  locale: string,
): string {
  return formatChatBubbleTimestampLines(createdAtMs, locale).join(" ");
}
