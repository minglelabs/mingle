'use client'

const CLIENT_MESSAGE_OUTBOX_STORAGE_KEY = 'mingle:client-message-outbox:v1'
const CLIENT_MESSAGE_OUTBOX_MAX_RECORDS = 500
const CLIENT_MESSAGE_OUTBOX_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const CLIENT_MESSAGE_OUTBOX_MAX_FLUSH_BATCH = 20
const CLIENT_MESSAGE_OUTBOX_RETRY_BASE_MS = 2_000
const CLIENT_MESSAGE_OUTBOX_RETRY_MAX_MS = 60_000
const CLIENT_MESSAGE_OUTBOX_ID_SEPARATOR = '\u001f'

export type ClientMessageOutboxRecord = {
  id: string
  ownerIdentity: string
  endpoint: string
  body: string
  trackingUserId: string
  createdAt: number
  updatedAt: number
  attemptCount: number
  nextAttemptAt: number
}

export type ClientMessageOutboxFlushResult = {
  delivered: number
  retained: number
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const outboxMemory = new Map<string, ClientMessageOutboxRecord>()
const activeFlushes = new Map<string, Promise<ClientMessageOutboxFlushResult>>()
let hasLoadedStoredOutbox = false

function readBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function normalizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

function normalizeRecord(value: unknown, now = Date.now()): ClientMessageOutboxRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Partial<ClientMessageOutboxRecord>
  const id = normalizeText(candidate.id, 1_024)
  const ownerIdentity = normalizeText(candidate.ownerIdentity, 512)
  const endpoint = normalizeText(candidate.endpoint, 2_048)
  const body = typeof candidate.body === 'string' ? candidate.body : ''
  const trackingUserId = normalizeText(candidate.trackingUserId, 256)
  const createdAt = Number(candidate.createdAt)
  const updatedAt = Number(candidate.updatedAt)
  const attemptCount = Number(candidate.attemptCount)
  const nextAttemptAt = Number(candidate.nextAttemptAt)

  if (
    !id
    || !ownerIdentity
    || !endpoint.startsWith('/api/')
    || !body
    || !trackingUserId
    || !Number.isFinite(createdAt)
    || createdAt <= 0
    || createdAt > now + 60_000
    || now - createdAt > CLIENT_MESSAGE_OUTBOX_MAX_AGE_MS
  ) {
    return null
  }

  return {
    id,
    ownerIdentity,
    endpoint,
    body,
    trackingUserId,
    createdAt: Math.floor(createdAt),
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? Math.floor(updatedAt) : Math.floor(createdAt),
    attemptCount: Number.isFinite(attemptCount) && attemptCount > 0 ? Math.floor(attemptCount) : 0,
    nextAttemptAt: Number.isFinite(nextAttemptAt) && nextAttemptAt > 0 ? Math.floor(nextAttemptAt) : 0,
  }
}

function persistOutbox(): void {
  const storage = readBrowserStorage()
  if (!storage) return

  const records = [...outboxMemory.values()]
    .sort((left, right) => left.createdAt - right.createdAt)
    .slice(-CLIENT_MESSAGE_OUTBOX_MAX_RECORDS)

  try {
    if (records.length === 0) {
      storage.removeItem(CLIENT_MESSAGE_OUTBOX_STORAGE_KEY)
      return
    }
    storage.setItem(CLIENT_MESSAGE_OUTBOX_STORAGE_KEY, JSON.stringify(records))
  } catch {
    // The in-memory queue remains available for the current WebView process.
  }
}

function ensureStoredOutboxLoaded(now = Date.now()): void {
  if (hasLoadedStoredOutbox) return
  hasLoadedStoredOutbox = true

  const storage = readBrowserStorage()
  if (!storage) return

  try {
    const rawValue = storage.getItem(CLIENT_MESSAGE_OUTBOX_STORAGE_KEY)
    if (!rawValue) return
    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) {
      storage.removeItem(CLIENT_MESSAGE_OUTBOX_STORAGE_KEY)
      return
    }

    for (const value of parsed) {
      const record = normalizeRecord(value, now)
      if (record) outboxMemory.set(record.id, record)
    }
    persistOutbox()
  } catch {
    // Ignore malformed or unavailable storage and start with an empty queue.
  }
}

export function buildClientMessageOutboxOwnerIdentity(input: {
  userId?: string | null
  trackingUserId: string
}): string {
  const userId = input.userId?.trim()
  if (userId) return `user:${userId}`
  return `tracking:${input.trackingUserId.trim() || 'anonymous'}`
}

export function buildClientMessageOutboxId(input: {
  ownerIdentity: string
  sessionKey: string
  clientMessageId: string
}): string {
  return [
    input.ownerIdentity.trim(),
    input.sessionKey.trim(),
    input.clientMessageId.trim(),
  ].join(CLIENT_MESSAGE_OUTBOX_ID_SEPARATOR)
}

