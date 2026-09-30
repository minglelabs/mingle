import { describe, expect, it } from 'vitest'
import { overlayBlocksFor } from '@/lib/conversation-image-text'
import {
  PHOTO_TRANSLATION_MIN_FONT_PX,
  PHOTO_TRANSLATION_NEAR_BLACK,
  PHOTO_TRANSLATION_PLATE_ALPHA,
  PHOTO_TRANSLATION_SCRIM,
  PHOTO_TRANSLATION_WHITE,
  blockPaintRect,
  chooseTextColor,
  containFit,
  contrastRatio,
  cssColor,
  estimateTextWidthEm,
  fitFontSize,
  harmonizeFontSizes,
  isVerticalWritingLanguage,
  layoutPhotoTranslationBlocks,
  medianColor,
  parseHexColor,
  recoverRotatedSize,
  resolveBlockPaint,
  ringVariation,
  sampleCanvasSize,
  sampleRingColors,
  sampleTextColor,
  toPercentRect,
  verticalColumnCount,
  wrapLineCount,
  type Rgb,
  type SampleImage,
} from './photo-translation-geometry.logic'
import { photoTranslationReadyResponse, photoTranslationSettledResponse } from './photo-translation.fixtures'

/** Every character is half an em, so widths are exact in these tests. */
const halfEm = (text: string) => [...text].length * 0.5

const DEG = Math.PI / 180

function enclosingBox(width: number, height: number, angleDeg: number) {
  const t = Math.abs(angleDeg) * DEG
  return {
    width: width * Math.cos(t) + height * Math.sin(t),
    height: width * Math.sin(t) + height * Math.cos(t),
  }
}

function solidImage(width: number, height: number, color: Rgb): SampleImage & { data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < width * height; index += 1) {
    data.set([color.r, color.g, color.b, 255], index * 4)
  }
  return { width, height, data }
}

function paint(image: SampleImage & { data: Uint8ClampedArray }, x: number, y: number, color: Rgb) {
  image.data.set([color.r, color.g, color.b, 255], (y * image.width + x) * 4)
}

const WHITE = { r: 255, g: 255, b: 255 }
const INK = { r: 31, g: 41, b: 55 }

describe('containFit', () => {
  it('matches the contain rect the probe measured for tall and wide photos', () => {
    const tall = containFit({ width: 945, height: 2048 }, { width: 358, height: 675 })
    expect(tall.width).toBeCloseTo(311.5, 1)
    expect(tall.height).toBeCloseTo(675, 5)
    const desktop = containFit({ width: 500, height: 2048 }, { width: 896, height: 700 })
    expect(desktop.width).toBeCloseTo(170.9, 1)
    const landscape = containFit({ width: 2048, height: 1536 }, { width: 358, height: 675 })
    expect(landscape).toEqual({ width: 358, height: 268.5 })
  })

  it('never upscales and survives empty sizes', () => {
    expect(containFit({ width: 300, height: 200 }, { width: 358, height: 675 })).toEqual({ width: 300, height: 200 })
    expect(containFit({ width: 0, height: 200 }, { width: 358, height: 675 })).toEqual({ width: 0, height: 0 })
    expect(containFit({ width: 300, height: 200 }, { width: 0, height: 0 })).toEqual({ width: 0, height: 0 })
  })

  it('sizes the sampling canvas to at most 512 px on the long side', () => {
    expect(sampleCanvasSize({ width: 2048, height: 1536 })).toEqual({ width: 512, height: 384 })
    expect(sampleCanvasSize({ width: 945, height: 2048 })).toEqual({ width: 236, height: 512 })
    expect(sampleCanvasSize({ width: 300, height: 200 })).toEqual({ width: 300, height: 200 })
  })
})

