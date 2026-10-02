import type { Utterance } from './ChatBubble'
import { readAccountBadgeKind } from './chat-account-badge.logic'
import {
  canonicalizeLanguageKey,
  classifyChineseLanguage,
  listChineseVariants,
  resolveChineseVariant,
  toChineseVariant,
} from '@/lib/chinese-variant'

export type LanguageCandidates = readonly (string | null | undefined)[]

export type CanonicalizeUtteranceLanguagesOptions = {
  /** The room's current languages; they help resolve a generic `zh`. */
  roomLanguages?: LanguageCandidates | null
  /** The source text was typed, so its script is evidence for the source variant. */
  preferSourceScript?: boolean
}

function isGenericChineseKey(rawLanguage: string): boolean {
  return classifyChineseLanguage(rawLanguage) === 'zh'
}

function dedupeLanguages(languages: readonly string[]): string[] {
  const output: string[] = []
  for (const language of languages) if (language && !output.includes(language)) output.push(language)
  return output
}

function isCanonicalKey(rawLanguage: string): boolean {
  return canonicalizeLanguageKey(rawLanguage) === rawLanguage
}

// Cheap check run before the full rewrite: mergeDisplayUtterances normalizes
// every utterance on each live update, and almost all of them are canonical.
function hasCanonicalLanguages(utterance: Utterance): boolean {
  const originalLang = typeof utterance.originalLang === 'string' ? utterance.originalLang : ''
  if (classifyChineseLanguage(originalLang) && toChineseVariant(originalLang) !== originalLang) return false
  for (const [key, value] of Object.entries(utterance.translations || {})) {
    if (typeof value !== 'string' || !isCanonicalKey(key)) return false
  }
  for (const [key, value] of Object.entries(utterance.translationFinalized || {})) {
    if (typeof value !== 'boolean' || !isCanonicalKey(key)) return false
  }
  const targets = utterance.targetLanguages || []
  for (let index = 0; index < targets.length; index += 1) {
    const language = targets[index]
    if (typeof language !== 'string' || !language || !isCanonicalKey(language)) return false
    if (targets.indexOf(language) !== index) return false
  }
  return true
}

/**
 * Rewrites an utterance so every language key it carries is canonical: Chinese
 * is always zh-CN or zh-TW, never a bare `zh`. Legacy data (old DB rows,
 * localStorage, previews from old clients) may still say `zh`; it is resolved
 * against the utterance's own languages, the room's languages and the text.
 * A generic translation key never becomes a row of its own: it is folded into
 * the variant its text is written in, or dropped when that variant already has
 * text. Returns the same object when nothing changes.
 */
export function canonicalizeUtteranceLanguages(
  utterance: Utterance,
  options: CanonicalizeUtteranceLanguagesOptions = {},
): Utterance {
  if (hasCanonicalLanguages(utterance)) return utterance
  const rawTargets = (utterance.targetLanguages || []).filter((language): language is string => typeof language === 'string')
  const rawTranslations = utterance.translations || {}
  const roomLanguages = options.roomLanguages || []
  const sourceCandidates = [...rawTargets, ...roomLanguages]

  const rawOriginalLang = typeof utterance.originalLang === 'string' ? utterance.originalLang : ''
  const originalLang = classifyChineseLanguage(rawOriginalLang)
    ? resolveChineseVariant({
        language: rawOriginalLang,
        text: utterance.originalText,
        candidates: sourceCandidates,
        preferScript: options.preferSourceScript === true,
      })
    : rawOriginalLang
  const sourceVariant = toChineseVariant(originalLang)

  // Candidates for a generic translation key or target. A translation into the
  // source's own variant is rarely wanted, so the sibling wins when present.
  const keyCandidateVariants = listChineseVariants([
    ...rawTargets, ...Object.keys(rawTranslations), ...roomLanguages,
  ])
  const siblingCandidates = keyCandidateVariants.filter(variant => variant !== sourceVariant)
  const keyCandidates = siblingCandidates.length > 0 ? siblingCandidates : keyCandidateVariants

  const translations: Record<string, string> = {}
  let genericTranslationVariant: string | null = null
  let genericTranslationDropped = false
  const genericEntries: Array<[string, string]> = []
  for (const [rawKey, value] of Object.entries(rawTranslations)) {
    if (typeof value !== 'string') continue
    if (isGenericChineseKey(rawKey)) {
      genericEntries.push([rawKey, value])
      continue
    }
    const key = canonicalizeLanguageKey(rawKey)
    if (!key) continue
    // Same canonical key twice (zh-CN and zh-cn): the later value is newer.
    translations[key] = value
  }
  for (const [, value] of genericEntries) {
    let variant = resolveChineseVariant({ language: 'zh', text: value, candidates: keyCandidates, preferScript: true })
    // Never promote it into a variant nobody asked for.
    if (keyCandidates.length > 0 && !keyCandidates.includes(variant)) {
      variant = resolveChineseVariant({ language: 'zh', candidates: keyCandidates })
    }
    genericTranslationVariant = variant
    if (translations[variant]?.trim()) {
      genericTranslationDropped = true
      continue
    }
    translations[variant] = value
  }

  const resolveGenericKey = () => genericTranslationVariant
    ?? resolveChineseVariant({ language: 'zh', candidates: keyCandidates })

  const targetLanguages = dedupeLanguages(rawTargets.map(language => (
    isGenericChineseKey(language) ? resolveGenericKey() : canonicalizeLanguageKey(language)
  )))

  let translationFinalized: Record<string, boolean> | undefined
  if (utterance.translationFinalized) {
    translationFinalized = {}
    const genericFinalized: boolean[] = []
    for (const [rawKey, value] of Object.entries(utterance.translationFinalized)) {
      if (typeof value !== 'boolean') continue
      if (isGenericChineseKey(rawKey)) {
        genericFinalized.push(value)
        continue
      }
      const key = canonicalizeLanguageKey(rawKey)
      if (key) translationFinalized[key] = value
    }
    if (!genericTranslationDropped) {
      for (const value of genericFinalized) {
        const key = resolveGenericKey()
        if (!(key in translationFinalized)) translationFinalized[key] = value
      }
    }
  }

  const changed = originalLang !== utterance.originalLang
    || (utterance.targetLanguages !== undefined && JSON.stringify(targetLanguages) !== JSON.stringify(utterance.targetLanguages))
    || JSON.stringify(translations) !== JSON.stringify(rawTranslations)
    || (translationFinalized !== undefined && JSON.stringify(translationFinalized) !== JSON.stringify(utterance.translationFinalized))
  if (!changed) return utterance
  return {
    ...utterance,
    originalLang,
    ...(utterance.targetLanguages !== undefined ? { targetLanguages } : {}),
    translations,
    ...(translationFinalized !== undefined ? { translationFinalized } : {}),
  }
}

