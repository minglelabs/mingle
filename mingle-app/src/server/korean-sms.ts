import { SendonSendError, readSendonConfig, sendSendonSms } from '@/server/sendon-sms'
import { SolapiSendError, readSolapiConfig, sendSolapiSms } from '@/server/solapi-sms'

// Korean numbers (+82) get a plain SMS with a code made here
// (@/server/sms-codes), far cheaper than Twilio Verify to Korea (about 140
// KRW). Sendon (10.5 KRW) is used when SENDON_* is set, else Solapi (18 KRW)
// when SOLAPI_* is set.

export type KoreanSmsProvider = 'sendon' | 'solapi'

export function koreanSmsProvider(): KoreanSmsProvider | null {
  if (readSendonConfig()) return 'sendon'
  if (readSolapiConfig()) return 'solapi'
  return null
}

/** What a refused send means for the caller. */
export class KoreanSmsError extends Error {
  constructor(readonly kind: 'invalid_phone' | 'too_many_requests' | 'unavailable', cause?: unknown) {
    super(`korean_sms_${kind}`, { cause })
  }
}

export async function sendKoreanSms(phone: string, text: string): Promise<void> {
  const sendon = readSendonConfig()
  if (sendon) {
    try {
      return await sendSendonSms(sendon, phone, text)
    } catch (error) {
      if (error instanceof SendonSendError && error.code === 400) throw new KoreanSmsError('invalid_phone', error)
      if (error instanceof SendonSendError && error.code === 429) throw new KoreanSmsError('too_many_requests', error)
      throw error
    }
  }
  const solapi = readSolapiConfig()
  if (solapi) {
    try {
      return await sendSolapiSms(solapi, phone, text)
    } catch (error) {
      if (error instanceof SolapiSendError && error.status === 400) throw new KoreanSmsError('invalid_phone', error)
      if (error instanceof SolapiSendError && error.status === 429) throw new KoreanSmsError('too_many_requests', error)
      throw error
    }
  }
  throw new KoreanSmsError('unavailable')
}
