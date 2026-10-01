import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import {
  CONVERSATION_IMAGE_TEXT_MAX_TOTAL_CHARS,
  ConversationImageTextProviderError,
  OCR_PROMPT_V2,
  OCR_SCHEMA,
  OPENAI_OCR_SCHEMA,
  SYSTEM_PROMPT,
  TRANSLATE_SCHEMA,
  TRANSLATION_SYSTEM_INSTRUCTION,
  conversationImageTextProviderForModel,
  convertOcrBox,
  extractConversationImageText,
  finalizeConversationImageTextBlocks,
  parseOcrResponseText,
  parseTranslationResponseText,
  resolveConversationImageTextModels,
  toConversationImageTextBlocks,
  translateConversationImageTextBlocks,
} from './conversation-image-text-provider'
import { parseConversationImageTextResponse, type ConversationImageTextBlock } from '@/lib/conversation-image-text'

const fetchMock = vi.fn()
const noSleep = async () => {}

function interaction(json: unknown, usage = { total_input_tokens: 1200, total_output_tokens: 300, total_thought_tokens: 0 }) {
  return new Response(JSON.stringify({
    status: 'completed',
    steps: [
      { type: 'thought', content: [{ type: 'text', text: 'ignored' }] },
      { type: 'model_output', content: [{ type: 'text', text: typeof json === 'string' ? json : JSON.stringify(json) }] },
    ],
    usage,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function openAiChat(json: unknown, usage = { prompt_tokens: 1800, completion_tokens: 900, completion_tokens_details: { reasoning_tokens: 200 } }) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: typeof json === 'string' ? json : JSON.stringify(json) } }],
    usage,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function rawBlock(overrides: Record<string, unknown> = {}) {
  return { box_2d: [100, 200, 150, 600], text: '営業時間', lang: 'ja', bg: '#FFFFFF', fg: '#1A1A1A', bold: true, angle_deg: 0, vertical: false, ...overrides }
}

function block(id: string, text: string, sourceLanguage: string | null): ConversationImageTextBlock {
  return { id, box: [0.1, 0.1, 0.5, 0.2], text, sourceLanguage, angle: 0, lines: 1 }
}

function requestBody(call = 0) {
  return JSON.parse(fetchMock.mock.calls[call][1].body as string)
}

const jpeg = (width = 400, height = 300) => sharp({ create: { width, height, channels: 3, background: '#ffffff' } }).jpeg().toBuffer()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('GEMINI_API_KEY', 'test-key')
  vi.stubEnv('OPENAI_API_KEY', 'openai-test-key')
  for (const name of ['OCR_MODEL', 'OCR_FALLBACK_MODEL', 'TRANSLATION_MODEL', 'TRANSLATION_FALLBACK_MODEL']) {
    vi.stubEnv(`CONVERSATION_IMAGE_TEXT_${name}`, '')
  }
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('OCR alignment', () => {
  it('keeps a valid alignment and drops anything else', () => {
    const blocks = toConversationImageTextBlocks([
      rawBlock({ align: 'left' }), rawBlock({ align: 'Center' }), rawBlock({ align: 'right', text: 'second' }), rawBlock({ text: 'third' }),
    ])
    expect(blocks.map(block => block.align)).toEqual(['left', undefined, 'right', undefined])
    expect(OCR_PROMPT_V2).toContain('- align:')
    expect(OCR_SCHEMA.properties.blocks.items.required).toContain('align')
    expect(OPENAI_OCR_SCHEMA.properties.blocks.items.required).toContain('align')
  })

  it('survives the stored-block parser the response goes through', () => {
    const [block] = toConversationImageTextBlocks([rawBlock({ align: 'right' })])
    const parsed = parseConversationImageTextResponse({ status: 'ready', blocks: [block], translations: [] })
    expect(parsed?.blocks[0].align).toBe('right')
    expect(parseConversationImageTextResponse({ status: 'ready', blocks: [{ ...block, align: 'sideways' }], translations: [] })?.blocks[0].align).toBeUndefined()
  })
})

describe('OCR prompt', () => {
  it('tells the model to skip letterless blocks, which the server would drop anyway', () => {
    // A chart's axis ticks alone doubled the output tokens and the latency of a dense photo.
    expect(OCR_PROMPT_V2).toContain('Skip a block that contains no letters at all')
    expect(OCR_PROMPT_V2).not.toContain('Use "und"')
  })
})

describe('OCR output -> contract blocks', () => {
  it('converts box_2d [ymin, xmin, ymax, xmax]/1000 to [x0, y0, x1, y1] and rejects malformed boxes', () => {
    expect(convertOcrBox([100, 200, 150, 600])).toEqual([0.2, 0.1, 0.6, 0.15])
    expect(convertOcrBox([0, 0, 1000, 1000])).toEqual([0, 0, 1, 1])
    for (const bad of [[100, 200, 150], [100, 200, 150, 600, 1], [100.5, 200, 150, 600], [-1, 200, 150, 600], [100, 200, 150, 1001], [150, 200, 150, 600], [100, 600, 150, 200], ['100', 200, 150, 600], null, 'box']) {
      expect(convertOcrBox(bad)).toBeNull()
    }
  })

  it('keeps style, lines, vertical and clamps the angle', () => {
    const [first, second] = toConversationImageTextBlocks([
      rawBlock({ text: '定休日\r\n 毎週水曜日 ', angle_deg: 123.456, vertical: false }),
      rawBlock({ text: '本日のおすすめ', vertical: true, angle_deg: -12.34, bg: 'white', fg: '#C8102E', bold: 'yes' }),
    ])
    expect(first).toEqual({ id: 'b0', box: [0.2, 0.1, 0.6, 0.15], text: '定休日\n毎週水曜日', sourceLanguage: 'ja', angle: 90, lines: 2, style: { background: '#ffffff', color: '#1a1a1a', bold: true } })
    expect(second).toEqual({ id: 'b1', box: [0.2, 0.1, 0.6, 0.15], text: '本日のおすすめ', sourceLanguage: 'ja', angle: -12.3, lines: 1, vertical: true, style: { color: '#c8102e' } })
  })

  it('drops letterless blocks (times, prices, codes) but keeps numbers with a unit word', () => {
    const blocks = toConversationImageTextBlocks([
      rawBlock({ text: '10:00～22:00', lang: 'und' }),
      rawBlock({ text: '¥1,200' }),
      rawBlock({ text: '→' }),
      rawBlock({ text: '30分', lang: 'ja' }),
      rawBlock({ text: '9,000원', lang: 'ko' }),
      rawBlock({ text: '   ' }),
      'not a block',
      rawBlock({ box_2d: [5, 5, 5, 9] }),
    ])
    expect(blocks.map(entry => [entry.id, entry.text])).toEqual([['b0', '30分'], ['b1', '9,000원']])
  })

  it('normalizes languages: catalog codes, unknown -> null, Chinese variant from the written script', () => {
    const blocks = toConversationImageTextBlocks([
      rawBlock({ text: 'OPEN', lang: 'en-US' }),
      rawBlock({ text: 'CAFE', lang: 'und' }),
      rawBlock({ text: 'Menu', lang: 'xx' }),
      rawBlock({ text: '營業時間', lang: 'zh' }),
      rawBlock({ text: '营业时间', lang: 'zh-TW' }),
      rawBlock({ text: '你好', lang: 'zh-Hant' }),
    ])
    expect(blocks.map(entry => entry.sourceLanguage)).toEqual(['en', null, null, 'zh-TW', 'zh-CN', 'zh-TW'])
  })

  it('applies the block, per-block and total character limits and renumbers ids', () => {
    const many = Array.from({ length: 70 }, (_, index) => rawBlock({ text: `Item ${index}` }))
    const limited = toConversationImageTextBlocks(many)
    expect(limited).toHaveLength(60)
    expect(limited.map(entry => entry.id)).toEqual(Array.from({ length: 60 }, (_, index) => `b${index}`))

    const long = toConversationImageTextBlocks([rawBlock({ text: `${'가'.repeat(499)}😀tail` })])
    expect(Array.from(long[0].text)).toHaveLength(500)
    expect(long[0].text.endsWith('😀')).toBe(true)

    const heavy = toConversationImageTextBlocks(Array.from({ length: 20 }, () => rawBlock({ text: 'a'.repeat(500) })))
    expect(heavy).toHaveLength(CONVERSATION_IMAGE_TEXT_MAX_TOTAL_CHARS / 500)
    expect(heavy.reduce((total, entry) => total + entry.text.length, 0)).toBe(CONVERSATION_IMAGE_TEXT_MAX_TOTAL_CHARS)

    // Idempotent on already-final blocks.
    expect(finalizeConversationImageTextBlocks(limited)).toEqual(limited)
  })

  it('treats unparsable or envelope-less output as invalid, and an empty block list as no text', () => {
    expect(() => parseOcrResponseText('{"blocks": [')).toThrow(ConversationImageTextProviderError)
    expect(() => parseOcrResponseText('[]')).toThrow('invalid_output')
    expect(() => parseOcrResponseText('{"items": []}')).toThrow('invalid_output')
    expect(parseOcrResponseText('{"blocks": []}')).toEqual([])
    expect(parseOcrResponseText(JSON.stringify({ blocks: [{ text: 'no box' }, rawBlock()] }))).toHaveLength(1)
  })
})

describe('translation output', () => {
  const input = [block('b0', '営業時間', 'ja'), block('b3', 'お手洗い', 'ja'), block('b7', '定休日', 'ja')]

  it('maps integer ids back to block ids, leaving missing ids untranslated', () => {
    const texts = parseTranslationResponseText(JSON.stringify({ items: [
      { id: 0, text: ' 영업시간 ' },
      { id: '2', text: '정기 휴일' },
      { id: 0, text: 'duplicate' },
      { id: 9, text: 'out of range' },
      { id: 1.5, text: 'not an id' },
      { id: 1, text: '' },
    ] }), input, 'ko')
    expect(texts).toEqual({ b0: '영업시간', b7: '정기 휴일' })
  })

  it('forces the Chinese variant script and rejects unusable output', () => {
    expect(parseTranslationResponseText(JSON.stringify({ items: [{ id: 0, text: '营业时间' }] }), input, 'zh-TW')).toEqual({ b0: '營業時間' })
    expect(() => parseTranslationResponseText('nope', input, 'ko')).toThrow('invalid_output')
    expect(() => parseTranslationResponseText('{"items": {}}', input, 'ko')).toThrow('invalid_output')
    expect(() => parseTranslationResponseText('{"items": [{"id": 5, "text": "x"}]}', input, 'ko')).toThrow('invalid_output')
  })
})

describe('extractConversationImageText', () => {
  it('sends the v2 OCR request with store:false and a 1536 px JPEG', async () => {
    fetchMock.mockResolvedValue(interaction({ blocks: [rawBlock()] }))
    const result = await extractConversationImageText(await jpeg(3000, 2000), { sleep: noSleep })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions')
    expect(init.headers).toMatchObject({ 'x-goog-api-key': 'test-key', 'Content-Type': 'application/json' })
    const body = requestBody()
    expect(body).toMatchObject({
      model: 'gemini-3.8-flash',
      system_instruction: SYSTEM_PROMPT,
      response_format: { type: 'text', mime_type: 'application/json', schema: OCR_SCHEMA },
      generation_config: { thinking_level: 'low' },
      store: false,
    })
    expect(body.input[0]).toEqual({ type: 'text', text: OCR_PROMPT_V2 })
    expect(body.input[1]).toMatchObject({ type: 'image', mime_type: 'image/jpeg', resolution: 'high' })
    const sent = await sharp(Buffer.from(body.input[1].data, 'base64')).metadata()
    expect(sent).toMatchObject({ format: 'jpeg', width: 1536, height: 1024 })

    expect(result).toMatchObject({ model: 'gemini-3.8-flash', fallbackUsed: false, usage: { inputTokens: 1200, outputTokens: 300, thoughtTokens: 0 } })
    expect(result.blocks).toHaveLength(1)
  })

  it('does not enlarge small photos', async () => {
    fetchMock.mockResolvedValue(interaction({ blocks: [] }))
    await extractConversationImageText(await jpeg(400, 300), { sleep: noSleep })
    expect(await sharp(Buffer.from(requestBody().input[1].data, 'base64')).metadata()).toMatchObject({ width: 400, height: 300 })
  })

  it('retries once with the fallback model on 5xx, 429 and invalid JSON, summing usage', async () => {
    fetchMock
      .mockResolvedValueOnce(interaction('{"blocks": [', { total_input_tokens: 1000, total_output_tokens: 50, total_thought_tokens: 5 }))
      .mockResolvedValueOnce(interaction({ blocks: [rawBlock()] }))
    const sleep = vi.fn(async () => {})
    const result = await extractConversationImageText(await jpeg(), { sleep })
    expect(requestBody(1).model).toBe('gemini-3.7-flash')
    expect(requestBody(1).generation_config).toEqual({ thinking_level: 'low' })
    expect(requestBody(1).store).toBe(false)
    expect(sleep).toHaveBeenCalledTimes(1)
    const [[delay]] = sleep.mock.calls as unknown as [[number]]
    expect(delay).toBeGreaterThanOrEqual(1000)
    expect(delay).toBeLessThan(2000)
    expect(result).toMatchObject({ model: 'gemini-3.7-flash', fallbackUsed: true, usage: { inputTokens: 2200, outputTokens: 350, thoughtTokens: 5 } })

    for (const status of [429, 503]) {
      fetchMock.mockReset()
      fetchMock.mockResolvedValueOnce(new Response('busy', { status })).mockResolvedValueOnce(interaction({ blocks: [] }))
      await expect(extractConversationImageText(await jpeg(), { sleep: noSleep })).resolves.toMatchObject({ model: 'gemini-3.7-flash', blocks: [] })
    }
  })

  it('fails the attempt after the fallback fails, and never retries a 4xx', async () => {
    fetchMock.mockResolvedValue(new Response('down', { status: 500 }))
    await expect(extractConversationImageText(await jpeg(), { sleep: noSleep })).rejects.toMatchObject({ code: 'upstream_error', status: 500, model: 'gemini-3.7-flash' })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    fetchMock.mockReset()
    fetchMock.mockResolvedValue(new Response('bad request', { status: 400 }))
    await expect(extractConversationImageText(await jpeg(), { sleep: noSleep })).rejects.toMatchObject({ code: 'upstream_error', status: 400, model: 'gemini-3.8-flash' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('needs the Gemini key and uses the env model overrides', async () => {
    vi.stubEnv('GEMINI_API_KEY', '')
    await expect(extractConversationImageText(await jpeg())).rejects.toMatchObject({ code: 'missing_credentials' })
    expect(fetchMock).not.toHaveBeenCalled()

    vi.stubEnv('GEMINI_API_KEY', 'test-key')
    vi.stubEnv('CONVERSATION_IMAGE_TEXT_OCR_MODEL', 'ocr-a')
    vi.stubEnv('CONVERSATION_IMAGE_TEXT_OCR_FALLBACK_MODEL', 'ocr-b')
    vi.stubEnv('CONVERSATION_IMAGE_TEXT_TRANSLATION_MODEL', 'tr-a')
    vi.stubEnv('CONVERSATION_IMAGE_TEXT_TRANSLATION_FALLBACK_MODEL', 'tr-b')
    expect(resolveConversationImageTextModels()).toEqual({ ocr: 'ocr-a', ocrFallback: 'ocr-b', translation: 'tr-a', translationFallback: 'tr-b' })
    fetchMock.mockResolvedValueOnce(new Response('x', { status: 502 })).mockResolvedValueOnce(interaction({ blocks: [] }))
    await extractConversationImageText(await jpeg(), { sleep: noSleep })
    expect([requestBody(0).model, requestBody(1).model]).toEqual(['ocr-a', 'ocr-b'])
  })

  it('rejects an undecodable image without calling the model', async () => {
    await expect(extractConversationImageText(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({ code: 'invalid_image' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('extractConversationImageText with a gpt-* model override (OpenAI opt-in)', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'openai-test-key')
    vi.stubEnv('CONVERSATION_IMAGE_TEXT_OCR_MODEL', 'gpt-6-luna')
  })

  it('sends the v2 OCR request to OpenAI with store:false and a 1536 px JPEG', async () => {
    fetchMock.mockResolvedValue(openAiChat({ blocks: [rawBlock()] }))
    const result = await extractConversationImageText(await jpeg(3000, 2000), { sleep: noSleep })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer openai-test-key', 'Content-Type': 'application/json' })
    const body = requestBody()
    expect(body).toMatchObject({
      model: 'gpt-6-luna',
      reasoning_effort: 'low',
      store: false,
      response_format: { type: 'json_schema', json_schema: { name: 'photo_ocr', strict: true } },
    })
    expect(body.messages[0]).toEqual({ role: 'system', content: SYSTEM_PROMPT })
    const [text, image] = body.messages[1].content
    expect(text).toEqual({ type: 'text', text: OCR_PROMPT_V2 })
    expect(image).toMatchObject({ type: 'image_url', image_url: { detail: 'high' } })
    const dataUrl: string = image.image_url.url
    expect(dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
    const sent = await sharp(Buffer.from(dataUrl.split(',')[1], 'base64')).metadata()
    expect(sent).toMatchObject({ format: 'jpeg', width: 1536, height: 1024 })

    // completion_tokens (900) includes the 200 reasoning tokens.
    expect(result).toMatchObject({ model: 'gpt-6-luna', fallbackUsed: false, usage: { inputTokens: 1800, outputTokens: 700, thoughtTokens: 200 } })
    expect(result.blocks).toHaveLength(1)
  })

  it('keeps the OpenAI strict schema free of keywords it rejects and in sync with the Gemini schema', () => {
    const openAiProperties = (OPENAI_OCR_SCHEMA.properties.blocks.items.properties)
    const geminiProperties = (OCR_SCHEMA.properties.blocks.items.properties)
    expect(Object.keys(openAiProperties).sort()).toEqual(Object.keys(geminiProperties).sort())
    expect(JSON.stringify(OPENAI_OCR_SCHEMA)).not.toMatch(/minItems|maxItems|minimum|maximum/)
    expect(OPENAI_OCR_SCHEMA.properties.blocks.items.required).toEqual(Object.keys(openAiProperties))
  })

  it('retries once with the Gemini fallback, summing usage, and never retries a 4xx', async () => {
    fetchMock
      .mockResolvedValueOnce(openAiChat('{"blocks": [', { prompt_tokens: 1000, completion_tokens: 55, completion_tokens_details: { reasoning_tokens: 5 } }))
      .mockResolvedValueOnce(interaction({ blocks: [rawBlock()] }))
    const sleep = vi.fn(async () => {})
    const result = await extractConversationImageText(await jpeg(), { sleep })
    expect(fetchMock.mock.calls[1][0]).toBe('https://generativelanguage.googleapis.com/v1beta/interactions')
    expect(requestBody(1).model).toBe('gemini-3.7-flash')
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ model: 'gemini-3.7-flash', fallbackUsed: true, usage: { inputTokens: 2200, outputTokens: 350, thoughtTokens: 5 } })

    fetchMock.mockReset()
    fetchMock.mockResolvedValue(new Response('bad request', { status: 400 }))
    await expect(extractConversationImageText(await jpeg(), { sleep: noSleep })).rejects.toMatchObject({ code: 'upstream_error', status: 400, model: 'gpt-6-luna' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('goes straight to the fallback without waiting when OPENAI_API_KEY is missing, and needs one usable key', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    fetchMock.mockResolvedValue(interaction({ blocks: [rawBlock()] }))
    const sleep = vi.fn(async () => {})
    await expect(extractConversationImageText(await jpeg(), { sleep })).resolves.toMatchObject({ model: 'gemini-3.7-flash', fallbackUsed: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()

    fetchMock.mockReset()
    vi.stubEnv('GEMINI_API_KEY', '')
    await expect(extractConversationImageText(await jpeg())).rejects.toMatchObject({ code: 'missing_credentials' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('routes each model by id', async () => {
    expect(conversationImageTextProviderForModel('gpt-6-luna')).toBe('openai')
    expect(conversationImageTextProviderForModel('openai/gpt-6-luna')).toBe('openai')
    expect(conversationImageTextProviderForModel('gemini-3.8-flash')).toBe('gemini')

    vi.stubEnv('CONVERSATION_IMAGE_TEXT_OCR_MODEL', 'gemini-ocr-a')
    vi.stubEnv('CONVERSATION_IMAGE_TEXT_OCR_FALLBACK_MODEL', 'gpt-ocr-b')
    fetchMock.mockResolvedValueOnce(new Response('x', { status: 502 })).mockResolvedValueOnce(openAiChat({ blocks: [] }))
    await extractConversationImageText(await jpeg(), { sleep: noSleep })
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      'https://api.openai.com/v1/chat/completions',
    ])
  })
})

describe('translateConversationImageTextBlocks', () => {
  const blocks = [block('b0', '営業時間', 'ja'), block('b1', '메뉴', 'ko'), block('b2', 'OPEN', null)]

  it('sends only blocks that need translation, with the v2 prompt and one system line', async () => {
    fetchMock.mockResolvedValue(interaction({ items: [{ id: 0, text: '영업시간' }, { id: 1, text: '영업 중' }] }, { total_input_tokens: 180, total_output_tokens: 40, total_thought_tokens: 0 }))
    const result = await translateConversationImageTextBlocks(blocks, 'ko', { sleep: noSleep })
    const body = requestBody()
    expect(body).toMatchObject({
      model: 'gemini-3.5-flash-lite',
      system_instruction: TRANSLATION_SYSTEM_INSTRUCTION,
      response_format: { type: 'text', mime_type: 'application/json', schema: TRANSLATE_SCHEMA },
      generation_config: { thinking_level: 'minimal' },
      store: false,
    })
    expect(body.input).toHaveLength(1)
    const prompt: string = body.input[0].text
    expect(prompt.startsWith('Translate these text blocks from a photo into Korean.')).toBe(true)
    expect(prompt.endsWith('[{"id":0,"lang":"ja","text":"営業時間"},{"id":1,"lang":"und","text":"OPEN"}]')).toBe(true)
    expect(result).toMatchObject({ texts: { b0: '영업시간', b2: '영업 중' }, model: 'gemini-3.5-flash-lite', usage: { inputTokens: 180, outputTokens: 40 } })
  })

  it('makes no call when nothing needs translation', async () => {
    const result = await translateConversationImageTextBlocks([block('b0', '메뉴', 'ko')], 'ko')
    expect(result).toEqual({ texts: {}, model: null, usage: { inputTokens: 0, outputTokens: 0, thoughtTokens: 0 }, latencyMs: 0, fallbackUsed: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('names non-probe languages by their catalog name', async () => {
    fetchMock.mockResolvedValue(interaction({ items: [{ id: 0, text: 'Horario' }] }))
    await translateConversationImageTextBlocks([block('b0', '営業時間', 'ja')], 'es')
    expect(requestBody().input[0].text.startsWith('Translate these text blocks from a photo into Spanish.')).toBe(true)
  })

  it('times out after 8 s and retries once with the fallback model', async () => {
    vi.useFakeTimers()
    fetchMock
      .mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }))
      .mockResolvedValueOnce(interaction({ items: [{ id: 0, text: '영업시간' }] }))
    const pending = translateConversationImageTextBlocks([block('b0', '営業時間', 'ja')], 'ko', { sleep: noSleep })
    await vi.advanceTimersByTimeAsync(7_999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await expect(pending).resolves.toMatchObject({ model: 'gemini-3.1-flash-lite', fallbackUsed: true, texts: { b0: '영업시간' } })
    expect(requestBody(1)).toMatchObject({ model: 'gemini-3.1-flash-lite', generation_config: { thinking_level: 'minimal' }, store: false })
  })

  it('stops without a fallback attempt when the caller aborts', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const pending = translateConversationImageTextBlocks([block('b0', '営業時間', 'ja')], 'ko', { signal: controller.signal, sleep: noSleep })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'aborted' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
