import { NextRequest, NextResponse } from 'next/server'
import {
  getVersionPolicyCopy,
  resolveSupportedLocaleTag,
  type AppLocale,
} from '@/i18n'

type VersionTuple = [number, number, number]
type VersionPolicyAction = 'force_update' | 'recommend_update' | 'none'
type ClientPlatform = 'ios' | 'android'

type VersionPolicySnapshot = {
  minSupportedVersion: VersionTuple
  recommendBelowVersion: VersionTuple | null
  latestVersion: VersionTuple | null
  updateUrl: string
}

type VersionPolicySource =
  | 'env'
  | 'fallback_no_policy'
  | 'fallback_invalid'

type VersionPolicyAdMobConfig = {
  bannerUnitId: string
}

type VersionPolicyReadResult = {
  snapshot: VersionPolicySnapshot
  source: VersionPolicySource
  policyPlatform: ClientPlatform
}

const DEFAULT_MIN_SUPPORTED_VERSION: VersionTuple = [1, 0, 0]
const DEFAULT_CLIENT_PLATFORM: ClientPlatform = 'ios'
const CLIENT_PLATFORM_ALIASES: Record<string, ClientPlatform> = {
  ios: 'ios',
  iphone: 'ios',
  ipad: 'ios',
  android: 'android',
  aos: 'android',
}
const VERSION_POLICY_ENV_KEYS: Record<
  ClientPlatform,
  {
    minSupportedVersion: string
    recommendedBelowVersion: string
    latestVersion: string
    updateUrl: string
  }
> = {
  ios: {
    minSupportedVersion: 'IOS_CLIENT_MIN_SUPPORTED_VERSION',
    recommendedBelowVersion: 'IOS_CLIENT_RECOMMENDED_BELOW_VERSION',
    latestVersion: 'IOS_CLIENT_LATEST_VERSION',
    updateUrl: 'IOS_APPSTORE_URL',
  },
  android: {
    minSupportedVersion: 'ANDROID_CLIENT_MIN_SUPPORTED_VERSION',
    recommendedBelowVersion: 'ANDROID_CLIENT_RECOMMENDED_BELOW_VERSION',
    latestVersion: 'ANDROID_CLIENT_LATEST_VERSION',
    updateUrl: 'ANDROID_PLAYSTORE_URL',
  },
}
const VERSION_POLICY_ADMOB_ENV_KEYS: Record<ClientPlatform, { bannerUnitId: string }> = {
  ios: {
    bannerUnitId: 'RN_ADMOB_BANNER_UNIT_ID_IOS',
  },
  android: {
    bannerUnitId: 'RN_ADMOB_BANNER_UNIT_ID_ANDROID',
  },
}

const DEFAULT_LOCALE: AppLocale = 'en'

function resolveLocale(raw: unknown): AppLocale {
  if (typeof raw !== 'string') return DEFAULT_LOCALE
  return resolveSupportedLocaleTag(raw) || DEFAULT_LOCALE
}

function resolveClientPlatform(raw: unknown): ClientPlatform {
  if (typeof raw !== 'string') return DEFAULT_CLIENT_PLATFORM
  const normalized = raw.trim().toLowerCase()
  if (!normalized) return DEFAULT_CLIENT_PLATFORM
  return CLIENT_PLATFORM_ALIASES[normalized] || DEFAULT_CLIENT_PLATFORM
}

function normalizeVersionString(raw: string): string {
  return raw.trim().replace(/^v/i, '')
}

function parseSemver3(raw: string): VersionTuple | null {
  const normalized = normalizeVersionString(raw)
  if (!/^\d+\.\d+\.\d+$/.test(normalized)) return null

  const parts = normalized.split('.').map(part => Number.parseInt(part, 10))
  if (parts.length !== 3) return null
  if (parts.some(part => !Number.isFinite(part) || part < 0)) return null
  return [parts[0], parts[1], parts[2]]
}

function formatVersion(version: VersionTuple): string {
  return `${version[0]}.${version[1]}.${version[2]}`
}

