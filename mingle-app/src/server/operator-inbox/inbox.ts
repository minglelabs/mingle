import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  getConversationHydrationStateForUser,
  markConversationChannelRead,
  type ConversationHydrationCursor,
  type ConversationHydrationState,
} from '@/lib/app-conversations'
import { sanitizeSttLanguageSelection } from '@/lib/stt-languages'
import { canonicalizeTranslationLanguageCode } from '@/lib/translation-languages'
import { writeAdminAudit } from '@/server/admin/audit'
import type { AdminContext } from '@/server/admin/guard'
import { USER_IDENTITY_SELECT, identityBadgeFlags, type IdentityBadgeFlags } from '@/server/identity/user-identity-select'
import { OperatorAccountRequiredError, requireOperatorAccount } from '@/server/operators/operator-guard'
import {
  STAFF_TRANSLATION_LANGUAGE,
  isPhotoMessageMetadata,
  translateForStaff,
  type StaffTranslationRequest,
} from '@/server/operator-inbox/staff-translate'

/**
 * The unified operator inbox (contract §5/§6 W5): every room in which an
 * operator account is an ACTIVE, materialized member. A pending invitee has
 * no member row yet (see AppConversationChannel.pendingInviteeUserIds), and
 * a member who left has `leftAt` set; neither puts a room in the inbox.
 *
 * Unread for staff = visible messages from REAL users (not from any operator
 * account) after that operator's `lastReadAt` — the per-viewer SQL of
 * `listUnreadMessageCountsByChannelId` (app-conversations.ts), generalized to
 * every operator membership in one query. A reply staff sent as another
 * operator in the same room is not "new" for staff, so it never counts.
 */
export const INBOX_PAGE_SIZE = 20
export const INBOX_MAX_PAGE_SIZE = 50

const ID_PATTERN = /^[\w-]{1,128}$/
const CURSOR_PATTERN = /^(\d{1,15})\.([\w-]{1,128})$/

export type InboxPerson = IdentityBadgeFlags & {
  userId: string
  handle: string | null
  name: string | null
  image: string | null
  imageCropScale: number | null
  imageCropX: number | null
  imageCropY: number | null
}

export type InboxOperator = InboxPerson & {
  /** primaryLanguages[0]: the language every reply is sent in (the message SOURCE). */
  personaLanguage: string | null
  /** Messages from real users this operator has not read yet. */
  unreadCount: number
  isActive: boolean
}

export type InboxMessagePreview = {
  messageId: string
  senderUserId: string | null
  /** Sent by an operator account (a staff reply). */
  fromOperator: boolean
  createdAt: string
  kind: 'text' | 'photo'
  /** As the operator reads it: their display-language translation, else the original. Empty for a photo. */
  text: string
  /** Language of `text`. */
  language: string
  /** Korean for staff: a Korean original, a stored `ko` translation, or (when requested) an admin-only translation. */
  koText: string | null
}

export type InboxRoomSummary = {
  conversationId: string
  /** More than two active members. */
  isGroup: boolean
  operators: InboxOperator[]
  /** Active members that are not operator accounts. */
  counterparts: InboxPerson[]
  latestMessage: InboxMessagePreview | null
  activityAt: string
  /** Unread for the filtered operator, else the highest count among the room's operators. */
  unreadCount: number
  /** A 1:1 room with a block in either direction: no reply is possible. */
  blocked: boolean
}

export type InboxOperatorStat = InboxPerson & {
  personaLanguage: string | null
  isActive: boolean
  roomCount: number
  unreadCount: number
}

export type InboxSummary = {
  /** Unread across every inbox room (each room counts its most-behind operator once). */
  unreadTotal: number
  operators: InboxOperatorStat[]
}

export type InboxListResult = {
  rooms: InboxRoomSummary[]
  nextCursor: string | null
}

export type InboxCursor = { activityMs: number; conversationId: string }

export type InboxReplyUnavailableReason = 'blocked' | 'no_recipients' | 'operator_inactive'

