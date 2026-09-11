import type { Utterance } from './ChatBubble'

let sequence = Date.now()
export type PreviewEvent = {
  type: 'utterance_preview'; sessionKey: string; revision: number; expiresAt: number; final: boolean; utterance: Utterance
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
    const partial = preview.utterance
    return {
      ...utterance,
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
      result.push({ ...this.applyOrder(event.utterance), speakerImage: knownSpeaker?.speakerImage ?? null })
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
