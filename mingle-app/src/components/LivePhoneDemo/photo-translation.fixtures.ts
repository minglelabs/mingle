// Test fixtures for the photo translation overlay, built from the shared
// contract and run through its parser (no live API exists on this branch).
// Modeled on the R2 probe sign: Japanese signage with a vertical banner, a
// rotated English sticker, a Korean line and a brand name.

import {
  parseConversationImageTextResponse,
  type ConversationImageTextResponse,
} from '@/lib/conversation-image-text'

function parsed(body: unknown): ConversationImageTextResponse {
  const response = parseConversationImageTextResponse(body)
  if (!response) throw new Error('invalid photo translation fixture')
  return response
}

export const PHOTO_TRANSLATION_READY_BODY = {
  status: 'ready',
  blocks: [
    { id: 'b0', box: [0.125, 0.1, 0.33, 0.21], text: '営業時間', sourceLanguage: 'ja', angle: 0, lines: 1, style: { background: '#FFFFFF', color: '#1F2937', bold: true } },
    { id: 'b1', box: [0.11, 0.39, 0.43, 0.44], text: '定休日：毎週水曜日', sourceLanguage: 'ja', angle: 0, lines: 1, style: { background: '#ffffff', color: '#1f2937' } },
    { id: 'b2', box: [0.195, 0.62, 0.46, 0.68], text: 'トイレはこちら →', sourceLanguage: 'ja', angle: 0, lines: 1, style: { background: '#1b7f3b', color: '#ffffff', bold: true } },
    { id: 'b3', box: [0.855, 0.14, 0.905, 0.58], text: '本日のおすすめ', sourceLanguage: 'ja', angle: 0, lines: 1, vertical: true, style: { background: '#c1121f', color: '#ffffff', bold: true } },
    { id: 'b4', box: [0.48, 0.13, 0.965, 0.34], text: 'FRAGILE — HANDLE WITH CARE', sourceLanguage: 'en', angle: 12, lines: 1, style: { background: '#ffffff', color: '#b91c1c', bold: true } },
    { id: 'b5', box: [0.12, 0.8, 0.46, 0.86], text: '방문해 주셔서 감사합니다', sourceLanguage: 'ko', angle: 0, lines: 1 },
    { id: 'b6', box: [0.6, 0.8, 0.8, 0.86], text: 'STARBUCKS', sourceLanguage: 'en', angle: 0, lines: 1 },
  ],
  translations: [
    { language: 'ko', status: 'ready', texts: { b0: '영업시간', b1: '정기휴일: 매주 수요일', b2: '화장실은 이쪽 →', b3: '오늘의 추천', b4: '파손 주의 — 취급 주의', b6: 'STARBUCKS' } },
    { language: 'en', status: 'pending', texts: {} },
    { language: 'ja', status: 'failed', texts: {} },
  ],
  retryAfterMs: 1200,
} as const

/** ko ready (b6 kept as-is), en pending, ja failed. */
export const photoTranslationReadyResponse = parsed(PHOTO_TRANSLATION_READY_BODY)

/** The same photo once English finished too. */
export const photoTranslationSettledResponse = parsed({
  ...PHOTO_TRANSLATION_READY_BODY,
  translations: [
    PHOTO_TRANSLATION_READY_BODY.translations[0],
    { language: 'en', status: 'ready', texts: { b0: 'Business hours', b1: 'Closed: every Wednesday', b2: 'Restrooms this way →', b3: "Today's pick", b5: 'Thank you for visiting' } },
    { language: 'ja', status: 'ready', texts: { b4: '取扱注意', b5: 'ご来店ありがとうございます', b6: 'STARBUCKS' } },
  ],
  retryAfterMs: undefined,
})

/** A photo whose only text is a brand name every translation keeps. */
export const photoTranslationBrandOnlyResponse = parsed({
  status: 'ready',
  blocks: [{ id: 'b0', box: [0.2, 0.4, 0.8, 0.5], text: 'STARBUCKS', sourceLanguage: 'en', angle: 0, lines: 1 }],
  translations: [{ language: 'ko', status: 'ready', texts: { b0: 'STARBUCKS' } }],
})

/** A Korean-only photo: nothing to translate for a Korean viewer. */
export const photoTranslationKoreanOnlyResponse = parsed({
  status: 'ready',
  blocks: [{ id: 'b0', box: [0.1, 0.1, 0.5, 0.2], text: '오늘의 메뉴', sourceLanguage: 'ko', angle: 0, lines: 1 }],
  translations: [{ language: 'en', status: 'ready', texts: { b0: "Today's menu" } }],
})

export const photoTranslationPendingResponse = parsed({ status: 'pending', blocks: [], translations: [], retryAfterMs: 2000 })
export const photoTranslationFailedResponse = parsed({ status: 'failed', blocks: [], translations: [] })
export const photoTranslationEmptyResponse = parsed({ status: 'empty', blocks: [], translations: [] })
export const photoTranslationDisabledResponse = parsed({ status: 'disabled', blocks: [], translations: [] })