export type InboxRoomDetail = {
  conversationId: string
  /** The operator the room is read and answered as. */
  operator: InboxOperator
  operators: InboxOperator[]
  counterparts: InboxPerson[]
  isGroup: boolean
  blocked: boolean
  replyUnavailableReason: InboxReplyUnavailableReason | null
}

export type InboxRoomAccess = InboxRoomDetail & { sessionKey: string }

export type InboxRoomAccessError = 'not_found' | 'operator_not_in_room' | 'operator_ambiguous'

export type InboxRoomAccessResult = { ok: true; room: InboxRoomAccess } | { ok: false; error: InboxRoomAccessError }

export type InboxRoomView = {
  room: InboxRoomDetail
  hydration: ConversationHydrationState
}

export type InboxRoomViewResult =
  | { ok: true; view: InboxRoomView }
  | { ok: false; error: InboxRoomAccessError | 'operator_required' }

// ─── Cursor ──────────────────────────────────────────────────────────────────

export function encodeInboxCursor(cursor: InboxCursor): string {
  return `${Math.max(0, Math.trunc(cursor.activityMs))}.${cursor.conversationId}`
}

export function decodeInboxCursor(raw: unknown): InboxCursor | null {
  if (typeof raw !== 'string') return null
  const match = CURSOR_PATTERN.exec(raw.trim())
  if (!match) return null
  const activityMs = Number(match[1])
  return Number.isSafeInteger(activityMs) ? { activityMs, conversationId: match[2] } : null
}

export function normalizeInboxId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return ID_PATTERN.test(trimmed) ? trimmed : null
}

function clampPageSize(limit: number | null | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return INBOX_PAGE_SIZE
  return Math.min(INBOX_MAX_PAGE_SIZE, Math.max(1, Math.trunc(limit)))
}

// ─── SQL building blocks ─────────────────────────────────────────────────────

/** Every active membership of a non-deleted operator in a non-deleted room. */
function operatorMembershipsCte(filter: { operatorUserId?: string | null; channelIds?: string[] | null } = {}): Prisma.Sql {
  const operatorFilter = filter.operatorUserId
    ? Prisma.sql`AND member.user_id = ${filter.operatorUserId}`
    : Prisma.empty
  const channelFilter = filter.channelIds && filter.channelIds.length > 0
    ? Prisma.sql`AND member.channel_id IN (${Prisma.join(filter.channelIds)})`
    : Prisma.empty
  return Prisma.sql`memberships AS (
    SELECT
      member.channel_id,
      member.user_id AS operator_user_id,
      member.last_read_at,
      channel.session_key,
      channel.created_at AS channel_created_at
    FROM app.app_conversation_channel_members AS member
    JOIN app.app_users AS operator_user
      ON operator_user.id = member.user_id
      AND operator_user.is_operator = true
      AND operator_user.is_deleted = false
    JOIN app.app_conversation_channels AS channel
      ON channel.id = member.channel_id
      AND (channel.is_deleted = false OR channel.is_deleted IS NULL)
    WHERE member.left_at IS NULL
      ${operatorFilter}
      ${channelFilter}
  )`
}

/** Unread per (room, operator): visible messages from real users after the operator's lastReadAt. */
const UNREAD_CTE = Prisma.sql`unread AS (
  SELECT
    membership.channel_id,
    membership.operator_user_id,
    COUNT(message.id)::int AS unread_count
  FROM memberships AS membership
  LEFT JOIN app.app_messages AS message
    ON message.session_key = membership.session_key
    AND (message.is_deleted = false OR message.is_deleted IS NULL)
    AND message.user_id IS NOT NULL
    AND message.user_id <> membership.operator_user_id
    AND (membership.last_read_at IS NULL OR message.created_at > membership.last_read_at)
    AND message.user_id NOT IN (
      SELECT staff.id FROM app.app_users AS staff WHERE staff.is_operator = true
    )
  GROUP BY membership.channel_id, membership.operator_user_id
)`

