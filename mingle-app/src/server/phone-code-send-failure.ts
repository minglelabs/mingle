import { captureMingleEvent } from '@/lib/posthog-server'
import { SendonSendError } from '@/server/sendon-sms'
import { SolapiSendError } from '@/server/solapi-sms'
import { KoreanSmsError } from '@/server/korean-sms'

/**
 * A sign-in or verification code that could not be sent (owner, 2026-11-23:
 * the code step is where new users drop off, so every failed send must be
 * visible). One log line and one PostHog event, `mingle_phone_code_send_failed`,
 * with the provider's own reason. The number itself is never recorded, only
 * its country calling code.
 */
export type PhoneCodeSendFailure = {
  route: 'korean_sms' | 'twilio'
  phone: string
  kind: string
  error?: unknown
  provider?: { name: string; status?: number; code?: string; message?: string }
}

/** "+82" from "+821012345678": enough to tell Korean numbers from others. */
export function phoneCountryPrefix(phone: string): string {
  if (phone.startsWith('+82')) return '+82'
  if (phone.startsWith('+1')) return '+1'
  return phone.slice(0, 3)
}

function describeProvider(failure: PhoneCodeSendFailure): { name: string; status?: number; code?: string; message?: string } {
  if (failure.provider) return failure.provider
  const error = failure.error instanceof KoreanSmsError ? failure.error.cause ?? failure.error : failure.error
  if (error instanceof SolapiSendError) return { name: 'solapi', status: error.status, code: error.errorCode, message: error.providerMessage }
  if (error instanceof SendonSendError) return { name: 'sendon', status: error.code, code: error.reason }
  if (failure.error instanceof KoreanSmsError) return { name: 'korean_sms', code: failure.error.kind }
  return { name: failure.route, message: error instanceof Error ? error.message : String(error ?? '') }
}

export function reportPhoneCodeSendFailure(failure: PhoneCodeSendFailure): void {
  const provider = describeProvider(failure)
  const properties = {
    route: failure.route,
    kind: failure.kind,
    country_prefix: phoneCountryPrefix(failure.phone),
    provider: provider.name,
    provider_status: provider.status ?? null,
    provider_code: provider.code ?? null,
    provider_message: provider.message ? provider.message.slice(0, 200) : null,
  }
  console.error('[phone-verification] code_send_failed', JSON.stringify(properties))
  captureMingleEvent({
    // Not a person: the event is counted, not tied to an account.
    distinctId: 'server:phone-code',
    event: 'mingle_phone_code_send_failed',
    properties: { ...properties, $process_person_profile: false },
  })
}
