'use client'

import type { Utterance } from './ChatBubble'
import { canonicalizeTranslationLanguageCode } from '@/lib/translation-languages'
import { readConversationMutationRecords } from '../conversation-mutation-queue'

const STORAGE_KEY = 'mingle:message-finalization:v1'
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 30_000
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
export type FinalizationResult = {
  translations: Record<string, string>
  sourceLanguage?: string
  sourceLanguagesMixed?: boolean
  sourceTextHasForeignScript?: boolean
  provider?: string
  infrastructureProvider?: string
  model?: string
  translationPromptTokens?: number
  translationCompletionTokens?: number
  translationTotalTokens?: number
}
export type DurableFinalization = {
  id: string
  ownerIdentity: string
  apiNamespace: string
  trackingUserId: string
  conversationId: string
  storageNamespace: string
  eventBody: Record<string, unknown>
  translationBody: Record<string, unknown> | null
  utterance: Utterance
  sourceDelivered: boolean
  result: FinalizationResult | null
  createdAt: number
  nextAttemptAt: number
  attemptCount: number
}
type Update = { record: DurableFinalization; result: FinalizationResult | null; retrying: boolean }
type FinalizationOwner = { consumers: number; generation: number }
type FinalizationRun = { owner: FinalizationOwner; generation: number }
const records = new Map<string, DurableFinalization>()
const active = new Map<string, { record: DurableFinalization; run: FinalizationRun; promise: Promise<FinalizationResult | null>; controller: AbortController }>()
const flushes = new Map<string, { run: FinalizationRun; promise: Promise<void> }>()
const owners = new Map<string, FinalizationOwner>()
const listeners = new Set<(update: Update) => void>()
let loaded = false

function ownerKey(ownerIdentity: string, apiNamespace: string): string {
  return `${ownerIdentity}\u001f${apiNamespace}`
}

function currentRun(key: string, run: FinalizationRun): boolean {
  return owners.get(key) === run.owner && run.owner.generation === run.generation
}

function storage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

function persist(): void {
  const target = storage()
  if (!target) return
  try {
    if (records.size) target.setItem(STORAGE_KEY, JSON.stringify([...records.values()]))
    else target.removeItem(STORAGE_KEY)
  } catch {
    // Keep the live job in memory if browser storage is unavailable.
  }
}

function load(): void {
  if (loaded) return
  loaded = true
  try {
    const values: unknown = JSON.parse(storage()?.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(values)) return
    for (const value of values) {
      const r = value as DurableFinalization
      if (!r || typeof r.id !== 'string' || typeof r.ownerIdentity !== 'string'
        || typeof r.apiNamespace !== 'string' || !/^(?:(?:ios|android)\/v[\d.]+)?$/.test(r.apiNamespace)
        || typeof r.trackingUserId !== 'string' || typeof r.conversationId !== 'string'
        || typeof r.storageNamespace !== 'string' || !r.eventBody || typeof r.eventBody !== 'object'
        || typeof r.eventBody.sessionKey !== 'string' || typeof r.eventBody.clientMessageId !== 'string'
        || !r.utterance || typeof r.utterance.originalText !== 'string' || typeof r.utterance.id !== 'string'
        || typeof r.sourceDelivered !== 'boolean' || !Number.isFinite(r.nextAttemptAt) || !Number.isFinite(r.attemptCount)
        || (r.translationBody !== null && (!r.translationBody || typeof r.translationBody !== 'object' || Array.isArray(r.translationBody)))
        || !Number.isFinite(r.createdAt) || Date.now() - r.createdAt > MAX_AGE_MS) continue
      if (r.result && r.translationBody) {
        try { r.result = parseFinalizationResult(r.result, r.translationBody) } catch { r.result = null }
      }
      records.set(r.id, r)
    }
  } catch { /* Ignore malformed storage. */ }
}

function apiPath(record: DurableFinalization, path: string): string {
  return `/api/${record.apiNamespace ? `${record.apiNamespace}/` : ''}${path}`
}

function pendingRemoval(record: DurableFinalization): boolean {
  return readConversationMutationRecords({
    apiNamespace: record.apiNamespace,
    authenticatedUserId: record.ownerIdentity.startsWith('user:') ? record.ownerIdentity.slice(5) : null,
    externalUserId: record.trackingUserId,
  }).some(r => r.conversationId === record.conversationId && r.kind === 'remove')
}

