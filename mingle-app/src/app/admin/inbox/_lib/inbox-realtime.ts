/**
 * The admin inbox socket URL from `GET /admin/inbox/api/realtime-token`'s
 * `wsUrl`: absolute ws(s) URLs are used as is, http(s) URLs switch scheme,
 * and a same-origin path resolves against the page's origin. Anything else
 * (missing, unparsable, another scheme) is null: realtime is off and the
 * page relies on its 20 s poll.
 */
export function resolveAdminInboxWsUrl(
  rawWsUrl: unknown,
  location: { protocol: string; host: string },
): string | null {
  const configured = typeof rawWsUrl === 'string' ? rawWsUrl.trim() : ''
  if (!configured) return null
  try {
    const url = new URL(configured, `${location.protocol}//${location.host}`)
    if (url.protocol === 'http:') url.protocol = 'ws:'
    else if (url.protocol === 'https:') url.protocol = 'wss:'
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return null
    return url.toString()
  } catch {
    return null
  }
}

/** Appends the token query parameter to a socket URL. */
export function withRealtimeToken(wsUrl: string, token: string): string {
  const url = new URL(wsUrl)
  url.searchParams.set('token', token)
  return url.toString()
}
