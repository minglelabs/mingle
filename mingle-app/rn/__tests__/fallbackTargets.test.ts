import {
  isWebViewPageLoadFailureHttpStatus,
  normalizeHttpBaseUrl,
  normalizeWsUrl,
  resolveDistinctFallbackTarget,
  shouldFallbackHttpStatus,
  shouldTryFallbackVersionPolicy,
} from '../src/fallbackTargets';

describe('fallbackTargets', () => {
  it('normalizes HTTP fallback base URLs', () => {
    expect(normalizeHttpBaseUrl(' https://mingle-1-1-4-production.up.railway.app/// ')).toBe(
      'https://mingle-1-1-4-production.up.railway.app',
    );
    expect(normalizeHttpBaseUrl('wss://mingle.example.com')).toBe('');
  });

  it('normalizes WebSocket fallback URLs', () => {
    expect(normalizeWsUrl(' wss://mingle-1-1-4-production.up.railway.app/stt ')).toBe(
      'wss://mingle-1-1-4-production.up.railway.app/stt',
    );
    expect(normalizeWsUrl(' wss://mingle-1-1-4-production.up.railway.app/stt/ ')).toBe(
      'wss://mingle-1-1-4-production.up.railway.app/stt',
    );
    expect(normalizeWsUrl('https://mingle.example.com')).toBe('');
  });

  it('uses fallback only when it differs from the primary target', () => {
    expect(resolveDistinctFallbackTarget(
      'https://railway.example.com',
      'https://mingle-1-1-4-production.up.railway.app',
    )).toBe('https://mingle-1-1-4-production.up.railway.app');
    expect(resolveDistinctFallbackTarget(
      'https://mingle-1-1-4-production.up.railway.app/',
      'https://mingle-1-1-4-production.up.railway.app',
    )).toBe('');
  });

  it('limits HTTP fallback to server-side failures', () => {
    expect(shouldFallbackHttpStatus(500)).toBe(true);
    expect(shouldFallbackHttpStatus(503)).toBe(true);
    expect(shouldFallbackHttpStatus(404)).toBe(false);
    expect(shouldFallbackHttpStatus(401)).toBe(false);
  });

  it('treats any client or server error as a WebView page load failure worth covering', () => {
    expect(isWebViewPageLoadFailureHttpStatus(404)).toBe(true);
    expect(isWebViewPageLoadFailureHttpStatus(401)).toBe(true);
    expect(isWebViewPageLoadFailureHttpStatus(500)).toBe(true);
    expect(isWebViewPageLoadFailureHttpStatus(503)).toBe(true);
    expect(isWebViewPageLoadFailureHttpStatus(200)).toBe(false);
    expect(isWebViewPageLoadFailureHttpStatus(304)).toBe(false);
  });

  it('never retries the version-policy check on a fallback host that is not configured', () => {
    expect(shouldTryFallbackVersionPolicy(false, undefined)).toBe(false);
    expect(shouldTryFallbackVersionPolicy(false, 500)).toBe(false);
    expect(shouldTryFallbackVersionPolicy(false, 404)).toBe(false);
  });

  it('retries the version-policy check on the fallback host only when it could plausibly help', () => {
    // No status at all means the primary host never responded (network
    // error/timeout/DNS) — trying the other host is worth it.
    expect(shouldTryFallbackVersionPolicy(true, undefined)).toBe(true);
    // The primary host responded but is itself broken (5xx) — worth trying
    // the other host.
    expect(shouldTryFallbackVersionPolicy(true, 500)).toBe(true);
    expect(shouldTryFallbackVersionPolicy(true, 503)).toBe(true);
    // The primary host responded with a client error — the fallback host
    // would fail the same way, so don't bother switching.
    expect(shouldTryFallbackVersionPolicy(true, 404)).toBe(false);
    expect(shouldTryFallbackVersionPolicy(true, 401)).toBe(false);
  });
});