let sequence = Date.now()
export type PreviewEvent = {
  type: 'utterance_preview'; sessionKey: string; revision: number; expiresAt: number; final: boolean; utterance: Utterance
}

// Only a known badge kind survives; anything else becomes "no badge".
function sanitizeSpeakerBadge(utterance: Utterance): Utterance {
  if (utterance.speakerBadge == null) return utterance
  const speakerBadge = readAccountBadgeKind(utterance.speakerBadge)
  return speakerBadge === utterance.speakerBadge ? utterance : { ...utterance, speakerBadge }
}

// Remote previews deliberately never enter the persisted utterance store.
// A server message with the same ID replaces the preview without another row.
export class RemotePreviews {
  private records = new Map<string, PreviewEvent>()
  // Order outlives the disposable preview, including local finalization before
  // the DB acknowledgement. This cache is scoped to the account and room hook.
  private orders = new Map<string, { time: number; until: number }>()
  accept(event: PreviewEvent): boolean {
    if (!event.utterance?.id || !event.utterance.speakerUserId || !Number.isFinite(event.revision)
      || !Number.isFinite(event.expiresAt) || typeof event.utterance.originalText !== 'string') return false
    // Previews from older clients may still carry a bare `zh`.
    event = { ...event, utterance: sanitizeSpeakerBadge(canonicalizeUtteranceLanguages(event.utterance)) }
    const key = JSON.stringify([event.utterance.speakerUserId, event.utterance.id])
    const previous = this.records.get(key)
    if (previous && (previous.revision >= event.revision || (previous.final && !event.final))) return false
    if (this.records.size >= 100 && !this.records.has(key)) this.records.delete(this.records.keys().next().value!)
    this.records.set(key, event)
    const knownOrder = this.orders.get(key)
    if (knownOrder) {
      knownOrder.until = Date.now() + 30 * 60_000
    } else if (typeof event.utterance.createdAtMs === 'number' && Number.isFinite(event.utterance.createdAtMs) && event.utterance.createdAtMs > 0) {
      if (this.orders.size >= 1000) this.orders.delete(this.orders.keys().next().value!)
      this.orders.set(key, { time: event.utterance.createdAtMs, until: Date.now() + 30 * 60_000 })
    }
    return !previous || previous.final !== event.final || JSON.stringify(previous.utterance) !== JSON.stringify(event.utterance)
  }
  clear(): void { this.records.clear(); this.orders.clear() }
  orderFor(userId: string | null | undefined, id: string): number | undefined {
    return this.orders.get(JSON.stringify([userId, id]))?.time
  }
  applyOrder(utterance: Utterance): Utterance {
    const time = this.orderFor(utterance.speakerUserId, utterance.id)
    return !utterance.serverMessageId && time !== undefined && utterance.serverCreatedAtMs !== time
      ? { ...utterance, serverCreatedAtMs: time } : utterance
  }
  mergeCommitted(utterance: Utterance): Utterance {
    const preview = this.records.get(JSON.stringify([utterance.speakerUserId, utterance.id]))
    if (!preview || preview.expiresAt <= Date.now()) return utterance
    // Source persistence may beat the final translation. Keep the preview's
    // targets and interim text until the committed translation replaces them.
    const partial = canonicalizeUtteranceLanguages(preview.utterance, { roomLanguages: utterance.targetLanguages })
    // The committed payload normally carries the sender's badge itself; keep
    // the preview's (signed-token) badge when it does not.
    const previewBadge = utterance.speakerBadge ? null : readAccountBadgeKind(preview.utterance.speakerBadge)
    return {
      ...utterance,
      ...(previewBadge ? { speakerBadge: previewBadge } : {}),
      targetLanguages: [...new Set([...(partial.targetLanguages || []), ...(utterance.targetLanguages || [])])],
      translations: { ...partial.translations, ...utterance.translations },
      translationFinalized: {
        ...Object.fromEntries(Object.keys(partial.translations).map(lang => [lang, false])),
        ...Object.fromEntries(Object.keys(utterance.translations).map(lang => [lang, true])),
        ...utterance.translationFinalized,
      },
    }
  }
  expire(now = Date.now()): boolean {
    let changed = false
    for (const [key, event] of this.records) if (event.expiresAt <= now) { this.records.delete(key); changed = true }
    for (const [key, order] of this.orders) if (order.until <= now) this.orders.delete(key)
    return changed
  }
  visible(committed: readonly Utterance[], viewerUserId?: string | null, now = Date.now()): Utterance[] {
    const result: Utterance[] = []
    for (const [key, event] of this.records) {
      if (event.expiresAt <= now) { this.records.delete(key); continue }
      if (committed.some(u => u.id === event.utterance.id)) { this.records.delete(key); continue }
      if (event.utterance.speakerUserId === viewerUserId) continue
      const knownSpeaker = committed.find(u => u.speakerUserId === event.utterance.speakerUserId)
      // The badge normally rides on the frame (from the sender's signed
      // writer token); fall back to the same speaker's committed bubbles so a
      // labeled account's live bubble is never shown without its label.
      const speakerBadge = readAccountBadgeKind(event.utterance.speakerBadge)
        ?? readAccountBadgeKind(committed.find(u => (
          u.speakerUserId === event.utterance.speakerUserId && readAccountBadgeKind(u.speakerBadge)
        ))?.speakerBadge)
      result.push({
        ...this.applyOrder(event.utterance),
        speakerImage: knownSpeaker?.speakerImage ?? null,
        ...(speakerBadge ? { speakerBadge } : {}),
      })
    }
    return result
  }
}

