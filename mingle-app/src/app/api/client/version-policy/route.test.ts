import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const VERSION_POLICY_ENV_NAMES = [
  'IOS_CLIENT_MIN_SUPPORTED_VERSION',
  'IOS_CLIENT_RECOMMENDED_BELOW_VERSION',
  'IOS_CLIENT_LATEST_VERSION',
  'IOS_APPSTORE_URL',
  'ANDROID_CLIENT_MIN_SUPPORTED_VERSION',
  'ANDROID_CLIENT_RECOMMENDED_BELOW_VERSION',
  'ANDROID_CLIENT_LATEST_VERSION',
  'ANDROID_PLAYSTORE_URL',
] as const

const ORIGINAL_VERSION_POLICY_ENV = Object.fromEntries(
  VERSION_POLICY_ENV_NAMES.map(name => [name, process.env[name]]),
) as Record<(typeof VERSION_POLICY_ENV_NAMES)[number], string | undefined>

function restoreVersionPolicyEnv() {
  for (const name of VERSION_POLICY_ENV_NAMES) {
    const originalValue = ORIGINAL_VERSION_POLICY_ENV[name]
    if (originalValue === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = originalValue
    }
  }
}

function seedDefaultIosPolicyEnv() {
  process.env.IOS_CLIENT_MIN_SUPPORTED_VERSION = '1.0.0'
  process.env.IOS_CLIENT_RECOMMENDED_BELOW_VERSION = '1.2.0'
  process.env.IOS_CLIENT_LATEST_VERSION = '1.3.0'
  process.env.IOS_APPSTORE_URL = 'https://apps.apple.com/app/id6759795134'
}

function makeRequest(version: string, locale?: string, platform?: string): Request {
  return new Request('http://localhost:3000/api/client/version-policy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientVersion: version,
      clientBuild: '123',
      locale: locale || 'ko',
      platform: platform || 'ios',
    }),
  })
}

async function loadLegacyRoutePost() {
  vi.resetModules()
  const mod = await import('@/app/api/client/version-policy/route')
  return mod.POST
}

const FORCE_LOCALIZATION_CASES = [
  { locale: 'ko', title: '업데이트 필요', updateButtonLabel: '업데이트', laterButtonLabel: '나중에' },
  { locale: 'en', title: 'Update Required', updateButtonLabel: 'Update', laterButtonLabel: 'Later' },
  { locale: 'ja', title: 'アップデートが必要です', updateButtonLabel: 'アップデート', laterButtonLabel: 'あとで' },
  { locale: 'zh-CN', title: '更新必需', updateButtonLabel: '更新', laterButtonLabel: '稍后' },
  { locale: 'zh-TW', title: '必須更新', updateButtonLabel: '更新', laterButtonLabel: '稍後' },
  { locale: 'fr', title: 'Mise à jour requise', updateButtonLabel: 'Mettre à jour', laterButtonLabel: 'Plus tard' },
  { locale: 'de', title: 'Update erforderlich', updateButtonLabel: 'Aktualisieren', laterButtonLabel: 'Später' },
  { locale: 'es', title: 'Actualización obligatoria', updateButtonLabel: 'Actualizar', laterButtonLabel: 'Más tarde' },
  { locale: 'pt', title: 'Atualização obrigatória', updateButtonLabel: 'Atualizar', laterButtonLabel: 'Mais tarde' },
  { locale: 'it', title: 'Aggiornamento obbligatorio', updateButtonLabel: 'Aggiorna', laterButtonLabel: 'Più tardi' },
  { locale: 'ru', title: 'Требуется обновление', updateButtonLabel: 'Обновить', laterButtonLabel: 'Позже' },
  { locale: 'ar', title: 'التحديث مطلوب', updateButtonLabel: 'تحديث', laterButtonLabel: 'لاحقًا' },
  { locale: 'hi', title: 'अपडेट आवश्यक', updateButtonLabel: 'अपडेट करें', laterButtonLabel: 'बाद में' },
  { locale: 'th', title: 'จำเป็นต้องอัปเดต', updateButtonLabel: 'อัปเดต', laterButtonLabel: 'ภายหลัง' },
  { locale: 'vi', title: 'Cần cập nhật', updateButtonLabel: 'Cập nhật', laterButtonLabel: 'Để sau' },
  { locale: 'pl', title: 'Wymagana aktualizacja', updateButtonLabel: 'Aktualizacja', laterButtonLabel: 'Później' },
  { locale: 'af', title: 'Opdatering vereis', updateButtonLabel: 'Dateer op', laterButtonLabel: 'Later' },
] as const

