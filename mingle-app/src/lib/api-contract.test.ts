import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_API_NAMESPACE = process.env.NEXT_PUBLIC_API_NAMESPACE

function stubWindowSearch(search: string): void {
  vi.stubGlobal('window', {
    location: { search },
  } as unknown as Window & typeof globalThis)
}

async function loadApiContractModule() {
  vi.resetModules()
  return import('./api-contract')
}

describe('api-contract namespace guard', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    delete process.env.NEXT_PUBLIC_API_NAMESPACE
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (typeof ORIGINAL_API_NAMESPACE === 'string') {
      process.env.NEXT_PUBLIC_API_NAMESPACE = ORIGINAL_API_NAMESPACE
    } else {
      delete process.env.NEXT_PUBLIC_API_NAMESPACE
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
    '/api/ios/v1.0.4/translate/finalize',
    '/api/ios/v1.0.5/translate/finalize',
    '/api/ios/v1.0.6/translate/finalize',
    '/api/ios/v1.0.7/translate/finalize',
    '/api/ios/v1.0.8/translate/finalize',
    '/api/ios/v1.0.9/translate/finalize',
    '/api/ios/v1.0.11/translate/finalize',
    '/api/ios/v1.1.0/translate/finalize',
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
    stubWindowSearch('?apiNamespace=ios%2Fv1.0.6')
    const contract = await loadApiContractModule()
    expect(contract.clientApiNamespace).toBe('ios/v1.0.6')
  })

  it('allows Android query override when value is allow-listed', async () => {
    process.env.NEXT_PUBLIC_API_NAMESPACE = ''
    stubWindowSearch('?apiNs=android%2Fv1.0.6')
    const contract = await loadApiContractModule()
    expect(contract.clientApiNamespace).toBe('android/v1.0.6')
  })

  it('allows query override for older allow-listed namespaces', async () => {
    process.env.NEXT_PUBLIC_API_NAMESPACE = ''
    stubWindowSearch('?apiNamespace=android%2Fv1.0.10')
    const contract = await loadApiContractModule()
    expect(contract.clientApiNamespace).toBe('android/v1.0.10')
    expect(contract.buildClientApiPath('/tts/inworld')).toBe('/api/android/v1.0.10/tts/inworld')
  })

  it('ignores invalid query override values', async () => {
    process.env.NEXT_PUBLIC_API_NAMESPACE = 'ios/v1.1.0'
    stubWindowSearch('?apiNs=unknown%2Fnamespace')
    const contract = await loadApiContractModule()
    expect(contract.clientApiNamespace).toBe('ios/v1.1.0')
  })
})
