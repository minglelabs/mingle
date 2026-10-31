/**
 * The starter feed on prod (what a new reader sees first) plus a little
 * engagement on it, from latent posts picked for Korean readers and for
 * everyone else. For each one that has been published it
 *   - saves the starter feed in the picked order (unpublished picks wait),
 *   - adds likes from other operator accounts to a post with none yet,
 *   - has 1-3 other operator accounts leave an AI comment on a post with none.
 * Safe to run again after more of them are published. --dry-run prints only.
 * --all does the same for every published operator post still without likes
 * or comments (run it after posts are published from review).
 *
 *   railway run -- npx tsx scripts/seed-starter-engagement.mts [--all] [--dry-run]
 */
import { prisma } from '../src/lib/prisma'
import { markPostViewed } from '../src/server/feed/post-view'
import { saveStarterFeed, type StarterFeed } from '../src/server/feed/starter-feed'
import { commentOnPostAsOperator } from '../src/server/operator-comments/comment'

// Picked by the rules staff set for the starter feed (2026-10-31), mostly
// photos with people in them: Korean readers get 3 posts by Japanese women
// and 2 by Chinese women, the rest from other countries; everyone else gets
// 4 posts by Korean men and 3 by Korean women, the rest by foreigners living
// in or loving Korea. Candidates written for this list are in
// scripts/starter-feed-candidates.mts.
const PICKS: Record<keyof StarterFeed, string[]> = {
  // Existing posts first: a published post or a latent one with a photo plan
  // is used before anything new is written for the same account and topic.
  ko: [
    'cmvtocu1e0018sh3e3cnkkjki', // rina.sel (JP, F) 韓国の美容室で初めて髪切った, published
    'cmvwdqd9j0003sh99czmdffsm', // linxiao.sh (CN, F) 상하이 고깃집 알바, 한국어 주문 (written for this list)
    'cmvwdqdtj0005sh991jp9d20z', // em.ldn (GB, F) 런던 카페에서 한국어 주문 (written for this list)
    'cmvdgqqp20160shsydydf48ga', // misaki.tkm (JP, F) 鐘路3街のポチャ通り
    'cmvtocn45000ksh3eferewy36', // dan.in.seoul (US, M) 3년째 아메리카노 원 플리즈, published
    'cmvtocww8001ish3e6gk77j9a', // yuxuan.w (CN, F) 첫 찜질방 양머리, published
    'cmuwrn9lq0019sh9afs6cpgkt', // chen.yi.chun (TW, F) 涼麵, published
    'cmvfrs00y00tcshwui4ri9nnu', // sara.ueno (JP, F) 교환학생 자기소개서 4번째 수정
    'cmvfr5n8w006lshwuaqdayrhl', // lucas.frr (BR, M) 민수 씨와 한강 러닝, 반포대교까지 전력 질주
    'cmuwrof8i002csh5cdclh80xc', // anya.lestari (ID, F) 똠얌꿍, published
  ],
  foreign: [
    'post:cmvb31snm0004shx1uy1mp6i7', // seoyun.daily (KR, F) 유리바닥 사진 4장, already a post
    'cmvtocz6r001qsh3e20ny2s1l', // dohyun.k (KR, M) 북한산 외국인 등산객, 같이 갈 사람? published
    'cmvfr1mhy001dshwu4yhpw7i0', // haeun.log (KR, F) 1원 단위까지 나눠 송금하는 문화, 외국은?
    'cmvdflgnx004asheyafjb73ji', // junho.bsn (KR, M) 돼지국밥 다대기, published
    'cmvfrfg9700f2shwu3oi34fmp', // siwoo.j (KR, M) 성수 옥상 사진, 바람에 앞머리
    'cmuwrpj9p003csh5cjhjk3u4b', // yuki.yokohama (JP, F) 편의점 푸딩, published
    'cmvtoczrc001ssh3e03pyibcv', // minji.k (KR, F) 망원시장 떡볶이, published
    'cmvtocym4001osh3es60uvbxl', // taeyun.s (KR, M) 한강 따릉이, published
    'cmvfr3o59004cshwu7r25qzbm', // ava.kim.la (US, F) H-Mart 붕어빵 3개
    'cmvdfli6e004wsheypwu0ak23', // yuxuan.w (CN in Seoul, F) 괴물 드라마, published
  ],
}

const dryRun = process.argv.includes('--dry-run')
const allPublished = process.argv.includes('--all')

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
    where: { id: { in: reserveIds.filter((id) => !id.startsWith('post:')) } },
    select: { id: true, state: true, postId: true, operatorUserId: true },
  })
  const byId = new Map(rows.map((row) => [row.id, row]))
  // A `post:` entry is a post that never was a latent post.
  const postIdOf = (id: string) => {
    if (id.startsWith('post:')) return id.slice('post:'.length)
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

  const targets = [...feed.ko, ...feed.foreign]
  if (allPublished) {
    const bare = await prisma.post.findMany({
      where: {
        author: { isOperator: true },
        deletedAt: null,
        AND: [
          { OR: [{ isDeleted: false }, { isDeleted: null }] },
          { OR: [{ likeCount: 0 }, { commentCount: 0 }] },
        ],
      },
      orderBy: { publishedAt: 'asc' },
      select: { id: true },
    })
    for (const { id } of bare) if (!targets.includes(id)) targets.push(id)
  }

  for (const postId of targets) {
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