describe('block rectangles', () => {
  it('pads the pixel box by 15% of its height on every side and places it in percent', () => {
    const size = { width: 1000, height: 500 }
    const rect = blockPaintRect({ box: [0.1, 0.2, 0.5, 0.3], angle: 0 }, size)
    const expected = { cx: 300, cy: 125, textWidth: 400, textHeight: 50, padding: 7.5, width: 415, height: 65, angle: 0 }
    for (const [key, value] of Object.entries(expected)) expect(rect[key as keyof typeof rect]).toBeCloseTo(value, 6)
    expect(toPercentRect(rect, size)).toEqual({ left: 9.25, top: 18.5, width: 41.5, height: 13 })
  })

  it('pads vertical text by 15% of its column width', () => {
    const rect = blockPaintRect({ box: [0.8, 0.1, 0.85, 0.7], angle: 0, vertical: true }, { width: 1000, height: 500 })
    expect(rect.padding).toBeCloseTo(7.5, 6)
    expect(rect.width).toBeCloseTo(65, 6)
    expect(rect.height).toBeCloseTo(315, 6)
  })

  it('recovers the rotated text rectangle from its axis-aligned box in pixels', () => {
    for (const angle of [3, 10, -12, 25, 40]) {
      const box = enclosingBox(500, 40, angle)
      const recovered = recoverRotatedSize(box.width, box.height, angle)
      expect(recovered.width).toBeCloseTo(500, 6)
      expect(recovered.height).toBeCloseTo(40, 6)
      expect(recovered.angle).toBe(angle)
    }
  })

  it('paints the box unrotated past 40 degrees or when a side is not positive', () => {
    expect(recoverRotatedSize(120, 90, 41)).toEqual({ width: 120, height: 90, angle: 0 })
    expect(recoverRotatedSize(120, 90, -60)).toEqual({ width: 120, height: 90, angle: 0 })
    expect(recoverRotatedSize(100, 20, 30)).toEqual({ width: 100, height: 20, angle: 0 })
    expect(recoverRotatedSize(100, 20, 0)).toEqual({ width: 100, height: 20, angle: 0 })
  })

  it('pads a rotated block by its recovered height, not the enclosing box', () => {
    const box = enclosingBox(400, 40, 10)
    const x0 = (500 - box.width / 2) / 1000
    const y0 = (500 - box.height / 2) / 1000
    const rect = blockPaintRect({ box: [x0, y0, 1 - x0, 1 - y0], angle: 10 }, { width: 1000, height: 1000 })
    expect(rect.textWidth).toBeCloseTo(400, 6)
    expect(rect.textHeight).toBeCloseTo(40, 6)
    expect(rect.padding).toBeCloseTo(6, 6)
    expect(rect.angle).toBe(10)
    expect(rect.cx).toBeCloseTo(500, 6)
  })
})

