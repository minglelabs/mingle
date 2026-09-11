import type { LatestUtterancePayload } from './LivePhoneDemo'

export type LatestUtteranceReport = {
  utteranceId: string
  payload: LatestUtterancePayload
}

export function resolveLatestUtteranceReport(
  previous: LatestUtteranceReport | null,
  utteranceId: string,
  payload: LatestUtterancePayload,
): { report: LatestUtteranceReport; isNewUtterance: boolean } | null {
  const isNewUtterance = previous?.utteranceId !== utteranceId
  if (!isNewUtterance && previous
    && previous.payload.preview === payload.preview
    && previous.payload.speaker === payload.speaker
    && previous.payload.speakerAvatarSeed === payload.speakerAvatarSeed
    && previous.payload.speakerAvatarIndex === payload.speakerAvatarIndex
  ) return null

  return {
    isNewUtterance,
    report: {
      utteranceId,
      // A delayed translation must not move an undated legacy message to now.
      payload: !isNewUtterance && previous
        ? { ...payload, createdAt: previous.payload.createdAt }
        : payload,
    },
  }
}
