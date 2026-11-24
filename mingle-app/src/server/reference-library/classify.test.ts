import { describe, expect, it } from 'vitest'
import { parseClassification } from './classify'
import { referenceRecreateLines } from './library'

describe('reference photo classification', () => {
  it('reads the JSON answer and drops gender for things', () => {
    expect(parseClassification('{"kind":"person","gender":"female","summary":"woman from behind at a beach"}')).toEqual({ kind: 'person', gender: 'female', summary: 'woman from behind at a beach' })
    expect(parseClassification('Here: {"kind":"thing","gender":"male","summary":"ramen"}')).toEqual({ kind: 'thing', gender: null, summary: 'ramen' })
    expect(parseClassification('{"kind":"dog"}')).toBeNull()
    expect(parseClassification('no json')).toBeNull()
  })

  it('writes the prompt for each kind', () => {
    expect(referenceRecreateLines({ kind: 'thing', look: null, fit: 'late-night ramen' }).join('\n')).toMatch(/same kind of thing[\s\S]*late-night ramen/)
    expect(referenceRecreateLines({ kind: 'person', look: 'a woman in her 20s' }).join('\n')).toMatch(/Never show a face/)
    const paired = referenceRecreateLines({ kind: 'face', look: 'x', poster: true }).join('\n')
    expect(paired).toMatch(/LEFT[\s\S]*RIGHT/)
    expect(paired).toMatch(/must NOT be the face of the person in the LEFT photo/)
  })
})

describe('reference note', () => {
  it('puts staff note into the prompt', () => {
    expect(referenceRecreateLines({ kind: 'thing', look: null, note: '라멘 말고 우동으로' }).join('\n')).toMatch(/Staff note about the reference photo, to follow: 라멘 말고 우동으로/)
  })
})
