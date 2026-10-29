/**
 * Puts the demo feed's posts into the LOCAL database and makes them the
 * starter feed (what a new reader sees first, in plan order):
 *
 *   pnpm tsx scripts/demo-feed/publish-posts.ts prompts <dir>
 *     writes <dir>/<slot>.prompt.txt for each photo post not yet published,
 *     and <dir>/<slot>.ref.jpg when the photo shows the poster;
 *
 *   pnpm tsx scripts/demo-feed/publish-posts.ts redraw <dir> <slot...>
 *     writes the prompts again for published posts whose photo is redone;
 *
 *   pnpm tsx scripts/demo-feed/publish-posts.ts rephoto <dir> <slot...>
 *     replaces those posts' photos with <dir>/<slot>.(png|jpg|jpeg|webp);
 *
 *   pnpm tsx scripts/demo-feed/publish-posts.ts publish <dir>
 *     publishes every post not yet published whose photo (if it has one) is
 *     in <dir>/<slot>.(png|jpg|jpeg|webp), then saves the starter feed.
 *
 * Safe to run again: a slot is published once (its client post id is fixed).
 * Refuses any database that is not on this machine.
 */
import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '../../src/lib/prisma'
import { saveStarterFeed } from '../../src/server/feed/starter-feed'
import { buildPostImagePrompt, reservePostPerson, reservePostPlace, storeReservePostImage } from '../../src/server/operator-post-reserve/post-image'
import { decodePostPhoto } from '../../src/server/operator-post-reserve/post-photo'
import { publishPost } from '../../src/server/posts/publish-post'
import { DEMO_POSTS, type DemoPost } from './posts'

const postIdOf = (post: DemoPost) => post.existingPostId ?? `demo-feed-${post.slot.toLowerCase()}`

async function authorId(handle: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { handle }, select: { id: true, isOperator: true } })
  if (!user?.isOperator) throw new Error(`${handle}: not an operator account`)
  return user.id
}

async function main() {
  const host = new URL(process.env.DATABASE_URL ?? 'postgresql://unset').hostname
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error(`not a local database: ${host}`)
  const [mode, dir, ...slots] = process.argv.slice(2)
  if (!['prompts', 'publish', 'redraw', 'rephoto', 'retext'].includes(mode) || !dir) throw new Error('usage: prompts|publish <dir> | redraw|rephoto|retext <dir> <slot...>')
  const redo = new Set(slots.map((slot) => slot.toUpperCase()))
  fs.mkdirSync(dir, { recursive: true })

  const published = new Set((await prisma.post.findMany({ where: { id: { in: DEMO_POSTS.map(postIdOf) } }, select: { id: true } })).map((post) => post.id))
  for (const post of DEMO_POSTS) {
    if (post.existingPostId) {
      if (!published.has(post.existingPostId)) throw new Error(`${post.slot}: post ${post.existingPostId} not found`)
      continue
    }
    const isRedo = mode === 'redraw' || mode === 'rephoto' || mode === 'retext'
    if (isRedo && !redo.has(post.slot)) continue
    if (!isRedo && published.has(postIdOf(post))) continue
    const author = await authorId(post.handle)

    if (mode === 'retext') {
      if (!published.has(postIdOf(post))) throw new Error(`${post.slot}: post missing`)
      // A new body version: readers get the new text translated on demand.
      await prisma.post.update({ where: { id: postIdOf(post) }, data: { sourceText: post.text ?? null, bodyVersion: { increment: 1 } } })
      console.log(`${post.slot}: text replaced`)
      continue
    }

    if (mode === 'rephoto') {
      const file = ['png', 'jpg', 'jpeg', 'webp'].map((ext) => path.join(dir, `${post.slot}.${ext}`)).find((candidate) => fs.existsSync(candidate))
      if (!file || !published.has(postIdOf(post))) throw new Error(`${post.slot}: photo or post missing`)
      const image = await storeReservePostImage(author, fs.readFileSync(file))
      await prisma.post.update({ where: { id: postIdOf(post) }, data: { imageObjectKey: image.objectKey, imageWidth: image.width, imageHeight: image.height } })
      console.log(`${post.slot}: photo replaced`)
      continue
    }

    if (mode === 'prompts' || mode === 'redraw') {
      if (!post.photo) continue
      const withPerson = decodePostPhoto(post.photo).kind === 'scene' ? null : await reservePostPerson(author)
      const place = post.place ?? await reservePostPlace(author)
      fs.writeFileSync(path.join(dir, `${post.slot}.prompt.txt`), buildPostImagePrompt(post.photo, place, Math.random, withPerson?.person ?? null))
      if (withPerson?.reference) fs.writeFileSync(path.join(dir, `${post.slot}.ref.jpg`), withPerson.reference.bytes)
      console.log(`${post.slot}: prompt${withPerson?.reference ? ' + reference' : ''}`)
      continue
    }

    let image: Awaited<ReturnType<typeof storeReservePostImage>> | null = null
    if (post.photo) {
      const file = ['png', 'jpg', 'jpeg', 'webp'].map((ext) => path.join(dir, `${post.slot}.${ext}`)).find((candidate) => fs.existsSync(candidate))
      if (!file) {
        console.log(`${post.slot}: waiting for its photo`)
        continue
      }
      image = await storeReservePostImage(author, fs.readFileSync(file))
    }
    const result = await publishPost({
      authorId: author,
      text: post.text ?? null,
      imageObjectKey: image?.objectKey ?? null,
      imageDimensions: image ? { imageWidth: image.width, imageHeight: image.height } : null,
      clientHint: post.language,
      clientPostId: postIdOf(post),
    })
    if (result.kind === 'conflict') throw new Error(`${post.slot}: client post id taken`)
    published.add(result.post.id)
    console.log(`${post.slot}: published ${result.post.id}`)
  }

  if (mode === 'publish') {
    const ids = (set: string) => DEMO_POSTS.filter((post) => post.slot.startsWith(set)).map(postIdOf).filter((id) => published.has(id))
    await saveStarterFeed({ ko: ids('A'), foreign: ids('B') })
    console.log(`starter feed: ${ids('A').length} for Korean readers, ${ids('B').length} for the others`)
  }
  await prisma.$disconnect()
}

main()