// A restored native STT session can finalize a turn before useSession has
// exposed the authenticated user id. If that first delivery fails, move the
// tracking-scoped record to the canonical account as soon as the id arrives;
// otherwise later account-scoped flushes would never see it.
export async function adoptClientMessageOutboxRecords(input: {
  fromOwnerIdentity: string
  toOwnerIdentity: string
  now?: number
}): Promise<number> {
  const fromOwnerIdentity = input.fromOwnerIdentity.trim()
  const toOwnerIdentity = input.toOwnerIdentity.trim()
  if (!fromOwnerIdentity || !toOwnerIdentity || fromOwnerIdentity === toOwnerIdentity) return 0

  const activeSourceFlush = activeFlushes.get(fromOwnerIdentity)
  if (activeSourceFlush) {
    await activeSourceFlush.catch(() => ({ delivered: 0, retained: 0 }))
  }

  const now = input.now ?? Date.now()
  ensureStoredOutboxLoaded(now)
  const idPrefix = `${fromOwnerIdentity}${CLIENT_MESSAGE_OUTBOX_ID_SEPARATOR}`
  let adopted = 0

  for (const [recordId, record] of outboxMemory.entries()) {
    if (record.ownerIdentity !== fromOwnerIdentity || !recordId.startsWith(idPrefix)) continue

    const idSuffix = recordId.slice(idPrefix.length)
    if (!idSuffix) continue
    const nextId = `${toOwnerIdentity}${CLIENT_MESSAGE_OUTBOX_ID_SEPARATOR}${idSuffix}`
    const existing = outboxMemory.get(nextId)
    const latest = !existing || record.updatedAt >= existing.updatedAt ? record : existing

    outboxMemory.delete(recordId)
    outboxMemory.set(nextId, {
      ...latest,
      id: nextId,
      ownerIdentity: toOwnerIdentity,
      createdAt: Math.min(record.createdAt, existing?.createdAt ?? record.createdAt),
      updatedAt: now,
      nextAttemptAt: 0,
    })
    adopted += 1
  }

  if (adopted > 0) persistOutbox()
  return adopted
}

export function enqueueClientMessageOutboxRecord(input: {
  id: string
  ownerIdentity: string
  endpoint: string
  body: string
  trackingUserId: string
  now?: number
}): ClientMessageOutboxRecord {
  const now = input.now ?? Date.now()
  ensureStoredOutboxLoaded(now)
  const existing = outboxMemory.get(input.id)
  const record: ClientMessageOutboxRecord = {
    id: input.id,
    ownerIdentity: input.ownerIdentity,
    endpoint: input.endpoint,
    body: input.body,
    trackingUserId: input.trackingUserId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    attemptCount: existing?.attemptCount ?? 0,
    nextAttemptAt: 0,
  }
  outboxMemory.set(record.id, record)
  persistOutbox()
  return record
}

export function readClientMessageOutboxRecords(
  ownerIdentity: string,
  now = Date.now(),
): ClientMessageOutboxRecord[] {
  ensureStoredOutboxLoaded(now)
  let removedExpiredRecord = false
  for (const [id, value] of outboxMemory.entries()) {
    const normalized = normalizeRecord(value, now)
    if (!normalized) {
      outboxMemory.delete(id)
      removedExpiredRecord = true
    }
  }
  if (removedExpiredRecord) persistOutbox()

  return [...outboxMemory.values()]
    .filter((record) => record.ownerIdentity === ownerIdentity)
    .sort((left, right) => left.createdAt - right.createdAt)
}

function resolveRetryDelayMs(attemptCount: number): number {
  return Math.min(
    CLIENT_MESSAGE_OUTBOX_RETRY_MAX_MS,
    CLIENT_MESSAGE_OUTBOX_RETRY_BASE_MS * (2 ** Math.max(0, attemptCount - 1)),
  )
}

async function performFlush(input: {
  ownerIdentity: string
  fetchImpl: FetchLike
  force: boolean
  now: () => number
}): Promise<ClientMessageOutboxFlushResult> {
  const records = readClientMessageOutboxRecords(input.ownerIdentity, input.now())
    .filter((record) => input.force || record.nextAttemptAt <= input.now())
    .slice(0, CLIENT_MESSAGE_OUTBOX_MAX_FLUSH_BATCH)
  let delivered = 0

  for (const record of records) {
    try {
      const response = await input.fetchImpl(record.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mingle-user-id': record.trackingUserId,
        },
        body: record.body,
        keepalive: true,
      })
      if (response.ok) {
        outboxMemory.delete(record.id)
        delivered += 1
        persistOutbox()
        continue
      }
    } catch {
      // Retain the record and retry after an exponential backoff.
    }

    const attemptCount = record.attemptCount + 1
    outboxMemory.set(record.id, {
      ...record,
      attemptCount,
      updatedAt: input.now(),
      nextAttemptAt: input.now() + resolveRetryDelayMs(attemptCount),
    })
    persistOutbox()
  }

  return {
    delivered,
    retained: readClientMessageOutboxRecords(input.ownerIdentity, input.now()).length,
  }
}

export function flushClientMessageOutbox(input: {
  ownerIdentity: string
  fetchImpl?: FetchLike
  force?: boolean
  now?: () => number
}): Promise<ClientMessageOutboxFlushResult> {
  const ownerIdentity = input.ownerIdentity.trim()
  if (!ownerIdentity || typeof window === 'undefined') {
    return Promise.resolve({ delivered: 0, retained: 0 })
  }

  const activeFlush = activeFlushes.get(ownerIdentity)
  if (activeFlush) return activeFlush

  const flushPromise = performFlush({
    ownerIdentity,
    fetchImpl: input.fetchImpl ?? window.fetch.bind(window),
    force: input.force === true,
    now: input.now ?? Date.now,
  }).finally(() => {
    activeFlushes.delete(ownerIdentity)
  })
  activeFlushes.set(ownerIdentity, flushPromise)
  return flushPromise
}
