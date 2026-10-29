/**
 * Photos staff asked for in the review tool, drawn by hand in ChatGPT through
 * the staff Chrome profiles (never a paid image API):
 *
 *   railway run -- npx tsx scripts/draw-pending-photos.mts list <dir>
 *     writes, for every profile whose 재제작 waits for a photo,
 *     <dir>/avatar-<userId>.prompt.txt, and for every latent post waiting for
 *     its photo, <dir>/post-<reserveId>.prompt.txt plus, for a photo of the
 *     poster, <dir>/post-<reserveId>.ref.jpg to attach with it;
 *
 *   railway run -- npx tsx scripts/draw-pending-photos.mts store <dir>
 *     stores every drawn <dir>/<same name>.(png|jpg|jpeg|webp): the profile
 *     photo goes up and the account is back in review; the post photo goes on
 *     the latent post, still in review.
 */
import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '../src/lib/prisma'
import { buildPostImagePrompt, reservePostPerson, reservePostPlace, storeReservePostImage } from '../src/server/operator-post-reserve/post-image'
import { decodePostPhoto } from '../src/server/operator-post-reserve/post-photo'
import { setOperatorAvatarFromBytes } from '../src/server/operators/operator-avatar'

function drawnFile(dir: string, name: string): string | null {
  return ['png', 'jpg', 'jpeg', 'webp'].map((ext) => path.join(dir, `${name}.${ext}`)).find((file) => fs.existsSync(file)) ?? null
}

async function main() {
  const [mode, dir] = process.argv.slice(2)
  if (!['list', 'store'].includes(mode) || !dir) throw new Error('usage: list <dir> | store <dir>')
  fs.mkdirSync(dir, { recursive: true })

  const accounts = await prisma.operatorAccount.findMany({
    where: { reviewState: 'drawing', user: { isOperator: true, isDeleted: false } },
    orderBy: [{ reviewRank: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'asc' }],
    select: { userId: true, avatarSpec: true, user: { select: { handle: true } } },
  })
  const posts = await prisma.operatorPostReserve.findMany({
    where: { state: 'review', imagePrompt: { not: null }, imageObjectKey: null, operatorUser: { isDeleted: false } },
    orderBy: [{ reviewRank: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    select: { id: true, operatorUserId: true, imagePrompt: true, operatorUser: { select: { handle: true } } },
  })

  if (mode === 'list') {
    for (const account of accounts) {
      const prompt = (account.avatarSpec as { prompt?: unknown } | null)?.prompt
      if (typeof prompt !== 'string') continue
      fs.writeFileSync(path.join(dir, `avatar-${account.userId}.prompt.txt`), prompt)
      console.log(`avatar-${account.userId} @${account.user.handle}`)
    }
    for (const post of posts) {
      const withPerson = decodePostPhoto(post.imagePrompt!).kind === 'scene' ? null : await reservePostPerson(post.operatorUserId)
      const prompt = buildPostImagePrompt(post.imagePrompt!, await reservePostPlace(post.operatorUserId), Math.random, withPerson?.person ?? null)
      fs.writeFileSync(path.join(dir, `post-${post.id}.prompt.txt`), prompt)
      if (withPerson?.reference) fs.writeFileSync(path.join(dir, `post-${post.id}.ref.jpg`), withPerson.reference.bytes)
      console.log(`post-${post.id} @${post.operatorUser.handle}${withPerson?.reference ? ' (+ref)' : ''}`)
    }
    console.log(`${accounts.length} profile photos, ${posts.length} post photos to draw`)
  } else {
    for (const account of accounts) {
      const file = drawnFile(dir, `avatar-${account.userId}`)
      if (!file) continue
      const spec = account.avatarSpec as { category?: string; subtype?: string } | null
      const stored = await setOperatorAvatarFromBytes(null, account.userId, fs.readFileSync(file), { generated: true, category: spec?.category ?? null, subtype: spec?.subtype ?? null, model: 'chatgpt-web' })
      if (!stored.ok) { console.log(`avatar-${account.userId}: ${stored.error}`); continue }
      await prisma.operatorAccount.updateMany({ where: { userId: account.userId, reviewState: 'drawing' }, data: { reviewState: 'pending', avatarGeneratedAt: new Date() } })
      console.log(`avatar-${account.userId} @${account.user.handle}: stored`)
    }
    for (const post of posts) {
      const file = drawnFile(dir, `post-${post.id}`)
      if (!file) continue
      const image = await storeReservePostImage(post.operatorUserId, fs.readFileSync(file))
      await prisma.operatorPostReserve.updateMany({
        where: { id: post.id, imageObjectKey: null },
        data: { imageObjectKey: image.objectKey, imageWidth: image.width, imageHeight: image.height, error: null },
      })
      console.log(`post-${post.id} @${post.operatorUser.handle}: stored`)
    }
  }
  await prisma.$disconnect()
}

void main()