function compareVersion(a: VersionTuple, b: VersionTuple): number {
  if (a[0] !== b[0]) return a[0] > b[0] ? 1 : -1
  if (a[1] !== b[1]) return a[1] > b[1] ? 1 : -1
  if (a[2] !== b[2]) return a[2] > b[2] ? 1 : -1
  return 0
}

function resolvePolicy(args: {
  clientVersion: VersionTuple | null
  minSupportedVersion: VersionTuple
  recommendBelowVersion: VersionTuple | null
}): VersionPolicyAction {
  if (!args.clientVersion) return 'force_update'
  if (compareVersion(args.clientVersion, args.minSupportedVersion) < 0) return 'force_update'
  if (args.recommendBelowVersion && compareVersion(args.clientVersion, args.recommendBelowVersion) < 0) {
    return 'recommend_update'
  }
  return 'none'
}

function buildFallbackPolicySnapshot(
  source: Exclude<VersionPolicySource, 'env'>,
  policyPlatform: ClientPlatform,
): VersionPolicyReadResult {
  return {
    source,
    policyPlatform,
    snapshot: {
      minSupportedVersion: DEFAULT_MIN_SUPPORTED_VERSION,
      recommendBelowVersion: null,
      latestVersion: null,
      updateUrl: '',
    },
  }
}

type ActivePolicyRecord = {
  minSupportedVersion: string
  recommendedBelowVersion: string | null
  latestVersion: string | null
  updateUrl: string | null
}

function readEnvValue(name: string): string {
  return process.env[name]?.trim() || ''
}

function readVersionPolicyEnvForPlatform(
  platform: ClientPlatform,
): ActivePolicyRecord | null {
  const envKeys = VERSION_POLICY_ENV_KEYS[platform]
  const minSupportedVersion = readEnvValue(envKeys.minSupportedVersion)
  if (!minSupportedVersion) return null

  return {
    minSupportedVersion,
    recommendedBelowVersion: readEnvValue(envKeys.recommendedBelowVersion) || null,
    latestVersion: readEnvValue(envKeys.latestVersion) || null,
    updateUrl: readEnvValue(envKeys.updateUrl) || null,
  }
}

function readVersionPolicyAdMobConfig(
  platform: ClientPlatform,
): VersionPolicyAdMobConfig {
  return {
    bannerUnitId: readEnvValue(VERSION_POLICY_ADMOB_ENV_KEYS[platform].bannerUnitId),
  }
}

async function readActiveVersionPolicy(
  requestedPlatform: ClientPlatform,
): Promise<VersionPolicyReadResult> {
  let policyPlatform: ClientPlatform = requestedPlatform
  let record = readVersionPolicyEnvForPlatform(policyPlatform)

  if (!record && requestedPlatform !== DEFAULT_CLIENT_PLATFORM) {
    policyPlatform = DEFAULT_CLIENT_PLATFORM
    record = readVersionPolicyEnvForPlatform(policyPlatform)
    if (record) {
      console.warn('[client-version-policy] fallback to ios policy env', {
        requestedPlatform,
        missingEnvKey: VERSION_POLICY_ENV_KEYS[requestedPlatform].minSupportedVersion,
      })
    }
  }

  if (!record) {
    console.error('[client-version-policy] no active policy env found', {
      requestedPlatform,
    })
    return buildFallbackPolicySnapshot('fallback_no_policy', requestedPlatform)
  }

  const minSupportedVersion = parseSemver3(record.minSupportedVersion)
  if (!minSupportedVersion) {
    console.error('[client-version-policy] active policy env has invalid min_supported_version', {
      policyPlatform,
      minSupportedVersion: record.minSupportedVersion,
      envKey: VERSION_POLICY_ENV_KEYS[policyPlatform].minSupportedVersion,
    })
    return buildFallbackPolicySnapshot('fallback_invalid', policyPlatform)
  }

  const recommendBelowVersion = record.recommendedBelowVersion
    ? parseSemver3(record.recommendedBelowVersion)
    : null

  if (record.recommendedBelowVersion && !recommendBelowVersion) {
    console.error('[client-version-policy] active policy env has invalid recommended_below_version', {
      policyPlatform,
      recommendedBelowVersion: record.recommendedBelowVersion,
      envKey: VERSION_POLICY_ENV_KEYS[policyPlatform].recommendedBelowVersion,
    })
  }

  const latestVersionFromPolicy = record.latestVersion
    ? parseSemver3(record.latestVersion)
    : null

  if (record.latestVersion && !latestVersionFromPolicy) {
    console.error('[client-version-policy] active policy env has invalid latest_version', {
      policyPlatform,
      latestVersion: record.latestVersion,
      envKey: VERSION_POLICY_ENV_KEYS[policyPlatform].latestVersion,
    })
  }

  const latestVersion = latestVersionFromPolicy || recommendBelowVersion || minSupportedVersion
  return {
    source: 'env',
    policyPlatform,
    snapshot: {
      minSupportedVersion,
      recommendBelowVersion,
      latestVersion,
      updateUrl: record.updateUrl?.trim() || '',
    },
  }
}