type UnreadRow = { channelId: string; operatorUserId: string; unreadCount: number | bigint }

/** channelId -> operatorUserId -> unread, for the given rooms. */
async function listOperatorUnreadByRoom(channelIds: string[]): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>()
  if (channelIds.length === 0) return result
  const rows = await prisma.$queryRaw<UnreadRow[]>(Prisma.sql`
    WITH ${operatorMembershipsCte({ channelIds })}, ${UNREAD_CTE}
    SELECT channel_id AS "channelId", operator_user_id AS "operatorUserId", unread_count AS "unreadCount"
    FROM unread
  `)
  for (const row of rows) {
    const count = Number(row.unreadCount)
    const byOperator = result.get(row.channelId) ?? new Map<string, number>()
    byOperator.set(row.operatorUserId, Number.isFinite(count) && count > 0 ? Math.floor(count) : 0)
    result.set(row.channelId, byOperator)
  }
  return result
}

// ─── Members, identities, previews ───────────────────────────────────────────

const INBOX_MEMBER_USER_SELECT = {
  ...USER_IDENTITY_SELECT,
  isDeleted: true,
  isActive: true,
  primaryLanguages: true,
  defaultDisplayLanguage: true,
} satisfies Prisma.UserSelect

type InboxMemberUser = Prisma.UserGetPayload<{ select: typeof INBOX_MEMBER_USER_SELECT }>

type InboxMemberRow = {
  channelId: string
  userId: string
  displayLanguage: string | null
  user: InboxMemberUser
}

async function listActiveMembersByChannelId(channelIds: string[]): Promise<Map<string, InboxMemberRow[]>> {
  const result = new Map<string, InboxMemberRow[]>()
  if (channelIds.length === 0) return result
  const rows = await prisma.appConversationChannelMember.findMany({
    where: { channelId: { in: channelIds }, leftAt: null },
    orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
    select: {
      channelId: true,
      userId: true,
      displayLanguage: true,
      user: { select: INBOX_MEMBER_USER_SELECT },
    },
  })
  for (const row of rows) {
    const members = result.get(row.channelId) ?? []
    members.push(row)
    result.set(row.channelId, members)
  }
  return result
}

function isOperatorMember(row: InboxMemberRow): boolean {
  return row.user.isOperator === true && row.user.isDeleted !== true
}

function toInboxPerson(user: InboxMemberUser): InboxPerson {
  return {
    userId: user.id,
    handle: user.handle ?? null,
    name: user.name ?? null,
    image: user.image ?? null,
    imageCropScale: user.imageCropScale ?? null,
    imageCropX: user.imageCropX ?? null,
    imageCropY: user.imageCropY ?? null,
    ...identityBadgeFlags(user),
  }
}

function resolvePersonaLanguage(user: { primaryLanguages: string[] }): string | null {
  return sanitizeSttLanguageSelection(user.primaryLanguages)[0] ?? null
}

function toInboxOperator(row: InboxMemberRow, unreadCount: number): InboxOperator {
  return {
    ...toInboxPerson(row.user),
    personaLanguage: resolvePersonaLanguage(row.user),
    unreadCount,
    isActive: row.user.isActive !== false,
  }
}

/** What the operator reads the room in: their own room choice, else account default, else persona language. */
function resolveOperatorDisplayLanguage(row: InboxMemberRow): string | null {
  return canonicalLanguage(row.displayLanguage)
    || canonicalLanguage(row.user.defaultDisplayLanguage)
    || resolvePersonaLanguage(row.user)
}

function canonicalLanguage(raw: string | null | undefined): string {
  if (!raw) return ''
  return canonicalizeTranslationLanguageCode(raw) || ''
}

function normalizePreviewText(raw: string | null | undefined): string {
  return (raw || '').replace(/\s+/g, ' ').trim()
}

type LatestMessageRow = {
  id: string
  userId: string | null
  createdAt: Date
  sourceLanguage: string
  metadata: Prisma.JsonValue | null
  contents: Array<{ contentType: string; language: string; text: string }>
}

