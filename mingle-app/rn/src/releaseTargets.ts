import {
  compareApiNamespaceVersions,
  parseApiNamespaceVersion,
} from './apiNamespace';

export type MingleReleaseTarget =
  | 'legacy_1_0_11'
  | 'v1_1_0'
  | 'v1_1_1'
  | 'v1_1_2'
  | 'v1_1_3'
  | 'v1_1_4'
  | 'v2_0_0'
  | 'unknown';

const V1_1_0_VERSION: readonly [number, number, number] = [1, 1, 0];
const V1_1_1_VERSION: readonly [number, number, number] = [1, 1, 1];
const V1_1_2_VERSION: readonly [number, number, number] = [1, 1, 2];
const V1_1_3_VERSION: readonly [number, number, number] = [1, 1, 3];
const V1_1_4_VERSION: readonly [number, number, number] = [1, 1, 4];
const V2_0_0_VERSION: readonly [number, number, number] = [2, 0, 0];
const DEDICATED_RELEASE_TARGET_LABELS = {
  v1_1_0: '1.1.0',
  v1_1_1: '1.1.1',
  v1_1_2: '1.1.2',
  v1_1_3: '1.1.3',
  v1_1_4: '1.1.4',
  v2_0_0: '2.0.0',
} as const;

export const DEFAULT_LEGACY_PRODUCTION_WEB_APP_BASE_URL = 'https://mingle-app-xi.vercel.app';
export const DEFAULT_LEGACY_PRODUCTION_WS_URL = 'wss://mingle-stt.fly.dev';

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
  const normalizedLowerValue = normalizedValue.toLowerCase();

  if (
    normalizedLowerValue.includes('mingle-app-devbox.photo-for-passport.com')
    || normalizedLowerValue.includes('mingle-stt-devbox.photo-for-passport.com')
  ) {
    return true;
  }

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

  if (compareApiNamespaceVersions(parsedNamespace.version, V2_0_0_VERSION) >= 0) {
    return 'v2_0_0';
  }
  if (compareApiNamespaceVersions(parsedNamespace.version, V1_1_4_VERSION) >= 0) {
    return 'v1_1_4';
  }
  if (compareApiNamespaceVersions(parsedNamespace.version, V1_1_3_VERSION) >= 0) {
    return 'v1_1_3';
  }
  if (compareApiNamespaceVersions(parsedNamespace.version, V1_1_2_VERSION) >= 0) {
    return 'v1_1_2';
  }
  if (compareApiNamespaceVersions(parsedNamespace.version, V1_1_1_VERSION) >= 0) {
    return 'v1_1_1';
  }
  if (compareApiNamespaceVersions(parsedNamespace.version, V1_1_0_VERSION) >= 0) {
    return 'v1_1_0';
  }
  return 'legacy_1_0_11';
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

  const releaseTarget = resolveMingleReleaseTarget(input.apiNamespace);
  if (
    releaseTarget !== 'v1_1_0'
    && releaseTarget !== 'v1_1_1'
    && releaseTarget !== 'v1_1_2'
    && releaseTarget !== 'v1_1_3'
    && releaseTarget !== 'v1_1_4'
    && releaseTarget !== 'v2_0_0'
  ) {
    return { ok: true };
  }
  const releaseTargetLabel = DEDICATED_RELEASE_TARGET_LABELS[releaseTarget];

  const normalizedWebAppBaseUrl = normalizeUrlForComparison(input.webAppBaseUrl);
  const normalizedWsUrl = normalizeUrlForComparison(input.wsUrl);
  const normalizedLegacyWebAppBaseUrl = normalizeUrlForComparison(
    input.legacyWebAppBaseUrl || DEFAULT_LEGACY_PRODUCTION_WEB_APP_BASE_URL,
  );
  const normalizedLegacyWsUrl = normalizeUrlForComparison(
    input.legacyWsUrl || DEFAULT_LEGACY_PRODUCTION_WS_URL,
  );
  const currentWebIsDevelopmentLike = isDevelopmentLikeTargetUrl(normalizedWebAppBaseUrl);
  const currentWsIsDevelopmentLike = isDevelopmentLikeTargetUrl(normalizedWsUrl);

  if (currentWebIsDevelopmentLike) {
    return { ok: true };
  }

  if (
    normalizedWebAppBaseUrl
    && normalizedLegacyWebAppBaseUrl
    && normalizedWebAppBaseUrl === normalizedLegacyWebAppBaseUrl
    && !currentWebIsDevelopmentLike
  ) {
    return {
      ok: false,
      error: `NEXT_PUBLIC_SITE_URL must point to a dedicated ${releaseTargetLabel} web deployment, not the legacy production host (${normalizedLegacyWebAppBaseUrl}).`,
    };
  }

  if (
    normalizedWsUrl
    && normalizedLegacyWsUrl
    && normalizedWsUrl === normalizedLegacyWsUrl
    && !currentWsIsDevelopmentLike
  ) {
    return {
      ok: false,
      error: `NEXT_PUBLIC_WS_URL must point to a dedicated ${releaseTargetLabel} STT deployment, not the legacy production host (${normalizedLegacyWsUrl}).`,
    };
  }

  return { ok: true };
}