function current(record: DurableFinalization): boolean {
  return records.get(record.id) === record && !pendingRemoval(record)
}

// Persist the original synchronously; the hook's normal debounced cache write
// must not be the only copy of a message that the composer has already cleared.
function persistUtterance(record: DurableFinalization, retrying = false): void {
  const target = storage()
  if (!target) return
  const result = record.result
  const next: Utterance = {
    ...record.utterance,
    ...(result ? {
      originalLang: result.sourceLanguage || record.utterance.originalLang,
      translations: { ...record.utterance.translations, ...result.translations },
      translationFinalized: { ...record.utterance.translationFinalized, ...Object.fromEntries(Object.keys(result.translations).map(k => [k, true])) },
      sourceLanguagesMixed: result.sourceLanguagesMixed,
      sourceTextHasForeignScript: result.sourceTextHasForeignScript,
    } : {}),
    translationStatus: result || !record.translationBody ? undefined : retrying ? 'retrying' : 'pending',
  }
  record.utterance = next
  const key = `mingle_demo_utterances${record.storageNamespace ? `__${record.storageNamespace}` : ''}`
  try {
    const value = JSON.parse(target.getItem(key) || '[]')
    const items: Utterance[] = Array.isArray(value) ? value : []
    const index = items.findIndex(u => u.id === next.id)
    if (index < 0) items.push(next)
    else items[index] = { ...items[index], ...next }
    target.setItem(key, JSON.stringify(record.conversationId ? items.slice(-100) : items))
  } catch { /* The durable job still contains the complete original. */ }
}

function notify(record: DurableFinalization, retrying = false): void {
  persistUtterance(record, retrying)
  for (const listener of listeners) {
    try { listener({ record, result: record.result, retrying }) } catch { /* A view cannot interrupt durable delivery. */ }
  }
}

