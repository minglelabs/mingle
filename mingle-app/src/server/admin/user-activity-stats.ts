import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * Staff-only activity report for one account (staff, 2026-11-23): what the
 * person has done in the app, aggregated from rows the app already keeps.
 * Nothing new is logged. Every source is read through an index on the
 * account's own id, so one report is a handful of index scans even on the
 * small prod database.
 *
 * Each metric has a total, the last 7 and 30 days, and the first and last
 * time it happened; `amount` metrics (seconds, Hash) also sum a value.
 */

export const USER_ACTIVITY_METRICS = [
  { key: 'posts', label: '게시물 작성', group: '피드' },
  { key: 'photo_posts', label: '사진 게시물', group: '피드' },
  { key: 'comments', label: '댓글 작성', group: '피드' },
  { key: 'replies', label: '대댓글 작성', group: '피드' },
  { key: 'post_likes_given', label: '게시물 좋아요 누름', group: '피드' },
  { key: 'comment_likes_given', label: '댓글 좋아요 누름', group: '피드' },
  { key: 'post_likes_received', label: '받은 게시물 좋아요', group: '피드' },
  { key: 'comments_received', label: '받은 댓글', group: '피드' },
  { key: 'posts_viewed', label: '본 게시물', group: '피드' },
  { key: 'followers', label: '팔로워', group: '관계' },
  { key: 'following', label: '팔로잉', group: '관계' },
  { key: 'profiles_viewed', label: '다른 프로필 방문', group: '관계' },
  { key: 'profile_visits_received', label: '내 프로필 방문받음', group: '관계' },
  { key: 'blocks', label: '차단함', group: '관계' },
  { key: 'reports_filed', label: '신고함', group: '관계' },
  { key: 'reports_received', label: '신고받음', group: '관계' },
  { key: 'rooms_joined', label: '대화방 참여', group: '대화' },
  { key: 'messages_sent', label: '보낸 메시지', group: '대화' },
  { key: 'voice_messages', label: '음성으로 보낸 메시지', group: '대화' },
  { key: 'voice_seconds', label: '음성 통역 시간', group: '대화', unit: 'seconds' },
  { key: 'calls', label: '음성 통화 참여', group: '대화' },
  { key: 'call_seconds', label: '음성 통화 시간', group: '대화', unit: 'seconds' },
  { key: 'hash_spent', label: '쓴 해씨', group: '해씨', unit: 'hash' },
  { key: 'hash_purchased', label: '구매로 받은 해씨', group: '해씨', unit: 'hash' },
  { key: 'hash_admin_granted', label: '운영 지급 해씨', group: '해씨', unit: 'hash' },
  { key: 'hash_free_granted', label: '무료 지급 해씨 (가입·매일 등)', group: '해씨', unit: 'hash' },
  { key: 'purchases', label: '결제 건수', group: '해씨' },
] as const

export type UserActivityMetricKey = (typeof USER_ACTIVITY_METRICS)[number]['key']

export type UserActivityMetric = {
  key: UserActivityMetricKey
  label: string
  group: string
  unit: 'count' | 'seconds' | 'hash'
  /** Count, or the summed amount for seconds / Hash. */
  total: number
  last7: number
  last30: number
  first: string | null
  last: string | null
}

export type UserActivityPartner = { userId: string; name: string | null; handle: string; isOperator: boolean; messages: number; last: string | null }

export type UserActivityStats = {
  user: {
    id: string
    name: string | null
    handle: string
    isOperator: boolean
    createdAt: string
    lastSeenAt: string
    platform: string | null
    appVersion: string | null
    discoverySource: string | null
    usagePurpose: string | null
    referralSource: string | null
    nationalityCountry: string | null
    primaryLanguages: string[]
    interestLanguages: string[]
    /** `app_users.total_usage_sec`: the app's own running usage counter. */
    totalUsageSec: number
    hashBalance: number | null
  }
  metrics: UserActivityMetric[]
  conversations: {
    /** Rooms where someone else sent at least one message. */
    roomsWithOthers: number
    /** Distinct people who sent messages in this person's rooms. */
    partners: number
    topPartners: UserActivityPartner[]
  }
}

type MetricRow = { metric: string; total: number; last7: number; last30: number; first: Date | null; last: Date | null }

const MICRO = 1_000_000

