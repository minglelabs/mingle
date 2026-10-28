/**
 * Profile photos for existing operator accounts drawn by hand (in the ChatGPT
 * web app) instead of through the image API, in two steps:
 *
 *   pnpm tsx scripts/operator-avatar-by-hand.ts prompts <dir> <handle...>
 *     picks a spec per account from its persona, exactly as the generator
 *     does, and writes <dir>/<handle>.prompt.txt and <dir>/<handle>.spec.json;
 *
 *   pnpm tsx scripts/operator-avatar-by-hand.ts store <dir> <handle...>
 *     stores <dir>/<handle>.(png|jpg|jpeg|webp) as the account's photo, with
 *     the spec it was drawn from.
 *
 * Every run of `prompts` draws a new spec. Refuses any database that is not
 * on this machine.
 */
import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '../src/lib/prisma'
import type { AdminContext } from '../src/server/admin/guard'
import { loadAvatarPersona } from '../src/server/operator-avatars/generate'
import { pickAvatarSpec, seededRandom } from '../src/server/operator-avatars/taxonomy'
import { setOperatorAvatarFromBytes } from '../src/server/operators/operator-avatar'

const CTX: AdminContext = { sessionId: null, ip: null, userAgent: 'operator-avatar-by-hand' }

async function main() {
  const host = new URL(process.env.DATABASE_URL ?? 'postgresql://unset').hostname
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error(`not a local database: ${host}`)
  const [mode, dir, ...handles] = process.argv.slice(2)
  if (!['prompts', 'store'].includes(mode) || !dir || !handles.length) throw new Error('usage: prompts|store <dir> <handle...>')
  fs.mkdirSync(dir, { recursive: true })

  for (const handle of handles) {
    const user = await prisma.user.findUnique({ where: { handle }, select: { id: true, isOperator: true } })
    if (!user?.isOperator) throw new Error(`${handle}: not an operator account`)
    const specFile = path.join(dir, `${handle}.spec.json`)

    if (mode === 'prompts') {
      const persona = await loadAvatarPersona(user.id)
      if (!persona) throw new Error(`${handle}: no persona`)
      const spec = pickAvatarSpec(persona, seededRandom(`${user.id}:${Date.now()}`))
      fs.writeFileSync(path.join(dir, `${handle}.prompt.txt`), spec.prompt)
      fs.writeFileSync(specFile, JSON.stringify(spec))
      console.log(`${handle}: ${spec.labelKo} · ${spec.attributes.attractiveness ?? '-'}`)
      continue
    }

    const photo = ['png', 'jpg', 'jpeg', 'webp'].map((ext) => path.join(dir, `${handle}.${ext}`)).find((file) => fs.existsSync(file))
    if (!photo || !fs.existsSync(specFile)) throw new Error(`${handle}: photo or spec missing`)
    const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'))
    const stored = await setOperatorAvatarFromBytes(CTX, user.id, fs.readFileSync(photo), { generated: true, category: spec.category, subtype: spec.subtype, model: 'chatgpt-web' })
    if (!stored.ok) throw new Error(`${handle}: ${stored.error}`)
    await prisma.operatorAccount.update({ where: { userId: user.id }, data: { avatarSpec: spec, avatarGeneratedAt: new Date() } })
    console.log(`${handle}: stored`)
  }
  await prisma.$disconnect()
}

main()