describe('text fitting', () => {
  it('estimates wide CJK and narrow Latin glyphs', () => {
    expect(estimateTextWidthEm('本日のおすすめ')).toBe(7)
    expect(estimateTextWidthEm('오늘의 추천')).toBeCloseTo(5.28, 6)
    expect(estimateTextWidthEm('iii')).toBeLessThan(estimateTextWidthEm('MMM'))
    expect(estimateTextWidthEm('Menu', true)).toBeGreaterThan(estimateTextWidthEm('Menu'))
  })

  it('wraps at spaces, breaks Chinese and Japanese anywhere and keeps Korean words whole', () => {
    expect(wrapLineCount('aa bb cc dd', 2.9, { measure: halfEm })).toBe(2)
    expect(wrapLineCount('aa\nbb', 10, { measure: halfEm })).toBe(2)
    expect(wrapLineCount('本日のおすすめ', 3)).toBe(3)
    expect(wrapLineCount('오늘의 추천', 3)).toBe(2)
    expect(wrapLineCount('오늘의추천', 3)).toBe(Infinity)
  })

  it('breaks a word wider than a line only when allowed', () => {
    expect(wrapLineCount('abcdefgh', 2, { measure: halfEm })).toBe(Infinity)
    expect(wrapLineCount('abcdefgh', 2, { measure: halfEm, breakWords: true })).toBe(2)
  })

  it('counts upright columns for vertical text', () => {
    expect(verticalColumnCount('本日のおすすめ', 4)).toBe(2)
    expect(verticalColumnCount('本日\nおすすめ', 4)).toBe(2)
    expect(verticalColumnCount('本日', 0.5)).toBe(Infinity)
  })

  it('fits one line by height or width', () => {
    const base = { text: 'abcd', mode: 'single' as const, lines: 1, height: 30, padding: 5, measure: halfEm }
    expect(fitFontSize({ ...base, width: 100 })).toBe(25)
    expect(fitFontSize({ ...base, width: 40 })).toBe(17.5)
    expect(fitFontSize({ ...base, text: 'ab\ncd', width: 40 })).toBeCloseTo(14, 6)
    expect(fitFontSize({ ...base, width: 6 })).toBe(PHOTO_TRANSLATION_MIN_FONT_PX)
  })

  it('wraps into the box without growing past the original line size', () => {
    const base = { mode: 'wrap' as const, lines: 2, width: 60, padding: 0, measure: halfEm }
    expect(fitFontSize({ ...base, text: 'aa bb cc dd', height: 50 })).toBe(20.83)
    expect(fitFontSize({ ...base, text: 'aa bb cc dd', height: 30 })).toBe(12.5)
    expect(fitFontSize({ ...base, text: 'aaaa bbbb cccc dddd', height: 50 })).toBeCloseTo(13.33, 2)
  })

  it('fits upright vertical text into one column when it can', () => {
    expect(fitFontSize({ text: '오늘의 추천', mode: 'vertical', lines: 1, width: 60, height: 300, padding: 9 })).toBe(48.5)
  })

  it('harmonizes blocks whose line size is within 12% to the smallest fitted size', () => {
    const sizes = harmonizeFontSizes([
      { id: 'a', lineSize: 20, fontSize: 18, group: 'horizontal' },
      { id: 'b', lineSize: 21.5, fontSize: 14, group: 'horizontal' },
      { id: 'c', lineSize: 22.3, fontSize: 16, group: 'horizontal' },
      { id: 'd', lineSize: 30, fontSize: 25, group: 'horizontal' },
      { id: 'e', lineSize: 21, fontSize: 30, group: 'vertical' },
    ])
    expect(Object.fromEntries(sizes)).toEqual({ a: 14, b: 14, c: 14, d: 25, e: 30 })
  })
})

describe('layoutPhotoTranslationBlocks', () => {
  const stage = { width: 1000, height: 750 }

  it('lays out every painted block with its mode, rotation and a harmonized size', () => {
    const items = overlayBlocksFor(photoTranslationReadyResponse, 'ko')
    const layouts = layoutPhotoTranslationBlocks({ items, stage, language: 'ko' })
    expect(layouts.map(layout => layout.id)).toEqual(['b0', 'b1', 'b2', 'b3', 'b4'])
    const byId = Object.fromEntries(layouts.map(layout => [layout.id, layout]))
    expect(byId.b3.mode).toBe('vertical')
    expect(byId.b4.angle).toBe(12)
    expect(byId.b0.mode).toBe('single')
    expect(layouts.every(layout => layout.keepAll && layout.fontSize >= PHOTO_TRANSLATION_MIN_FONT_PX)).toBe(true)
    expect(byId.b0.rect.left).toBeGreaterThan(0)
    expect(byId.b0.rect.width).toBeGreaterThan(20)
  })

  it('writes vertical source blocks horizontally for non-CJK targets', () => {
    const items = overlayBlocksFor(photoTranslationSettledResponse, 'en')
    const layouts = layoutPhotoTranslationBlocks({ items, stage, language: 'en' })
    expect(layouts.find(layout => layout.id === 'b3')?.mode).toBe('wrap')
    expect(layouts.every(layout => !layout.keepAll)).toBe(true)
    expect(isVerticalWritingLanguage('zh-TW')).toBe(true)
    expect(isVerticalWritingLanguage('en')).toBe(false)
  })

  it('returns nothing before the stage has a size', () => {
    expect(layoutPhotoTranslationBlocks({ items: overlayBlocksFor(photoTranslationReadyResponse, 'ko'), stage: { width: 0, height: 0 }, language: 'ko' })).toEqual([])
  })
})

