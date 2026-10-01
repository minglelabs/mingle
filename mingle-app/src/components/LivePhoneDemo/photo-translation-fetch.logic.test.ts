import { describe, expect, it } from 'vitest'
import { CONVERSATION_IMAGE_TEXT_JOB_DEADLINE_MS, CONVERSATION_IMAGE_TEXT_MAX_POLL_MS, CONVERSATION_IMAGE_TEXT_POLL_MS } from '@/lib/conversation-image-text'
import {
  PHOTO_TRANSLATION_MAX_FAILURES,
  isPhotoTranslationSettled,
  markPendingPhotoTranslationFailed,
  mergePhotoTranslationResponse,
  nextPhotoTranslationPollDelay,
  nextPhotoTranslationRetryDelay,
} from './photo-translation-fetch.logic'
import {
  photoTranslationDisabledResponse,
  photoTranslationEmptyResponse,
  photoTranslationFailedResponse,
  photoTranslationPendingResponse,
  photoTranslationReadyResponse,
  photoTranslationSettledResponse,
} from './photo-translation.fixtures'

describe('nextPhotoTranslationPollDelay', () => {
  it('polls while anything requested is pending, preferring the server retryAfterMs', () => {
    expect(nextPhotoTranslationPollDelay(photoTranslationPendingResponse, 0)).toBe(2000)
    expect(nextPhotoTranslationPollDelay(photoTranslationReadyResponse, 0)).toBe(1200)
    expect(nextPhotoTranslationPollDelay({ ...photoTranslationReadyResponse, retryAfterMs: undefined }, 0)).toBe(CONVERSATION_IMAGE_TEXT_POLL_MS)
  })

  it('stops once nothing is pending or the session budget is spent', () => {
    expect(nextPhotoTranslationPollDelay(photoTranslationSettledResponse, 0)).toBeNull()
    expect(nextPhotoTranslationPollDelay(photoTranslationFailedResponse, 0)).toBeNull()
    expect(nextPhotoTranslationPollDelay(null, 0)).toBeNull()
    expect(nextPhotoTranslationPollDelay(photoTranslationPendingResponse, CONVERSATION_IMAGE_TEXT_MAX_POLL_MS - 2000)).toBe(2000)
    expect(nextPhotoTranslationPollDelay(photoTranslationPendingResponse, CONVERSATION_IMAGE_TEXT_MAX_POLL_MS - 1999)).toBeNull()
  })

  it('allows time for a lost claim to expire and one bounded recovery attempt', () => {
    expect(CONVERSATION_IMAGE_TEXT_MAX_POLL_MS).toBe(240_000)
    expect(CONVERSATION_IMAGE_TEXT_MAX_POLL_MS).toBeGreaterThanOrEqual(CONVERSATION_IMAGE_TEXT_JOB_DEADLINE_MS + 42_000 + 54_000)
  })
})

describe('markPendingPhotoTranslationFailed', () => {
  it('ends pending OCR locally without making the response settled for a later open', () => {
    const failed = markPendingPhotoTranslationFailed(photoTranslationPendingResponse)
    expect(failed).toEqual({ status: 'failed', blocks: [], translations: [] })
    expect(isPhotoTranslationSettled(failed, ['ko'])).toBe(false)
  })

  it('preserves ready translations while ending pending indicators', () => {
    const failed = markPendingPhotoTranslationFailed(photoTranslationReadyResponse)
    expect(failed).toMatchObject({
      status: 'ready',
      translations: [
        { language: 'ko', status: 'ready' },
        { language: 'en', status: 'failed', texts: {} },
        { language: 'ja', status: 'failed', texts: {} },
      ],
    })
    expect(failed?.retryAfterMs).toBeUndefined()
    expect(isPhotoTranslationSettled(failed, ['ko', 'en'])).toBe(false)
  })
})

describe('nextPhotoTranslationRetryDelay', () => {
  it('backs off after network and server errors', () => {
    expect(nextPhotoTranslationRetryDelay({ failures: 1, elapsedMs: 0 })).toBe(CONVERSATION_IMAGE_TEXT_POLL_MS)
    expect(nextPhotoTranslationRetryDelay({ failures: 2, httpStatus: 503, elapsedMs: 0 })).toBe(CONVERSATION_IMAGE_TEXT_POLL_MS * 2)
    expect(nextPhotoTranslationRetryDelay({ failures: 1, httpStatus: 429, elapsedMs: 0 })).toBe(CONVERSATION_IMAGE_TEXT_POLL_MS)
  })

  it('gives up on client errors, repeated failures and a spent budget', () => {
    expect(nextPhotoTranslationRetryDelay({ failures: 1, httpStatus: 404, elapsedMs: 0 })).toBeNull()
    expect(nextPhotoTranslationRetryDelay({ failures: 1, httpStatus: 401, elapsedMs: 0 })).toBeNull()
    expect(nextPhotoTranslationRetryDelay({ failures: PHOTO_TRANSLATION_MAX_FAILURES, elapsedMs: 0 })).toBeNull()
    expect(nextPhotoTranslationRetryDelay({ failures: 1, elapsedMs: CONVERSATION_IMAGE_TEXT_MAX_POLL_MS })).toBeNull()
  })
})

describe('isPhotoTranslationSettled', () => {
  it('skips the request on reopen only when nothing can change', () => {
    expect(isPhotoTranslationSettled(photoTranslationSettledResponse, ['ko', 'en', 'ja'])).toBe(true)
    expect(isPhotoTranslationSettled(photoTranslationEmptyResponse, ['ko'])).toBe(true)
    expect(isPhotoTranslationSettled(photoTranslationReadyResponse, ['ko'])).toBe(true)
    expect(isPhotoTranslationSettled(photoTranslationReadyResponse, ['ko', 'en'])).toBe(false)
    expect(isPhotoTranslationSettled(photoTranslationReadyResponse, ['ko', 'ja'])).toBe(false)
    expect(isPhotoTranslationSettled(photoTranslationSettledResponse, ['ko', 'zh-TW'])).toBe(false)
  })

  it('always asks again for pending, failed or disabled photos', () => {
    for (const response of [null, photoTranslationPendingResponse, photoTranslationFailedResponse, photoTranslationDisabledResponse]) {
      expect(isPhotoTranslationSettled(response, ['ko'])).toBe(false)
    }
  })
})

describe('mergePhotoTranslationResponse', () => {
  it('keeps the previous object when a poll changed nothing', () => {
    const copy = JSON.parse(JSON.stringify(photoTranslationReadyResponse))
    expect(mergePhotoTranslationResponse(photoTranslationReadyResponse, copy)).toBe(photoTranslationReadyResponse)
    expect(mergePhotoTranslationResponse(null, copy)).toBe(copy)
  })

  it('reuses the block array when only a translation moved on', () => {
    const next = JSON.parse(JSON.stringify(photoTranslationSettledResponse))
    const merged = mergePhotoTranslationResponse(photoTranslationReadyResponse, next)
    expect(merged).not.toBe(photoTranslationReadyResponse)
    expect(merged.blocks).toBe(photoTranslationReadyResponse.blocks)
    expect(merged.translations).toEqual(photoTranslationSettledResponse.translations)
  })

  it('takes new blocks when the text itself arrived', () => {
    const merged = mergePhotoTranslationResponse(photoTranslationPendingResponse, photoTranslationReadyResponse)
    expect(merged).toBe(photoTranslationReadyResponse)
  })
})
