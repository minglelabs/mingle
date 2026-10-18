/**
 * Photos for published operator posts that went out without one because the
 * image model could not draw it, drawn by hand (in the ChatGPT web app):
 *
 *   pnpm tsx scripts/post-photo-by-hand.ts prompts <dir> [limit]
 *     writes <dir>/<reserveId>.prompt.txt for each such post, oldest first,
 *     with the same prompt the worker would have sent;
 *
 *   pnpm tsx scripts/post-photo-by-hand.ts store <dir>
 *     attaches every <dir>/<reserveId>.(png|jpg|jpeg|webp) to its post if the
 *     post still has no photo.
 *
 * Refuses any database that is not on this machine.
 */
import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '../src/lib/prisma'
import { buildPostImagePrompt, reservePostPlace, storeReservePostImage } from '../src/server/operator-post-reserve/post-image'

async function main() {
  const host = new URL(process.env.DATABASE_URL ?? 'postgresql://unset').hostname
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error(`not a local database: ${host}`)
  const [mode, dir, limit] = process.argv.slice(2)
  if (!['prompts', 'store'].includes(mode) || !dir) throw new Error('usage: prompts <dir> [limit] | store <dir>')
  fs.mkdirSync(dir, { recursive: true })

  const rows = await prisma.operatorPostReserve.findMany({
    where: { state: 'published', imagePrompt: { not: null }, postId: { not: null } },
    orderBy: { updatedAt: 'asc' },
    select: { id: true, operatorUserId: true, imagePrompt: true, postId: true },
  })
  const posts = await prisma.post.findMany({ where: { id: { in: rows.map((row) => row.postId!) }, imageObjectKey: null }, select: { id: true } })
  const missing = new Set(posts.map((post) => post.id))
  const pending = rows.filter((row) => missing.has(row.postId!))

  if (mode === 'prompts') {
    for (const row of pending.slice(0, limit ? Number(limit) : undefined)) {
      fs.writeFileSync(path.join(dir, `${row.id}.prompt.txt`), buildPostImagePrompt(row.imagePrompt!, await reservePostPlace(row.operatorUserId)))
    }
    console.log(`${pending.length} posts without their photo; wrote ${Math.min(pending.length, limit ? Number(limit) : pending.length)} prompts`)
  } else {
    for (const row of pending) {
      const photo = ['png', 'jpg', 'jpeg', 'webp'].map((ext) => path.join(dir, `${row.id}.${ext}`)).find((file) => fs.existsSync(file))
      if (!photo) continue
      const image = await storeReservePostImage(row.operatorUserId, fs.readFileSync(photo))
      await prisma.post.update({ where: { id: row.postId! }, data: { imageObjectKey: image.objectKey, imageWidth: image.width, imageHeight: image.height } })
      console.log(`${row.id}: attached to ${row.postId}`)
    }
  }
  await prisma.$disconnect()
}

main()
