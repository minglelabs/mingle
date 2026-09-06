"use client";

import type { ConversationChannelSummary } from "@/lib/app-conversations";
import { compatiblePendingWorkNamespaces } from "@/lib/pending-work-api-namespace";
import { EXPECTED_ACCOUNT_HEADER } from "@/lib/request-account-guard";

const CONVERSATION_MUTATION_QUEUE_KEY_PREFIX = "mingle:conversation-mutation-queue:v1";
const CONVERSATION_MUTATION_MAX_RECORDS = 200;
const CONVERSATION_MUTATION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const CONVERSATION_MUTATION_MAX_FLUSH_BATCH = 50;
const CONVERSATION_MUTATION_RETRY_BASE_MS = 2_000;
const CONVERSATION_MUTATION_RETRY_MAX_MS = 60_000;

export type ConversationMutationKind =
  | "status"
  | "selected-languages"
  | "speech-languages"
  | "translation-languages-linked"
  | "default-display-language"
  | "title"
  | "mark-read"
  | "remove"
  | "profile-default-languages";

export type ConversationMutationPatch = Partial<Pick<
  ConversationChannelSummary,
  | "title"
  | "status"
  | "selectedLanguages"
  | "selectedLanguagesAttribution"
  | "viewerSelectedLanguages"
  | "speechLanguages"
  | "translationLanguagesLinked"
  | "defaultDisplayLanguage"
  | "unreadMessageCount"
  | "pausedAt"
>> & {
  defaultConversationLanguages?: string[];
  removed?: boolean;
};

export type ConversationMutationRecord = {
  id: string;
  ownerIdentity: string;
  apiNamespace: string;
  conversationId: string;
  kind: ConversationMutationKind;
  endpoint: string;
  method: "PATCH" | "DELETE" | "POST";
  body: string;
  patch: ConversationMutationPatch;
  rollback: ConversationMutationPatch | null;
  createdAt: number;
  updatedAt: number;
  attemptCount: number;
  nextAttemptAt: number;
};

export type ConversationMutationQueueIdentity = {
  apiNamespace: string;
  authenticatedUserId?: string | null;
  externalUserId?: string | null;
};

export type ConversationMutationFlushResult = {
  delivered: number;
  retained: number;
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const conversationMutationMemory = new Map<string, ConversationMutationRecord>();
const activeFlushes = new Map<string, { promise: Promise<ConversationMutationFlushResult>; signal?: AbortSignal }>();
const loadedMutationStorageKeys = new Set<string>();
let lastMutationTimestamp = 0;

function readBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function normalizePatch(value: unknown): ConversationMutationPatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const candidate = value as Record<string, unknown>;
  const patch: ConversationMutationPatch = {};

  if (typeof candidate.title === "string") patch.title = candidate.title.slice(0, 500);
  if (candidate.status === "active" || candidate.status === "paused") patch.status = candidate.status;
  // This is the shared room union, not one member's five-language selection.
  if (isStringArray(candidate.selectedLanguages)) patch.selectedLanguages = [...candidate.selectedLanguages];
  if (candidate.selectedLanguagesAttribution && typeof candidate.selectedLanguagesAttribution === "object" && !Array.isArray(candidate.selectedLanguagesAttribution)) {
    const attribution: Record<string, string[]> = {};
    for (const [language, memberIds] of Object.entries(candidate.selectedLanguagesAttribution)) {
      if (!isStringArray(memberIds)) continue;
      attribution[language] = memberIds.slice(0, 10);
    }
    patch.selectedLanguagesAttribution = attribution;
  }
  if (isStringArray(candidate.viewerSelectedLanguages)) {
    patch.viewerSelectedLanguages = candidate.viewerSelectedLanguages.slice(0, 5);
  }
  if (isStringArray(candidate.speechLanguages)) patch.speechLanguages = candidate.speechLanguages.slice(0, 5);
  if (typeof candidate.translationLanguagesLinked === "boolean") {
    patch.translationLanguagesLinked = candidate.translationLanguagesLinked;
  }
  if (candidate.defaultDisplayLanguage === null || typeof candidate.defaultDisplayLanguage === "string") {
    patch.defaultDisplayLanguage = candidate.defaultDisplayLanguage;
  }
  if (candidate.unreadMessageCount === null || (
    typeof candidate.unreadMessageCount === "number"
    && Number.isFinite(candidate.unreadMessageCount)
  )) {
    patch.unreadMessageCount = candidate.unreadMessageCount === null
      ? undefined
      : Math.max(0, Math.floor(candidate.unreadMessageCount));
  }
  if (candidate.pausedAt === null || typeof candidate.pausedAt === "string") {
    patch.pausedAt = candidate.pausedAt;
  }
  if (isStringArray(candidate.defaultConversationLanguages)) {
    patch.defaultConversationLanguages = candidate.defaultConversationLanguages.slice(0, 5);
  }
  if (candidate.removed === true) patch.removed = true;

  return patch;
}

