import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { accountBadgeCopy } from '@/i18n/account-badge-copy'
import ChatAccountBadge from './ChatAccountBadge'
import ChatBubble, { type Utterance } from './ChatBubble'
import ConversationOperatorDisclosure from './ConversationOperatorDisclosure'
import {
  labelNameWithAccountBadge,
  readAccountBadgeFlags,
  readAccountBadgeKind,
  resolveRoomAccountBadge,
} from './chat-account-badge.logic'
import { RemotePreviews, type PreviewEvent } from './conversation-live'
import {
  normalizeConversationHydrationInviteNotices,
  normalizeConversationHydrationLeaveNotices,
  normalizeConversationHydrationUtterances,
} from './use-realtime-stt'
import { toUtterance } from '@/components/use-conversation-spectate'

const ko = accountBadgeCopy('ko')
const en = accountBadgeCopy('en')

function counterpartUtterance(overrides: Partial<Utterance> = {}): Utterance {
  return {
    id: 'u-op',
    originalText: '안녕하세요',
    originalLang: 'ko',
    translations: {},
    speakerUserId: 'op',
    speakerName: 'Mina',
    speaker: 'Speaker 1',
    speakerAvatarSeed: 'seed-op',
    ...overrides,
  }
}

function renderBubble(utterance: Utterance, viewerUserId = 'viewer', uiLocale = 'ko') {
  return renderToStaticMarkup(createElement(ChatBubble, {
    utterance, uiLocale, viewerUserId, bubbleDisplayMode: 'collapsed',
  }))
}

describe('wire readers', () => {
  it('keeps only known badge kinds and true flags', () => {
    expect(readAccountBadgeKind('operator')).toBe('operator')
    expect(readAccountBadgeKind('official')).toBe('official')
    for (const value of ['admin', '', null, undefined, true, 1, {}]) expect(readAccountBadgeKind(value)).toBeNull()
    expect(readAccountBadgeFlags({ isOperator: true, isOfficial: false })).toEqual({ isOperator: true })
    expect(readAccountBadgeFlags({ isOperator: 'true', isOfficial: 1 })).toEqual({})
    expect(readAccountBadgeFlags(null)).toEqual({})
  })

  it('labels a room by its strongest other member, operator first', () => {
    expect(resolveRoomAccountBadge([{}, { isOfficial: true }, { isOperator: true }])).toBe('operator')
    expect(resolveRoomAccountBadge([{}, { isOfficial: true }])).toBe('official')
    expect(resolveRoomAccountBadge([{}, {}])).toBeNull()
    expect(resolveRoomAccountBadge(undefined)).toBeNull()
  })

  it('writes the plain-text label for notice sentences, never for an empty name', () => {
    expect(labelNameWithAccountBadge('Mina', 'operator', 'ko')).toBe(`Mina (${ko.pushLabel})`)
    expect(labelNameWithAccountBadge('Mina', 'operator', 'en')).toBe('Mina (Run by Mingle)')
    expect(labelNameWithAccountBadge('Mingle', 'official', 'en')).toBe('Mingle (Official)')
    expect(labelNameWithAccountBadge('Bob', null, 'ko')).toBe('Bob')
    expect(labelNameWithAccountBadge('', 'operator', 'ko')).toBe('')
  })
})

describe('ChatAccountBadge', () => {
  it('adapts the operator badge to the shared explanation button and 44px target', () => {
    const html = renderToStaticMarkup(createElement(ChatAccountBadge, { kind: 'operator', locale: 'ko' }))
    expect(html).toContain('data-account-badge="operator"')
    expect(html).toContain(ko.operator)
    expect(html).toContain('<button')
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain(`aria-label="${ko.operator}, ${ko.operatorDescription}"`)
    expect(html).toContain('before:h-11')
    const english = renderToStaticMarkup(createElement(ChatAccountBadge, { kind: 'operator', locale: 'en-US' }))
    expect(english).toContain(en.operator)
    expect(english).toContain(en.operatorDescription)
  })

  it('keeps the official badge informational and non-interactive', () => {
    const html = renderToStaticMarkup(createElement(ChatAccountBadge, { kind: 'official', locale: 'ja' }))
    expect(html).toContain('data-account-badge="official"')
    expect(html).toContain(accountBadgeCopy('ja').official)
    expect(html).not.toContain('<button')
  })
})

describe('ChatBubble sender label', () => {
  it('shows the badge next to a counterpart sender name', () => {
    const html = renderBubble(counterpartUtterance({ speakerBadge: 'operator' }))
    expect(html).toContain('data-chat-speaker-name')
    expect(html).toContain('data-chat-speaker-badge')
    expect(html).toContain(ko.operator)
    expect(html.indexOf('Mina')).toBeLessThan(html.indexOf('data-chat-speaker-badge'))
  })

  it('still labels the sender when their name is missing', () => {
    const html = renderBubble(counterpartUtterance({ speakerName: null, speakerBadge: 'operator' }))
    expect(html).toContain('data-chat-speaker-badge')
  })

  it('adds nothing for ordinary senders, own messages, solo turns or unknown values', () => {
    expect(renderBubble(counterpartUtterance())).not.toContain('data-chat-speaker-badge')
    expect(renderBubble(counterpartUtterance({ speakerBadge: 'operator' }), 'op')).not.toContain('data-chat-speaker-badge')
    expect(renderBubble(counterpartUtterance({ speakerUserId: null, speakerBadge: 'operator' }))).not.toContain('data-account-badge')
    expect(renderBubble(counterpartUtterance({ speakerBadge: 'admin' as never }))).not.toContain('data-account-badge')
  })
})

