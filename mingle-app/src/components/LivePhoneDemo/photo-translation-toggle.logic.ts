// Pure state rules for the photo translation pill in the full-screen viewer
// (spec §1.5 / §1.6): which room languages the viewer can switch to, what a
// tap does, what is shown by default, and where a per-photo choice is
// remembered. The component stays thin: it feeds the parsed API response in
// here and renders the result.

import {
  CONVERSATION_IMAGE_TEXT_MAX_LANGUAGES,
  languageHasTextToTranslate,
  normalizeImageTextLanguage,
  overlayBlocksFor,
  type ConversationImageTextResponse,
} from '@/lib/conversation-image-text'

/** The "Original" state: nothing is painted over the photo. */
export const PHOTO_TRANSLATION_OFF = 'off'

/** A language key (normalizeImageTextLanguage) or PHOTO_TRANSLATION_OFF. */
export type PhotoTranslationChoice = string

/** Values captured by a component instance are valid only for their photo/account key. */
export type PhotoTranslationKeyedSnapshot<T> = { key: string; value: T }

/** Resolve the current key synchronously so a prop change cannot render the previous key's state for one frame. */
export function resolvePhotoTranslationKeyedSnapshot<T>(
  snapshot: PhotoTranslationKeyedSnapshot<T> | null | undefined,
  key: string,
  read: (key: string) => T,
): T {
  return snapshot?.key === key ? snapshot.value : read(key)
}

/**
 * - ready: a translation exists and changes at least one block (eligible)
 * - pending: the photo has text to translate and the translation is still running (eligible)
 * - same: nothing to translate into this language, or the finished translation
 *   changes nothing (brand names kept as-is); shown as "Same as original"
 * - unavailable: the translation failed or was not offered for this language
 */
export type PhotoTranslationLanguageState = 'ready' | 'pending' | 'same' | 'unavailable'

export type PhotoTranslationOption = {
  language: string
  state: PhotoTranslationLanguageState
  eligible: boolean
}

export type PhotoTranslationToggle = {
  /** Every requested language in `order`, eligible or not (the long-press menu). */
  options: PhotoTranslationOption[]
  /** Eligible languages in `order`, then Off (what a tap walks through). */
  cycle: PhotoTranslationChoice[]
  /** What is shown right now. */
  choice: PhotoTranslationChoice
  /** False while the photo has no text, failed, is disabled or nothing is eligible. */
  visible: boolean
  /** The shown language is still being translated (the pill shows a spinner). */
  pending: boolean
}

/**
 * The toggle order: the viewer's default display language first, then the
 * other room languages in room order. Normalized with the contract's language
 * key (zh-CN and zh-TW stay distinct), de-duplicated, and capped at the number
 * of languages one request may carry. Without a default, the first room
 * language leads.
 */
export function buildPhotoTranslationOrder(
  roomLanguages: readonly (string | null | undefined)[],
  defaultLanguage?: string | null,
): string[] {
  const order: string[] = []
  const add = (value: string | null | undefined) => {
    const key = normalizeImageTextLanguage(value)
    if (key && !order.includes(key)) order.push(key)
  }
  add(defaultLanguage ?? roomLanguages[0])
  roomLanguages.forEach(add)
  return order.slice(0, CONVERSATION_IMAGE_TEXT_MAX_LANGUAGES)
}

export function resolvePhotoTranslationLanguageState(
  response: ConversationImageTextResponse | null | undefined,
  language: string,
): PhotoTranslationLanguageState {
  if (!response || response.status === 'pending') return 'pending'
  if (response.status !== 'ready') return 'unavailable'
  if (!languageHasTextToTranslate(response.blocks, language)) return 'same'
  const translation = response.translations.find(entry => entry.language === language)
  if (!translation || translation.status === 'failed') return 'unavailable'
  if (translation.status === 'pending') return 'pending'
  return overlayBlocksFor(response, language).length > 0 ? 'ready' : 'same'
}

/**
 * Eligibility (spec §1.5): the photo's text is known (status ready), at least
 * one block needs translation into the language, and its translation is
 * either still pending or finished with something to paint. A failed (or
 * missing) translation is not eligible.
 */