describe('colors', () => {
  it('parses hex hints and formats css colors', () => {
    expect(parseHexColor('#1B7F3B')).toEqual({ r: 27, g: 127, b: 59 })
    expect(parseHexColor('red')).toBeNull()
    expect(parseHexColor(undefined)).toBeNull()
    expect(cssColor({ r: 1, g: 2, b: 3 })).toBe('rgb(1, 2, 3)')
    expect(cssColor({ r: 1, g: 2, b: 3 }, 0.5)).toBe('rgba(1, 2, 3, 0.5)')
  })

  it('uses WCAG contrast and falls back to near-black or white below 3:1', () => {
    expect(contrastRatio(WHITE, { r: 0, g: 0, b: 0 })).toBeCloseTo(21, 6)
    expect(contrastRatio(INK, INK)).toBe(1)
    expect(chooseTextColor(INK, WHITE)).toEqual(INK)
    expect(chooseTextColor({ r: 119, g: 119, b: 119 }, { r: 136, g: 136, b: 136 })).toEqual(PHOTO_TRANSLATION_NEAR_BLACK)
    expect(chooseTextColor(null, { r: 27, g: 127, b: 59 })).toEqual(PHOTO_TRANSLATION_WHITE)
  })

  it('takes a per-channel median and measures ring variation', () => {
    expect(medianColor([WHITE, WHITE, INK])).toEqual(WHITE)
    expect(medianColor([])).toBeNull()
    expect(ringVariation([WHITE, WHITE, WHITE, WHITE], WHITE)).toBe(0)
    expect(ringVariation([WHITE, INK, INK, INK], WHITE)).toBeGreaterThan(300)
  })

  it('samples the patch from the ring and the text from the glyph cores', () => {
    const image = solidImage(100, 60, WHITE)
    for (let y = 26; y <= 34; y += 1) {
      for (let x = 22; x <= 78; x += 1) if (x % 4 < 2) paint(image, x, y, INK)
    }
    const block = { box: [0.2, 0.4, 0.8, 0.6] as const, angle: 0 }
    const rect = blockPaintRect(block, image)
    expect(medianColor(sampleRingColors(image, rect))).toEqual(WHITE)
    expect(sampleTextColor(image, rect, WHITE)).toEqual(INK)
    expect(resolveBlockPaint(block, image)).toEqual({ kind: 'flat', background: WHITE, alpha: 1, text: INK })
  })

  it('paints a blurred plate when the ring is busy', () => {
    const image = solidImage(100, 60, WHITE)
    let seed = 7
    for (let y = 0; y < 60; y += 1) {
      for (let x = 0; x < 100; x += 1) {
        seed = (seed * 1103515245 + 12345) % 2147483648
        const value = seed % 256
        paint(image, x, y, { r: value, g: 255 - value, b: (value * 7) % 256 })
      }
    }
    const result = resolveBlockPaint({ box: [0.2, 0.4, 0.8, 0.6], angle: 0 }, image)
    expect(result.kind).toBe('plate')
    expect(result.alpha).toBe(PHOTO_TRANSLATION_PLATE_ALPHA)
  })

  it('samples rotated blocks and uses the hint text color when no glyph stands out', () => {
    const green = { r: 27, g: 127, b: 59 }
    const image = solidImage(200, 200, green)
    const result = resolveBlockPaint({ box: [0.3, 0.3, 0.7, 0.5], angle: 12, style: { color: '#ffffff' } }, image)
    expect(result).toEqual({ kind: 'flat', background: green, alpha: 1, text: WHITE })
  })

  it('falls back to the style hints, then to the dark scrim', () => {
    expect(resolveBlockPaint({ box: [0.1, 0.1, 0.5, 0.2], angle: 0, style: { background: '#ffffff', color: '#fafafa' } }, null))
      .toEqual({ kind: 'hint', background: WHITE, alpha: 1, text: PHOTO_TRANSLATION_NEAR_BLACK })
    expect(resolveBlockPaint({ box: [0.1, 0.1, 0.5, 0.2], angle: 0 }, null)).toBe(PHOTO_TRANSLATION_SCRIM)
    expect(resolveBlockPaint({ box: [0.1, 0.1, 0.5, 0.2], angle: 0 }, { width: 0, height: 0, data: [] })).toBe(PHOTO_TRANSLATION_SCRIM)
  })
})
