import {
  compareApiNamespaceVersions,
  parseApiNamespaceVersion,
} from './apiNamespace';

export type MingleReleaseTarget = 'legacy_1_0_11' | 'v1_1_0' | 'unknown';

const V1_1_0_VERSION: readonly [number, number, number] = [1, 1, 0];

export const DEFAULT_LEGACY_PRODUCTION_WEB_APP_BASE_URL = 'https://mingle-app-xi.vercel.app';
export const DEFAULT_LEGACY_PRODUCTION_WS_URL = 'wss://mingle.up.railway.app';

function normalizeUrlForComparison(rawValue: string): string {
  const normalizedValue = rawValue.trim();
  if (!normalizedValue) return '';

  try {
    const parsed = new URL(normalizedValue);
    const pathname = parsed.pathname.replace(/\/+$/, '');
    const search = parsed.search;
    const hash = parsed.hash;
    return `${parsed.protocol}//${parsed.host}${pathname}${search}${hash}`;
  } catch {
    return normalizedValue.replace(/\/+$/, '');
  }
}

function isLoopbackUrl(rawValue: string): boolean {
  const normalizedValue = rawValue.trim();
  if (!normalizedValue) return false;

  try {
    const { hostname } = new URL(normalizedValue);
    const normalizedHost = hostname.trim().toLowerCase();
    return normalizedHost === '127.0.0.1'
      || normalizedHost === 'localhost'
      || normalizedHost === '::1';
  } catch {
    return /(127\.0\.0\.1|localhost|::1)/i.test(normalizedValue);
  }
}

function isDevelopmentTunnelUrl(rawValue: string): boolean {
  const normalizedValue = rawValue.trim();
  if (!normalizedValue) return false;

  try {
    const { hostname } = new URL(normalizedValue);
    const normalizedHost = hostname.toLowerCase();
    return normalizedHost.endsWith('.ngrok-free.dev')
      || normalizedHost.endsWith('.ngrok-free.app')
      || normalizedHost === 'mingle-app-devbox.photo-for-passport.com'
      || normalizedHost === 'mingle-stt-devbox.photo-for-passport.com';
  } catch {
    return /(\.ngrok-free\.(dev|app)|mingle-(app|stt)-devbox\.photo-for-passport\.com)/i.test(normalizedValue);
  }
}

function isDevelopmentLikeTargetUrl(rawValue: string): boolean {
  return isLoopbackUrl(rawValue) || isDevelopmentTunnelUrl(rawValue);
}

export function resolveMingleReleaseTarget(apiNamespace: string): MingleReleaseTarget {
  const parsedNamespace = parseApiNamespaceVersion(apiNamespace);
  if (!parsedNamespace) return 'unknown';

  return compareApiNamespaceVersions(parsedNamespace.version, V1_1_0_VERSION) >= 0
    ? 'v1_1_0'
    : 'legacy_1_0_11';
}

type ValidateDedicatedReleaseTargetInput = {
  apiNamespace: string;
  webAppBaseUrl: string;
  wsUrl: string;
  legacyWebAppBaseUrl?: string | null;
  legacyWsUrl?: string | null;
  allowLegacyProductionTargets?: boolean;
};

export function validateDedicatedReleaseTargetConfig(
  input: ValidateDedicatedReleaseTargetInput,
): { ok: true } | { ok: false; error: string } {
  if (input.allowLegacyProductionTargets) {
    return { ok: true };
  }

  if (resolveMingleReleaseTarget(input.apiNamespace) !== 'v1_1_0') {
    return { ok: true };
  }

  const normalizedWebAppBaseUrl = normalizeUrlForComparison(input.webAppBaseUrl);
  const normalizedWsUrl = normalizeUrlForComparison(input.wsUrl);
  const normalizedLegacyWebAppBaseUrl = normalizeUrlForComparison(
    input.legacyWebAppBaseUrl || DEFAULT_LEGACY_PRODUCTION_WEB_APP_BASE_URL,
  );
  const normalizedLegacyWsUrl = normalizeUrlForComparison(
    input.legacyWsUrl || DEFAULT_LEGACY_PRODUCTION_WS_URL,
  );

  if (
    normalizedWebAppBaseUrl
    && normalizedLegacyWebAppBaseUrl
    && normalizedWebAppBaseUrl === normalizedLegacyWebAppBaseUrl
    && !isDevelopmentLikeTargetUrl(normalizedWebAppBaseUrl)
  ) {
    return {
      ok: false,
      error: `NEXT_PUBLIC_SITE_URL must point to a dedicated 1.1.0 web deployment, not the legacy production host (${normalizedLegacyWebAppBaseUrl}).`,
    };
  }

  if (
    normalizedWsUrl
    && normalizedLegacyWsUrl
    && normalizedWsUrl === normalizedLegacyWsUrl
    && !isDevelopmentLikeTargetUrl(normalizedWsUrl)
  ) {
    return {
      ok: false,
      error: `NEXT_PUBLIC_WS_URL must point to a dedicated 1.1.0 STT deployment, not the legacy production host (${normalizedLegacyWsUrl}).`,
    };
  }

  return { ok: true };
}
