import { resolveSupportedLocaleTag } from '@/i18n/config'

export type OperatorInboxPushCopyInput = {
  /** The staff recipient's language tag (any app language; unknown -> English). */
  recipientLanguage: string
  /**
   * Label of the member who wrote, as built by the sender of the push.
   * `notifyOperatorInboxActivity` builds it with `encodeOperatorInboxActorLabel`
   * so it also names the operator account(s) and the message kind; a plain
   * label still works and gets the generic title.
   */
  actorLabel: string
  messagePreview?: string
}

/** What a staff alert is about. */
export type OperatorInboxPushSubject = {
  /** Display names of the room's operator accounts, first joined first. */
  operatorNames: string[]
  /** Display name of the user who wrote (already carrying its badge, if any). */
  senderLabel: string
  /** A chat message or photo, or (operator activity) a comment with or without text. */
  kind: OperatorInboxPushKind
}

export type OperatorInboxPushKind = 'text' | 'photo' | 'comment' | 'comment_photo'

const PUSH_KINDS: ReadonlySet<string> = new Set(['text', 'photo', 'comment', 'comment_photo'])

function normalizeKind(value: unknown): OperatorInboxPushKind {
  return typeof value === 'string' && PUSH_KINDS.has(value) ? value as OperatorInboxPushKind : 'text'
}

/** Characters of the user's message shown in the alert body. */
export const OPERATOR_INBOX_PUSH_PREVIEW_MAX_CHARS = 100

const OPERATOR_NAMES_SHOWN = 2
const MAX_LABEL_CHARS = 80
// Marks an encoded subject. Control characters are stripped from every name
// when encoding, so a real label can never start with it.
const SUBJECT_MARKER = '\u001e'

type Copy = {
  genericTitle: string
  title: (operators: string) => string
  genericCommentTitle: string
  commentTitle: (operators: string) => string
  moreOperators: (count: number) => string
  unknownSender: string
  photo: string
}

const KOREAN_COPY: Copy = {
  genericTitle: '운영 계정 새 메시지',
  title: (operators) => `${operators}에게 새 메시지`,
  genericCommentTitle: '운영 계정 새 댓글',
  commentTitle: (operators) => `${operators}에게 새 댓글`,
  moreOperators: (count) => ` 외 ${count}명`,
  unknownSender: '알 수 없는 사용자',
  photo: '사진을 보냈습니다',
}

const ENGLISH_COPY: Copy = {
  genericTitle: 'New message for a Mingle-run account',
  title: (operators) => `New message for ${operators}`,
  genericCommentTitle: 'New comment for a Mingle-run account',
  commentTitle: (operators) => `New comment for ${operators}`,
  moreOperators: (count) => ` and ${count} more`,
  unknownSender: 'Someone',
  photo: 'Sent a photo',
}

function cleanLabel(value: unknown): string {
  if (typeof value !== 'string') return ''
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return Array.from(cleaned).slice(0, MAX_LABEL_CHARS).join('')
}

/**
 * Packs the subject into `PushMessage.actorLabel`. The Phase 0 `PushMessage`
 * hands only `actorLabel`, `messagePreview` and `recipientLanguage` to
 * `resolveOperatorInboxPushCopy` (see `resolvePushCopy`), so the operator names
 * and the message kind ride inside the label. The label never leaves the
 * server: it is only read back here to build the copy.
 */
export function encodeOperatorInboxActorLabel(subject: OperatorInboxPushSubject): string {
  return `${SUBJECT_MARKER}${JSON.stringify({
    operatorNames: subject.operatorNames.map(cleanLabel).filter(Boolean),
    senderLabel: cleanLabel(subject.senderLabel),
    kind: normalizeKind(subject.kind),
  })}`
}

/** The subject packed by `encodeOperatorInboxActorLabel`, or null for a plain label. */
export function decodeOperatorInboxActorLabel(label: string): OperatorInboxPushSubject | null {
  if (typeof label !== 'string' || !label.startsWith(SUBJECT_MARKER)) return null
  try {
    const parsed = JSON.parse(label.slice(SUBJECT_MARKER.length)) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return null
    return {
      operatorNames: Array.isArray(parsed.operatorNames) ? parsed.operatorNames.map(cleanLabel).filter(Boolean) : [],
      senderLabel: cleanLabel(parsed.senderLabel),
      kind: normalizeKind(parsed.kind),
    }
  } catch {
    return null
  }
}

function clipPreview(value: string | undefined): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim()
  const characters = Array.from(normalized)
  return characters.length > OPERATOR_INBOX_PUSH_PREVIEW_MAX_CHARS
    ? `${characters.slice(0, OPERATOR_INBOX_PUSH_PREVIEW_MAX_CHARS).join('')}…`
    : normalized
}

function formatOperatorNames(names: string[], copy: Copy): string {
  const shown = names.slice(0, OPERATOR_NAMES_SHOWN).join(', ')
  const hidden = names.length - OPERATOR_NAMES_SHOWN
  return hidden > 0 ? `${shown}${copy.moreOperators(hidden)}` : shown
}

/**
 * Title and body of the `operator_inbox_message` push, which tells staff (on
 * their OWN Mingle accounts, see AdminNotifyTarget) that a user wrote to an
 * operator account. `resolvePushCopy` in `@/server/push-notifications`
 * delegates here for that type.
 *
 * Korean staff: '루카에게 새 메시지' / 'Mina: <first 100 characters>' (a photo:
 * 'Mina: 사진을 보냈습니다'). Every other language gets the English copy.
 */
export function resolveOperatorInboxPushCopy(input: OperatorInboxPushCopyInput): { title: string; body: string } {
  const copy = resolveSupportedLocaleTag(input.recipientLanguage.trim()) === 'ko' ? KOREAN_COPY : ENGLISH_COPY
  const subject = decodeOperatorInboxActorLabel(input.actorLabel)
  const sender = (subject ? subject.senderLabel : cleanLabel(input.actorLabel)) || copy.unknownSender
  const isPhoto = subject?.kind === 'photo' || subject?.kind === 'comment_photo'
  const isComment = subject?.kind === 'comment' || subject?.kind === 'comment_photo'
  const preview = isPhoto ? copy.photo : clipPreview(input.messagePreview) || '…'
  const operators = subject && subject.operatorNames.length > 0 ? formatOperatorNames(subject.operatorNames, copy) : ''
  const title = isComment
    ? (operators ? copy.commentTitle(operators) : copy.genericCommentTitle)
    : (operators ? copy.title(operators) : copy.genericTitle)
  return { title, body: `${sender}: ${preview}` }
}
