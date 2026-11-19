import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./hash-rush-cards.module.css', import.meta.url), 'utf8')

describe('Hash Rush lobby: Start is always in view', () => {
  it('sticks to the bottom of the scrolling lobby card, with why a start was turned down', () => {
    const rule = css.slice(css.indexOf('.startDock {'), css.indexOf('}', css.indexOf('.startDock {')))
    expect(rule).toContain('position: sticky;')
    expect(rule).toContain('bottom: 4px;')
  })

  it('ends above the game\'s 💬 button and below the top pills', () => {
    const below = css.slice(css.indexOf('.coverChatBelow {'), css.indexOf('}', css.indexOf('.coverChatBelow {')))
    expect(below).toContain('+ 54px')
    const cover = css.slice(css.indexOf('.cover {'), css.indexOf('}', css.indexOf('.cover {')))
    expect(cover).toContain('padding: 46px')
  })
})