export function subscribeDurableFinalizations(listener: (update: Update) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function readDurableFinalizations(ownerIdentity: string, apiNamespace: string): DurableFinalization[] {
  load()
  return [...records.values()].filter(r => r.ownerIdentity === ownerIdentity && r.apiNamespace === apiNamespace)
}

export function restoreDurableFinalizationCache(ownerIdentity: string, apiNamespace: string): void {
  for (const record of readDurableFinalizations(ownerIdentity, apiNamespace)) {
    if (current(record)) persistUtterance(record, record.attemptCount > 0)
  }
}

export function cancelActiveDurableFinalizations(ownerIdentity: string, apiNamespace: string): void {
  const key = ownerKey(ownerIdentity, apiNamespace)
  const owner = owners.get(key)
  // Invalidate continuations as well as active requests. Otherwise an aborted
  // worker (or a deferred replacement) can start the next message in its batch.
  if (owner) owner.generation += 1
  flushes.delete(key)
  for (const delivery of active.values()) {
    if (delivery.record.ownerIdentity === ownerIdentity && delivery.record.apiNamespace === apiNamespace) {
      delivery.controller.abort()
    }
  }
}

export function retainDurableFinalizationOwner(ownerIdentity: string, apiNamespace: string): () => void {
  const key = ownerKey(ownerIdentity, apiNamespace)
  const owner = owners.get(key) ?? { consumers: 0, generation: 0 }
  owner.consumers += 1
  owners.set(key, owner)
  let released = false
  return () => {
    if (released) return
    released = true
    owner.consumers -= 1
    if (owner.consumers === 0 && owners.get(key) === owner) {
      owners.delete(key)
      cancelActiveDurableFinalizations(ownerIdentity, apiNamespace)
    }
  }
}

export function enqueueDurableFinalization(input: Omit<DurableFinalization,
  'id' | 'sourceDelivered' | 'result' | 'createdAt' | 'nextAttemptAt' | 'attemptCount'>): DurableFinalization {
  load()
  const id = [input.ownerIdentity, input.apiNamespace, input.eventBody.sessionKey, input.utterance.id].join('\u001f')
  const existing = records.get(id)
  if (existing && existing.utterance.originalText === input.utterance.originalText
    && JSON.stringify(existing.translationBody) === JSON.stringify(input.translationBody)) return existing
  active.get(id)?.controller.abort()
  const record: DurableFinalization = {
    ...input, id, sourceDelivered: false, result: null,
    createdAt: existing?.createdAt ?? Date.now(), nextAttemptAt: 0, attemptCount: 0,
  }
  records.set(id, record)
  // One record contains BOTH source delivery and translation intent. A restart
  // between the following writes can reconstruct either missing cache state.
  persist()
  notify(record)
  return record
}

export function discardDurableFinalizations(ownerIdentity: string, apiNamespace: string, conversationId: string): void {
  for (const r of readDurableFinalizations(ownerIdentity, apiNamespace)) {
    if (r.conversationId !== conversationId) continue
    records.delete(r.id)
    active.get(r.id)?.controller.abort()
  }
  persist()
}

export async function adoptDurableFinalizations(fromOwner: string, toOwner: string, apiNamespace: string): Promise<void> {
  if (fromOwner === toOwner) return
  const jobs = readDurableFinalizations(fromOwner, apiNamespace)
  cancelActiveDurableFinalizations(fromOwner, apiNamespace)
  await Promise.all(jobs.map(r => active.get(r.id)?.promise.catch(() => null)))
  for (const r of jobs) {
    if (records.get(r.id) !== r) continue
    records.delete(r.id)
    const id = [toOwner, apiNamespace, r.eventBody.sessionKey, r.utterance.id].join('\u001f')
    if (!records.has(id)) records.set(id, { ...r, id, ownerIdentity: toOwner, nextAttemptAt: 0 })
  }
  persist()
}

export function parseFinalizationResult(value: unknown, request: Record<string, unknown>): FinalizationResult {
  if (!value || typeof value !== 'object') throw new Error('invalid_translation_response')
  const data = value as FinalizationResult
  if (!data.translations || typeof data.translations !== 'object' || Array.isArray(data.translations)) throw new Error('missing_translations')
  const translations = Object.fromEntries(Object.entries(data.translations).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && !!entry[1].trim()))
  const sourceLanguage = typeof data.sourceLanguage === 'string' ? data.sourceLanguage : String(request.sourceLanguage || '')
  const sourceKey = canonicalizeTranslationLanguageCode(sourceLanguage)
  const keys = new Set(Object.keys(translations).map(canonicalizeTranslationLanguageCode))
  const targets = Array.isArray(request.targetLanguages) ? request.targetLanguages.filter((s): s is string => typeof s === 'string') : []
  if (!targets.length || targets.some(t => canonicalizeTranslationLanguageCode(t) !== sourceKey && !keys.has(canonicalizeTranslationLanguageCode(t)))) {
    throw new Error('incomplete_translations')
  }
  return {
    translations, sourceLanguage,
    sourceLanguagesMixed: data.sourceLanguagesMixed === true,
    sourceTextHasForeignScript: data.sourceTextHasForeignScript === true,
    ...Object.fromEntries(['provider', 'infrastructureProvider', 'model'].flatMap(key => {
      const val = (value as Record<string, unknown>)[key]
      return typeof val === 'string' ? [[key, val]] : []
    })),
    ...Object.fromEntries(['translationPromptTokens', 'translationCompletionTokens', 'translationTotalTokens'].flatMap(key => {
      const val = (value as Record<string, unknown>)[key]
      return typeof val === 'number' && Number.isFinite(val) && val >= 0 ? [[key, Math.floor(val)]] : []
    })),
  }
}

