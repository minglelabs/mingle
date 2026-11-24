import { describe, expect, it } from 'vitest'
import { parseClassification, parseReferenceAttributes, referenceAutoTagEnabled } from './classify'
import { referenceRecreateLines } from './library'

describe('reference photo classification', () => {
  it('reads the JSON answer and drops gender for things', () => {
    expect(parseClassification('{"kind":"person","gender":"female","summary":"woman from behind at a beach"}')).toEqual({ kind: 'person', gender: 'female', summary: 'woman from behind at a beach', attributes: null })
    expect(parseClassification('Here: {"kind":"thing","gender":"male","summary":"ramen"}')).toEqual({ kind: 'thing', gender: null, summary: 'ramen', attributes: null })
    expect(parseClassification('{"kind":"dog"}')).toBeNull()
    expect(parseClassification('no json')).toBeNull()
  })

  it('writes the prompt for each kind', () => {
    expect(referenceRecreateLines({ kind: 'thing', look: null }).join('\n')).toMatch(/same photo taken again/)
    expect(referenceRecreateLines({ kind: 'person', look: 'a woman in her 20s' }).join('\n')).toMatch(/Never show a face/)
    const paired = referenceRecreateLines({ kind: 'face', look: 'x', poster: true }).join('\n')
    expect(paired).toMatch(/LEFT[\s\S]*RIGHT/)
    expect(paired).toMatch(/Give the person in the LEFT photo the poster's face/)
    expect(paired).toMatch(/Keep everything else exactly as in the LEFT photo/)
  })
})

describe('reference note', () => {
  it('puts staff note into the prompt', () => {
    expect(referenceRecreateLines({ kind: 'thing', look: null, note: '라멘 말고 우동으로' }).join('\n')).toMatch(/Staff note about the reference photo, to follow: 라멘 말고 우동으로/)
  })
})

describe('automatic tagging window', () => {
  it('runs through 2026-12-12 KST only', () => {
    expect(referenceAutoTagEnabled(new Date('2026-12-12T23:59:59+09:00'))).toBe(true)
    expect(referenceAutoTagEnabled(new Date('2026-12-13T00:00:00+09:00'))).toBe(false)
  })
})

describe('group photos', () => {
  it('reads a group answer without a gender and writes the group prompt', () => {
    expect(parseClassification('{"kind":"group","gender":"female","summary":"three friends at a bar"}')).toEqual({ kind: 'group', gender: null, summary: 'three friends at a bar', attributes: null })
    const lines = referenceRecreateLines({ kind: 'group', look: 'a man in his 20s', poster: true }).join('\n')
    expect(lines).toMatch(/change only the faces/)
    expect(lines).toMatch(/poster's face from the RIGHT photo/)
  })
})

describe('reference attributes', () => {
  it('keeps known axes with allowed values only, people included', () => {
    expect(parseReferenceAttributes({
      style: 'photo', layout: 'photo_booth', panels: 4, peopleCount: 2, appearances: 8, weather: 'tornado', angle: 'low',
      people: [{ gender: 'female', age: 'early_20s', ancestry: 'east_asian', attractiveness: 'striking', faceVisible: true, hair: 'long black hair', height: 'tall' }],
      bogus: 1,
    })).toEqual({
      style: 'photo', layout: 'photo_booth', panels: 4, peopleCount: 2, appearances: 8, angle: 'low',
      people: [{ gender: 'female', age: 'early_20s', ancestry: 'east_asian', attractiveness: 'striking', faceVisible: true, hair: 'long black hair' }],
    })
    expect(parseReferenceAttributes(null)).toBeNull()
    expect(parseReferenceAttributes({ weather: 'tornado' })).toBeNull()
  })
})
