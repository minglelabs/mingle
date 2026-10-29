/**
 * Prints operator profile-photo prompts exactly as production builds them,
 * for trying them by hand in ChatGPT. Personas are planned the way account
 * creation plans them: countries weighted by the default seed plan, then
 * city, age and gender from planPersonaSlots. The name and bio (written by a
 * language model in production) are left empty, and a gender the plan leaves
 * open is picked at random, as the model would.
 *
 *   pnpm tsx scripts/sample-avatar-prompts.ts [count] [--female|--male] [--striking]
 *
 * --striking keeps drawing until each prompt is a striking face photo.
 */
import { pickAvatarSpec } from '../src/server/operator-avatars/taxonomy'
import { planPersonaSlots } from '../src/server/operators/persona-draft'
import { DEFAULT_SEED_PLAN } from '../src/server/operators/seed-plan'

function weightedCountry(random: () => number): string {
  const entries = Object.entries(DEFAULT_SEED_PLAN)
  let roll = random() * entries.reduce((sum, [, weight]) => sum + weight, 0)
  return (entries.find(([, weight]) => (roll -= weight) < 0) ?? entries[0])[0]
}

async function main() {
  const args = process.argv.slice(2)
  const count = Number(args.find((arg) => /^\d+$/.test(arg)) ?? 3)
  const genderMix = args.includes('--female') ? 'female' : args.includes('--male') ? 'male' : 'any'
  const striking = args.includes('--striking')

  for (let printed = 0; printed < count;) {
    const [slot] = planPersonaSlots({ count: 1, countries: [weightedCountry(Math.random)], ageMin: 20, ageMax: 34, genderMix })
    const persona = {
      // With no gender asked for, the language model picks one in production; here a coin does.
      gender: slot.gender ?? (Math.random() < 0.5 ? 'female' : 'male'),
      name: null,
      age: new Date().getUTCFullYear() - slot.birthYear,
      country: slot.country.code,
      countryName: slot.country.nameEn,
      city: slot.city.name,
      bio: null,
    }
    const spec = pickAvatarSpec(persona)
    if (striking && !(spec.attributes.attractiveness === 'striking' && ['face', 'partial'].includes(spec.category))) continue
    printed += 1
    console.log(`=== ${persona.country} ${persona.city} · ${persona.gender ?? '?'} ${persona.age} · ${spec.labelKo} · ${spec.attributes.attractiveness ?? '-'}\n${spec.prompt}\n`)
  }
}

main()