async function post(record: DurableFinalization, path: string, body: Record<string, unknown>, fetchImpl: FetchLike, signal: AbortSignal, canSend: () => boolean): Promise<unknown> {
  const controller = new AbortController()
  let rejectTimeout: (error: Error) => void = () => {}
  const abort = () => { controller.abort(); rejectTimeout(new Error('finalization_aborted')) }
  const timeout = new Promise<never>((_, reject) => { rejectTimeout = reject })
  const timer = setTimeout(() => { controller.abort(); rejectTimeout(new Error('finalization_timeout')) }, REQUEST_TIMEOUT_MS)
  signal.addEventListener('abort', abort, { once: true })
  try {
    if (signal.aborted || !canSend()) throw new Error('finalization_aborted')
    return await Promise.race([fetchImpl(apiPath(record, path), {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-mingle-user-id': record.trackingUserId },
      body: JSON.stringify(body), signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error(`${path}_${response.status}`)
      return path === 'translate/finalize' ? response.json() : null
    }), timeout])
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}

export function deliverDurableFinalization(record: DurableFinalization, fetchImpl?: FetchLike): Promise<FinalizationResult | null> {
  const owner = owners.get(ownerKey(record.ownerIdentity, record.apiNamespace))
  if (!owner) return Promise.resolve(null)
  return deliverForRun(record, { owner, generation: owner.generation }, fetchImpl)
}

function deliverForRun(record: DurableFinalization, run: FinalizationRun, fetchImpl?: FetchLike): Promise<FinalizationResult | null> {
  const key = ownerKey(record.ownerIdentity, record.apiNamespace)
  if (!currentRun(key, run) || !current(record)) return Promise.resolve(null)
  const existing = active.get(record.id)
  if (existing) return existing.record === record && existing.run.owner === run.owner
    && existing.run.generation === run.generation && !existing.controller.signal.aborted ? existing.promise
    : existing.promise.then(() => deliverForRun(record, run, fetchImpl))
  const controller = new AbortController()
  const canSend = () => currentRun(key, run) && current(record) && !controller.signal.aborted
  const fetcher = fetchImpl ?? window.fetch.bind(window)
  const promise = (async () => {
    if (!canSend()) return null
    // Original delivery and translation are independent. A hung translation
    // cannot prevent the original from being acknowledged and persisted.
    await Promise.all([
      (async () => {
        if (record.sourceDelivered) return
        await post(record, 'log/client-event', {
          ...record.eventBody, translationPending: !!record.translationBody,
        }, fetcher, controller.signal, canSend)
        if (canSend()) { record.sourceDelivered = true; persist() }
      })(),
      (async () => {
        if (!record.translationBody || record.result) return
        const startedAt = Date.now()
        const response = await post(record, 'translate/finalize', record.translationBody, fetcher, controller.signal, canSend)
        const result = parseFinalizationResult(response, record.translationBody)
        if (canSend()) {
          record.result = result
          record.eventBody.totalDurationMs = Number(record.eventBody.sttDurationMs || 0) + Math.max(0, Date.now() - startedAt)
          persist(); notify(record)
        }
      })(),
    ].map(p => p.catch(() => null)))
    if (!canSend()) return null
    if (!record.sourceDelivered || (record.translationBody && !record.result)) throw new Error('finalization_incomplete')
    if (record.result) {
      await post(record, 'log/client-event', {
        ...record.eventBody, ...record.result, translationUpdate: true,
      }, fetcher, controller.signal, canSend)
    }
    if (!canSend()) return null
    records.delete(record.id); persist()
    return record.result
  })().catch(() => {
    if (canSend()) {
      record.attemptCount += 1
      record.nextAttemptAt = Date.now() + Math.min(60_000, 2_000 * 2 ** Math.min(record.attemptCount - 1, 5))
      persist()
      notify(record, true)
    }
    return null
  }).finally(() => { if (active.get(record.id)?.controller === controller) active.delete(record.id) })
  active.set(record.id, { record, run, promise, controller })
  return promise
}

export function flushDurableFinalizations(ownerIdentity: string, apiNamespace: string, force = false): Promise<void> {
  const key = ownerKey(ownerIdentity, apiNamespace)
  const owner = owners.get(key)
  if (!owner) return Promise.resolve()
  const existing = flushes.get(key)
  if (existing && currentRun(key, existing.run)) return existing.promise
  const run: FinalizationRun = { owner, generation: owner.generation }
  const flush = { run, promise: Promise.resolve() }
  const due = readDurableFinalizations(ownerIdentity, apiNamespace)
    .filter(r => (force || r.nextAttemptAt <= Date.now()) && !pendingRemoval(r)).slice(0, 20)
  let index = 0
  flushes.set(key, flush)
  flush.promise = Promise.all([0, 1].map(async () => {
    while (index < due.length && currentRun(key, run)) await deliverForRun(due[index++], run)
  })).then(() => {}).finally(() => {
    // A canceled run may finish after a new mount has already started recovery.
    if (flushes.get(key) === flush) flushes.delete(key)
  })
  return flush.promise
}