describe('ConversationOperatorDisclosure', () => {
  it('renders the full disclosure expanded, as a note that can only collapse', () => {
    const html = renderToStaticMarkup(createElement(ConversationOperatorDisclosure, { locale: 'ko', stickyTopPx: 50 }))
    expect(html).toContain('role="note"')
    expect(html).toContain(ko.chatDisclosure)
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('data-operator-disclosure-collapsed="false"')
    expect(html).toContain('top:50px')
    expect(html).not.toMatch(/close|dismiss|닫기/i)
  })

  it('uses the viewer locale', () => {
    expect(renderToStaticMarkup(createElement(ConversationOperatorDisclosure, { locale: 'en' }))).toContain(en.chatDisclosure)
  })
})

describe('client parsing of hydration, notices and spectate payloads', () => {
  it('keeps speakerBadge from hydration and committed live utterances, dropping unknown values', () => {
    const [operator, plain, garbage] = normalizeConversationHydrationUtterances([
      { id: 'a', originalText: 'hi', originalLang: 'en', speakerUserId: 'op', speakerName: 'Mina', speakerBadge: 'operator' },
      { id: 'b', originalText: 'hi', originalLang: 'en', speakerUserId: 'bob', speakerName: 'Bob' },
      { id: 'c', originalText: 'hi', originalLang: 'en', speakerUserId: 'x', speakerName: 'X', speakerBadge: 'admin' },
    ])
    expect(operator.speakerBadge).toBe('operator')
    expect(plain).not.toHaveProperty('speakerBadge')
    expect(garbage).not.toHaveProperty('speakerBadge')
  })

  it('keeps notice badges only when valid', () => {
    const [invite] = normalizeConversationHydrationInviteNotices([{
      inviteeUserId: 'op', inviteeName: 'Mina', invitedByUserId: 'me', invitedByName: 'Alice', invitedAtMs: 1,
      inviteeBadge: 'operator', invitedByBadge: 'nope',
    }])
    expect(invite.inviteeBadge).toBe('operator')
    expect(invite).not.toHaveProperty('invitedByBadge')
    const [left, plain] = normalizeConversationHydrationLeaveNotices([
      { userId: 'op', name: 'Mina', leftAtMs: 1, isOperator: true, isOfficial: false },
      { userId: 'bob', name: 'Bob', leftAtMs: 2 },
    ])
    expect(left).toMatchObject({ isOperator: true })
    expect(left).not.toHaveProperty('isOfficial')
    expect(plain).not.toHaveProperty('isOperator')
  })

  it('keeps the spectate speakerBadge on the alias-keyed bubble', () => {
    expect(toUtterance({ id: 's', originalText: 'hi', speakerAlias: 's1', speakerName: 'Mina', speakerBadge: 'operator' }))
      .toMatchObject({ speakerUserId: 's1', speakerBadge: 'operator' })
    expect(toUtterance({ id: 's', originalText: 'hi', speakerAlias: 's1', speakerBadge: 'x' })).not.toHaveProperty('speakerBadge')
  })
})

describe('live preview labels', () => {
  const preview = (utterance: Partial<Utterance>, revision = 1): PreviewEvent => ({
    type: 'utterance_preview', sessionKey: 'room', revision, expiresAt: Date.now() + 60_000, final: false,
    utterance: { id: 'live-1', originalText: 'speaking', originalLang: 'ko', translations: {}, speakerUserId: 'op', speakerName: 'Mina', ...utterance },
  })

  it('shows the signed-token badge on the live bubble', () => {
    const previews = new RemotePreviews()
    previews.accept(preview({ speakerBadge: 'operator' }))
    expect(previews.visible([], 'viewer')[0]).toMatchObject({ speakerName: 'Mina', speakerBadge: 'operator' })
  })

  it('falls back to the same speaker\'s committed badge and drops unknown values', () => {
    const previews = new RemotePreviews()
    previews.accept(preview({ speakerBadge: 'bogus' as never }))
    const committed = [counterpartUtterance({ id: 'old', speakerBadge: 'operator' })]
    expect(previews.visible(committed, 'viewer')[0].speakerBadge).toBe('operator')
    expect(previews.visible([], 'viewer')[0].speakerBadge ?? null).toBeNull()
  })

  it('keeps the preview badge when the committed utterance arrives without one', () => {
    const previews = new RemotePreviews()
    previews.accept(preview({ speakerBadge: 'operator' }))
    const committed = previews.mergeCommitted({ id: 'live-1', originalText: 'done', originalLang: 'ko', translations: {}, speakerUserId: 'op' })
    expect(committed.speakerBadge).toBe('operator')
    const labeled = previews.mergeCommitted({ id: 'live-1', originalText: 'done', originalLang: 'ko', translations: {}, speakerUserId: 'op', speakerBadge: 'official' })
    expect(labeled.speakerBadge).toBe('official')
  })
})
