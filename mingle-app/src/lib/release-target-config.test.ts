import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LEGACY_PRODUCTION_WEB_APP_BASE_URL,
  DEFAULT_LEGACY_PRODUCTION_WS_URL,
  parseBooleanEnv,
  validateReleaseTargetConfig,
} from '../../scripts/release-target-config.mjs';

describe('release-target-config', () => {
  it('accepts empty and legacy release targets without dedicated endpoint checks', () => {
    expect(validateReleaseTargetConfig({
      releaseTarget: '',
      siteUrl: DEFAULT_LEGACY_PRODUCTION_WEB_APP_BASE_URL,
      wsUrl: DEFAULT_LEGACY_PRODUCTION_WS_URL,
    })).toEqual({ ok: true });
  });

  it('rejects the legacy production web host for a v1_1_0 release build', () => {
    expect(validateReleaseTargetConfig({
      releaseTarget: 'v1_1_0',
      siteUrl: DEFAULT_LEGACY_PRODUCTION_WEB_APP_BASE_URL,
      wsUrl: 'wss://mingle-v110.up.railway.app',
    })).toEqual({
      ok: false,
      error: `NEXT_PUBLIC_SITE_URL must point to a dedicated 1.1.0 web deployment, not the legacy production host (${DEFAULT_LEGACY_PRODUCTION_WEB_APP_BASE_URL}).`,
    });
  });

  it('rejects the legacy production STT host for a v1_1_0 release build', () => {
    expect(validateReleaseTargetConfig({
      releaseTarget: 'v1_1_0',
      siteUrl: 'https://mingle-app-v110.vercel.app',
      wsUrl: DEFAULT_LEGACY_PRODUCTION_WS_URL,
    })).toEqual({
      ok: false,
      error: `NEXT_PUBLIC_WS_URL must point to a dedicated 1.1.0 STT deployment, not the legacy production host (${DEFAULT_LEGACY_PRODUCTION_WS_URL}).`,
    });
  });

  it('accepts devbox and ngrok endpoints for local verification', () => {
    expect(validateReleaseTargetConfig({
      releaseTarget: 'v1_1_0',
      siteUrl: 'https://mingle-app-devbox.photo-for-passport.com',
      wsUrl: 'wss://foo.ngrok-free.app',
    })).toEqual({ ok: true });
  });

  it('parses boolean env values', () => {
    expect(parseBooleanEnv('true')).toBe(true);
    expect(parseBooleanEnv('on')).toBe(true);
    expect(parseBooleanEnv('0')).toBe(false);
  });
});
