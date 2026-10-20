/**
 * Likes and comments on the demo feed's posts in the LOCAL database, so a new
 * reader does not land on a feed nobody reacts to:
 *
 *   pnpm tsx scripts/demo-feed/reactions.ts
 *
 * Likes come from operator accounts as real like rows; when the plan wants
 * more likes than there are operator accounts, the rest is added to the count
 * only (who liked is not shown anywhere yet). Comments are AI-written by
 * operator accounts through the app's own comment path, always fewer than the
 * likes. A post that already has likes is left alone, so it is safe to rerun;
 * a post with its own `reactions` target is topped up to it instead.
 * Refuses any database that is not on this machine.
 */
import { prisma } from '../../src/lib/prisma'
import { commentOnPostAsOperator } from '../../src/server/operator-comments/comment'
import { seededRandom } from '../../src/server/operator-avatars/taxonomy'
import { decodePostPhoto } from '../../src/server/operator-post-reserve/post-photo'
import { DEMO_POSTS, type DemoPost } from './posts'

const postIdOf = (post: DemoPost) => post.existingPostId ?? `demo-feed-${post.slot.toLowerCase()}`

/** Photos of people draw the most likes, other photos fewer, text posts the fewest. */
function plan(post: DemoPost, random: () => number): { likes: number; comments: number } {
  const kind = post.photo ? decodePostPhoto(post.photo).kind : null
  const [low, high] = kind && kind !== 'scene' ? [22, 48] : post.photo ? [11, 26] : [6, 15]
  const likes = low + Math.floor(random() * (high - low + 1))
  const question = /[?？]/.test(post.text ?? '')
  const comments = Math.min(likes - 3, (question ? 3 : 2) + Math.floor(random() * 3))
  return { likes, comments }
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

async function main() {
  const host = new URL(process.env.DATABASE_URL ?? 'postgresql://unset').hostname
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error(`not a local database: ${host}`)
  const operators = (await prisma.user.findMany({
    where: { isOperator: true, isActive: true, isDeleted: false },
    select: { id: true },
  })).map((user) => user.id)

  const seen = new Set<string>()
  for (const post of DEMO_POSTS) {
    const id = postIdOf(post)
    if (seen.has(id)) continue
    seen.add(id)
    const row = await prisma.post.findUnique({ where: { id }, select: { authorId: true, likeCount: true, commentCount: true, publishedAt: true } })
    if (!row) continue
    const topUp = post.reactions && row.likeCount < post.reactions.likes
    if (row.likeCount > 0 && !topUp) continue
    const random = seededRandom(`demo-feed-reactions:${id}`)
    const target = post.reactions ?? plan(post, random)
    const likes = target.likes
    const comments = target.comments - (topUp ? row.commentCount : 0)
    const others = shuffled(operators.filter((operator) => operator !== row.authorId), random)
    const likers = others.slice(0, Math.min(likes, Math.round(others.length * (post.reactions ? 1 : 0.8))))
    const after = (minutes: number) => new Date(row.publishedAt.getTime() + minutes * 60_000)

    await prisma.$transaction([
      prisma.postLike.createMany({
        data: likers.map((userId, index) => ({ postId: id, userId, createdAt: after(3 + index * 7) })),
        skipDuplicates: true,
      }),
      prisma.post.update({ where: { id }, data: { likeCount: likes } }),
    ])

    let written = 0
    for (const operatorUserId of shuffled(others, random)) {
      if (written >= comments) break
      const photo = post.photo ? decodePostPhoto(post.photo).description : null
      const result = await commentOnPostAsOperator(null, { operatorUserId, postId: id, photo })
      if (result.ok) written += 1
    }
    console.log(`${post.slot}: ${likes} likes (${likers.length} from accounts), ${written} comments`)
  }
  await prisma.$disconnect()
}

main()
