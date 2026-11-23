import { describe, expect, it } from 'vitest'
import { learnerPlan, operatorInterestLanguageFields, posterProfile } from './poster-profile'
import { reserveLearnerPlan } from './generate'

describe('learner level', () => {
  const shares = (native: string) => {
    const counts = [0, 0, 0, 0, 0]
    const total = 20_000
    for (let index = 0; index < total; index += 1) counts[learnerPlan(`user-${index}`, native).level.dots - 1] += 1
    return counts.map((count) => count / total)
  }

  it('puts most foreign accounts at the lowest Korean level, Westerners most of all', () => {
    const western = shares('en')
    expect(western[0]).toBeGreaterThan(0.81)
    expect(western[3] + western[4]).toBeLessThan(0.02)
    const japanese = shares('ja')
    expect(japanese[0]).toBeGreaterThan(0.71)
    expect(japanese[0]).toBeLessThan(0.77)
    expect(japanese[3] + japanese[4]).toBeLessThan(0.035)
    const vietnamese = shares('vi')
    expect(vietnamese[0]).toBeGreaterThan(0.61)
    expect(vietnamese[0]).toBeLessThan(japanese[0])
  })

  it('keeps Korean accounts learning other languages at about 60 / 25 / 10 / 5', () => {
    const korean = shares('ko')
    expect(korean[0]).toBeGreaterThan(0.57)
    expect(korean[0]).toBeLessThan(0.63)
  })

  it('puts the same level on the profile as the posts use', () => {
    const plan = learnerPlan('user-7', 'ja')
    expect(operatorInterestLanguageFields('user-7', 'ja')).toEqual({ interestLanguages: ['ko'], interestLanguageLevels: [plan.level.dots] })
  })

  it('writes at the level stored on the profile when there is one', () => {
    expect(reserveLearnerPlan('user-7', 'ja', [{ language: 'ko', level: 4 }]).level.key).toBe('advanced')
    expect(reserveLearnerPlan('user-7', 'ja', [{ language: 'en', level: 4 }]).level).toEqual(learnerPlan('user-7', 'ja').level)
  })
})

describe('men\'s posting style', () => {
  it('is mostly short or earnest and rarely uses emoji, without changing topics', () => {
    let plain = 0
    let emoji = 0
    for (let index = 0; index < 2000; index += 1) {
      const male = posterProfile(`user-${index}`, ['food', 'travel'], 'male')
      if (['terse', 'earnest'].includes(male.length.key)) plain += 1
      if (!male.voice.some((line) => line.startsWith('never uses emoji'))) emoji += 1
      expect(male.topicFactors).toEqual(posterProfile(`user-${index}`, ['food', 'travel']).topicFactors)
    }
    expect(plain / 2000).toBeGreaterThan(0.7)
    expect(emoji / 2000).toBeLessThan(0.2)
  })
})
