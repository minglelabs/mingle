import { describe, expect, it } from 'vitest'
import { normalizeConversationMessageImage } from './conversation-image'
import { normalizeConversationHydrationUtterances, createUtteranceStoreState, mergeServerHydrationUtteranceIntoStoreState } from '@/components/LivePhoneDemo/use-realtime-stt'
describe('conversation image hydration', () => {
  const image = { conversationId: 'room', messageId: 'message', width: 640, height: 480 }
  it('preserves images through hydration and later message reconciliation', () => {
    const [utterance] = normalizeConversationHydrationUtterances([{ id: 'image-client', originalText: '📷 Photo', originalLang: 'en', image, translations: {}, createdAtMs: 100 }])
    expect(utterance.image).toEqual(image)
    let state = createUtteranceStoreState([{ ...utterance, image: undefined }])
    state = mergeServerHydrationUtteranceIntoStoreState(state, utterance)
    state = mergeServerHydrationUtteranceIntoStoreState(state, utterance)
    expect(state.utterances).toHaveLength(1); expect(state.utterances[0].image).toEqual(image)
  })
  it('rejects untrusted paths and invalid dimensions without dropping the message', () => {
    for (const bad of [{ ...image, conversationId: '../private' }, { ...image, messageId: 'https://outside.example' }, { ...image, width: 0 }, { ...image, height: 9000 }]) {
      expect(normalizeConversationMessageImage(bad)).toBeUndefined()
    }
  })
})
