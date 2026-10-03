import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  settingFindUnique: vi.fn(),
  settingUpsert: vi.fn(),
  userFindFirst: vi.fn(),
  postFindMany: vi.fn(),
  messageFindMany: vi.fn(),
  messageFindFirst: vi.fn(),
  queryRaw: vi.fn(),
  audit: vi.fn(),
  send: vi.fn(),
  generateJson: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    adminSetting: { findUnique: mocks.settingFindUnique, upsert: mocks.settingUpsert },
    user: { findFirst: mocks.userFindFirst },
    post: { findMany: mocks.postFindMany },
    appMessage: { findMany: mocks.messageFindMany, findFirst: mocks.messageFindFirst },
    $queryRaw: mocks.queryRaw,
  },
}))
vi.mock('@/server/admin/audit', () => ({ writeAdminAudit: mocks.audit }))
vi.mock('@/server/operator-inbox/send', () => ({ sendOperatorMessage: mocks.send }))
vi.mock('@/server/llm/generate-json', () => ({ generateJson: mocks.generateJson }))

import { ageOn, buildAutoReplyInstructions, loadAutoReplyContext, resolveAutoReplyModel, validateAutoReply } from './generate'
import { normalizeAutoReplySettings, parseAutoReplyDelayMinutes, updateAutoReplySettings } from './settings'
import {
  __resetAutoReplyAttemptsForTests,
  autoReplyRequestId,
  autoReplyToCandidate,
  findAutoReplyCandidates,
  runOperatorAutoReplies,
} from './worker'

const NOW = new Date('2026-10-02T12:00:00.000Z')
const ctx = { sessionId: 'sess_1', ip: null, userAgent: null }
const candidate = {
  conversationId: 'conv_1', sessionKey: 'sess_key', operatorUserId: 'op_1', messageId: 'msg9', createdAt: new Date('2026-10-02T11:50:00.000Z'),
}

function message(id: string, userId: string, text: string, minute: number, metadata: unknown = null) {
  return {
    id, userId, createdAt: new Date(Date.UTC(2026, 9, 2, 11, minute)), sourceLanguage: 'pt', metadata,
    user: { name: userId === 'op_1' ? 'Mina' : 'João', handle: userId },
    contents: [{ language: 'pt', text }],
  }
}

describe('auto-reply settings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('accepts whole minutes from 1 to 1440 only', () => {
    expect(parseAutoReplyDelayMinutes(5)).toBe(5)
    expect(parseAutoReplyDelayMinutes('30')).toBe(30)
    expect(parseAutoReplyDelayMinutes(0)).toBeNull()
    expect(parseAutoReplyDelayMinutes(1441)).toBeNull()
    expect(parseAutoReplyDelayMinutes(2.5)).toBeNull()
    expect(parseAutoReplyDelayMinutes('abc')).toBeNull()
  })

  it('is off by default and when the stored value is malformed', () => {
    expect(normalizeAutoReplySettings(null)).toEqual({ enabled: false, delayMinutes: 5, enabledAt: null })
    expect(normalizeAutoReplySettings({ enabled: true, delayMinutes: 10 })).toMatchObject({ enabled: false, delayMinutes: 10 })
    expect(normalizeAutoReplySettings({ enabled: true, delayMinutes: 10, enabledAt: NOW.toISOString() }))
      .toEqual({ enabled: true, delayMinutes: 10, enabledAt: NOW.toISOString() })
  })

  it('stamps the start time when turned on and keeps it on a delay change', async () => {
    mocks.settingFindUnique.mockResolvedValue(null)
    const first = await updateAutoReplySettings(ctx, { enabled: true, delayMinutes: 3 }, NOW)
    expect(first).toEqual({ enabled: true, delayMinutes: 3, enabledAt: NOW.toISOString() })
    expect(mocks.audit).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: 'settings.auto_reply' }))

    mocks.settingFindUnique.mockResolvedValue({ value: first })
    const later = await updateAutoReplySettings(ctx, { enabled: true, delayMinutes: 9 }, new Date(NOW.getTime() + 60_000))
    expect(later).toEqual({ enabled: true, delayMinutes: 9, enabledAt: NOW.toISOString() })
  })
})

