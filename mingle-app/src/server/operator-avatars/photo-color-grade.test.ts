import { describe, expect, it } from 'vitest'
import { COLOR_GRADES, NOT_WASHED_OUT, phonePhotoRealism } from './photo-realism'

describe('post photo color grade', () => {
  it('names one grade, keeps real blacks and drops the generic white-balance words', () => {
    const prompt = phonePhotoRealism(() => 0.5, { people: true, focusOnPerson: true, pickTime: true, scene: 'a café' })
    expect(prompt).toContain('Color and exposure in this photo:')
    expect(prompt).toContain(NOT_WASHED_OUT)
    expect(prompt).not.toContain('slightly too warm or too cool')
    expect(prompt).toContain('no gritty, crawling micro-texture anywhere.')
  })

  it('leaves avatars as they were', () => {
    const prompt = phonePhotoRealism(() => 0.5, { people: true, scene: 'a café' })
    expect(prompt).not.toContain('Color and exposure')
    expect(prompt).toContain('slightly too warm or too cool')
  })

  it('leans neutral and warm; the cool grade is the rarest', () => {
    const weights = COLOR_GRADES.map(([, weight]) => weight)
    expect(COLOR_GRADES.at(-1)?.[0]).toContain('cool')
    expect(Math.min(...weights)).toBe(COLOR_GRADES.at(-1)?.[1])
  })
})
