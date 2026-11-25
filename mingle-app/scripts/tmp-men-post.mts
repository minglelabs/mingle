import { readFileSync, writeFileSync } from 'node:fs'
import { prisma } from '@/lib/prisma'
import { requestAvatarImage } from '@/server/operator-avatars/generate'
import { buildPostImagePrompt, storeReservePostImage, withStaffReference } from '@/server/operator-post-reserve/post-image'
const [userId, description, refFile, outName, rename] = process.argv.slice(2)
if (rename) { const [name, handle] = rename.split('|'); await prisma.user.update({ where: { id: userId }, data: { name, handle } }) }
const account = await prisma.operatorAccount.findUnique({ where: { userId }, select: { avatarSpec: true } })
const subject = String((account?.avatarSpec as { prompt?: string })?.prompt ?? '').split('\n').find((line) => line.startsWith('Subject: '))?.slice(9).replace(/\.$/, '') ?? ''
const prompt = buildPostImagePrompt(description, 'Seoul, South Korea', Math.random, { look: subject, hasReference: false, gender: 'male' }, 'photo')
const request = await withStaffReference({ prompt, reference: null }, { bytes: readFileSync(refFile), mimeType: 'image/jpeg' })
writeFileSync(`${process.env.OUT}/${outName}.prompt.txt`, request.prompt)
const drawn = await requestAvatarImage(request.prompt, { reference: request.reference })
if (!drawn.ok) throw new Error(`draw failed ${drawn.error}`)
const stored = await storeReservePostImage(userId, drawn.bytes)
writeFileSync(`${process.env.OUT}/${outName}.jpg`, drawn.bytes)
writeFileSync(`${process.env.OUT}/${outName}.json`, JSON.stringify(stored))
console.log(JSON.stringify(stored))
await prisma.$disconnect()
