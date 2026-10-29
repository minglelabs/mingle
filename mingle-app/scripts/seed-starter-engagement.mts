/**
 * The starter feed on prod (what a new reader sees first) plus a little
 * engagement on it: staff picked latent posts for Korean readers and for
 * everyone else (2026-10-29, photo posts with a hook). For each one that has
 * been published it
 *   - saves the starter feed in the picked order (unpublished picks wait),
 *   - adds likes from other operator accounts to a post with none yet,
 *   - has 1-3 other operator accounts leave an AI comment on a post with none.
 * Safe to run again after more of them are published. --dry-run prints only.
 *
 *   railway run -- npx tsx scripts/seed-starter-engagement.mts [--dry-run]
 */
import { prisma } from '../src/lib/prisma'
import { markPostViewed } from '../src/server/feed/post-view'
import { saveStarterFeed, type StarterFeed } from '../src/server/feed/starter-feed'
import { commentOnPostAsOperator } from '../src/server/operator-comments/comment'

const PICKS: Record<keyof StarterFeed, string[]> = {
  ko: [
    'cmuvc86by0009shzy2781fbtp', // kenji_sapporo ジンギスカン
    'cmuwromjz0035sh5cmgnm8aql', // huy.cantho 키보드에 오렌지 주스
    'cmuwromjz002ssh5crzuvz0m6', // huy.cantho 오토바이 펑크
    'cmuwrmyrd0004sh5csvylpqek', // li.wei.sh 2호선 발이 뜸
    'cmuwrn9lq001ash9ajhqlius5', // chen.yi.chun 胡椒餅
    'cmuwrpj9p003fsh5cbmqo71r2', // yuki.yokohama 家系ラーメン
    'cmuwrq0aj0042sh5c9gi8r4f2', // somchai_kk 커피 쏟음
    'cmuwromjz0031sh5cnebcomzv', // huy.cantho 버블티 100% 당도
    'cmvdfhmy6000gsheyivm4y2wi', // dan.in.seoul 구호 활동 수준
    'cmuvchsfm000bshx0s6szf1yj', // jessica.lee.htx 겨울 아아
  ],
  foreign: [
    'cmvdflgnx004asheyafjb73ji', // junho.bsn 다대기
    'cmuwrnaes001ysh9a2riv4wgk', // yuki.kr 양파 태움
    'cmuwrnaer001ssh9a0ozbgtl8', // yuki.kr 지갑
    'cmuwrnaer001wsh9avn1jb3m3', // yuki.kr 팀플 단톡방
    'cmvew5mjz01xhshsylhvkwrs8', // taeyun.s 영혼 없이
    'cmuwrpv98005bsh9a8idrfao3', // minjun.k 厉害 vs 牛逼
    'cmuwrpv98005ash9a76fxk6vu', // minjun.k 단어 42개
    'cmvb32e2u0083shbzrhhh4oh7', // seoyun.daily 성수 칼국수
    'cmuwrn9lq0019sh9afs6cpgkt', // chen.yi.chun 떡볶이
    'cmuwrmyrd0001sh5ctgufk500', // li.wei.sh 제주 사진
  ],
}

const dryRun = process.argv.includes('--dry-run')

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function between(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

async function main() {
  const reserveIds = [...PICKS.ko, ...PICKS.foreign]
  const rows = await prisma.operatorPostReserve.findMany({
    where: { id: { in: reserveIds } },
    select: { id: true, state: true, postId: true, operatorUserId: true },
  })
  const byId = new Map(rows.map((row) => [row.id, row]))
  const postIdOf = (id: string) => {
    const row = byId.get(id)
    return row?.state === 'published' && row.postId ? row.postId : null
  }
  const feed: StarterFeed = {
    ko: PICKS.ko.map(postIdOf).filter((id): id is string => id !== null),
    foreign: PICKS.foreign.map(postIdOf).filter((id): id is string => id !== null),
  }
  console.log(`published: ${feed.ko.length}/${PICKS.ko.length} for Korean readers, ${feed.foreign.length}/${PICKS.foreign.length} for the others`)
  for (const id of reserveIds) if (!postIdOf(id)) console.log('  waiting:', id, byId.get(id)?.state ?? 'missing')
  if (!dryRun) await saveStarterFeed(feed)

  const operators = (await prisma.user.findMany({
    where: { isOperator: true, isDeleted: false, operatorAccount: { reviewState: 'approved' } },
    select: { id: true },
  })).map((user) => user.id)

  for (const postId of [...feed.ko, ...feed.foreign]) {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true, publishedAt: true, likeCount: true, commentCount: true },
    })
    if (!post) continue
    const others = shuffle(operators.filter((id) => id !== post.authorId))

    if (post.likeCount === 0) {
      const likers = others.slice(0, between(4, 12))
      console.log(postId, `+${likers.length} likes`)
      if (!dryRun) {
        for (const userId of likers) {
          // Spread over the hours after the post went up, never in the future.
          const createdAt = new Date(Math.min(Date.now(), post.publishedAt.getTime() + between(5, 360) * 60_000))
          const created = await prisma.postLike.createMany({ data: [{ postId, userId, createdAt }], skipDuplicates: true })
          if (created.count) await prisma.post.update({ where: { id: postId }, data: { likeCount: { increment: 1 } } })
          await markPostViewed(userId, postId)
        }
      }
    }

    if (post.commentCount === 0) {
      const commenters = shuffle(others).slice(0, between(1, 3))
      for (const operatorUserId of commenters) {
        if (dryRun) {
          console.log(postId, 'comment by', operatorUserId)
          continue
        }
        const result = await commentOnPostAsOperator(null, { operatorUserId, postId })
        console.log(postId, result.ok ? `comment: ${result.text}` : `comment skipped: ${result.error}`)
      }
    }
  }
  await prisma.$disconnect()
}

void main()
