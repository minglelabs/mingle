import {
  isOfflineWebViewLoadError,
  isWebViewPageLoadFailureHttpStatus,
  resolveWebViewRetryUrl,
} from '../src/webViewLoadErrors';

describe('isOfflineWebViewLoadError', () => {
  it('treats device-side no-network signals as offline', () => {
    expect(isOfflineWebViewLoadError({ domain: 'NSURLErrorDomain', code: -1009 })).toBe(true); // NotConnectedToInternet
    expect(isOfflineWebViewLoadError({ domain: 'NSURLErrorDomain', code: -1018 })).toBe(true); // InternationalRoamingOff
    expect(isOfflineWebViewLoadError({ domain: 'NSURLErrorDomain', code: -1020 })).toBe(true); // DataNotAllowed
    expect(isOfflineWebViewLoadError({ description: 'net::ERR_INTERNET_DISCONNECTED' })).toBe(true);
    expect(isOfflineWebViewLoadError({ description: 'net::ERR_NETWORK_CHANGED' })).toBe(true);
    expect(isOfflineWebViewLoadError({ description: 'net::ERR_NETWORK_ACCESS_DENIED' })).toBe(true);
    expect(isOfflineWebViewLoadError({ description: 'net::ERR_PROXY_CONNECTION_FAILED' })).toBe(true);
    expect(isOfflineWebViewLoadError({ description: 'net::ERR_TUNNEL_CONNECTION_FAILED' })).toBe(true);
  });

  it('does not treat an unresponsive host as device offline', () => {
    // Timeouts, DNS failures and dropped connections happen just as well when
    // only our host is down — these must not be blamed on the user's
    // connection.
    expect(isOfflineWebViewLoadError({ domain: 'NSURLErrorDomain', code: -1001 })).toBe(false); // TimedOut
    expect(isOfflineWebViewLoadError({ domain: 'NSURLErrorDomain', code: -1003 })).toBe(false); // CannotFindHost
    expect(isOfflineWebViewLoadError({ domain: 'NSURLErrorDomain', code: -1005 })).toBe(false); // NetworkConnectionLost
    expect(isOfflineWebViewLoadError({ description: 'net::ERR_TIMED_OUT' })).toBe(false);
    expect(isOfflineWebViewLoadError({ description: 'net::ERR_CONNECTION_TIMED_OUT' })).toBe(false);
    expect(isOfflineWebViewLoadError({ description: 'net::ERR_NAME_NOT_RESOLVED' })).toBe(false);
    expect(isOfflineWebViewLoadError({ description: 'net::ERR_NAME_RESOLUTION_FAILED' })).toBe(false);
    expect(isOfflineWebViewLoadError({ description: 'net::ERR_ADDRESS_UNREACHABLE' })).toBe(false);
  });

  it('does not treat a reachable-but-broken host as offline', () => {
    expect(isOfflineWebViewLoadError({ domain: 'NSURLErrorDomain', code: -1004 })).toBe(false); // CannotConnectToHost
    expect(isOfflineWebViewLoadError({ domain: 'NSURLErrorDomain', code: -1200 })).toBe(false); // SecureConnectionFailed
    expect(isOfflineWebViewLoadError({ description: 'net::ERR_CONNECTION_REFUSED' })).toBe(false);
    expect(isOfflineWebViewLoadError({ description: 'net::ERR_CONNECTION_RESET' })).toBe(false);
    expect(isOfflineWebViewLoadError({ description: 'net::ERR_SSL_PROTOCOL_ERROR' })).toBe(false);
    expect(isOfflineWebViewLoadError({ description: 'net::ERR_CERT_AUTHORITY_INVALID' })).toBe(false);
  });

  it('does not misclassify an unrelated or missing description', () => {
    expect(isOfflineWebViewLoadError({})).toBe(false);
    expect(isOfflineWebViewLoadError({ description: 'webview_load_failed' })).toBe(false);
    expect(isOfflineWebViewLoadError({ domain: 'NSURLErrorDomain', code: -999 })).toBe(false);
    expect(isOfflineWebViewLoadError({ domain: 'OtherDomain', code: -1009 })).toBe(false);
  });
});

describe('resolveWebViewRetryUrl', () => {
  const roomUrl = 'https://mingle.example/ko/conversations/room-1?nativeUi=1';
  const listUrl = 'https://mingle.example/ko/conversations?nativeUi=1';

  it('keeps the page the user was on (e.g. an open room)', () => {
    expect(resolveWebViewRetryUrl([roomUrl, listUrl, listUrl])).toBe(roomUrl);
  });

  it('falls through non-http candidates to the next usable URL', () => {
    expect(resolveWebViewRetryUrl(['', 'about:blank', 'not a url', listUrl])).toBe(listUrl);
    expect(resolveWebViewRetryUrl([undefined, null, `  ${roomUrl}  `])).toBe(roomUrl);
  });

  it('returns an empty string when nothing is usable', () => {
    expect(resolveWebViewRetryUrl(['', 'data:text/html,x'])).toBe('');
  });
});

describe('isWebViewPageLoadFailureHttpStatus', () => {
  it('treats any client or server error as a WebView page load failure worth covering', () => {
    expect(isWebViewPageLoadFailureHttpStatus(404)).toBe(true);
    expect(isWebViewPageLoadFailureHttpStatus(401)).toBe(true);
    expect(isWebViewPageLoadFailureHttpStatus(500)).toBe(true);
    expect(isWebViewPageLoadFailureHttpStatus(503)).toBe(true);
    expect(isWebViewPageLoadFailureHttpStatus(200)).toBe(false);
    expect(isWebViewPageLoadFailureHttpStatus(304)).toBe(false);
  });
});
