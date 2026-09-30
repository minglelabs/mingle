// Shared contract for the photo text translation overlay: OCR of the text in a
// chat photo plus its translation into the room's languages. The server (API
// controller and background job) produces this shape; the full-screen viewer
// overlay consumes it. Keep this module free of server-only imports: it runs
// in the browser too.

import { classifyChineseLanguage, resolveChineseVariant } from '@/lib/chinese-variant'
import { canonicalizeTranslationLanguageCode } from '@/lib/translation-languages'

export const CONVERSATION_IMAGE_TEXT_STATUSES = ['pending', 'ready', 'empty', 'failed', 'disabled'] as const
export type ConversationImageTextStatus = (typeof CONVERSATION_IMAGE_TEXT_STATUSES)[number]

export const CONVERSATION_IMAGE_TEXT_TRANSLATION_STATUSES = ['pending', 'ready', 'failed'] as const
export type ConversationImageTextTranslationStatus = (typeof CONVERSATION_IMAGE_TEXT_TRANSLATION_STATUSES)[number]

/** At most this many languages per request (and per response). */
export const CONVERSATION_IMAGE_TEXT_MAX_LANGUAGES = 8
/** The server keeps at most this many blocks per image. */
export const CONVERSATION_IMAGE_TEXT_MAX_BLOCKS = 60
/** The server keeps at most this many characters of original text per block. */
export const CONVERSATION_IMAGE_TEXT_MAX_BLOCK_CHARS = 500
/** Longest original or translated text the client parser accepts. */
export const CONVERSATION_IMAGE_TEXT_MAX_PARSED_CHARS = 2000
/** Client polling interval while anything requested is pending (the server's retryAfterMs wins). */
export const CONVERSATION_IMAGE_TEXT_POLL_MS = 1500
/** The client stops polling one viewer session after this long. */
export const CONVERSATION_IMAGE_TEXT_MAX_POLL_MS = 45_000
/** Block ids are `b0`, `b1`, ... in reading order. */
export const CONVERSATION_IMAGE_TEXT_BLOCK_ID_PATTERN = /^b\d{1,3}$/

/**
 * A text box in the STORED image (after EXIF rotation and the 2048 px resize,
 * so the same pixels as metadata.image.width/height): [x0, y0, x1, y1], each a
 * 0..1 fraction of the image width (x) or height (y), with x0 < x1, y0 < y1.
 * Tight around the glyphs (the client pads it before painting). For rotated
 * text (angle != 0) it is the axis-aligned box that encloses the rotated text.
 */
export type ConversationImageTextBox = readonly [number, number, number, number]

export type ConversationImageTextStyle = {
  /** #rrggbb estimated by the OCR model. The client prefers colors sampled from the pixels. */
  background?: string
  color?: string
  bold?: boolean
}

export type ConversationImageTextBlock = {
  /** Unique within one image; see CONVERSATION_IMAGE_TEXT_BLOCK_ID_PATTERN. */
  id: string
  box: ConversationImageTextBox
  /**
   * Text as written in the photo; line breaks are "\n". Always contains a word:
   * the server omits blocks made only of digits, times, codes, URLs or symbols.
   */
  text: string
  /**
   * normalizeImageTextLanguage() of the text's language, or null when the
   * language is not recognized (such a block is still translated).
   */
  sourceLanguage: string | null
  /** Clockwise rotation of the text baseline in degrees, -90..90; 0 when horizontal. */
  angle: number
  /** Number of text lines inside the box, >= 1. */
  lines: number
  /** True for text written top-to-bottom (vertical CJK); absent otherwise. */
  vertical?: boolean
  style?: ConversationImageTextStyle
}

export type ConversationImageTextTranslation = {
  language: string
  status: ConversationImageTextTranslationStatus
  /** blockId -> translated text. Blocks that need no translation into `language` are absent. */
  texts: Record<string, string>
}

export type ConversationImageTextResponse = {
  status: ConversationImageTextStatus
  /** Reading-order blocks when status is 'ready'; empty otherwise. */
  blocks: ConversationImageTextBlock[]
  /**
   * When status is 'ready': one entry per requested language that has text to
   * translate (languageHasTextToTranslate), in request order. Empty otherwise.
   */
  translations: ConversationImageTextTranslation[]
  /** Set while anything is pending: how long to wait before polling again. */
  retryAfterMs?: number
}