// Latest-value coalescing: no per-token HTTP/DB requests and no backlog of old
// partials after reconnect. Final previews have priority and remain ephemeral.
export class LivePreviewSender {
  private records = new Map<string, { utterance: Utterance; final: boolean; lastSent: number; until: number }>()
  private lastPartialIds = new Set<string>()
  clear(): void { this.records.clear(); this.lastPartialIds.clear() }
  setPartials(utterances: readonly Utterance[]): void {
    const ids = new Set(utterances.map(u => u.id))
    for (const id of this.lastPartialIds) if (!ids.has(id) && !this.records.get(id)?.final) this.records.delete(id)
    this.lastPartialIds = ids
    for (const utterance of utterances) if (!this.records.get(utterance.id)?.final) this.update(utterance, false)
  }
  update(utterance: Utterance, final: boolean): void {
    if (!utterance.originalText.trim()) return
    const previous = this.records.get(utterance.id)
    if (previous?.final && !final) return
    if (previous?.final === final && JSON.stringify(previous.utterance) === JSON.stringify(utterance)) return
    if (this.records.size >= 100 && !previous) this.records.delete(this.records.keys().next().value!)
    this.records.set(utterance.id, { utterance, final, lastSent: 0, until: Date.now() + (final ? 120_000 : 30 * 60_000) })
  }
  committed(id: string): void { this.records.delete(id) }
  flush(send: (frame: Record<string, unknown>) => boolean, now = Date.now()): void {
    for (const [id, item] of this.records) if (item.until <= now) this.records.delete(id)
    const pending = [...this.records.values()].sort((a, b) => a.lastSent - b.lastSent)
    for (const item of pending) {
      if (now - item.lastSent < 1000) continue
      sequence = Math.max(sequence + 1, Date.now())
      if (send({ type: 'utterance_preview', id: item.utterance.id, originalText: item.utterance.originalText,
        originalLang: item.utterance.originalLang, translations: item.utterance.translations,
        targetLanguages: item.utterance.targetLanguages,
        sequence, final: item.final })) item.lastSent = now
      // At most four frames/second per room hook, even with many speakers.
      break
    }
  }
}
