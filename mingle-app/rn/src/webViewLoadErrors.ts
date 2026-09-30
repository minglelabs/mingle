// Detects failures that mean "this device itself has no usable network path
// right now" (airplane mode, cellular data off, no signal, the OS network
// stack switching interfaces, a local proxy/VPN refusing traffic) as opposed
// to failures where the device is online but OUR host could not be reached or
// misbehaved.
//
// Only device-side signals belong here, because this classification gates the
// one-shot switch to the fallback host: a device-offline error can never be
// fixed by pointing at another host, but a timeout / DNS failure / dropped
// connection can just as easily mean the primary host is down while the
// fallback host is healthy. Those ambiguous codes are therefore deliberately
// left out (TimedOut, CannotFindHost, NetworkConnectionLost, ERR_TIMED_OUT,
// ERR_NAME_NOT_RESOLVED, ERR_ADDRESS_UNREACHABLE, ...), together with codes
// that clearly point at the server (CannotConnectToHost,
// ERR_CONNECTION_REFUSED/RESET) or at security (SSL/cert errors).
//
// iOS reports this via NSURLErrorDomain codes; Android/Chromium reports it via
// a `net::ERR_*` string in the description.
const DEVICE_OFFLINE_NSURL_ERROR_CODES = new Set<number>([
  -1009, // NotConnectedToInternet
  -1018, // InternationalRoamingOff
  -1020, // DataNotAllowed (cellular data disabled)
]);

const DEVICE_OFFLINE_CHROMIUM_ERROR_PATTERN =
  /ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_NETWORK_ACCESS_DENIED|ERR_PROXY_CONNECTION_FAILED|ERR_TUNNEL_CONNECTION_FAILED/i;

export function isOfflineWebViewLoadError(
  event: { description?: string; code?: number; domain?: string },
): boolean {
  if (
    event.domain === 'NSURLErrorDomain'
    && typeof event.code === 'number'
    && DEVICE_OFFLINE_NSURL_ERROR_CODES.has(event.code)
  ) {
    return true;
  }
  const description = event.description || '';
  return DEVICE_OFFLINE_CHROMIUM_ERROR_PATTERN.test(description);
}

// Picks the URL the "retry" button should remount the WebView at: the page the
// user was actually on (e.g. an open conversation room) rather than the
// initial conversation-list URL. Candidates are tried in order; only absolute
// http(s) URLs qualify, so about:blank / data: / junk falls through.
export function resolveWebViewRetryUrl(candidates: ReadonlyArray<string | null | undefined>): string {
  for (const candidate of candidates) {
    const normalized = typeof candidate === 'string' ? candidate.trim() : '';
    if (!normalized) continue;
    try {
      const url = new URL(normalized);
      if (url.protocol === 'http:' || url.protocol === 'https:') return normalized;
    } catch {
      // not an absolute URL; try the next candidate
    }
  }
  return '';
}
