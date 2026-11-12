import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { getCoinCopy } from '@/i18n/coin-copy'
import CoinPriceListSection from './coin-price-list-section'

const priceList = { voicePerMinute: 8.000001, readAloudPerAudioMinute: 13.636, readAloudPerConversationMinute: 5.0000014, typedMessage: 0.3 }

describe('CoinPriceListSection', () => {
  it('lists every paid feature with its price and unit, then what is free, in Korean', () => {
    const html = renderToStaticMarkup(createElement(CoinPriceListSection, { copy: getCoinCopy('ko'), priceList, locale: 'ko' }))
    for (const text of [
      '해씨는 이렇게 쓰여요',
      '음성 인식', '1분',
      '번역 읽어 주기', '대화 1분', '음성 1분에 14해씨',
      '입력한 메시지 번역', '0.3', '1개',
      '사진 번역', '글자 양에 따라 달라요',
      '무료', '보이스톡 통화', '메시지·사진 보내기', '번역이 필요 없는 메시지', '번역된 내용 보기',
      '말하거나 보낸 사람이 내고, 읽어 주기는 듣는 사람이 내요.',
    ]) expect(html).toContain(text)
    expect(html).toMatch(/>8</)
    expect(html).toMatch(/~.*>5</)
  })

  it('has the copy in every store language', () => {
    for (const locale of ['en', 'ja', 'zh-CN', 'zh-TW', 'fr', 'de', 'es', 'pt', 'it', 'ru', 'ar', 'hi', 'th', 'vi'] as const) {
      const copy = getCoinCopy(locale)
      expect(copy.priceTitle).toBeTruthy()
      expect(copy.priceReadAloudNote).toContain('{coins}')
      expect(copy.freeCall).toBeTruthy()
      expect(copy.priceTitle).not.toBe(getCoinCopy('ko').priceTitle)
    }
  })
})