describe('auto-reply prompt', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses gemini-3.8-flash-lite unless overridden', () => {
    expect(resolveAutoReplyModel({} as NodeJS.ProcessEnv)).toBe('gemini-3.8-flash-lite')
    expect(resolveAutoReplyModel({ OPERATOR_AUTO_REPLY_MODEL: 'x' } as unknown as NodeJS.ProcessEnv)).toBe('x')
  })

  it('computes the age from the birth date', () => {
    expect(ageOn(new Date('2000-10-03'), NOW)).toBe(25)
    expect(ageOn(new Date('2000-10-02'), NOW)).toBe(26)
    expect(ageOn(null, NOW)).toBeNull()
  })

  it('gives the model the profile, the posts and the last 30 messages, oldest first', async () => {
    mocks.userFindFirst.mockResolvedValue({
      name: 'Mina', handle: 'mina', bio: 'Café e praia', birthDate: new Date('2000-01-01'), nationality: 'BR',
      locationCity: 'Rio', locationCountry: 'Brazil', primaryLanguages: ['pt'],
    })
    mocks.postFindMany.mockResolvedValue([{ sourceText: 'Dia de praia!', publishedAt: NOW }, { sourceText: '  ', publishedAt: NOW }])
    mocks.messageFindMany.mockResolvedValue([
      message('m3', 'user_1', '📷 Photo', 3, { image: { key: 'k' } }),
      message('m2', 'op_1', 'Oi! Tudo bem?', 2),
      message('m1', 'user_1', 'Olá', 1),
    ])
    const context = await loadAutoReplyContext({ operatorUserId: 'op_1', sessionKey: 'sess_key', now: NOW })
    expect(mocks.messageFindMany.mock.calls[0][0]).toMatchObject({ take: 30, orderBy: { createdAt: 'desc' } })
    expect(context).toMatchObject({
      profile: { name: 'Mina', bio: 'Café e praia', age: 26, city: 'Rio', language: 'pt' },
      posts: [{ text: 'Dia de praia!' }],
      counterpartName: 'João',
    })
    expect(context?.transcript.map((turn) => [turn.from, turn.text])).toEqual([
      ['them', 'Olá'], ['me', 'Oi! Tudo bem?'], ['them', '[photo]'],
    ])
    expect(buildAutoReplyInstructions(context!)).toContain('(pt)')
  })

  it('has nothing to write for an account without a language', async () => {
    mocks.userFindFirst.mockResolvedValue({ name: 'Mina', handle: 'mina', bio: null, birthDate: null, nationality: null, locationCity: null, locationCountry: null, primaryLanguages: [] })
    expect(await loadAutoReplyContext({ operatorUserId: 'op_1', sessionKey: 'sess_key' })).toBeNull()
  })

  it('validates the model answer', () => {
    expect(validateAutoReply({ reply: '  Oi!  ' })).toBe('Oi!')
    expect(validateAutoReply({ reply: '' })).toBe('')
    expect(() => validateAutoReply({ reply: 'x'.repeat(601) })).toThrow()
    expect(() => validateAutoReply({})).toThrow()
  })
})

describe('auto-reply worker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetAutoReplyAttemptsForTests()
    mocks.userFindFirst.mockResolvedValue({
      name: 'Mina', handle: 'mina', bio: null, birthDate: null, nationality: null, locationCity: null, locationCountry: null, primaryLanguages: ['pt'],
    })
    mocks.postFindMany.mockResolvedValue([])
    mocks.messageFindMany.mockResolvedValue([message('msg9', 'user_1', 'Olá', 50)])
    mocks.messageFindFirst.mockResolvedValue({ id: 'msg9' })
    mocks.generateJson.mockImplementation(async (request: { validate: (value: unknown) => string }) => request.validate({ reply: 'Oi!' }))
    mocks.send.mockResolvedValue({ duplicate: false, messageId: 'reply_1' })
  })

  it('derives a stable request id from the answered message', () => {
    expect(autoReplyRequestId('msg_9')).toBe('auto-msg9')
    expect(autoReplyRequestId('x'.repeat(80))).toHaveLength(64)
  })

  it('does nothing while auto-reply is off', async () => {
    mocks.settingFindUnique.mockResolvedValue(null)
    expect(await runOperatorAutoReplies({ now: () => NOW })).toMatchObject({ enabled: false, candidates: 0 })
    expect(mocks.queryRaw).not.toHaveBeenCalled()
  })

  it('skips the query when nothing can have waited long enough since it was turned on', async () => {
    expect(await findAutoReplyCandidates({ now: NOW, delayMinutes: 5, enabledAt: new Date(NOW.getTime() - 60_000) })).toEqual([])
    expect(mocks.queryRaw).not.toHaveBeenCalled()
  })

  it('answers a waiting room as the operator and audits it', async () => {
    mocks.settingFindUnique.mockResolvedValue({ value: { enabled: true, delayMinutes: 5, enabledAt: '2026-10-02T09:00:00.000Z' } })
    mocks.queryRaw.mockResolvedValue([candidate])
    const summary = await runOperatorAutoReplies({ now: () => NOW })
    expect(summary).toMatchObject({ enabled: true, candidates: 1, sent: 1 })
    expect(mocks.generateJson.mock.calls[0][0]).toMatchObject({ model: 'gemini-3.8-flash-lite' })
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: null }),
      { operatorUserId: 'op_1', conversationId: 'conv_1', text: 'Oi!', clientRequestId: 'auto-msg9' },
    )
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'inbox.auto_reply', operatorUserId: 'op_1', targetId: 'reply_1',
    }))
  })

  it('does not send when someone wrote while the model was thinking', async () => {
    mocks.messageFindFirst.mockResolvedValue({ id: 'msg10' })
    expect(await autoReplyToCandidate(candidate, NOW)).toBe('skipped')
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('leaves a message the model declines to staff, without asking again', async () => {
    mocks.generateJson.mockImplementation(async (request: { validate: (value: unknown) => string }) => request.validate({ reply: '' }))
    expect(await autoReplyToCandidate(candidate, NOW)).toBe('declined')
    expect(await autoReplyToCandidate(candidate, NOW)).toBe('skipped')
    expect(mocks.generateJson).toHaveBeenCalledTimes(1)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('gives up on a message after three failures', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.generateJson.mockRejectedValue(new Error('llm_request_failed'))
    for (let attempt = 0; attempt < 3; attempt += 1) expect(await autoReplyToCandidate(candidate, NOW)).toBe('failed')
    expect(await autoReplyToCandidate(candidate, NOW)).toBe('skipped')
    expect(mocks.generateJson).toHaveBeenCalledTimes(3)
    spy.mockRestore()
  })
})
