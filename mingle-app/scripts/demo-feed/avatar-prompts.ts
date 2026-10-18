/**
 * Prints the profile-photo prompt of every new demo-feed account, built by
 * the production taxonomy from the account's persona. The draw is seeded by
 * the handle, so the same prompt comes back every run; `--reroll=<handle>`
 * moves that one account to its next draw.
 *
 *   pnpm tsx scripts/demo-feed/avatar-prompts.ts [--reroll=handle,...]
 */
import { pickAvatarSpec, seededRandom } from '../../src/server/operator-avatars/taxonomy'
import { findPersonaCountry } from '../../src/server/operators/persona-countries'
import { validatePersonaDraft } from '../../src/server/operators/persona-rules'
import { DEMO_ACCOUNTS } from './accounts'

const rerolled = new Set((process.argv.find((arg) => arg.startsWith('--reroll='))?.slice(9) ?? '').split(',').filter(Boolean))
const year = new Date().getUTCFullYear()

for (const account of DEMO_ACCOUNTS.filter((candidate) => !candidate.existing)) {
  const residence = findPersonaCountry(account.residence.country)
  // The persona rules tie a city to its own country, so the draft is checked where the account lives.
  const draft = validatePersonaDraft({
    name: account.name, handle: account.handle, personaCountry: account.residence.country, city: account.residence.city,
    birthYear: year - account.age, bio: account.bio, primaryLanguage: account.primaryLanguage, gender: account.gender,
  })
  if (!draft.ok) throw new Error(`${account.handle}: ${JSON.stringify(draft.errors)}`)

  const persona = {
    gender: account.gender, name: account.name, age: account.age, bio: account.bio,
    country: account.nationality, countryName: residence?.nameEn ?? null, city: account.residence.city,
  }
  let skip = rerolled.has(account.handle) ? 1 : 0
  for (let draw = 0; ; draw += 1) {
    const spec = pickAvatarSpec(persona, seededRandom(`demo-feed:${account.handle}:${draw}`))
    if (account.needsFace && spec.category !== 'face') continue
    if (account.mustMention && !spec.prompt.includes(account.mustMention)) continue
    if (skip-- > 0) continue
    console.log(`=== ${account.name} (@${account.handle}) · ${account.nationality} ${account.gender} ${account.age} · ${account.residence.city} · ${spec.labelKo} · ${spec.attributes.attractiveness ?? '-'}\n${spec.prompt}\n`)
    break
  }
}