const UNKNOWN_LANGUAGE_CODES = new Set(['und', 'unknown', 'mul', 'zxx', 'none', 'null'])

/**
 * The one language key used by this feature on both sides: a catalog code,
 * with Chinese always resolved to zh-CN or zh-TW. For Chinese, the script of
 * `text` (written text is real evidence) outranks the declared variant.
 * Returns null for an empty, unknown or unsupported value.
 */
export function normalizeImageTextLanguage(rawLanguage: string | null | undefined, text?: string | null): string | null {
  const raw = (rawLanguage ?? '').trim()
  if (!raw || UNKNOWN_LANGUAGE_CODES.has(raw.toLowerCase())) return null
  const chinese = classifyChineseLanguage(raw)
  if (chinese) {
    return resolveChineseVariant({ text: text ?? null, preferScript: true, fallback: chinese === 'zh' ? null : chinese })
  }
  return canonicalizeTranslationLanguageCode(raw) || null
}

/** Normalized, de-duplicated, capped language list. Accepts an array or a comma-separated query value. */
export function normalizeImageTextLanguageList(
  languages: readonly (string | null | undefined)[] | string | null | undefined,
): string[] {
  const values = typeof languages === 'string' ? languages.split(',') : (languages ?? [])
  const output: string[] = []
  for (const value of values) {
    const key = normalizeImageTextLanguage(value)
    if (key && !output.includes(key)) output.push(key)
    if (output.length >= CONVERSATION_IMAGE_TEXT_MAX_LANGUAGES) break
  }
  return output
}

/** API path (without the namespace prefix; wrap with buildClientApiPath on the client). */
export function buildConversationImageTextEndpoint(
  conversationId: string,
  messageId: string,
  languages: readonly (string | null | undefined)[] = [],
): string {
  const path = `/conversations/${encodeURIComponent(conversationId)}/images/${encodeURIComponent(messageId)}/text`
  const list = normalizeImageTextLanguageList(languages)
  return list.length ? `${path}?languages=${list.map(encodeURIComponent).join(',')}` : path
}

/** True when this block must be translated into `language`. Unknown source languages always are. */
export function blockNeedsTranslation(
  block: Pick<ConversationImageTextBlock, 'sourceLanguage' | 'text'>,
  language: string | null | undefined,
): boolean {
  const target = normalizeImageTextLanguage(language)
  if (!target || !block.text.trim()) return false
  return block.sourceLanguage !== target
}

/** Whether `language` has anything to translate in this image (the toggle's eligibility rule). */
export function languageHasTextToTranslate(
  blocks: readonly Pick<ConversationImageTextBlock, 'sourceLanguage' | 'text'>[],
  language: string | null | undefined,
): boolean {
  return blocks.some(block => blockNeedsTranslation(block, language))
}

function comparableText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()
}

export type ConversationImageTextOverlayBlock = { block: ConversationImageTextBlock; text: string }

/**
 * Blocks the overlay paints for `language`: the block needs translation, a
 * translated text exists, and it differs from the original (a brand name kept
 * as-is is left unpainted).
 */
export function overlayBlocksFor(
  response: ConversationImageTextResponse | null | undefined,
  language: string | null | undefined,
): ConversationImageTextOverlayBlock[] {
  if (!response || response.status !== 'ready') return []
  const target = normalizeImageTextLanguage(language)
  if (!target) return []
  const translation = response.translations.find(entry => entry.language === target)
  if (!translation) return []
  const output: ConversationImageTextOverlayBlock[] = []
  for (const block of response.blocks) {
    if (!blockNeedsTranslation(block, target)) continue
    const text = translation.texts[block.id]?.trim()
    if (!text || comparableText(text) === comparableText(block.text)) continue
    output.push({ block, text })
  }
  return output
}

/** True while the client should keep polling. */
export function isConversationImageTextPending(response: ConversationImageTextResponse | null | undefined): boolean {
  if (!response) return false
  if (response.status === 'pending') return true
  return response.status === 'ready' && response.translations.some(entry => entry.status === 'pending')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isUsableText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= CONVERSATION_IMAGE_TEXT_MAX_PARSED_CHARS
}

