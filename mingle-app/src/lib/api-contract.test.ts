import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_API_NAMESPACE = process.env.NEXT_PUBLIC_API_NAMESPACE
const ORIGINAL_RELEASE_TARGET = process.env.NEXT_PUBLIC_MINGLE_RELEASE_TARGET

function stubBrowserRuntime(input: {
  search: string
  userAgent?: string
  platform?: string
  maxTouchPoints?: number
}): void {
  vi.stubGlobal('window', {
    location: { search: input.search },
  } as unknown as Window & typeof globalThis)
  vi.stubGlobal('navigator', {
    userAgent: input.userAgent || '',
    platform: input.platform || '',
    maxTouchPoints: input.maxTouchPoints ?? 0,
  } as unknown as Navigator)
}

async function loadApiContractModule() {
  vi.resetModules()
  return import('./api-contract')
}

describe('api-contract namespace guard', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    delete process.env.NEXT_PUBLIC_API_NAMESPACE
    delete process.env.NEXT_PUBLIC_MINGLE_RELEASE_TARGET
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (typeof ORIGINAL_API_NAMESPACE === 'string') {
      process.env.NEXT_PUBLIC_API_NAMESPACE = ORIGINAL_API_NAMESPACE
    } else {
      delete process.env.NEXT_PUBLIC_API_NAMESPACE
    }
    if (typeof ORIGINAL_RELEASE_TARGET === 'string') {
      process.env.NEXT_PUBLIC_MINGLE_RELEASE_TARGET = ORIGINAL_RELEASE_TARGET
    } else {
      delete process.env.NEXT_PUBLIC_MINGLE_RELEASE_TARGET
    }
  })

  it('uses default namespace when nothing is configured', async () => {
    const contract = await loadApiContractModule()

    expect(contract.clientApiNamespace).toBe('')
    expect(contract.buildClientApiPath('/translate/finalize')).toBe('/api/translate/finalize')
  })

  it('accepts only allowed env namespace values', async () => {
    process.env.NEXT_PUBLIC_API_NAMESPACE = 'ios/v1.1.0'
    const contract = await loadApiContractModule()
    expect(contract.clientApiNamespace).toBe('ios/v1.1.0')
  })

  it('accepts Android env namespace values', async () => {
    process.env.NEXT_PUBLIC_API_NAMESPACE = 'android/v1.1.0'
    const contract = await loadApiContractModule()
    expect(contract.clientApiNamespace).toBe('android/v1.1.0')
    expect(contract.buildClientApiPath('/translate/finalize')).toBe('/api/android/v1.1.0/translate/finalize')
  })

  it('accepts 1.1.1 env namespace values without changing the default client namespace', async () => {
    process.env.NEXT_PUBLIC_API_NAMESPACE = 'ios/v1.1.1'
    const contract = await loadApiContractModule()
    expect(contract.clientApiNamespace).toBe('ios/v1.1.1')
    expect(contract.buildClientApiPath('/conversations')).toBe('/api/ios/v1.1.1/conversations')
  })

  it('accepts 1.1.2 env namespace values without changing the default client namespace', async () => {
    process.env.NEXT_PUBLIC_API_NAMESPACE = 'ios/v1.1.2'
    const contract = await loadApiContractModule()
    expect(contract.clientApiNamespace).toBe('ios/v1.1.2')
    expect(contract.buildClientApiPath('/conversations')).toBe('/api/ios/v1.1.2/conversations')
  })

  it('keeps v1.0.10 namespaces allow-listed for older installed apps', async () => {
    process.env.NEXT_PUBLIC_API_NAMESPACE = 'ios/v1.0.10'
    const contract = await loadApiContractModule()
    expect(contract.clientApiNamespace).toBe('ios/v1.0.10')
    expect(contract.buildClientApiPath('/translate/finalize')).toBe('/api/ios/v1.0.10/translate/finalize')
  })

  it.each([
    '/api/android/v1.0.4/translate/finalize',
    '/api/android/v1.0.5/translate/finalize',
    '/api/android/v1.0.6/translate/finalize',
    '/api/android/v1.0.7/translate/finalize',
    '/api/android/v1.0.8/translate/finalize',
    '/api/android/v1.0.9/translate/finalize',
    '/api/android/v1.0.11/translate/finalize',
    '/api/android/v1.1.0/translate/finalize',
    '/api/android/v1.1.1/translate/finalize',
    '/api/android/v1.1.2/translate/finalize',
    '/api/ios/v1.0.4/translate/finalize',
    '/api/ios/v1.0.5/translate/finalize',
    '/api/ios/v1.0.6/translate/finalize',
    '/api/ios/v1.0.7/translate/finalize',
    '/api/ios/v1.0.8/translate/finalize',
    '/api/ios/v1.0.9/translate/finalize',
    '/api/ios/v1.0.11/translate/finalize',
    '/api/ios/v1.1.0/translate/finalize',
    '/api/ios/v1.1.1/translate/finalize',
    '/api/ios/v1.1.2/translate/finalize',
  ])('enables final source-language redetection for %s', async (pathname) => {
    const contract = await loadApiContractModule()
    expect(contract.shouldRedetectFinalizeSourceLanguage(pathname)).toBe(true)
  })

  it.each([
    '/api/translate/finalize',
    '/api/android/v1.0.0/translate/finalize',
    '/api/android/v1.0.3/translate/finalize',
    '/api/ios/v1.0.2/translate/finalize',
    '/api/ios/v1.0.3/translate/finalize',
  ])('disables final source-language redetection for %s', async (pathname) => {
    const contract = await loadApiContractModule()
    expect(contract.shouldRedetectFinalizeSourceLanguage(pathname)).toBe(false)
  })

  it('ignores invalid env namespace values', async () => {
    process.env.NEXT_PUBLIC_API_NAMESPACE = 'ios/v9.0.0'
    const contract = await loadApiContractModule()
    expect(contract.clientApiNamespace).toBe('')
  })

  it('allows query override only when value is allow-listed', async () => {
    process.env.NEXT_PUBLIC_API_NAMESPACE = ''
    stubBrowserRuntime({ search: '?apiNamespace=ios%2Fv1.0.6' })
    const contract = await loadApiContractModule()
    expect(contract.clientApiNamespace).toBe('ios/v1.0.6')
  })

  it('allows Android query override when value is allow-listed', async () => {
    process.env.NEXT_PUBLIC_API_NAMESPACE = ''
    stubBrowserRuntime({ search: '?apiNs=android%2Fv1.0.6' })
    const contract = await loadApiContractModule()
    expect(contract.clientApiNamespace).toBe('android/v1.0.6')
  })

  it('allows query override for older allow-listed namespaces', async () => {
    process.env.NEXT_PUBLIC_API_NAMESPACE = ''
    stubBrowserRuntime({ search: '?apiNamespace=android%2Fv1.0.10' })
    const contract = await loadApiContractModule()
    expect(contract.clientApiNamespace).toBe('android/v1.0.10')
    expect(contract.buildClientApiPath('/tts/inworld')).toBe('/api/android/v1.0.10/tts/inworld')
  })

  it('ignores invalid query override values', async () => {
    process.env.NEXT_PUBLIC_API_NAMESPACE = 'ios/v1.1.0'
    stubBrowserRuntime({ search: '?apiNs=unknown%2Fnamespace' })
    const contract = await loadApiContractModule()
    expect(contract.clientApiNamespace).toBe('ios/v1.1.0')
  })

  it('defaults query-less dedicated 1.1.0 Android hosts to Android v1.1.0 APIs', async () => {
    process.env.NEXT_PUBLIC_API_NAMESPACE = ''
    process.env.NEXT_PUBLIC_MINGLE_RELEASE_TARGET = 'v1_1_0'
    stubBrowserRuntime({
      search: '',
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/123.0.0.0 Mobile Safari/537.36',
      platform: 'Linux armv8l',
    })
    const contract = await loadApiContractModule()
    expect(contract.clientApiNamespace).toBe('android/v1.1.0')
    expect(contract.buildClientApiPath('/conversations')).toBe('/api/android/v1.1.0/conversations')
  })

  it('defaults query-less dedicated 1.1.0 iOS hosts to iOS v1.1.0 APIs', async () => {
    process.env.NEXT_PUBLIC_API_NAMESPACE = ''
    process.env.NEXT_PUBLIC_MINGLE_RELEASE_TARGET = 'v1_1_0'
    stubBrowserRuntime({
      search: '',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    })
    const contract = await loadApiContractModule()
    expect(contract.clientApiNamespace).toBe('ios/v1.1.0')
    expect(contract.buildClientApiPath('/translate/finalize')).toBe('/api/ios/v1.1.0/translate/finalize')
  })

  it('defaults query-less dedicated 1.1.1 Android hosts to Android v1.1.1 APIs', async () => {
    process.env.NEXT_PUBLIC_API_NAMESPACE = ''
    process.env.NEXT_PUBLIC_MINGLE_RELEASE_TARGET = 'v1_1_1'
    stubBrowserRuntime({
      search: '',
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/123.0.0.0 Mobile Safari/537.36',
      platform: 'Linux armv8l',
    })
    const contract = await loadApiContractModule()
    expect(contract.clientApiNamespace).toBe('android/v1.1.1')
    expect(contract.buildClientApiPath('/conversations')).toBe('/api/android/v1.1.1/conversations')
  })

  it('defaults query-less dedicated 1.1.1 iOS hosts to iOS v1.1.1 APIs', async () => {
    process.env.NEXT_PUBLIC_API_NAMESPACE = ''
    process.env.NEXT_PUBLIC_MINGLE_RELEASE_TARGET = 'v1_1_1'
    stubBrowserRuntime({
      search: '',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    })
    const contract = await loadApiContractModule()
    expect(contract.clientApiNamespace).toBe('ios/v1.1.1')
    expect(contract.buildClientApiPath('/translate/finalize')).toBe('/api/ios/v1.1.1/translate/finalize')
  })

  it('defaults query-less dedicated 1.1.2 Android hosts to Android v1.1.2 APIs', async () => {
    process.env.NEXT_PUBLIC_API_NAMESPACE = ''
    process.env.NEXT_PUBLIC_MINGLE_RELEASE_TARGET = 'v1_1_2'
    stubBrowserRuntime({
      search: '',
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/123.0.0.0 Mobile Safari/537.36',
      platform: 'Linux armv8l',
    })
    const contract = await loadApiContractModule()
    expect(contract.clientApiNamespace).toBe('android/v1.1.2')
    expect(contract.buildClientApiPath('/conversations')).toBe('/api/android/v1.1.2/conversations')
  })

  it('defaults query-less dedicated 1.1.2 iOS hosts to iOS v1.1.2 APIs', async () => {
    process.env.NEXT_PUBLIC_API_NAMESPACE = ''
    process.env.NEXT_PUBLIC_MINGLE_RELEASE_TARGET = 'v1_1_2'
    stubBrowserRuntime({
      search: '',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    })
    const contract = await loadApiContractModule()
    expect(contract.clientApiNamespace).toBe('ios/v1.1.2')
    expect(contract.buildClientApiPath('/translate/finalize')).toBe('/api/ios/v1.1.2/translate/finalize')
  })
})
