import { describe, expect, it, vi } from 'vitest'

const translateTexts = vi.fn()
vi.mock('./translate-texts', () => ({ translateTexts: (input: unknown) => translateTexts(input) }))

import { translatePostBodySettled } from './post-translation-service'

const SOURCE = '『アンナチュラル』を何度見返しても、中堂さんの台詞で毎回手が止まる始末…'

describe('operator translation that Haiku hands back unchanged', () => {
  it('is translated by the app\'s own model instead of failing', async () => {
    translateTexts.mockImplementation(async (input: { provider?: string }) => ({
      translations: { ko: input.provider === 'operator' ? SOURCE : '『언내추럴』을 몇 번이고 다시 봐도 매번 손이 멈춘다…' },
    }))
    const rows = await translatePostBodySettled({ sourceText: SOURCE, sourceLanguage: 'ja', targetLanguages: ['ko'], provider: 'operator' })
    expect(rows).toEqual([{ language: 'ko', status: 'ready', text: '『언내추럴』을 몇 번이고 다시 봐도 매번 손이 멈춘다…' }])
    expect(translateTexts).toHaveBeenCalledTimes(2)
    expect(translateTexts.mock.calls[1][0]).toMatchObject({ provider: undefined, modelSelection: undefined })
  })

  it('keeps Haiku\'s answer when it translated', async () => {
    translateTexts.mockReset()
    translateTexts.mockResolvedValue({ translations: { ko: '번역됨' } })
    const rows = await translatePostBodySettled({ sourceText: SOURCE, sourceLanguage: 'ja', targetLanguages: ['ko'], provider: 'operator' })
    expect(rows[0]).toMatchObject({ status: 'ready', text: '번역됨' })
    expect(translateTexts).toHaveBeenCalledTimes(1)
  })
})
