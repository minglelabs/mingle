import { describe, expect, it, vi } from 'vitest'

vi.mock('@/server/llm/generate-json', () => ({ OPERATOR_POST_TEXT_MODEL: 'claude-opus-5-5', OPERATOR_TEXT_MODEL: 'claude-haiku-5-5', resolveJsonProvider: () => 'gemini', extractJsonText: (t: string) => t, generateJson: vi.fn() }))

import { buildCommentInstructions, cleanGeneratedComment, commentLanguageFor, generateOperatorComment, operatorCommentDefaultModel, pickCommentKind, resolveRealUserReplyModel, COMMENT_KINDS } from './generate'

const commenter = { id: 'op_1', name: '민지', bio: null, age: 30, city: 'Gwangju', country: 'South Korea', language: 'ko' }

describe('generated comments', () => {
  it('picks every kind and only known kinds', () => {
    const keys = new Set(COMMENT_KINDS.map((kind) => kind.key))
    expect(keys.has(pickCommentKind(() => 0).key)).toBe(true)
    expect(keys.has(pickCommentKind(() => 0.999).key)).toBe(true)
  })

  it('writes in the commenter\'s own language when the post is in it or in a language they do not study', () => {
    expect(commentLanguageFor(commenter, 'ko')).toEqual({ language: 'ko', asLearner: false })
    expect(commentLanguageFor(commenter, null)).toEqual({ language: 'ko', asLearner: false })
    expect(commentLanguageFor(commenter, 'tr')).toEqual({ language: 'ko', asLearner: false })
  })

  it('writes in Korean as a learner when a foreign account comments on a Korean post', () => {
    expect(commentLanguageFor({ id: 'op_2', language: 'ja' }, 'ko')).toEqual({ language: 'ko', asLearner: true })
  })

  it('rejects empty, long, tagged and contact-bearing comments', () => {
    expect(cleanGeneratedComment('  맛있겠다 ㅋㅋ ')).toBe('맛있겠다 ㅋㅋ')
    expect(cleanGeneratedComment('')).toBeNull()
    expect(cleanGeneratedComment('가'.repeat(201))).toBeNull()
    expect(cleanGeneratedComment('좋아요 #일상')).toBeNull()
    expect(cleanGeneratedComment('여기로 https://a.example')).toBeNull()
    expect(cleanGeneratedComment(3)).toBeNull()
  })

  it('returns the cleaned comment with its language and kind', async () => {
    const generate = vi.fn(async (request: { validate: (value: unknown) => unknown }) => request.validate({ text: ' 상추튀김 진짜 맛있죠 ' }))
    const result = await generateOperatorComment({
      commenter, post: { text: '상추튀김 먹음', language: 'ko' }, existingComments: [], generate: generate as never, random: () => 0,
    })
    expect(result).toEqual({ text: '상추튀김 진짜 맛있죠', language: 'ko', kind: 'answer' })
    expect(generate.mock.calls[0][0]).toMatchObject({ model: operatorCommentDefaultModel(), provider: 'direct' })
  })

  it('writes on Claude Opus 5.5 through 12-12 KST, then Claude Haiku 5.5', () => {
    expect(operatorCommentDefaultModel(new Date('2026-11-23T10:00:00+09:00'))).toBe('claude-opus-5-5')
    expect(operatorCommentDefaultModel(new Date('2026-12-12T23:59:00+09:00'))).toBe('claude-opus-5-5')
    expect(operatorCommentDefaultModel(new Date('2026-12-13T00:00:00+09:00'))).toBe('claude-haiku-5-5')
    expect(resolveRealUserReplyModel({ OPERATOR_REAL_REPLY_MODEL: 'claude-sonnet-5-5' } as unknown as NodeJS.ProcessEnv)).toBe('claude-sonnet-5-5')
  })

  it('tells the model never to read as AI and never to invent what it cannot see', () => {
    for (const reply of [false, true]) {
      const instructions = buildCommentInstructions('ko', reply)
      expect(instructions).toContain('never let it read as AI-written')
      expect(instructions).toContain('never invent a confident specific')
    }
  })

  it('answers a real person on the Anthropic API, off the ChatGPT pool', async () => {
    const generate = vi.fn(async (request: { validate: (value: unknown) => unknown }) => request.validate({ text: '고마워요!' }))
    await generateOperatorComment({
      commenter, post: { text: '상추튀김 먹음', language: 'ko' }, existingComments: [], generate: generate as never, random: () => 0,
      replyTo: { text: '맛있겠다', language: 'ko', thread: [], asPostAuthor: true }, toRealUser: true,
    })
    expect(generate.mock.calls[0][0]).toMatchObject({ model: operatorCommentDefaultModel(), provider: 'direct' })
    const request = generate.mock.calls[0][0] as unknown as { instructions: string; input: { asLearner: boolean } }
    expect(request.instructions).toContain('(ko)')
    expect(request.input.asLearner).toBe(false)
  })

  it('is null when the model answer is unusable', async () => {
    const generate = vi.fn(async () => '')
    expect(await generateOperatorComment({ commenter, post: { text: 'x', language: 'ko' }, existingComments: [], generate: generate as never })).toBeNull()
  })
})