async function listMessagesById(messageIds: string[]): Promise<Map<string, LatestMessageRow>> {
  if (messageIds.length === 0) return new Map()
  const rows = await prisma.appMessage.findMany({
    where: { id: { in: messageIds } },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      sourceLanguage: true,
      metadata: true,
      contents: {
        where: { OR: [{ isDeleted: false }, { isDeleted: null }] },
        select: { contentType: true, language: true, text: true },
      },
    },
  })
  return new Map(rows.map((row) => [row.id, row]))
}

type PreviewWithSource = InboxMessagePreview & { sourceText: string; sourceLanguage: string }

function buildPreview(row: LatestMessageRow, viewerLanguage: string | null, operatorUserIds: Set<string>): PreviewWithSource {
  const sources = row.contents.filter((content) => content.contentType === 'SOURCE')
  const source = sources.find((content) => content.language === row.sourceLanguage) ?? sources[0] ?? null
  const translations: Record<string, string> = {}
  for (const content of row.contents) {
    if (content.contentType !== 'TRANSLATION_FINAL') continue
    const language = canonicalLanguage(content.language) || content.language.trim()
    const text = normalizePreviewText(content.text)
    if (language && text) translations[language] = text
  }
  const sourceLanguage = canonicalLanguage(row.sourceLanguage) || row.sourceLanguage
  const sourceText = normalizePreviewText(source?.text)
  const kind = isPhotoMessageMetadata(row.metadata) ? 'photo' as const : 'text' as const
  const viewer = canonicalLanguage(viewerLanguage)
  const viewerTranslation = kind === 'text' && viewer && viewer !== sourceLanguage ? translations[viewer] : undefined
  return {
    messageId: row.id,
    senderUserId: row.userId,
    fromOperator: Boolean(row.userId && operatorUserIds.has(row.userId)),
    createdAt: row.createdAt.toISOString(),
    kind,
    text: kind === 'photo' ? '' : (viewerTranslation || sourceText),
    language: viewerTranslation ? viewer : sourceLanguage,
    koText: kind === 'photo'
      ? null
      : sourceLanguage === STAFF_TRANSLATION_LANGUAGE ? sourceText : (translations[STAFF_TRANSLATION_LANGUAGE] ?? null),
    sourceText,
    sourceLanguage,
  }
}

function stripPreviewSource(preview: PreviewWithSource): InboxMessagePreview {
  const { sourceText: _sourceText, sourceLanguage: _sourceLanguage, ...rest } = preview
  void _sourceText
  void _sourceLanguage
  return rest
}

/** channelId -> true for 1:1 rooms (one operator + one other member) with a block in either direction. */
async function resolveBlockedRooms(membersByChannelId: Map<string, InboxMemberRow[]>): Promise<Set<string>> {
  const pairs: Array<{ channelId: string; a: string; b: string }> = []
  for (const [channelId, members] of membersByChannelId.entries()) {
    if (members.length !== 2) continue
    const [first, second] = members
    if (!isOperatorMember(first) && !isOperatorMember(second)) continue
    pairs.push({ channelId, a: first.userId, b: second.userId })
  }
  if (pairs.length === 0) return new Set()
  const blocks = await prisma.userBlock.findMany({
    where: {
      OR: pairs.flatMap(({ a, b }) => [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ]),
    },
    select: { blockerId: true, blockedId: true },
  })
  const blockedPairs = new Set(blocks.map((block) => [block.blockerId, block.blockedId].sort().join('\u0000')))
  return new Set(pairs
    .filter(({ a, b }) => blockedPairs.has([a, b].sort().join('\u0000')))
    .map(({ channelId }) => channelId))
}

// ─── Inbox list ──────────────────────────────────────────────────────────────

type RoomPageRow = {
  conversationId: string
  sessionKey: string
  latestMessageId: string | null
  activityMs: number | bigint
}