function normalizeRecord(value: unknown, now = Date.now()): ConversationMutationRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<ConversationMutationRecord>;
  const id = normalizeText(candidate.id, 1_024);
  const ownerIdentity = normalizeText(candidate.ownerIdentity, 512);
  const conversationId = normalizeText(candidate.conversationId, 256);
  const endpoint = normalizeText(candidate.endpoint, 2_048);
  const method = candidate.method === "DELETE" || candidate.method === "POST"
    ? candidate.method
    : candidate.method === "PATCH" ? "PATCH" : null;
  const kind = candidate.kind;
  const body = typeof candidate.body === "string" ? candidate.body : "";
  const createdAt = Number(candidate.createdAt);
  const updatedAt = Number(candidate.updatedAt);
  const attemptCount = Number(candidate.attemptCount);
  const nextAttemptAt = Number(candidate.nextAttemptAt);

  if (
    !id
    || !ownerIdentity
    || !conversationId
    || !endpoint.startsWith("/api/")
    || !method
    || !body
    || (
      kind !== "status"
      && kind !== "selected-languages"
      && kind !== "speech-languages"
      && kind !== "translation-languages-linked"
      && kind !== "default-display-language"
      && kind !== "title"
      && kind !== "mark-read"
      && kind !== "remove"
      && kind !== "profile-default-languages"
    )
    || !Number.isFinite(createdAt)
    || createdAt <= 0
    || createdAt > now + 60_000
    || now - createdAt > CONVERSATION_MUTATION_MAX_AGE_MS
  ) {
    return null;
  }

  return {
    id,
    ownerIdentity,
    apiNamespace: typeof candidate.apiNamespace === "string" ? candidate.apiNamespace : "",
    conversationId,
    kind,
    endpoint,
    method,
    body,
    patch: normalizePatch(candidate.patch),
    rollback: candidate.rollback ? normalizePatch(candidate.rollback) : null,
    createdAt: Math.floor(createdAt),
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0
      ? Math.floor(updatedAt)
      : Math.floor(createdAt),
    attemptCount: Number.isFinite(attemptCount) && attemptCount > 0
      ? Math.floor(attemptCount)
      : 0,
    nextAttemptAt: Number.isFinite(nextAttemptAt) && nextAttemptAt > 0
      ? Math.floor(nextAttemptAt)
      : 0,
  };
}

function buildStorageKey(identity: ConversationMutationQueueIdentity): string {
  const namespace = identity.apiNamespace.trim() || "default";
  const userId = identity.authenticatedUserId?.trim();
  const externalUserId = identity.externalUserId?.trim();
  const owner = userId
    ? `user:${userId}`
    : `tracking:${externalUserId || "anonymous"}`;
  return `${CONVERSATION_MUTATION_QUEUE_KEY_PREFIX}:${encodeURIComponent(namespace)}:${encodeURIComponent(owner)}`;
}

export function buildConversationMutationOwnerIdentity(
  identity: ConversationMutationQueueIdentity,
): string {
  const userId = identity.authenticatedUserId?.trim();
  if (userId) return `user:${userId}`;
  return `tracking:${identity.externalUserId?.trim() || "anonymous"}`;
}

function buildMutationId(input: {
  ownerIdentity: string;
  apiNamespace: string;
  conversationId: string;
  kind: ConversationMutationKind;
}): string {
  return [input.ownerIdentity.trim(), input.apiNamespace, input.conversationId.trim(), input.kind].join("\u001f");
}