/** Rows (metric, at, amount) from every source, one index scan each. */
function metricSql(userId: string): Prisma.Sql {
  return Prisma.sql`
    WITH ev(metric, at, amount) AS (
      SELECT 'posts', p.published_at, 1::float8 FROM app.app_posts p WHERE p.author_id = ${userId} AND p.is_deleted IS NOT TRUE
      UNION ALL SELECT 'photo_posts', p.published_at, 1 FROM app.app_posts p WHERE p.author_id = ${userId} AND p.is_deleted IS NOT TRUE AND p.image_object_key IS NOT NULL
      UNION ALL SELECT CASE WHEN c.parent_id IS NULL THEN 'comments' ELSE 'replies' END, c.created_at, 1 FROM app.app_post_comments c WHERE c.author_id = ${userId} AND c.is_deleted IS NOT TRUE
      UNION ALL SELECT 'post_likes_given', l.created_at, 1 FROM app.app_post_likes l WHERE l.user_id = ${userId}
      UNION ALL SELECT 'comment_likes_given', l.created_at, 1 FROM app.app_post_comment_likes l WHERE l.user_id = ${userId}
      UNION ALL SELECT 'post_likes_received', l.created_at, 1 FROM app.app_posts p JOIN app.app_post_likes l ON l.post_id = p.id WHERE p.author_id = ${userId} AND l.user_id <> ${userId}
      UNION ALL SELECT 'comments_received', c.created_at, 1 FROM app.app_posts p JOIN app.app_post_comments c ON c.post_id = p.id WHERE p.author_id = ${userId} AND c.author_id <> ${userId} AND c.is_deleted IS NOT TRUE
      UNION ALL SELECT 'posts_viewed', v.viewed_at, 1 FROM app.app_post_views v WHERE v.user_id = ${userId}
      UNION ALL SELECT 'followers', f.created_at, 1 FROM app.app_user_follows f WHERE f.following_id = ${userId}
      UNION ALL SELECT 'following', f.created_at, 1 FROM app.app_user_follows f WHERE f.follower_id = ${userId}
      UNION ALL SELECT 'profiles_viewed', v.created_at, 1 FROM app.app_profile_views v WHERE v.viewer_id = ${userId} AND v.profile_user_id <> ${userId}
      UNION ALL SELECT 'profile_visits_received', v.created_at, 1 FROM app.app_profile_views v WHERE v.profile_user_id = ${userId} AND v.viewer_id <> ${userId}
      UNION ALL SELECT 'blocks', b.created_at, 1 FROM app.app_user_blocks b WHERE b.blocker_id = ${userId}
      UNION ALL SELECT 'reports_filed', r.created_at, 1 FROM app.app_user_reports r WHERE r.reporter_id = ${userId}
      UNION ALL SELECT 'reports_received', r.created_at, 1 FROM app.app_user_reports r WHERE r.reported_user_id = ${userId}
      UNION ALL SELECT 'rooms_joined', m.joined_at, 1 FROM app.app_conversation_channel_members m WHERE m.user_id = ${userId}
      UNION ALL SELECT 'messages_sent', m.created_at, 1 FROM app.app_messages m WHERE m.user_id = ${userId} AND m.is_deleted IS NOT TRUE
      UNION ALL SELECT 'voice_messages', m.created_at, 1 FROM app.app_messages m WHERE m.user_id = ${userId} AND m.is_deleted IS NOT TRUE AND m.stt_duration_ms > 0
      UNION ALL SELECT 'voice_seconds', m.created_at, m.stt_duration_ms / 1000.0 FROM app.app_messages m WHERE m.user_id = ${userId} AND m.stt_duration_ms > 0
      UNION ALL SELECT 'calls', p.joined_at, 1 FROM app.app_voice_call_participants p WHERE p.user_id = ${userId}
      UNION ALL SELECT 'call_seconds', p.joined_at, GREATEST(0, EXTRACT(EPOCH FROM (p.left_at - p.joined_at))) FROM app.app_voice_call_participants p WHERE p.user_id = ${userId} AND p.left_at IS NOT NULL
      UNION ALL SELECT CASE
          WHEN g.type = 'spend' THEN 'hash_spent'
          WHEN g.purchase_id IS NOT NULL THEN 'hash_purchased'
          WHEN g.admin_grant_id IS NOT NULL THEN 'hash_admin_granted'
          ELSE 'hash_free_granted' END,
        g.created_at, ABS(g.amount_micro)::float8 / ${MICRO}
        FROM app.app_coin_ledger g WHERE g.user_id = ${userId} AND g.type IN ('spend', 'grant')
      UNION ALL SELECT 'purchases', i.created_at, 1 FROM app.app_iap_purchases i WHERE i.user_id = ${userId} AND i.status IN ('verified', 'granted')
    )
    SELECT metric,
      COALESCE(SUM(amount), 0)::float8 AS total,
      COALESCE(SUM(amount) FILTER (WHERE at > now() - interval '7 days'), 0)::float8 AS last7,
      COALESCE(SUM(amount) FILTER (WHERE at > now() - interval '30 days'), 0)::float8 AS last30,
      MIN(at) AS first, MAX(at) AS last
    FROM ev GROUP BY metric`
}

