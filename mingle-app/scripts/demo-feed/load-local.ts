/**
 * Puts the demo-feed accounts into the LOCAL database: creates each new
 * account once (as staff would), records its nationality and photo spec, and
 * sets its profile photo from `<dir>/<handle>.(png|jpg|jpeg|webp)` when the
 * account has none yet. Safe to run again as more photos arrive.
 *
 *   pnpm tsx scripts/demo-feed/load-local.ts <photo dir> [--replace=handle,...]
 *
 * The photo spec is saved with the photo, so an account keeps the spec its
 * photo was drawn from even after the taxonomy changes. `--replace` swaps the
 * photo of accounts that already have one (a redrawn photo).
 *
 * Refuses any database that is not on this machine.
 */
import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '../../src/lib/prisma'
import type { AdminContext } from '../../src/server/admin/guard'
import { createOperatorAccount } from '../../src/server/operators/create-operator'
import { whenOperatorBioQueueIdle } from '../../src/server/operators/bio-queue'
import { findPersonaCity, findPersonaCountry } from '../../src/server/operators/persona-countries'
import { setOperatorAvatarFromBytes } from '../../src/server/operators/operator-avatar'
import { DEMO_ACCOUNTS } from './accounts'
import { demoAvatarSpec } from './spec'

const CTX: AdminContext = { sessionId: null, ip: null, userAgent: 'demo-feed-load' }

async function main() {
  const host = new URL(process.env.DATABASE_URL ?? 'postgresql://unset').hostname
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error(`not a local database: ${host}`)
  const dir = process.argv[2]
  const replace = new Set((process.argv.find((arg) => arg.startsWith('--replace='))?.slice(10) ?? '').split(',').filter(Boolean))
  const year = new Date().getUTCFullYear()

  for (const account of DEMO_ACCOUNTS.filter((candidate) => !candidate.existing)) {
    let user = await prisma.user.findUnique({ where: { handle: account.handle }, select: { id: true, image: true } })
    if (!user) {
      const country = findPersonaCountry(account.residence.country)!
      const city = findPersonaCity(country, account.residence.city)!
      // The persona rules tie the city to the persona country, so the account is created where it lives.
      const created = await createOperatorAccount(CTX, {
        name: account.name, handle: account.handle, personaCountry: country.code, city: city.name, countryName: country.nameEn,
        latitude: city.latitude, longitude: city.longitude, birthYear: year - account.age, bio: account.bio,
        primaryLanguage: account.primaryLanguage, gender: account.gender,
      }, { notes: `demo feed: ${account.posts.join(', ')}` })
      user = { id: created.userId, image: null }
      console.log("created", account.handle, created.userId)
    }
    // The persona country is staff-only and steers the look: the nationality, not the residence.
    await prisma.operatorAccount.update({ where: { userId: user.id }, data: { personaCountry: account.nationality, personaGender: account.gender } })

    const photo = dir && ['png', 'jpg', 'jpeg', 'webp'].map((ext) => path.join(dir, `${account.handle}.${ext}`)).find((file) => fs.existsSync(file))
    if (photo && (!user.image || replace.has(account.handle))) {
      const spec = demoAvatarSpec(account)
      const stored = await setOperatorAvatarFromBytes(CTX, user.id, fs.readFileSync(photo), { generated: true, category: spec.category, subtype: spec.subtype, model: 'chatgpt-web' })
      if (!stored.ok) throw new Error(`${account.handle}: ${stored.error}`)
      await prisma.operatorAccount.update({ where: { userId: user.id }, data: { avatarSpec: spec, avatarGeneratedAt: new Date() } })
      console.log('photo', account.handle)
    }
  }
  await whenOperatorBioQueueIdle()
  await prisma.$disconnect()
}

main()