/**
 * One page of inbox rooms, newest activity first (latest visible message,
 * else the room's creation). Keyset pagination on (activity, room id), so a
 * room that gets a new message moves to the top instead of shifting pages.
 * `includeKorean` fills `koText` for text previews that have none, through
 * the admin-only staff translation (never stored in the room).
 */
export async function listOperatorInboxRooms(args: {
  operatorUserId?: string | null
  cursor?: InboxCursor | null
  limit?: number | null
  includeKorean?: boolean
} = {}): Promise<InboxListResult> {
  const limit = clampPageSize(args.limit)
  const operatorUserId = args.operatorUserId ? normalizeInboxId(args.operatorUserId) : null
  if (args.operatorUserId && !operatorUserId) return { rooms: [], nextCursor: null }
  const cursorFilter = args.cursor
    ? Prisma.sql`WHERE (activity_ms, channel_id) < (${args.cursor.activityMs}::bigint, ${args.cursor.conversationId}::text)`
    : Prisma.empty

  const pageRows = await prisma.$queryRaw<RoomPageRow[]>(Prisma.sql`
    WITH ${operatorMembershipsCte({ operatorUserId })},
    rooms AS (
      SELECT DISTINCT channel_id, session_key, channel_created_at FROM memberships
    ),
    activity AS (
      SELECT
        room.channel_id,
        room.session_key,
        latest.id AS latest_message_id,
        FLOOR(EXTRACT(EPOCH FROM COALESCE(latest.created_at, room.channel_created_at)) * 1000)::bigint AS activity_ms
      FROM rooms AS room
      LEFT JOIN LATERAL (
        SELECT message.id, message.created_at
        FROM app.app_messages AS message
        WHERE message.session_key = room.session_key
          AND (message.is_deleted = false OR message.is_deleted IS NULL)
        ORDER BY message.created_at DESC, message.id DESC
        LIMIT 1
      ) AS latest ON true
    )
    SELECT
      channel_id AS "conversationId",
      session_key AS "sessionKey",
      latest_message_id AS "latestMessageId",
      activity_ms AS "activityMs"
    FROM activity
    ${cursorFilter}
    ORDER BY activity_ms DESC, channel_id DESC
    LIMIT ${limit + 1}
  `)

  const hasMore = pageRows.length > limit
  const page = pageRows.slice(0, limit)
  if (page.length === 0) return { rooms: [], nextCursor: null }

  const channelIds = page.map((row) => row.conversationId)
  const latestIds = page.flatMap((row) => (row.latestMessageId ? [row.latestMessageId] : []))
  const [membersByChannelId, unreadByRoom, messagesById] = await Promise.all([
    listActiveMembersByChannelId(channelIds),
    listOperatorUnreadByRoom(channelIds),
    listMessagesById(latestIds),
  ])
  const blockedRooms = await resolveBlockedRooms(membersByChannelId)

  const previews = new Map<string, PreviewWithSource>()
  const rooms: InboxRoomSummary[] = []
  for (const row of page) {
    const members = membersByChannelId.get(row.conversationId) ?? []
    const operatorRows = members.filter(isOperatorMember)
    // Membership changed between the two reads (the operator just left).
    if (operatorRows.length === 0) continue
    const unread = unreadByRoom.get(row.conversationId) ?? new Map<string, number>()
    const operators = operatorRows.map((member) => toInboxOperator(member, unread.get(member.userId) ?? 0))
    const viewerRow = (operatorUserId && operatorRows.find((member) => member.userId === operatorUserId)) || operatorRows[0]
    const latestRow = row.latestMessageId ? messagesById.get(row.latestMessageId) : undefined
    const preview = latestRow
      ? buildPreview(latestRow, resolveOperatorDisplayLanguage(viewerRow), new Set(operatorRows.map((member) => member.userId)))
      : null
    if (preview) previews.set(row.conversationId, preview)
    const unreadCount = operatorUserId
      ? unread.get(operatorUserId) ?? 0
      : Math.max(0, ...operators.map((operator) => operator.unreadCount))
    rooms.push({
      conversationId: row.conversationId,
      isGroup: members.length > 2,
      operators,
      counterparts: members.filter((member) => !isOperatorMember(member)).map((member) => toInboxPerson(member.user)),
      latestMessage: preview ? stripPreviewSource(preview) : null,
      activityAt: new Date(Number(row.activityMs)).toISOString(),
      unreadCount,
      blocked: blockedRooms.has(row.conversationId),
    })
  }

  if (args.includeKorean) {
    const requests: StaffTranslationRequest[] = []
    for (const preview of previews.values()) {
      if (preview.kind !== 'text' || preview.koText !== null || !preview.sourceText) continue
      requests.push({ messageId: preview.messageId, text: preview.sourceText, sourceLanguage: preview.sourceLanguage })
    }
    const translated = requests.length > 0 ? await translateForStaff(requests) : {}
    for (const room of rooms) {
      const messageId = room.latestMessage?.messageId
      if (room.latestMessage && messageId && translated[messageId]) {
        room.latestMessage = { ...room.latestMessage, koText: translated[messageId] }
      }
    }
  }

  const last = page.at(-1)
  return {
    rooms,
    nextCursor: hasMore && last
      ? encodeInboxCursor({ activityMs: Number(last.activityMs), conversationId: last.conversationId })
      : null,
  }
}

