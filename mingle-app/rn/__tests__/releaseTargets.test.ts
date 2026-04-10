import {
  DEFAULT_LEGACY_PRODUCTION_WEB_APP_BASE_URL,
  DEFAULT_LEGACY_PRODUCTION_WS_URL,
  resolveMingleReleaseTarget,
  validateDedicatedReleaseTargetConfig,
} from '../src/releaseTargets';

describe('releaseTargets', () => {
  it('maps 1.0.11 and below namespaces to the legacy release target', () => {
    expect(resolveMingleReleaseTarget('ios/v1.0.11')).toBe('legacy_1_0_11');
    expect(resolveMingleReleaseTarget('android/v1.0.7')).toBe('legacy_1_0_11');
  });

  it('maps 1.1.0 namespaces to the dedicated release target', () => {
    expect(resolveMingleReleaseTarget('ios/v1.1.0')).toBe('v1_1_0');
    expect(resolveMingleReleaseTarget('android/v1.1.0')).toBe('v1_1_0');
  });

  it('rejects the legacy production web host for a 1.1.0 release target', () => {
    expect(validateDedicatedReleaseTargetConfig({
      apiNamespace: 'ios/v1.1.0',
      webAppBaseUrl: DEFAULT_LEGACY_PRODUCTION_WEB_APP_BASE_URL,
      wsUrl: 'wss://mingle-v110.up.railway.app',
    })).toEqual({
      ok: false,
      error: `NEXT_PUBLIC_SITE_URL must point to a dedicated 1.1.0 web deployment, not the legacy production host (${DEFAULT_LEGACY_PRODUCTION_WEB_APP_BASE_URL}).`,
    });
  });

  it('rejects the legacy production STT host for a 1.1.0 release target', () => {
    expect(validateDedicatedReleaseTargetConfig({
      apiNamespace: 'android/v1.1.0',
      webAppBaseUrl: 'https://mingle-app-v110.vercel.app',
      wsUrl: DEFAULT_LEGACY_PRODUCTION_WS_URL,
    })).toEqual({
      ok: false,
      error: `NEXT_PUBLIC_WS_URL must point to a dedicated 1.1.0 STT deployment, not the legacy production host (${DEFAULT_LEGACY_PRODUCTION_WS_URL}).`,
    });
  });

  it('accepts development and devbox endpoints for local verification', () => {
    expect(validateDedicatedReleaseTargetConfig({
      apiNamespace: 'ios/v1.1.0',
      webAppBaseUrl: 'https://mingle-app-devbox.photo-for-passport.com',
      wsUrl: 'wss://foo.ngrok-free.app',
    })).toEqual({ ok: true });
  });

  it('accepts legacy production targets for legacy namespaces', () => {
    expect(validateDedicatedReleaseTargetConfig({
      apiNamespace: 'ios/v1.0.11',
      webAppBaseUrl: DEFAULT_LEGACY_PRODUCTION_WEB_APP_BASE_URL,
      wsUrl: DEFAULT_LEGACY_PRODUCTION_WS_URL,
    })).toEqual({ ok: true });
  });
});
