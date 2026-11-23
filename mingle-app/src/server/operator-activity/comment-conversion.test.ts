import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/server/llm/generate-json', () => ({
  OPERATOR_POST_TEXT_MODEL: 'claude-opus-5-5',
  OPERATOR_TEXT_MODEL: 'claude-haiku-5-5',
  OPERATOR_TEXT_OPUS_UNTIL: new Date('2026-12-13T00:00:00+09:00'),
  resolveJsonProvider: () => 'gemini',
  extractJsonText: (t: string) => t,
  generateJson: vi.fn(),
  operatorTextModel: (now: Date) => (now.getTime() < new Date('2026-12-13T00:00:00+09:00').getTime() ? 'claude-opus-5-5' : 'claude-haiku-5-5'),
}))

import { PersonaConversionFailedError } from '@/server/operator-posts/convert'
import { buildCommentConversionInstructions, convertCommentDraft, type CommentConversionInput } from './comment-conversion'

const input: CommentConversionInput = {
  draft: '세상에 변태가 얼마나 많은데…',
  targetLanguage: 'ja',
  writer: { name: '美咲', age: 26, gender: 'female', city: 'Tokyo', country: 'Japan', languages: ['ja'], isYou: true },
  addressee: { name: 'apple001225', country: 'China', languages: ['zh-CN'] },
  post: { author: { name: '美咲', isYou: true }, text: '夜道こわかった', hasPhoto: false },
  thread: [{ author: { name: 'apple001225' }, text: '胆子太小了吧' }],
  otherComments: [],
}

describe('staff comment conversion', () => {
  it('asks for casual spoken comment language, never written or literary style', () => {
    const instructions = buildCommentConversionInstructions('ja')
    expect(instructions).toContain('Japanese')
    expect(instructions).toMatch(/casual/i)
    expect(instructions).toMatch(/Never written, literary/)
    expect(instructions).toContain('〜ことか')
    expect(instructions).toMatch(/Do not add facts/)
  })

  it('sends the writer, the addressee, the post and the thread, on Haiku', async () => {
    const generate = vi.fn(async () => ({ sourceLanguage: 'ko', text: '世の中ほんと変なやつ多いからね…' }))
    const result = await convertCommentDraft(input, { now: new Date('2026-11-23T12:00:00Z'), generate: generate as never })
    expect(result).toEqual({ text: '世の中ほんと変なやつ多いからね…', language: 'ja', converted: true, sourceLanguage: 'ko' })
    const request = (generate.mock.calls[0] as unknown as [{ input: Record<string, unknown>; model: string }])[0]
    expect(request.model).toBe('claude-haiku-5-5')
    expect(request.input).toMatchObject({ draft: input.draft, writer: input.writer, addressee: input.addressee, post: input.post, thread: input.thread })
    expect(request.input.targetLanguage).toBeUndefined()
  })

  it('keeps a draft already in the persona language, and emoji-only drafts, untouched', async () => {
    const generate = vi.fn(async () => ({ sourceLanguage: 'ja', text: '別の文' }))
    await expect(convertCommentDraft({ ...input, draft: 'ほんとそれ' }, { generate: generate as never })).resolves.toMatchObject({ text: 'ほんとそれ', converted: false })
    const none = vi.fn()
    await expect(convertCommentDraft({ ...input, draft: '😂😂' }, { generate: none as never })).resolves.toMatchObject({ text: '😂😂', converted: false })
    expect(none).not.toHaveBeenCalled()
  })

  it('fails instead of posting when the model fails', async () => {
    const generate = vi.fn(async () => { throw new Error('llm_timeout') })
    await expect(convertCommentDraft(input, { generate: generate as never })).rejects.toBeInstanceOf(PersonaConversionFailedError)
  })
})
