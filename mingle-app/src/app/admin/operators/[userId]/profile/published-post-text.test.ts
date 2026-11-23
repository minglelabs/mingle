import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { orderStaffLanguages, PublishedPostText } from './published-post-text'

describe('published post text on the profile', () => {
  it('puts Korean first', () => {
    expect(orderStaffLanguages(['en', 'zh-TW', 'ko'])).toEqual(['ko', 'en', 'zh-TW'])
  })

  it('shows the original with a chip per stored translation', () => {
    const html = renderToString(createElement(PublishedPostText, { text: 'ソウルで', sourceLanguage: 'ja', translations: [{ language: 'en', text: 'In Seoul' }, { language: 'ko', text: '서울에서' }] }))
    expect(html).toContain('ソウルで')
    expect(html).toContain('data-post-language-chips')
    expect(html).not.toContain('저장된 번역이 없어요')
  })
})
