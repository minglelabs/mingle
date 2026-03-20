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
    const parts = new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
    }).formatToParts(date);

    let hour = "";
    let minute = "";
    let dayPeriod = "";

    for (const part of parts) {
      if (part.type === "hour") hour = part.value;
      if (part.type === "minute") minute = part.value;
      if (part.type === "dayPeriod") dayPeriod = part.value.trim();
    }

    const timeLine = hour && minute
      ? `${hour}:${minute}`
      : formatDate(date, locale, { hour: "numeric", minute: "2-digit" });

    return dayPeriod ? [timeLine, dayPeriod] : [timeLine];
  } catch {
    return [formatDate(date, "en", { hour: "numeric", minute: "2-digit" })];
  }
}

export function formatChatBubbleTimestampLines(
  createdAtMs: number | undefined,
  locale: string,
): string[] {
  if (!createdAtMs) return [];

  const normalizedLocale = normalizeLocale(locale);
  const now = Date.now();
  const created = new Date(createdAtMs);
  const current = new Date(now);

  if (Number.isNaN(created.getTime())) return [];

  const sameYear = created.getFullYear() === current.getFullYear();
  const elapsedMs = Math.max(0, now - createdAtMs);

  if (elapsedMs < 24 * 60 * 60 * 1000) {
    return [formatRelativeAgoShort(elapsedMs)];
  }

  const dateLine = formatDateLine(created, !sameYear);
  return [dateLine, ...formatTimeLines(created, normalizedLocale)];
}

export function formatChatBubbleTimestamp(
  createdAtMs: number | undefined,
  locale: string,
): string {
  return formatChatBubbleTimestampLines(createdAtMs, locale).join(" ");
}