// ─── Summary / unread total ──────────────────────────────────────────────────

/** Unread across every inbox room; a room counts once, with its most-behind operator. */
export async function countOperatorInboxUnread(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ unreadTotal: number | bigint | null }>>(Prisma.sql`
    WITH ${operatorMembershipsCte()}, ${UNREAD_CTE}
    SELECT COALESCE(SUM(room_unread), 0)::int AS "unreadTotal"
    FROM (
      SELECT channel_id, MAX(unread_count) AS room_unread FROM unread GROUP BY channel_id
    ) AS per_room
  `)
  const total = Number(rows[0]?.unreadTotal ?? 0)
  return Number.isFinite(total) && total > 0 ? Math.floor(total) : 0
}

/** unreadTotal plus one entry per operator that has at least one inbox room (for the filter chips). */
export async function getOperatorInboxSummary(): Promise<InboxSummary> {
  const [operatorRows, unreadTotal] = await Promise.all([
    prisma.$queryRaw<Array<{ operatorUserId: string; roomCount: number | bigint; unreadCount: number | bigint }>>(Prisma.sql`
      WITH ${operatorMembershipsCte()}, ${UNREAD_CTE}
      SELECT
        operator_user_id AS "operatorUserId",
        COUNT(*)::int AS "roomCount",
        COALESCE(SUM(unread_count), 0)::int AS "unreadCount"
      FROM unread
      GROUP BY operator_user_id
    `),
    countOperatorInboxUnread(),
  ])
  if (operatorRows.length === 0) return { unreadTotal, operators: [] }

  const users = await prisma.user.findMany({
    where: { id: { in: operatorRows.map((row) => row.operatorUserId) } },
    select: INBOX_MEMBER_USER_SELECT,
  })
  const usersById = new Map(users.map((user) => [user.id, user]))
  const operators: InboxOperatorStat[] = []
  for (const row of operatorRows) {
    const user = usersById.get(row.operatorUserId)
    if (!user) continue
    operators.push({
      ...toInboxPerson(user),
      personaLanguage: resolvePersonaLanguage(user),
      isActive: user.isActive !== false,
      roomCount: Math.max(0, Number(row.roomCount) || 0),
      unreadCount: Math.max(0, Number(row.unreadCount) || 0),
    })
  }
  operators.sort((left, right) => (
    right.unreadCount - left.unreadCount
    || (left.name || left.handle || '').localeCompare(right.name || right.handle || '')
  ))
  return { unreadTotal, operators }
}

// ─── One room ────────────────────────────────────────────────────────────────

