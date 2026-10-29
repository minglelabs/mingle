/**
 * The starter feed on prod (what a new reader sees first) plus a little
 * engagement on it, from latent posts picked for Korean readers and for
 * everyone else. For each one that has been published it
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

// Picked by the rules staff set for the starter feed: Korean readers meet
// foreigners learning Korean (3 Japanese with one first, 2 Chinese, 2 Korean,
// 3 others); everyone else meets Korea (4 Koreans, only Seoyun a woman; 2
// Japanese; 4 from the US, the UK, Brazil, France, India or China, all women
// but one white man). All photo posts, the ones with a hook.
const PICKS: Record<keyof StarterFeed, string[]> = {
  ko: [
    'cmuwrpj9p003fsh5cbmqo71r2', // yuki.yokohama (JP, F) 家系ラーメンで胃が死んだ
    'cmuvc86by0009shzy2781fbtp', // kenji_sapporo (JP) ジンギスカン、服が全部羊くさい
    'cmuwrmyrd0001sh5ctgufk500', // li.wei.sh (CN) 제주 사진 날리고 렌터카 영수증만
    'cmuwrnaer001ssh9a0ozbgtl8', // yuki.kr (KR) 지갑 두고 나옴 레전드
    'cmuwroamt001tsh5cz3qt2vpf', // kenji.sato (JP) 홍대 혼밥 어디?
    'cmuwrq0aj0042sh5c9gi8r4f2', // somchai_kk (TH) 커피 쏟아 바지 다 젖음
    'cmuwrn9lq0019sh9afs6cpgkt', // chen.yi.chun (TW) 떡볶이 너무 매워요
    'cmuwrpv98005ash9a76fxk6vu', // minjun.k (KR) 단어 42개 외우다 기절
    'cmuwromjz0035sh5cmgnm8aql', // huy.cantho (VN) 키보드에 오렌지 주스
    'cmuwrof8i002csh5cdclh80xc', // anya.lestari (ID) 똠얌꿍 시어서 눈물
  ],
  foreign: [
    'cmvb32e2u0083shbzrhhh4oh7', // seoyun.daily (KR, F) 성수 칼국수 어디가 나음
    'cmvdflgnx004asheyafjb73ji', // junho.bsn (KR, M) 돼지국밥 다대기
    'cmuvchsfm000bshx0s6szf1yj', // jessica.lee.htx (US, F) 겨울에도 아아?
    'cmuwrpv98005bsh9a8idrfao3', // minjun.k (KR, M) 厉害 vs 牛逼
    'cmvdfmxo8006ksheyl0zkfqnz', // ayaka.sel (JP in Seoul, F) 2호선 반대 방향
    'cmvdfhmy6000gsheyivm4y2wi', // dan.in.seoul (US, M) 발음 교정은 구호 활동 수준
    'cmvew5mjz01xhshsylhvkwrs8', // taeyun.s (KR, M) 서울 26년 11개월째
    'cmuwrpj9p003csh5cjhjk3u4b', // yuki.yokohama (JP, F) 편의점 푸딩
    'cmvdfli6e004wsheypwu0ak23', // yuxuan.w (CN in Seoul, F) 괴물 드라마
    'cmuwrp8hc003ysh9a13f014qv', // anya.k (IN, F) 한국어로 30분씩 이야기할 분
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
