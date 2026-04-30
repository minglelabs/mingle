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

  it('maps 1.1.1 namespaces to the 1.1.1 release target', () => {
    expect(resolveMingleReleaseTarget('ios/v1.1.1')).toBe('v1_1_1');
    expect(resolveMingleReleaseTarget('android/v1.1.1')).toBe('v1_1_1');
  });

  it('maps 1.1.2 namespaces to the 1.1.2 release target', () => {
    expect(resolveMingleReleaseTarget('ios/v1.1.2')).toBe('v1_1_2');
    expect(resolveMingleReleaseTarget('android/v1.1.2')).toBe('v1_1_2');
  });

  it('maps 1.1.3 namespaces to the 1.1.3 release target', () => {
    expect(resolveMingleReleaseTarget('ios/v1.1.3')).toBe('v1_1_3');
    expect(resolveMingleReleaseTarget('android/v1.1.3')).toBe('v1_1_3');
    expect(resolveMingleReleaseTarget('android/v1.2.0')).toBe('v1_1_3');
  });

  it('maps 2.0.0 and later namespaces to the 2.0.0 release target', () => {
    expect(resolveMingleReleaseTarget('ios/v2.0.0')).toBe('v2_0_0');
    expect(resolveMingleReleaseTarget('android/v2.0.0')).toBe('v2_0_0');
    expect(resolveMingleReleaseTarget('android/v2.0.1')).toBe('v2_0_0');
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

  it('rejects legacy production targets for a 1.1.1 release target', () => {
    expect(validateDedicatedReleaseTargetConfig({
      apiNamespace: 'android/v1.1.1',
      webAppBaseUrl: 'https://mingle-app-v111.vercel.app',
      wsUrl: DEFAULT_LEGACY_PRODUCTION_WS_URL,
    })).toEqual({
      ok: false,
      error: `NEXT_PUBLIC_WS_URL must point to a dedicated 1.1.1 STT deployment, not the legacy production host (${DEFAULT_LEGACY_PRODUCTION_WS_URL}).`,
    });
  });

  it('rejects legacy production targets for a 1.1.2 release target', () => {
    expect(validateDedicatedReleaseTargetConfig({
      apiNamespace: 'android/v1.1.2',
      webAppBaseUrl: 'https://mingle-app-v112.vercel.app',
      wsUrl: DEFAULT_LEGACY_PRODUCTION_WS_URL,
    })).toEqual({
      ok: false,
      error: `NEXT_PUBLIC_WS_URL must point to a dedicated 1.1.2 STT deployment, not the legacy production host (${DEFAULT_LEGACY_PRODUCTION_WS_URL}).`,
    });
  });

  it('rejects legacy production targets for a 1.1.3 release target', () => {
    expect(validateDedicatedReleaseTargetConfig({
      apiNamespace: 'android/v1.1.3',
      webAppBaseUrl: 'https://mingle-app-v113.vercel.app',
      wsUrl: DEFAULT_LEGACY_PRODUCTION_WS_URL,
    })).toEqual({
      ok: false,
      error: `NEXT_PUBLIC_WS_URL must point to a dedicated 1.1.3 STT deployment, not the legacy production host (${DEFAULT_LEGACY_PRODUCTION_WS_URL}).`,
    });
  });

  it('rejects legacy production targets for a 2.0.0 release target', () => {
    expect(validateDedicatedReleaseTargetConfig({
      apiNamespace: 'android/v2.0.0',
      webAppBaseUrl: 'https://mingle-app-v200.vercel.app',
      wsUrl: DEFAULT_LEGACY_PRODUCTION_WS_URL,
    })).toEqual({
      ok: false,
      error: `NEXT_PUBLIC_WS_URL must point to a dedicated 2.0.0 STT deployment, not the legacy production host (${DEFAULT_LEGACY_PRODUCTION_WS_URL}).`,
    });
  });

  it('accepts development and devbox endpoints for local verification', () => {
    expect(validateDedicatedReleaseTargetConfig({
      apiNamespace: 'ios/v1.1.0',
      webAppBaseUrl: 'https://mingle-app-devbox.photo-for-passport.com',
      wsUrl: 'wss://mingle-stt-devbox.photo-for-passport.com',
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
