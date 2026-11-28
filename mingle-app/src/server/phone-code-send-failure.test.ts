import { afterEach, describe, expect, it, vi } from 'vitest'

const captured: Array<{ distinctId: string; event: string; properties?: Record<string, unknown> }> = []
vi.mock('@/lib/posthog-server', () => ({
  captureMingleEvent: (args: { distinctId: string; event: string; properties?: Record<string, unknown> }) => {
    captured.push(args)
  },
}))

const { reportPhoneCodeSendFailure, phoneCountryPrefix } = await import('@/server/phone-code-send-failure')
const { SolapiSendError } = await import('@/server/solapi-sms')
const { KoreanSmsError } = await import('@/server/korean-sms')

describe('reportPhoneCodeSendFailure', () => {
  afterEach(() => {
    captured.length = 0
    vi.restoreAllMocks()
  })

  it('records the provider reason of a refused Korean SMS without the number', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const solapi = new SolapiSendError(403, 'Forbidden', '허용되지 않은 IP(1.2.3.4)로 접근하고 있습니다.')
    reportPhoneCodeSendFailure({ route: 'korean_sms', phone: '+821012345678', kind: 'unavailable', error: solapi })
    expect(captured).toHaveLength(1)
    const [event] = captured
    expect(event.event).toBe('mingle_phone_code_send_failed')
    expect(event.properties).toMatchObject({
      route: 'korean_sms',
      kind: 'unavailable',
      country_prefix: '+82',
      provider: 'solapi',
      provider_status: 403,
      provider_code: 'Forbidden',
    })
    expect(JSON.stringify(event)).not.toContain('1012345678')
  })

  it('looks through a KoreanSmsError to the provider error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const error = new KoreanSmsError('too_many_requests', new SolapiSendError(429, 'TooMany'))
    reportPhoneCodeSendFailure({ route: 'korean_sms', phone: '+821000000000', kind: error.kind, error })
    expect(captured[0].properties).toMatchObject({ provider: 'solapi', provider_status: 429, kind: 'too_many_requests' })
  })

  it('keeps only the country calling code', () => {
    expect(phoneCountryPrefix('+821012345678')).toBe('+82')
    expect(phoneCountryPrefix('+12025550147')).toBe('+1')
  })
})