/** Who talks with this person: senders in the rooms they are a member of. */
function partnerSql(userId: string): Prisma.Sql {
  return Prisma.sql`
    SELECT m.user_id AS "userId", u.name, u.handle, u.is_operator AS "isOperator",
      COUNT(*)::int AS messages, MAX(m.created_at) AS last, COUNT(DISTINCT c.id)::int AS rooms
    FROM app.app_conversation_channel_members cm
    JOIN app.app_conversation_channels c ON c.id = cm.channel_id
    JOIN app.app_messages m ON m.session_key = c.session_key
    JOIN app.app_users u ON u.id = m.user_id
    WHERE cm.user_id = ${userId} AND m.user_id <> ${userId} AND m.is_deleted IS NOT TRUE
    GROUP BY m.user_id, u.name, u.handle, u.is_operator
    ORDER BY messages DESC`
}

function roomsWithOthersSql(userId: string): Prisma.Sql {
  return Prisma.sql`
    SELECT COUNT(*)::int AS rooms
    FROM app.app_conversation_channel_members cm
    JOIN app.app_conversation_channels c ON c.id = cm.channel_id
    WHERE cm.user_id = ${userId}
      AND EXISTS (SELECT 1 FROM app.app_messages m WHERE m.session_key = c.session_key AND m.user_id <> ${userId} AND m.is_deleted IS NOT TRUE)`
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

function round(value: number, unit: UserActivityMetric['unit']): number {
  return unit === 'hash' ? Math.round(value * 10) / 10 : Math.round(value)
}

export function shapeMetrics(rows: MetricRow[]): UserActivityMetric[] {
  const byKey = new Map(rows.map((row) => [row.metric, row]))
  return USER_ACTIVITY_METRICS.map((definition) => {
    const unit = 'unit' in definition ? definition.unit : 'count'
    const row = byKey.get(definition.key)
    return {
      key: definition.key,
      label: definition.label,
      group: definition.group,
      unit,
      total: round(Number(row?.total ?? 0), unit),
      last7: round(Number(row?.last7 ?? 0), unit),
      last30: round(Number(row?.last30 ?? 0), unit),
      first: iso(row?.first),
      last: iso(row?.last),
    }
  })
}

const TOP_PARTNERS = 8

export async function loadUserActivityStats(userId: string): Promise<UserActivityStats | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, handle: true, isOperator: true, createdAt: true, lastSeenAt: true,
      latestClientPlatform: true, platform: true, latestAppVersion: true, discoverySource: true, usagePurpose: true,
      referralSource: true, nationalityCountry: true, primaryLanguages: true, interestLanguages: true, totalUsageSec: true,
    },
  })
  if (!user) return null
  // One after another: the prod database is small, and each is a few index scans.
  const metricRows = await prisma.$queryRaw<MetricRow[]>(metricSql(user.id))
  const partnerRows = await prisma.$queryRaw<Array<Omit<UserActivityPartner, 'last'> & { last: Date | null; rooms: number }>>(partnerSql(user.id))
  const [rooms] = await prisma.$queryRaw<Array<{ rooms: number }>>(roomsWithOthersSql(user.id))
  const wallet = await prisma.appCoinWallet.findUnique({ where: { userId: user.id }, select: { balanceMicro: true } })

  return {
    user: {
      id: user.id,
      name: user.name,
      handle: user.handle,
      isOperator: user.isOperator,
      createdAt: user.createdAt.toISOString(),
      lastSeenAt: user.lastSeenAt.toISOString(),
      platform: user.latestClientPlatform ?? user.platform,
      appVersion: user.latestAppVersion,
      discoverySource: user.discoverySource,
      usagePurpose: user.usagePurpose,
      referralSource: user.referralSource,
      nationalityCountry: user.nationalityCountry,
      primaryLanguages: user.primaryLanguages,
      interestLanguages: user.interestLanguages,
      totalUsageSec: user.totalUsageSec,
      hashBalance: wallet ? Math.round((Number(wallet.balanceMicro) / MICRO) * 10) / 10 : null,
    },
    metrics: shapeMetrics(metricRows),
    conversations: {
      roomsWithOthers: rooms?.rooms ?? 0,
      partners: partnerRows.length,
      topPartners: partnerRows.slice(0, TOP_PARTNERS).map((row) => ({
        userId: row.userId, name: row.name, handle: row.handle, isOperator: row.isOperator === true, messages: row.messages, last: iso(row.last),
      })),
    },
  }
}
