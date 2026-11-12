import { describe, expect, it } from 'vitest'
import { readPartialJsonStrings } from './partial-json-strings'

describe('readPartialJsonStrings', () => {
  it('reads finished and still-growing string fields', () => {
    const read = readPartialJsonStrings('{"translatedSource":"Hi.","ko":"안녕')
    expect(read.values).toEqual({ translatedSource: 'Hi.', ko: '안녕' })
    expect([...read.complete]).toEqual(['translatedSource'])
  })

  it('decodes escapes and waits for unfinished ones', () => {
    expect(readPartialJsonStrings('{"en":"say \\"hi\\"\\n').values.en).toBe('say "hi"\n')
    expect(readPartialJsonStrings('{"en":"a\\u00e9b"}').values.en).toBe('aéb')
    expect(readPartialJsonStrings('{"en":"a\\u00').values.en).toBe('a')
    expect(readPartialJsonStrings('{"en":"a\\').values.en).toBe('a')
  })

  it('skips non-string values and handles empty or partial keys', () => {
    expect(readPartialJsonStrings('{"mixed":false,"en":"x"}').values).toEqual({ en: 'x' })
    expect(readPartialJsonStrings('').values).toEqual({})
    expect(readPartialJsonStrings('{"tran').values).toEqual({})
    expect(readPartialJsonStrings('{"en":').values).toEqual({})
  })
})
