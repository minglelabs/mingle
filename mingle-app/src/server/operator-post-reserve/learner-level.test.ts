import { describe, expect, it } from 'vitest'
import { learnerPlan, operatorInterestLanguageFields, posterProfile } from './poster-profile'
import { reserveLearnerPlan } from './generate'

describe('learner level', () => {
  it('is mostly level 1: about 60 / 25 / 10 / 5 across accounts', () => {
    const counts = [0, 0, 0, 0, 0]
    const total = 20_000
    for (let index = 0; index < total; index += 1) counts[learnerPlan(`user-${index}`, 'ja').level.dots - 1] += 1
    const share = counts.map((count) => count / total)
    expect(share[0]).toBeGreaterThan(0.57)
    expect(share[0]).toBeLessThan(0.63)
    expect(share[1]).toBeGreaterThan(0.22)
    expect(share[1]).toBeLessThan(0.28)
    expect(share[2]).toBeGreaterThan(0.08)
    expect(share[2]).toBeLessThan(0.12)
    expect(share[3] + share[4]).toBeGreaterThan(0.035)
    expect(share[3] + share[4]).toBeLessThan(0.065)
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
