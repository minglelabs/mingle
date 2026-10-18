import { pickAvatarSpec, seededRandom, type AvatarSpec } from '../../src/server/operator-avatars/taxonomy'
import { findPersonaCountry } from '../../src/server/operators/persona-countries'
import type { DemoAccount } from './accounts'

/**
 * The profile-photo spec of a demo account, built by the production taxonomy.
 * The draw is seeded by the handle, so the same spec comes back every run;
 * `skip` moves to a later draw that still meets the account's constraints.
 */
export function demoAvatarSpec(account: DemoAccount, extraSkip = 0): AvatarSpec {
  let skip = (account.redraws ?? 0) + extraSkip
  const persona = {
    gender: account.gender, name: account.name, age: account.age, bio: account.bio,
    // The nationality decides the look; the place is where the account lives.
    country: account.nationality, countryName: findPersonaCountry(account.residence.country)?.nameEn ?? null, city: account.residence.city,
  }
  for (let draw = 0; ; draw += 1) {
    const spec = pickAvatarSpec(persona, seededRandom(`demo-feed:${account.handle}:${draw}`))
    if (account.needsFace && spec.category !== 'face') continue
    if (account.mustMention && !spec.prompt.includes(account.mustMention)) continue
    if (skip-- > 0) continue
    return spec
  }
}
