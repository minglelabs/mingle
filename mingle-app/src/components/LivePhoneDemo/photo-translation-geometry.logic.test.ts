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
  inferBlockAlignments,
  isVerticalWritingLanguage,
  layoutPhotoTranslationBlocks,
  medianColor,
  parseHexColor,
  recoverRotatedSize,
  resolveBlockPaint,
  resolveFreeSpans,
  ringVariation,
  sampleCanvasSize,
  sampleRingColors,
  sampleTextColor,
  solveRotatedSizeFromAspect,
  toPercentRect,
  verticalColumnCount,
  widestWordEm,
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
    // Still the spec inversion when the line is plausible for its text.
    const withText = blockPaintRect({ box: [x0, y0, 1 - x0, 1 - y0], angle: 10, text: 'Kimchi stew 9,000 won' }, { width: 1000, height: 1000 })
    expect(withText.textHeight).toBeCloseTo(40, 6)
    expect(withText.angle).toBe(10)
  })

  it('solves the rotation from the box shape and the text aspect', () => {
    const box = enclosingBox(500, 26, 11)
    const solved = solveRotatedSizeFromAspect(box.width, box.height, 500 / 26, -1)
    expect(solved?.width).toBeCloseTo(500, 3)
    expect(solved?.height).toBeCloseTo(26, 3)
    expect(solved?.angle).toBeCloseTo(-11, 2)
    expect(solveRotatedSizeFromAspect(250, 10, 500 / 26, 1)).toBeNull()
    expect(solveRotatedSizeFromAspect(100, 100, 500 / 26, 1)).toBeNull()
  })

  it('re-solves an implausibly thin rotated line instead of painting a sliver (R2 probe sticker)', () => {
    // s5_rotated_zh: the model said 13 degrees for a 489x120 px box, which the
    // plain inversion turns into a 500x7 px line over 26 px tall text.
    const size = { width: 1000, height: 820 }
    const block = { box: [0.46, 0.2, 0.949, 0.2 + 120 / 820] as const, angle: 13, text: 'FRAGILE - HANDLE WITH CARE' }
    expect(recoverRotatedSize(489, 120, 13).height).toBeLessThan(8)
    const rect = blockPaintRect(block, size)
    expect(rect.angle).toBeGreaterThan(10)
    expect(rect.angle).toBeLessThan(12)
    expect(rect.textHeight).toBeGreaterThan(20)
    expect(rect.textHeight).toBeLessThan(35)
    expect(rect.textWidth).toBeGreaterThan(480)
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

  it('counts upright columns with the measured 1.2 em vertical advance', () => {
    expect(verticalColumnCount('本日のおすすめ', 4)).toBe(3)
    expect(verticalColumnCount('本日\nおすすめ', 4)).toBe(3)
    expect(verticalColumnCount('오늘의 추천', 7.2)).toBe(1)
    expect(verticalColumnCount('오늘의 추천', 6)).toBe(2)
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
    // 6 upright advances (space included) of 1.2 em in a 291 px column.
    expect(fitFontSize({ text: '오늘의 추천', mode: 'vertical', lines: 1, width: 60, height: 300, padding: 9 })).toBe(40.42)
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

  it('keeps the live Japanese vertical banner readable in English without overlapping neighboring OCR', () => {
    // Exact b1 and sibling boxes from s2_ja_sign_live.json; source photo is 1000x750.
    const blocks = [
      { id: 'b0', box: [0.11, 0.146, 0.347, 0.222], text: '営業時間', sourceLanguage: 'ja', angle: 0, lines: 1 },
      { id: 'b1', box: [0.856, 0.146, 0.903, 0.591], text: '本日のおすすめ', sourceLanguage: 'ja', angle: 0, lines: 1, vertical: true, style: { bold: true } },
      { id: 'b2', box: [0.111, 0.395, 0.431, 0.439], text: '定休日:毎週水曜日', sourceLanguage: 'ja', angle: 0, lines: 1 },
      { id: 'b3', box: [0.112, 0.486, 0.465, 0.513], text: '※ラストオーダーは閉店30分前です', sourceLanguage: 'ja', angle: 0, lines: 1 },
      { id: 'b4', box: [0.151, 0.624, 0.503, 0.672], text: 'お手洗いはこちら →', sourceLanguage: 'ja', angle: 0, lines: 1 },
      { id: 'b5', box: [0.112, 0.792, 0.498, 0.829], text: 'ご来店ありがとうございます', sourceLanguage: 'ja', angle: 0, lines: 1 },
    ] as const
    const banner = blocks[1]
    const photo = { width: 1000, height: 750 }
    const originalRect = blockPaintRect(banner, photo)
    const english = layoutPhotoTranslationBlocks({
      items: [{ block: banner, text: "Today's Special" }],
      stage: photo,
      language: 'en',
      alignments: inferBlockAlignments(blocks),
      sourceBlocks: blocks,
      inlinePaddingPx: 4,
    })[0]

    expect(english.mode).toBe('wrap')
    expect(english.breakWords).toBe(false)
    expect(english.angle).toBe(0)
    expect(english.align).toBe('center')
    expect(english.rect.width).toBeGreaterThan(15)
    expect(english.rect.width).toBeLessThan(30)
    expect(english.rect.left).toBeGreaterThan(0)
    expect(english.rect.left + english.rect.width).toBeLessThan(100)
    expect(english.rect.height * photo.height / 100).toBeCloseTo(originalRect.width, 2)
    expect(wrapLineCount(english.text, (english.rect.width * photo.width / 100 - 8) / english.fontSize, {
      bold: true,
      measure: estimateTextWidthEm,
    })).toBeLessThanOrEqual(2)

    const label = {
      left: english.rect.left * photo.width / 100,
      right: (english.rect.left + english.rect.width) * photo.width / 100,
      top: english.rect.top * photo.height / 100,
      bottom: (english.rect.top + english.rect.height) * photo.height / 100,
    }
    for (const neighbor of blocks.filter(block => block.id !== banner.id)) {
      const rect = blockPaintRect(neighbor, photo)
      const radians = Math.abs(rect.angle) * DEG
      const halfWidth = (Math.abs(Math.cos(radians)) * rect.width + Math.abs(Math.sin(radians)) * rect.height) / 2
      const halfHeight = (Math.abs(Math.sin(radians)) * rect.width + Math.abs(Math.cos(radians)) * rect.height) / 2
      const overlaps = label.left < rect.cx + halfWidth && label.right > rect.cx - halfWidth
        && label.top < rect.cy + halfHeight && label.bottom > rect.cy - halfHeight
      expect(overlaps, `English label must not cover ${neighbor.id}`).toBe(false)
    }

    const korean = layoutPhotoTranslationBlocks({
      items: [{ block: banner, text: '오늘의 추천' }],
      stage: photo,
      language: 'ko',
      sourceBlocks: blocks,
    })[0]
    expect(korean.mode).toBe('vertical')
    expect(korean.rect).toEqual(toPercentRect(originalRect, photo))
  })

  it('fits the fixed glass-label inset before returning its font size', () => {
    const block = { id: 'tight', box: [0.1, 0.1, 0.18, 0.12] as const, text: '日本語の看板表示', sourceLanguage: 'ja', angle: 0, lines: 1 }
    const stage = { width: 1000, height: 1000 }
    const expectedRect = blockPaintRect(block, stage)
    const layout = layoutPhotoTranslationBlocks({
      items: [{ block, text: 'A fairly long English label' }],
      stage,
      language: 'en',
      measure: halfEm,
      inlinePaddingPx: 4,
    })[0]
    expect(layout.inset).toBe(4)
    expect(layout.fontSize).toBe(fitFontSize({
      text: 'A fairly long English label', mode: 'single', lines: 1,
      width: expectedRect.width, height: expectedRect.height, padding: 8, measure: halfEm,
    }))
    expect(layout.fontSize).toBeLessThan(layoutPhotoTranslationBlocks({
      items: [{ block, text: 'A fairly long English label' }], stage, language: 'en', measure: halfEm,
    })[0].fontSize)
  })

  it('returns nothing before the stage has a size', () => {
    expect(layoutPhotoTranslationBlocks({ items: overlayBlocksFor(photoTranslationReadyResponse, 'ko'), stage: { width: 0, height: 0 }, language: 'ko' })).toEqual([])
  })
})

describe('room for longer translations', () => {
  const block = (id: string, box: readonly [number, number, number, number], extra: object = {}) =>
    ({ id, box, text: 'x', sourceLanguage: 'ko', angle: 0, lines: 1, ...extra }) as const

  it('measures the widest unbreakable word', () => {
    expect(widestWordEm("Today's Special", { measure: halfEm })).toBe(3.5)
    expect(widestWordEm('本日のおすすめ')).toBe(1)
  })

  it('infers menu columns: left-aligned items, right-aligned prices, centered headings', () => {
    const alignments = inferBlockAlignments([
      block('heading', [0.3, 0.05, 0.7, 0.1]),
      block('item1', [0.1, 0.2, 0.3, 0.23]), block('item2', [0.1, 0.3, 0.35, 0.33]), block('item3', [0.101, 0.4, 0.25, 0.43]),
      block('price1', [0.75, 0.2, 0.9, 0.23]), block('price2', [0.78, 0.3, 0.9, 0.33]), block('price3', [0.77, 0.4, 0.899, 0.43]),
      block('tilted', [0.1, 0.6, 0.3, 0.7], { angle: 8 }), block('banner', [0.1, 0.7, 0.13, 0.95], { vertical: true }),
    ])
    expect(Object.fromEntries(alignments)).toEqual({
      heading: 'center', item1: 'left', item2: 'left', item3: 'left',
      price1: 'right', price2: 'right', price3: 'right', tilted: 'center', banner: 'center',
    })
    expect(inferBlockAlignments([block('a', [0.2, 0.1, 0.4, 0.15]), block('b', [0.2005, 0.3, 0.6, 0.35])]).get('a')).toBe('left')
  })

  function menuRow() {
    const image = solidImage(200, 60, WHITE)
    for (let y = 20; y <= 40; y += 1) for (let x = 120; x <= 125; x += 1) paint(image, x, y, INK)
    return image
  }

  it('finds free background beside a flat patch up to the next ink, less one padding', () => {
    const image = menuRow()
    const item = block('item', [0.1, 0.4, 0.3, 0.6])
    const spans = resolveFreeSpans([item], image, new Map([['item', resolveBlockPaint(item, image)]]))
    expect(spans.get('item')!.right * 200).toBeCloseTo(58 - 1.8, 6)
    expect(spans.get('item')!.left * 200).toBeCloseTo(18 - 1.8, 6)
  })

  it('gives no room to busy, rotated or neighbor-blocked patches', () => {
    const image = menuRow()
    const item = block('item', [0.1, 0.4, 0.3, 0.6])
    const neighbor = block('neighbor', [0.4, 0.45, 0.5, 0.55])
    const tilted = block('tilted', [0.1, 0.1, 0.3, 0.3], { angle: 5, text: 'Handle with care' })
    const paints = new Map([
      ['item', resolveBlockPaint(item, image)],
      ['neighbor', resolveBlockPaint(neighbor, image)],
      ['tilted', resolveBlockPaint(tilted, image)],
    ])
    const spans = resolveFreeSpans([item, neighbor, tilted], image, paints)
    expect(spans.get('item')!.right * 200).toBeLessThan(80 - 61)
    expect(spans.has('tilted')).toBe(false)
    const plate = new Map([['item', { ...paints.get('item')!, kind: 'plate' as const }]])
    expect(resolveFreeSpans([item], image, plate).has('item')).toBe(false)
    expect(resolveFreeSpans([item], null, paints).size).toBe(0)
  })

  it('grows a long single line into free space along its alignment before shrinking it', () => {
    const stage = { width: 200, height: 60 }
    const item = { ...block('item', [0.1, 0.4, 0.3, 0.6]), text: '김치찌개' }
    const items = [{ block: item, text: 'Kimchi Stew' }]
    const freeSpans = new Map([['item', { left: 16.2 / 200, right: 56.2 / 200 }]])
    const layout = (align?: 'left' | 'right' | 'center', withRoom = true) => layoutPhotoTranslationBlocks({
      items, stage, language: 'en', measure: halfEm, freeSpans: withRoom ? freeSpans : undefined, alignments: align ? new Map([['item', align]]) : undefined,
    })[0]
    const boxed = layout('left', false)
    expect(boxed.fontSize).toBeCloseTo(7.6, 1)
    const left = layout('left')
    expect(left.fontSize).toBe(13)
    expect(left.rect.left).toBe(boxed.rect.left)
    expect(left.align).toBe('left')
    const right = layout('right')
    expect(right.fontSize).toBeCloseTo(10.55, 1)
    expect(right.rect.left + right.rect.width).toBeCloseTo(boxed.rect.left + boxed.rect.width, 2)
    const centered = layout()
    expect(centered.fontSize).toBe(13)
    expect(centered.rect.left + centered.rect.width / 2).toBeCloseTo(boxed.rect.left + boxed.rect.width / 2, 2)
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
