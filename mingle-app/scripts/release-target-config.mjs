export const DEFAULT_LEGACY_PRODUCTION_WEB_APP_BASE_URL = 'https://mingle-app-xi.vercel.app';
export const DEFAULT_LEGACY_PRODUCTION_WS_URL = 'wss://mingle.up.railway.app';
const DEDICATED_RELEASE_TARGETS = new Set(['v1_1_0', 'v1_1_1', 'v1_1_2']);

function formatReleaseTargetForMessage(rawValue) {
  const match = /^v(\d+)_(\d+)_(\d+)$/.exec(typeof rawValue === 'string' ? rawValue.trim() : '');
  return match ? `${match[1]}.${match[2]}.${match[3]}` : rawValue;
}

function normalizeUrlForComparison(rawValue) {
  const normalizedValue = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!normalizedValue) return '';

  try {
    const parsed = new URL(normalizedValue);
    const pathname = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.protocol}//${parsed.host}${pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return normalizedValue.replace(/\/+$/, '');
  }
}

function isLoopbackUrl(rawValue) {
  const normalizedValue = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!normalizedValue) return false;

  try {
    const normalizedHost = new URL(normalizedValue).hostname.trim().toLowerCase();
    return normalizedHost === '127.0.0.1'
      || normalizedHost === 'localhost'
      || normalizedHost === '::1';
  } catch {
    return /(127\.0\.0\.1|localhost|::1)/i.test(normalizedValue);
  }
}

function isDevelopmentTunnelUrl(rawValue) {
  const normalizedValue = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!normalizedValue) return false;

  try {
    const normalizedHost = new URL(normalizedValue).hostname.toLowerCase();
    return normalizedHost.endsWith('.ngrok-free.dev')
      || normalizedHost.endsWith('.ngrok-free.app')
      || normalizedHost === 'mingle-app-devbox.photo-for-passport.com'
      || normalizedHost === 'mingle-stt-devbox.photo-for-passport.com';
  } catch {
    return /(\.ngrok-free\.(dev|app)|mingle-(app|stt)-devbox\.photo-for-passport\.com)/i.test(normalizedValue);
  }
}

function isDevelopmentLikeTargetUrl(rawValue) {
  return isLoopbackUrl(rawValue) || isDevelopmentTunnelUrl(rawValue);
}

export function parseBooleanEnv(rawValue) {
  return ['1', 'true', 'yes', 'on'].includes((rawValue || '').trim().toLowerCase());
}

export function validateReleaseTargetConfig(input) {
  if (!DEDICATED_RELEASE_TARGETS.has(input.releaseTarget) || input.allowLegacyProductionTargets) {
    return { ok: true };
  }

  const releaseTargetLabel = formatReleaseTargetForMessage(input.releaseTarget);
  const normalizedWebAppBaseUrl = normalizeUrlForComparison(input.siteUrl);
  const normalizedWsUrl = normalizeUrlForComparison(input.wsUrl);
  const normalizedLegacyWebAppBaseUrl = normalizeUrlForComparison(
    input.legacySiteUrl || DEFAULT_LEGACY_PRODUCTION_WEB_APP_BASE_URL,
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
      error: `NEXT_PUBLIC_SITE_URL must point to a dedicated ${releaseTargetLabel} web deployment, not the legacy production host (${normalizedLegacyWebAppBaseUrl}).`,
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
      error: `NEXT_PUBLIC_WS_URL must point to a dedicated ${releaseTargetLabel} STT deployment, not the legacy production host (${normalizedLegacyWsUrl}).`,
    };
  }

  return { ok: true };
}
