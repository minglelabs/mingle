// Detects failures that mean "this device has no usable network path right
// now" (no signal, DNS can't resolve anything, a captive portal/VPN is
// blocking traffic, the request never even reached a host) as opposed to
// failures where a host WAS reached but something else went wrong (a real
// backend outage, a bad cert, a refused/reset connection from a server that
// is up but broken). Only the former is safe to tell the user to fix by
// checking their own connection — codes that could equally mean "the server
// is down" (CannotConnectToHost, ERR_CONNECTION_REFUSED/RESET) or "this is a
// security problem, not a connectivity one" (SSL/cert errors) are
// deliberately left out so they keep surfacing the generic error copy
// instead. iOS reports this via NSURLErrorDomain codes; Android/Chromium
// reports it via a `net::ERR_*` string in the description.
export function isOfflineWebViewLoadError(
  event: { description?: string; code?: number; domain?: string },
): boolean {
  if (
    event.domain === 'NSURLErrorDomain'
    && (event.code === -1009 // NotConnectedToInternet
      || event.code === -1005 // NetworkConnectionLost
      || event.code === -1003 // CannotFindHost (DNS)
      || event.code === -1001) // TimedOut
  ) {
    return true;
  }
  const description = event.description || '';
  return /ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_NETWORK_ACCESS_DENIED|ERR_ADDRESS_UNREACHABLE|ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION_FAILED|ERR_TIMED_OUT|ERR_PROXY_CONNECTION_FAILED|ERR_TUNNEL_CONNECTION_FAILED/i.test(description);
}