describe('/api/client/version-policy route', () => {
  beforeEach(() => {
    restoreVersionPolicyEnv()
    seedDefaultIosPolicyEnv()
  })

  afterAll(() => {
    restoreVersionPolicyEnv()
  })

  it('returns force_update when client version is below supported minimum', async () => {
    const POST = await loadLegacyRoutePost()
    const response = await POST(makeRequest('0.9.9', 'ko') as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.action).toBe('force_update')
    expect(json.locale).toBe('ko')
    expect(json.minSupportedVersion).toBe('1.0.0')
    expect(json.latestVersion).toBe('1.3.0')
    expect(json.updateUrl).toBe('https://apps.apple.com/app/id6759795134')
    expect(json.title).toBe('업데이트 필요')
    expect(json.message).toContain('최신 버전으로 업데이트')
    expect(json.updateButtonLabel).toBe('업데이트')
    expect(json.laterButtonLabel).toBe('나중에')
  })

  it('returns recommend_update when client version is supported but below recommended threshold', async () => {
    const POST = await loadLegacyRoutePost()
    const response = await POST(makeRequest('1.1.5') as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.action).toBe('recommend_update')
    expect(json.recommendedBelowVersion).toBe('1.2.0')
  })

  it('uses request platform env for policy lookup', async () => {
    process.env.ANDROID_CLIENT_MIN_SUPPORTED_VERSION = '2.0.0'
    process.env.ANDROID_CLIENT_RECOMMENDED_BELOW_VERSION = '2.1.0'
    process.env.ANDROID_CLIENT_LATEST_VERSION = '2.2.0'
    process.env.ANDROID_PLAYSTORE_URL =
      'https://play.google.com/store/apps/details?id=com.minglelabs.mingle.rn'

    const POST = await loadLegacyRoutePost()
    const response = await POST(makeRequest('2.0.5', 'en', 'android') as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.platform).toBe('android')
    expect(json.policyPlatform).toBe('android')
    expect(json.minSupportedVersion).toBe('2.0.0')
    expect(json.recommendedBelowVersion).toBe('2.1.0')
    expect(json.latestVersion).toBe('2.2.0')
    expect(json.updateUrl).toBe(
      'https://play.google.com/store/apps/details?id=com.minglelabs.mingle.rn',
    )
  })

  it('falls back to ios policy env when android env is missing', async () => {
    const POST = await loadLegacyRoutePost()
    const response = await POST(makeRequest('1.1.0', 'en', 'android') as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.action).toBe('recommend_update')
    expect(json.platform).toBe('android')
    expect(json.policyPlatform).toBe('ios')
  })

  it('returns none when client version is already up to date enough', async () => {
    const POST = await loadLegacyRoutePost()
    const response = await POST(makeRequest('1.3.0') as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.action).toBe('none')
    expect(json.message).toBe('')
    expect(json.title).toBe('')
  })

  it.each(FORCE_LOCALIZATION_CASES)(
    'returns localized force_update copy for %s',
    async ({ locale, title, updateButtonLabel, laterButtonLabel }) => {
      const POST = await loadLegacyRoutePost()
      const response = await POST(makeRequest('0.9.9', locale) as never)
      const json = await response.json()

      expect(json.action).toBe('force_update')
      expect(json.locale).toBe(locale)
      expect(json.title).toBe(title)
      expect(json.message).toBeTruthy()
      expect(json.updateButtonLabel).toBe(updateButtonLabel)
      expect(json.laterButtonLabel).toBe(laterButtonLabel)
    },
  )

  it('normalizes Chinese locale aliases to zh-CN/zh-TW', async () => {
    const POST = await loadLegacyRoutePost()
    const zhHant = await POST(makeRequest('0.9.9', 'zh-Hant') as never)
    const zhHantJson = await zhHant.json()
    const zhGeneric = await POST(makeRequest('0.9.9', 'zh') as never)
    const zhGenericJson = await zhGeneric.json()

    expect(zhHantJson.locale).toBe('zh-TW')
    expect(zhHantJson.title).toBe('必須更新')
    expect(zhGenericJson.locale).toBe('zh-CN')
    expect(zhGenericJson.title).toBe('更新必需')
  })

  it('returns recommend_update with localized titles and labels', async () => {
    const POST = await loadLegacyRoutePost()
    const response = await POST(makeRequest('1.1.5', 'fr') as never)
    const json = await response.json()

    expect(json.action).toBe('recommend_update')
    expect(json.locale).toBe('fr')
    expect(json.title).toBe('Mise à jour recommandée')
    expect(json.updateButtonLabel).toBe('Mettre à jour')
    expect(json.laterButtonLabel).toBe('Plus tard')
  })

  it('returns localized copy for newly supported locales', async () => {
    const POST = await loadLegacyRoutePost()
    const response = await POST(makeRequest('0.9.9', 'pl-PL') as never)
    const json = await response.json()

    expect(json.locale).toBe('pl')
    expect(json.title).toBe('Wymagana aktualizacja')
    expect(json.updateButtonLabel).toBe('Aktualizacja')
    expect(json.laterButtonLabel).toBe('Później')
  })

  it('falls back to English when locale is unsupported', async () => {
    const POST = await loadLegacyRoutePost()
    const response = await POST(makeRequest('0.9.9', 'xx-YY') as never)
    const json = await response.json()

    expect(json.locale).toBe('en')
    expect(json.title).toBe('Update Required')
  })

  it('returns force_update when client version format is invalid', async () => {
    const POST = await loadLegacyRoutePost()
    const response = await POST(makeRequest('1.0') as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.action).toBe('force_update')
  })

  it('fails closed when no active policy env exists', async () => {
    for (const name of VERSION_POLICY_ENV_NAMES) delete process.env[name]

    const POST = await loadLegacyRoutePost()
    const response = await POST(makeRequest('1.0.0', 'en') as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.action).toBe('force_update')
    expect(json.minSupportedVersion).toBe('1.0.0')
    expect(json.recommendedBelowVersion).toBe('')
    expect(json.latestVersion).toBe('')
    expect(json.updateUrl).toBe('')
    expect(json.title).toBe('Update Required')
  })

  it('fails closed when required min version env is invalid', async () => {
    process.env.IOS_CLIENT_MIN_SUPPORTED_VERSION = '1.0'

    const POST = await loadLegacyRoutePost()
    const response = await POST(makeRequest('9.9.9', 'en') as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.action).toBe('force_update')
    expect(json.minSupportedVersion).toBe('1.0.0')
    expect(json.latestVersion).toBe('')
  })

  it('falls back latestVersion to recommendedBelowVersion when latest env is invalid', async () => {
    process.env.IOS_CLIENT_LATEST_VERSION = 'invalid'

    const POST = await loadLegacyRoutePost()
    const response = await POST(makeRequest('1.1.5', 'en') as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.action).toBe('recommend_update')
    expect(json.latestVersion).toBe('1.2.0')
  })
})