function persistMutations(identity: ConversationMutationQueueIdentity): boolean {
  const storageKey = buildStorageKey(identity);
  const ownerIdentity = buildConversationMutationOwnerIdentity(identity);
  const records = [...conversationMutationMemory.values()]
    .filter((record) => record.ownerIdentity === ownerIdentity && record.apiNamespace === identity.apiNamespace)
    .sort((left, right) => left.createdAt - right.createdAt)
    .slice(-CONVERSATION_MUTATION_MAX_RECORDS);

  // Keep the in-memory queue bounded too. Without this, a long-lived WebView
  // could retain every historical mutation even though localStorage only kept
  // the last 200 records.
  const retainedIds = new Set(records.map((record) => record.id));
  for (const [recordId, record] of conversationMutationMemory.entries()) {
    if (record.ownerIdentity === ownerIdentity && record.apiNamespace === identity.apiNamespace && !retainedIds.has(recordId)) {
      conversationMutationMemory.delete(recordId);
    }
  }

  const storage = readBrowserStorage();
  if (!storage) return false;

  try {
    if (records.length === 0) {
      storage.removeItem(storageKey);
      return true;
    }
    storage.setItem(storageKey, JSON.stringify(records));
    return true;
  } catch {
    // The in-memory queue remains available for the current WebView process.
    return false;
  }
}

