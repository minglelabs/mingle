import {
  normalizeHttpBaseUrl,
  normalizeWsUrl,
  resolveDistinctFallbackTarget,
  shouldFallbackHttpStatus,
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
});
