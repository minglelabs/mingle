import {
  normalizeHttpBaseUrl,
  normalizeWsUrl,
  resolveDistinctFallbackTarget,
  shouldFallbackHttpStatus,
} from '../src/fallbackTargets';

describe('fallbackTargets', () => {
  it('normalizes HTTP fallback base URLs', () => {
    expect(normalizeHttpBaseUrl(' https://mingle-app-xi.vercel.app/// ')).toBe(
      'https://mingle-app-xi.vercel.app',
    );
    expect(normalizeHttpBaseUrl('wss://mingle.example.com')).toBe('');
  });

  it('normalizes WebSocket fallback URLs', () => {
    expect(normalizeWsUrl(' wss://mingle.up.railway.app/stt ')).toBe(
      'wss://mingle.up.railway.app/stt',
    );
    expect(normalizeWsUrl('https://mingle.example.com')).toBe('');
  });

  it('uses fallback only when it differs from the primary target', () => {
    expect(resolveDistinctFallbackTarget(
      'https://railway.example.com',
      'https://mingle-app-xi.vercel.app',
    )).toBe('https://mingle-app-xi.vercel.app');
    expect(resolveDistinctFallbackTarget(
      'https://mingle-app-xi.vercel.app/',
      'https://mingle-app-xi.vercel.app',
    )).toBe('');
  });

  it('limits fallback to server-side or transport-style HTTP failures', () => {
    expect(shouldFallbackHttpStatus(500)).toBe(true);
    expect(shouldFallbackHttpStatus(503)).toBe(true);
    expect(shouldFallbackHttpStatus(404)).toBe(false);
    expect(shouldFallbackHttpStatus(401)).toBe(false);
  });
});