function parseBox(value: unknown): ConversationImageTextBox | null {
  if (!Array.isArray(value) || value.length !== 4) return null
  if (!value.every(entry => typeof entry === 'number' && Number.isFinite(entry))) return null
  const [x0, y0, x1, y1] = (value as number[]).map(entry => clamp(entry, 0, 1))
  if (x1 <= x0 || y1 <= y0) return null
  return [x0, y0, x1, y1]
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i

function parseStyle(value: unknown): ConversationImageTextStyle | undefined {
  if (!isRecord(value)) return undefined
  const style: ConversationImageTextStyle = {}
  if (typeof value.background === 'string' && HEX_COLOR_PATTERN.test(value.background)) style.background = value.background.toLowerCase()
  if (typeof value.color === 'string' && HEX_COLOR_PATTERN.test(value.color)) style.color = value.color.toLowerCase()
  if (typeof value.bold === 'boolean') style.bold = value.bold
  return Object.keys(style).length ? style : undefined
}

function parseBlock(value: unknown): ConversationImageTextBlock | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || !CONVERSATION_IMAGE_TEXT_BLOCK_ID_PATTERN.test(value.id)) return null
  if (!isUsableText(value.text)) return null
  const box = parseBox(value.box)
  if (!box) return null
  const text = value.text
  const sourceLanguage = typeof value.sourceLanguage === 'string' ? normalizeImageTextLanguage(value.sourceLanguage, text) : null
  const angle = typeof value.angle === 'number' && Number.isFinite(value.angle) ? clamp(value.angle, -90, 90) : 0
  const lines = typeof value.lines === 'number' && Number.isFinite(value.lines) ? clamp(Math.round(value.lines), 1, 50) : 1
  const style = parseStyle(value.style)
  return {
    id: value.id,
    box,
    text,
    sourceLanguage,
    angle,
    lines,
    ...(value.vertical === true ? { vertical: true } : {}),
    ...(style ? { style } : {}),
  }
}

function parseTranslation(value: unknown, blockIds: ReadonlySet<string>): ConversationImageTextTranslation | null {
  if (!isRecord(value)) return null
  const language = typeof value.language === 'string' ? normalizeImageTextLanguage(value.language) : null
  if (!language || !isOneOf(CONVERSATION_IMAGE_TEXT_TRANSLATION_STATUSES, value.status)) return null
  const texts: Record<string, string> = {}
  if (isRecord(value.texts)) {
    for (const [id, text] of Object.entries(value.texts)) {
      if (blockIds.has(id) && isUsableText(text)) texts[id] = text
    }
  }
  return { language, status: value.status, texts }
}

/**
 * Validates an untrusted API body. Returns null when the envelope is unusable;
 * malformed blocks or translations inside a usable envelope are dropped.
 */
export function parseConversationImageTextResponse(value: unknown): ConversationImageTextResponse | null {
  if (!isRecord(value) || !isOneOf(CONVERSATION_IMAGE_TEXT_STATUSES, value.status)) return null
  const status = value.status
  const blocks: ConversationImageTextBlock[] = []
  const translations: ConversationImageTextTranslation[] = []
  if (status === 'ready') {
    if (!Array.isArray(value.blocks)) return null
    const ids = new Set<string>()
    for (const raw of value.blocks.slice(0, CONVERSATION_IMAGE_TEXT_MAX_BLOCKS)) {
      const block = parseBlock(raw)
      if (!block || ids.has(block.id)) continue
      ids.add(block.id)
      blocks.push(block)
    }
    if (Array.isArray(value.translations)) {
      for (const raw of value.translations.slice(0, CONVERSATION_IMAGE_TEXT_MAX_LANGUAGES)) {
        const translation = parseTranslation(raw, ids)
        if (translation && !translations.some(entry => entry.language === translation.language)) translations.push(translation)
      }
    }
  }
  const retryAfterMs = typeof value.retryAfterMs === 'number' && Number.isFinite(value.retryAfterMs) && value.retryAfterMs > 0
    ? Math.min(Math.round(value.retryAfterMs), 10_000)
    : undefined
  return { status, blocks, translations, ...(retryAfterMs ? { retryAfterMs } : {}) }
}
