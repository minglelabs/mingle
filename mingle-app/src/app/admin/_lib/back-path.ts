/**
 * The screen a back link returns to travels in the address (`?back=`), so a
 * screen opened from a list page 3 goes back to page 3, not to the list's start.
 */
const MAX_BACK_LENGTH = 600

/** An in-admin path from a `back` parameter, or null for anything else (other origins, other apps). */
export function safeBackPath(value: string | string[] | undefined | null): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_BACK_LENGTH) return null
  if (!raw.startsWith('/admin/') || raw.startsWith('//') || raw.includes('\\')) return null
  return raw
}

/** `href` carrying the screen to return to. */
export function withBack(href: string, back: string): string {
  return `${href}${href.includes('?') ? '&' : '?'}back=${encodeURIComponent(back)}`
}