type HandleClientVersionPolicyOptions = {
  platformOverride?: ClientPlatform
}

export async function handleClientVersionPolicy(
  request: NextRequest,
  options?: HandleClientVersionPolicyOptions,
): Promise<NextResponse> {
  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    // tolerate empty/invalid body and treat as missing client version
  }

  const locale = resolveLocale(body.locale)
  const versionPolicyCopy = getVersionPolicyCopy(locale)
  const clientPlatform = options?.platformOverride || resolveClientPlatform(body.platform)
  const clientVersionRaw = typeof body.clientVersion === 'string' ? body.clientVersion : ''
  const clientBuildRaw = typeof body.clientBuild === 'string' ? body.clientBuild.trim() : ''
  const clientVersion = parseSemver3(clientVersionRaw)

  const policyRead = await readActiveVersionPolicy(clientPlatform)
  const adMobConfig = readVersionPolicyAdMobConfig(clientPlatform)

  const action = policyRead.source === 'env'
    ? resolvePolicy({
      clientVersion,
      minSupportedVersion: policyRead.snapshot.minSupportedVersion,
      recommendBelowVersion: policyRead.snapshot.recommendBelowVersion,
    })
    : 'force_update'

  const message = action === 'force_update'
    ? versionPolicyCopy.forceMessage
    : action === 'recommend_update'
      ? versionPolicyCopy.recommendMessage
      : ''

  const title = action === 'force_update'
    ? versionPolicyCopy.forceTitle
    : action === 'recommend_update'
      ? versionPolicyCopy.recommendTitle
      : ''

  const responseBody = {
    action,
    platform: clientPlatform,
    policyPlatform: policyRead.policyPlatform,
    locale,
    clientVersion: clientVersion ? formatVersion(clientVersion) : normalizeVersionString(clientVersionRaw),
    clientBuild: clientBuildRaw,
    minSupportedVersion: formatVersion(policyRead.snapshot.minSupportedVersion),
    recommendedBelowVersion: policyRead.snapshot.recommendBelowVersion ? formatVersion(policyRead.snapshot.recommendBelowVersion) : '',
    latestVersion: policyRead.snapshot.latestVersion ? formatVersion(policyRead.snapshot.latestVersion) : '',
    updateUrl: policyRead.snapshot.updateUrl,
    title,
    message,
    updateButtonLabel: versionPolicyCopy.updateButtonLabel,
    laterButtonLabel: versionPolicyCopy.laterButtonLabel,
    adMob: adMobConfig,
  }

  return NextResponse.json(responseBody, { status: 200 })
}

export async function handleIosClientVersionPolicy(
  request: NextRequest,
): Promise<NextResponse> {
  return handleClientVersionPolicy(request, { platformOverride: 'ios' })
}
