import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./hash-rush-cards.module.css', import.meta.url), 'utf8')

describe('Hash Rush lobby: Start is always in view', () => {
  it('sticks to the bottom of the scrolling lobby card', () => {
    const rule = css.slice(css.indexOf('.startButton {'), css.indexOf('}', css.indexOf('.startButton {')))
    expect(rule).toContain('position: sticky;')
    expect(rule).toContain('bottom: 4px;')
  })
})