function ensureStoredMutationsLoaded(identity: ConversationMutationQueueIdentity, now = Date.now()): void {
  const storageKey = buildStorageKey(identity);
  if (loadedMutationStorageKeys.has(storageKey)) return;
  loadedMutationStorageKeys.add(storageKey);

  const storage = readBrowserStorage();
  if (!storage) return;

  try {
    const ownerIdentity = buildConversationMutationOwnerIdentity(identity);
    const namespaces = identity.authenticatedUserId
      ? compatiblePendingWorkNamespaces(identity.apiNamespace) : [identity.apiNamespace];
    const oldKeys: string[] = [];
    for (const namespace of namespaces) {
      const sourceKey = buildStorageKey({ ...identity, apiNamespace: namespace });
      const rawValue = storage.getItem(sourceKey);
      if (!rawValue) continue;
      let parsed: unknown;
      try { parsed = JSON.parse(rawValue); } catch { continue; }
      if (!Array.isArray(parsed)) continue;
      for (const value of parsed) {
        const record = normalizeRecord(value, now);
        if (!record || record.ownerIdentity !== ownerIdentity) continue;
        // Only replace the API prefix, never a room ID, payload or tracking ID.
        const prefix = `/api/${namespace ? `${namespace}/` : ""}`;
        if (!record.endpoint.startsWith(prefix) && /^\/api\/(ios|android)\//.test(record.endpoint)) continue;
        const endpoint = record.endpoint.startsWith(prefix)
          ? `/api/${identity.apiNamespace ? `${identity.apiNamespace}/` : ""}${record.endpoint.slice(prefix.length)}`
          : record.endpoint;
        const id = buildMutationId({ ...record, apiNamespace: identity.apiNamespace });
        const existing = conversationMutationMemory.get(id);
        if (!existing || record.updatedAt > existing.updatedAt) {
          conversationMutationMemory.set(id, { ...record, id, endpoint, apiNamespace: identity.apiNamespace });
        }
        lastMutationTimestamp = Math.max(lastMutationTimestamp, record.updatedAt);
      }
      if (sourceKey !== storageKey) oldKeys.push(sourceKey);
    }
    // Persist the destination before removing any previous-version journal.
    if (persistMutations(identity)) {
      oldKeys.forEach(key => storage.removeItem(key));
      for (const [id, record] of conversationMutationMemory) {
        if (record.ownerIdentity === ownerIdentity && record.apiNamespace !== identity.apiNamespace
          && namespaces.includes(record.apiNamespace)) conversationMutationMemory.delete(id);
      }
    }
  } catch {
    // Ignore malformed or unavailable storage and start with an empty queue.
  }
}

export function readConversationMutationRecords(
  identity: ConversationMutationQueueIdentity,
  now = Date.now(),
): ConversationMutationRecord[] {
  ensureStoredMutationsLoaded(identity, now);
  const ownerIdentity = buildConversationMutationOwnerIdentity(identity);
  let removedExpiredRecord = false;
  for (const [id, value] of conversationMutationMemory.entries()) {
    const normalized = normalizeRecord(value, now);
    if (!normalized) {
      conversationMutationMemory.delete(id);
      removedExpiredRecord = true;
    }
  }
  if (removedExpiredRecord) persistMutations(identity);

  return [...conversationMutationMemory.values()]
    .filter((record) => record.ownerIdentity === ownerIdentity && record.apiNamespace === identity.apiNamespace)
    .sort((left, right) => left.createdAt - right.createdAt || left.updatedAt - right.updatedAt);
}

export function enqueueConversationMutation(
  identity: ConversationMutationQueueIdentity,
  input: {
    conversationId: string;
    kind: ConversationMutationKind;
    endpoint: string;
    method?: "PATCH" | "DELETE" | "POST";
    body: Record<string, unknown>;
    patch: ConversationMutationPatch;
    rollback?: ConversationMutationPatch | null;
    now?: number;
  },
): ConversationMutationRecord {
  const ownerIdentity = buildConversationMutationOwnerIdentity(identity);
  const conversationId = input.conversationId.trim();
  const id = buildMutationId({ ownerIdentity, apiNamespace: identity.apiNamespace, conversationId, kind: input.kind });
  const now = input.now ?? Date.now();
  ensureStoredMutationsLoaded(identity, now);
  const existing = conversationMutationMemory.get(id);
  const updatedAt = Math.max(now, existing?.updatedAt ?? 0, lastMutationTimestamp + 1);
  lastMutationTimestamp = updatedAt;
  const record: ConversationMutationRecord = {
    id,
    ownerIdentity,
    apiNamespace: identity.apiNamespace,
    conversationId,
    kind: input.kind,
    endpoint: input.endpoint,
    method: input.method ?? "PATCH",
    body: JSON.stringify(input.body),
    patch: normalizePatch(input.patch),
    // A coalesced edit must roll back to the value that existed before the
    // first pending edit, not to the previous optimistic intermediate value.
    rollback: existing?.rollback ?? (input.rollback ? normalizePatch(input.rollback) : null),
    // A coalesced edit is the latest user action, including relative to
    // other kinds that affect the same field (selected languages/linking).
    createdAt: updatedAt,
    updatedAt,
    attemptCount: 0,
    nextAttemptAt: 0,
  };
  conversationMutationMemory.set(id, record);
  persistMutations(identity);
  return record;
}

export function acknowledgeConversationMutation(
  identity: ConversationMutationQueueIdentity,
  record: ConversationMutationRecord,
): boolean {
  ensureStoredMutationsLoaded(identity);
  const current = conversationMutationMemory.get(record.id);
  if (!current || current.updatedAt !== record.updatedAt || current.body !== record.body) {
    return false;
  }
  conversationMutationMemory.delete(record.id);
  if (record.kind === "remove") {
    for (const [id, pending] of conversationMutationMemory) {
      if (pending.ownerIdentity === record.ownerIdentity && pending.apiNamespace === record.apiNamespace && pending.conversationId === record.conversationId) {
        conversationMutationMemory.delete(id);
      }
    }
  }
  persistMutations(identity);
  return true;
}

export function adoptConversationMutationRecords(input: {
  from: ConversationMutationQueueIdentity;
  to: ConversationMutationQueueIdentity;
  now?: number;
}): number {
  const fromOwnerIdentity = buildConversationMutationOwnerIdentity(input.from);
  const toOwnerIdentity = buildConversationMutationOwnerIdentity(input.to);
  if (!fromOwnerIdentity || !toOwnerIdentity || fromOwnerIdentity === toOwnerIdentity) return 0;
  ensureStoredMutationsLoaded(input.from, input.now);
  ensureStoredMutationsLoaded(input.to, input.now);
  const now = input.now ?? Date.now();
  let adopted = 0;

  for (const [recordId, record] of conversationMutationMemory.entries()) {
    if (record.ownerIdentity !== fromOwnerIdentity || record.apiNamespace !== input.from.apiNamespace) continue;
    const nextId = buildMutationId({
      ownerIdentity: toOwnerIdentity,
      apiNamespace: input.to.apiNamespace,
      conversationId: record.conversationId,
      kind: record.kind,
    });
    const existing = conversationMutationMemory.get(nextId);
    const latest = !existing || record.updatedAt >= existing.updatedAt ? record : existing;
    conversationMutationMemory.delete(recordId);
    const adoptedRecord: ConversationMutationRecord = {
      ...latest,
      id: nextId,
      ownerIdentity: toOwnerIdentity,
      apiNamespace: input.to.apiNamespace,
      updatedAt: Math.max(now, latest.updatedAt, lastMutationTimestamp + 1),
    };
    conversationMutationMemory.set(nextId, adoptedRecord);
    lastMutationTimestamp = Math.max(lastMutationTimestamp, adoptedRecord.updatedAt);
    adopted += 1;
  }

  if (adopted > 0) {
    persistMutations(input.from);
    persistMutations(input.to);
  }
  return adopted;
}

export function applyPendingConversationMutations(
  conversations: ConversationChannelSummary[],
  records: readonly ConversationMutationRecord[],
): ConversationChannelSummary[] {
  if (records.length === 0) return conversations;
  const byId = new Map(conversations.map((conversation) => [conversation.id, conversation]));
  const sortedRecords = [...records].sort(
    (left, right) => left.createdAt - right.createdAt || left.updatedAt - right.updatedAt,
  );

  for (const record of sortedRecords) {
    const current = byId.get(record.conversationId);
    if (!current || record.kind === "profile-default-languages") continue;
    if (record.patch.removed === true) {
      byId.delete(record.conversationId);
      continue;
    }
    const patch = { ...record.patch };
    delete patch.removed;
    byId.set(record.conversationId, { ...current, ...patch });
  }

  return [...byId.values()];
}

function resolveRetryDelayMs(attemptCount: number): number {
  return Math.min(
    CONVERSATION_MUTATION_RETRY_MAX_MS,
    CONVERSATION_MUTATION_RETRY_BASE_MS * (2 ** Math.max(0, attemptCount - 1)),
  );
}

async function performFlush(input: {
  identity: ConversationMutationQueueIdentity;
  fetchImpl: FetchLike;
  force: boolean;
  now: () => number;
  signal?: AbortSignal;
  onSuccess?: (record: ConversationMutationRecord, response: Response, acknowledged: boolean) => void | Promise<void>;
  onPermanentFailure?: (record: ConversationMutationRecord, response: Response, acknowledged: boolean) => void | Promise<void>;
}): Promise<ConversationMutationFlushResult> {
  const ownerIdentity = buildConversationMutationOwnerIdentity(input.identity);
  let delivered = 0;
  let attempts = 0;

  while (!input.signal?.aborted && attempts < CONVERSATION_MUTATION_MAX_FLUSH_BATCH) {
    const now = input.now();
    const pending = readConversationMutationRecords(input.identity, now);
    const removingRooms = new Set(pending.filter((record) => record.kind === "remove").map((record) => record.conversationId));
    // Removal supersedes room edits, but retain them until deletion succeeds
    // so a rejected removal does not discard the user's unsaved settings.
    const actionable = pending.filter((record) => record.kind === "remove" || !removingRooms.has(record.conversationId));
    const blockedRooms = new Set<string>();
    const first = actionable.find((record) => {
      if (blockedRooms.has(record.conversationId)) return false;
      blockedRooms.add(record.conversationId);
      return input.force || record.nextAttemptAt <= now;
    });
    if (!first) break;
    const records = [first];

    for (const record of records) {
      attempts += 1;
      try {
        const response = await fetchUntilAborted(input.fetchImpl, record.endpoint, {
          method: record.method,
          headers: {
            "Content-Type": "application/json",
            ...(input.identity.authenticatedUserId ? { [EXPECTED_ACCOUNT_HEADER]: input.identity.authenticatedUserId } : {}),
          },
          body: record.method === "DELETE" ? undefined : record.body,
          signal: input.signal,
        });
        if (input.signal?.aborted) break;
        const treatAsSuccess = response.ok || (record.kind === "remove" && response.status === 404);
        if (treatAsSuccess) {
          const acknowledged = acknowledgeConversationMutation(input.identity, record);
          if (acknowledged) {
            delivered += 1;
          }
          await input.onSuccess?.(record, response, acknowledged);
          continue;
        }

        // Authentication restoration and read-replica lag are transient for a
        // queued write. Keep those responses in the queue instead of rolling
        // back a valid local edit; validation/permission responses such as
        // 403 remain permanent failures.
        if (
          response.status >= 400
          && response.status < 500
          && response.status !== 401
          && response.status !== 404
          && response.status !== 408
          && response.status !== 429
        ) {
          // A rejected removal must not discard the edits it superseded.
          const current = conversationMutationMemory.get(record.id);
          const acknowledged = current?.updatedAt === record.updatedAt && current?.body === record.body;
          if (acknowledged) {
            conversationMutationMemory.delete(record.id);
            persistMutations(input.identity);
          }
          await input.onPermanentFailure?.(record, response, acknowledged);
          continue;
        }
      } catch {
        // Retain the record and retry after an exponential backoff.
      }

      if (input.signal?.aborted) break;

      const current = readConversationMutationRecords(input.identity, input.now())
        .find((candidate) => candidate.id === record.id);
      if (!current || current.updatedAt !== record.updatedAt) continue;
      const attemptCount = current.attemptCount + 1;
      const retryAt = input.now() + resolveRetryDelayMs(attemptCount);
      conversationMutationMemory.set(record.id, {
        ...current,
        attemptCount,
        updatedAt: Math.max(input.now(), current.updatedAt),
        nextAttemptAt: retryAt,
      });
      persistMutations(input.identity);
      // Preserve mutation order. A later setting must not pass an earlier
      // failed setting while the network is unavailable.
      return {
        delivered,
        retained: readConversationMutationRecords(input.identity, input.now()).length,
      };
    }

    if (attempts >= CONVERSATION_MUTATION_MAX_FLUSH_BATCH) break;
  }

  return {
    delivered,
    retained: readConversationMutationRecords(input.identity, input.now()).filter(
      (record) => record.ownerIdentity === ownerIdentity,
    ).length,
  };
}

export function flushConversationMutationQueue(input: {
  identity: ConversationMutationQueueIdentity;
  fetchImpl?: FetchLike;
  force?: boolean;
  now?: () => number;
  signal?: AbortSignal;
  onSuccess?: (record: ConversationMutationRecord, response: Response, acknowledged: boolean) => void | Promise<void>;
  onPermanentFailure?: (record: ConversationMutationRecord, response: Response, acknowledged: boolean) => void | Promise<void>;
}): Promise<ConversationMutationFlushResult> {
  const ownerIdentity = buildConversationMutationOwnerIdentity(input.identity);
  if (!ownerIdentity || typeof window === "undefined" || input.signal?.aborted) {
    return Promise.resolve({ delivered: 0, retained: 0 });
  }

  // Include the API namespace so an iOS and Android queue for the same account
  // cannot accidentally share a promise during a namespace transition.
  const flushKey = buildStorageKey(input.identity);
  const activeFlush = activeFlushes.get(flushKey);
  if (activeFlush && !activeFlush.signal?.aborted) return activeFlush.promise;

  const flushPromise = performFlush({
    identity: input.identity,
    fetchImpl: input.fetchImpl ?? window.fetch.bind(window),
    force: input.force === true,
    now: input.now ?? Date.now,
    signal: input.signal,
    onSuccess: input.onSuccess,
    onPermanentFailure: input.onPermanentFailure,
  }).finally(() => {
    if (activeFlushes.get(flushKey)?.promise === flushPromise) activeFlushes.delete(flushKey);
  });
  activeFlushes.set(flushKey, { promise: flushPromise, signal: input.signal });
  return flushPromise;
}

// Abort must settle the worker even if a fetch implementation never settles.
async function fetchUntilAborted(fetchImpl: FetchLike, endpoint: string, init: RequestInit): Promise<Response> {
  const signal = init.signal;
  if (!signal) return fetchImpl(endpoint, init);
  let rejectAbort: (reason: Error) => void = () => {};
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const onAbort = () => rejectAbort(new Error("conversation_mutation_aborted"));
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal.aborted) throw new Error("conversation_mutation_aborted");
    return await Promise.race([fetchImpl(endpoint, init), aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