export function resolvePhotoTranslationOptions(
  order: readonly string[],
  response: ConversationImageTextResponse | null | undefined,
): PhotoTranslationOption[] {
  const known = response?.status === 'ready'
  return order.map(language => {
    const state = resolvePhotoTranslationLanguageState(response, language)
    return { language, state, eligible: known && (state === 'ready' || state === 'pending') }
  })
}

export function photoTranslationCycle(options: readonly PhotoTranslationOption[]): PhotoTranslationChoice[] {
  return [...options.filter(option => option.eligible).map(option => option.language), PHOTO_TRANSLATION_OFF]
}

/**
 * What is shown. An explicit Off stays Off. An explicit language shows while
 * it is eligible and falls back to Off once it stops being eligible. Without
 * a (still meaningful) choice the viewer default is shown when eligible, else
 * Off. A remembered language that is no longer a room language counts as no
 * choice.
 */
export function resolvePhotoTranslationChoice(
  options: readonly PhotoTranslationOption[],
  selection?: PhotoTranslationChoice | null,
): PhotoTranslationChoice {
  if (selection === PHOTO_TRANSLATION_OFF) return PHOTO_TRANSLATION_OFF
  const chosen = selection ? options.find(option => option.language === selection) : undefined
  if (chosen) return chosen.eligible ? chosen.language : PHOTO_TRANSLATION_OFF
  const viewerDefault = options[0]
  return viewerDefault?.eligible ? viewerDefault.language : PHOTO_TRANSLATION_OFF
}

/** A tap: the next entry of the cycle, wrapping after Off. */
export function nextPhotoTranslationChoice(
  cycle: readonly PhotoTranslationChoice[],
  current: PhotoTranslationChoice,
): PhotoTranslationChoice {
  if (!cycle.length) return PHOTO_TRANSLATION_OFF
  const index = cycle.indexOf(current)
  return index < 0 ? cycle[0] : cycle[(index + 1) % cycle.length]
}

export function resolvePhotoTranslationToggle({ order, response, selection }: {
  order: readonly string[]
  response: ConversationImageTextResponse | null | undefined
  selection?: PhotoTranslationChoice | null
}): PhotoTranslationToggle {
  const options = resolvePhotoTranslationOptions(order, response)
  const cycle = photoTranslationCycle(options)
  const choice = resolvePhotoTranslationChoice(options, selection)
  const visible = response?.status === 'ready' && cycle.length > 1
  const pending = choice !== PHOTO_TRANSLATION_OFF
    && options.some(option => option.language === choice && option.state === 'pending')
  return { options, cycle, choice, visible, pending }
}

/** One photo as one viewer sees it: api namespace + viewer + conversation + message. */
export function photoTranslationMemoryKey({ apiNamespace, viewerUserId, conversationId, messageId }: {
  apiNamespace: string | null | undefined
  viewerUserId: string | null | undefined
  conversationId: string
  messageId: string
}): string {
  return [apiNamespace || '-', viewerUserId || '-', conversationId, messageId].map(encodeURIComponent).join(':')
}

export const PHOTO_TRANSLATION_MEMORY_LIMIT = 500

export type PhotoTranslationMemory<T> = {
  get: (key: string) => T | undefined
  set: (key: string, value: T) => void
  readonly size: number
}

/**
 * An app-session memory (a plain Map, never persisted) that forgets the
 * least recently written entries past `limit`.
 */
export function createPhotoTranslationMemory<T>(limit = PHOTO_TRANSLATION_MEMORY_LIMIT): PhotoTranslationMemory<T> {
  const entries = new Map<string, T>()
  return {
    get: key => entries.get(key),
    set: (key, value) => {
      entries.delete(key)
      entries.set(key, value)
      while (entries.size > limit) {
        const oldest = entries.keys().next()
        if (oldest.done) break
        entries.delete(oldest.value)
      }
    },
    get size() { return entries.size },
  }
}

/**
 * The per-photo choice (spec §1.6): survives closing and reopening the viewer
 * and chat list remounts for the app session. No global Off, no localStorage.
 */
export const photoTranslationSelections = createPhotoTranslationMemory<PhotoTranslationChoice>()