/**
 * The room as the inbox sees it, and the operator it is read and answered as.
 * `operatorUserId` picks one of the room's operators (`?as=`); without it the
 * room's only operator is used, and a room with several falls back to the
 * earliest one unless `requireExplicitOperator` (writes) asks for a choice.
 * A room without an active operator member is not_found: the inbox never
 * reveals other rooms.
 */
export async function resolveInboxRoomAccess(args: {
  conversationId: string
  operatorUserId?: string | null
  requireExplicitOperator?: boolean
}): Promise<InboxRoomAccessResult> {
  const conversationId = normalizeInboxId(args.conversationId)
  if (!conversationId) return { ok: false, error: 'not_found' }
  const requestedOperatorId = args.operatorUserId ? normalizeInboxId(args.operatorUserId) : null
  if (args.operatorUserId && !requestedOperatorId) return { ok: false, error: 'operator_not_in_room' }

  const channel = await prisma.appConversationChannel.findFirst({
    where: { id: conversationId, OR: [{ isDeleted: false }, { isDeleted: null }] },
    select: { id: true, sessionKey: true, pendingInviteeUserIds: true },
  })
  if (!channel) return { ok: false, error: 'not_found' }

  const membersByChannelId = await listActiveMembersByChannelId([channel.id])
  const members = membersByChannelId.get(channel.id) ?? []
  const operatorRows = members.filter(isOperatorMember)
  if (operatorRows.length === 0) return { ok: false, error: 'not_found' }

  if (!requestedOperatorId && operatorRows.length > 1 && args.requireExplicitOperator) {
    return { ok: false, error: 'operator_ambiguous' }
  }
  const actingUserId = requestedOperatorId ?? operatorRows[0].userId
  if (!operatorRows.some((member) => member.userId === actingUserId)) {
    return { ok: false, error: 'operator_not_in_room' }
  }

  const [unreadByRoom, blockedRooms] = await Promise.all([
    listOperatorUnreadByRoom([channel.id]),
    resolveBlockedRooms(membersByChannelId),
  ])
  const unread = unreadByRoom.get(channel.id) ?? new Map<string, number>()
  const operators = operatorRows.map((member) => toInboxOperator(member, unread.get(member.userId) ?? 0))
  const operator = operators.find((candidate) => candidate.userId === actingUserId) ?? operators[0]
  const blocked = blockedRooms.has(channel.id)
  const recipientCount = members.length - 1 + channel.pendingInviteeUserIds.length
  const replyUnavailableReason: InboxReplyUnavailableReason | null = !operator.isActive
    ? 'operator_inactive'
    : blocked ? 'blocked' : recipientCount <= 0 ? 'no_recipients' : null

  return {
    ok: true,
    room: {
      conversationId: channel.id,
      sessionKey: channel.sessionKey,
      operator,
      operators,
      counterparts: members.filter((member) => !isOperatorMember(member)).map((member) => toInboxPerson(member.user)),
      isGroup: members.length > 2,
      blocked,
      replyUnavailableReason,
    },
  }
}

function toRoomDetail(room: InboxRoomAccess): InboxRoomDetail {
  const { sessionKey: _sessionKey, ...detail } = room
  void _sessionKey
  return detail
}

/**
 * Hydrates the room exactly as the operator account sees it (the same
 * membership-gated read the app uses, with the operator as viewer). Reading
 * as a user counts as acting as one, so the operator guard runs first.
 * `auditOpen` writes `inbox.open` (the page's first load, never a refresh).
 */
