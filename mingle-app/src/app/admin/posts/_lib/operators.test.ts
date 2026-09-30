import { describe, expect, it } from 'vitest'
import type { OperatorPostPickerEntry } from '@/server/operator-posts/types'
import { filterOperators } from './operators'

function entry(overrides: Partial<OperatorPostPickerEntry>): OperatorPostPickerEntry {
  return { id: 'x', handle: 'x', name: null, image: null, language: null, isActive: true, restricted: false, ...overrides }
}

const OPERATORS = [
  entry({ id: 'retired', handle: 'old.lucas', name: 'Lucas Old', language: 'pt', isActive: false }),
  entry({ id: 'lucas', handle: 'lucas.silva', name: 'Lucas Silva', language: 'pt' }),
  entry({ id: 'yuki', handle: 'yuki.tnk', name: '田中 ゆき', language: 'ja' }),
  entry({ id: 'banned', handle: 'minjun_0412', name: '민준', language: 'ko', restricted: true }),
]

describe('filterOperators', () => {
  it('matches name, @handle, language code and the Korean language name', () => {
    expect(filterOperators(OPERATORS, 'silva').map((operator) => operator.id)).toEqual(['lucas'])
    expect(filterOperators(OPERATORS, '@yuki').map((operator) => operator.id)).toEqual(['yuki'])
    expect(filterOperators(OPERATORS, 'ゆき').map((operator) => operator.id)).toEqual(['yuki'])
    expect(filterOperators(OPERATORS, 'ja').map((operator) => operator.id)).toEqual(['yuki'])
    expect(filterOperators(OPERATORS, '포르투갈').map((operator) => operator.id)).toEqual(['lucas', 'retired'])
  })

  it('lists accounts that can post first, then retired or restricted ones', () => {
    expect(filterOperators(OPERATORS, '').map((operator) => operator.id)).toEqual(['lucas', 'yuki', 'retired', 'banned'])
    expect(filterOperators(OPERATORS, 'lucas').map((operator) => operator.id)).toEqual(['lucas', 'retired'])
  })
})
