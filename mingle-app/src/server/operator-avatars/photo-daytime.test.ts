import { describe, expect, it } from 'vitest'
import { DAYTIME, phonePhotoRealism } from './photo-realism'

describe('outdoor post photos default to plain daytime', () => {
  const realism = (scene: string, seed: number) => {
    let state = seed
    const random = () => ((state = (state * 16807) % 2147483647) / 2147483647)
    return phonePhotoRealism(random, { pickTime: true, scene })
  }

  it('says daytime for a street or park photo that names no other time', () => {
    for (let seed = 1; seed < 40; seed += 1) {
      const text = realism('[self] the poster on a sidewalk in Seongsu-dong', seed)
      if (/Time and light, like this: [^\n]*(night|fog|mist|rain|drizzle|snow|cloudy|overcast|morning|lamps|neon)/i.test(text)) continue
      expect(text).toContain(DAYTIME)
    }
  })

  it('leaves evening, night and indoor photos alone', () => {
    expect(realism('[self] the poster on a street at sunset', 3)).not.toContain(DAYTIME)
    expect(realism('[self] the poster by the river at night', 3)).not.toContain(DAYTIME)
    expect(realism('[self] the poster at a café table', 3)).not.toContain(DAYTIME)
  })
})