export async function loadInboxRoomView(args: {
  ctx: AdminContext
  conversationId: string
  operatorUserId?: string | null
  before?: ConversationHydrationCursor | null
  auditOpen?: boolean
}): Promise<InboxRoomViewResult> {
  const access = await resolveInboxRoomAccess({
    conversationId: args.conversationId,
    operatorUserId: args.operatorUserId,
  })
  if (!access.ok) return access
  const operatorUserId = access.room.operator.userId
  try {
    await requireOperatorAccount(operatorUserId)
  } catch (error) {
    if (error instanceof OperatorAccountRequiredError) return { ok: false, error: 'operator_required' }
    throw error
  }

  const hydration = await getConversationHydrationStateForUser({
    conversationId: access.room.conversationId,
    userId: operatorUserId,
    before: args.before ?? null,
  })
  if (!hydration) return { ok: false, error: 'not_found' }

  if (args.auditOpen) {
    await writeAdminAudit(args.ctx, {
      action: 'inbox.open',
      operatorUserId,
      targetType: 'conversation',
      targetId: access.room.conversationId,
    })
  }
  return { ok: true, view: { room: toRoomDetail(access.room), hydration } }
}

/** Marks the room read AS the operator (their own lastReadAt only) and audits it. */
export async function markInboxRoomRead(args: {
  ctx: AdminContext
  conversationId: string
  operatorUserId?: string | null
}): Promise<{ ok: true; operatorUserId: string } | { ok: false; error: InboxRoomAccessError | 'operator_required' }> {
  const access = await resolveInboxRoomAccess({
    conversationId: args.conversationId,
    operatorUserId: args.operatorUserId,
    requireExplicitOperator: true,
  })
  if (!access.ok) return access
  const operatorUserId = access.room.operator.userId
  try {
    await requireOperatorAccount(operatorUserId)
  } catch (error) {
    if (error instanceof OperatorAccountRequiredError) return { ok: false, error: 'operator_required' }
    throw error
  }

  const updated = await markConversationChannelRead({
    conversationId: access.room.conversationId,
    userId: operatorUserId,
  })
  if (!updated) return { ok: false, error: 'not_found' }
  await writeAdminAudit(args.ctx, {
    action: 'inbox.mark_read',
    operatorUserId,
    targetType: 'conversation',
    targetId: access.room.conversationId,
  })
  return { ok: true, operatorUserId }
}

/** First page of the inbox plus the operator chips and the unread total, for the list page and its API. */
export async function loadInboxList(args: {
  operatorUserId?: string | null
  cursor?: InboxCursor | null
  limit?: number | null
  includeKorean?: boolean
} = {}): Promise<InboxListResult & InboxSummary & { serverNowMs: number }> {
  const [list, summary] = await Promise.all([
    listOperatorInboxRooms(args),
    getOperatorInboxSummary(),
  ])
  return { ...list, ...summary, serverNowMs: Date.now() }
}

// Same key shape the photo upload path issues (conversation-image-controller.ts).
const CONVERSATION_IMAGE_KEY_PATTERN = /^conversation-images\/[\w-]+\.jpg$/

/**
 * Storage key of a chat photo the admin may view: a visible photo message in
 * a non-deleted room that has an active operator member. Anything else is
 * null, so the admin image proxy can never serve a photo from a room outside
 * the inbox.
 */
export async function resolveInboxPhotoObjectKey(rawMessageId: string): Promise<string | null> {
  const messageId = normalizeInboxId(rawMessageId)
  if (!messageId) return null
  const message = await prisma.appMessage.findFirst({
    where: { id: messageId, OR: [{ isDeleted: false }, { isDeleted: null }] },
    select: { sessionKey: true, metadata: true },
  })
  if (!message?.sessionKey || !isPhotoMessageMetadata(message.metadata)) return null
  const image = (message.metadata as Record<string, unknown>).image as Record<string, unknown>
  const objectKey = typeof image.objectKey === 'string' ? image.objectKey : ''
  if (!CONVERSATION_IMAGE_KEY_PATTERN.test(objectKey)) return null

  const operatorMember = await prisma.appConversationChannelMember.findFirst({
    where: {
      leftAt: null,
      channel: { sessionKey: message.sessionKey, OR: [{ isDeleted: false }, { isDeleted: null }] },
      user: { isOperator: true, isDeleted: false },
    },
    select: { id: true },
  })
  return operatorMember ? objectKey : null
}
