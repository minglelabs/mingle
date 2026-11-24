import { describe, expect, it } from 'vitest'
import { languageOfPost } from './generate'

describe('the language a generated post is stored under', () => {
  it('is the person\'s own when a learner slot came back in their own language', () => {
    expect(languageOfPost('横浜のゴミ出し事情、豆知識。収集日の朝8時までに集積所へ', 'ko', 'ja')).toBe('ja')
    expect(languageOfPost('Hoy fui al mercado con mi hermana', 'ko', 'es')).toBe('es')
  })

  it('stays the slot\'s language when the post is in it, also with a line in their own language under it', () => {
    expect(languageOfPost('오늘 시장에 갔어요! 今日は市場に行きました', 'ko', 'ja')).toBe('ko')
    expect(languageOfPost('今日は市場に行きました', 'ja', 'ko')).toBe('ja')
    expect(languageOfPost('I went to the market today', 'en', 'ja')).toBe('en')
    expect(languageOfPost('anything', 'ja', 'ja')).toBe('ja')
  })
})
