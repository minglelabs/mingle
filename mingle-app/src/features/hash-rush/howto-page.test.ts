import { existsSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import HashRushHowToPage from './HashRushHowToPage'

describe('Hash Rush how to play', () => {
  it('shows the game shots between the lines, in Korean for Korean and English otherwise', () => {
    const ko = renderToStaticMarkup(createElement(HashRushHowToPage, { uiLocale: 'ko' }))
    expect(ko.split('data-qa="hash-rush-howto-shot"').length - 1).toBe(3)
    expect(ko).toContain('/hash-rush/howto/ko-start.jpg')
    const de = renderToStaticMarkup(createElement(HashRushHowToPage, { uiLocale: 'de' }))
    expect(de).toContain('/hash-rush/howto/en-seed.jpg')
  })

  it('has every shot it points at', () => {
    for (const lang of ['ko', 'en']) {
      for (const file of ['start', 'seed', 'maps']) {
        expect(existsSync(new URL(`../../../public/hash-rush/howto/${lang}-${file}.jpg`, import.meta.url)), `${lang}-${file}`).toBe(true)
      }
    }
  })
})
