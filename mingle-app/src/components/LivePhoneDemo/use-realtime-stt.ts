'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import type { Utterance } from './ChatBubble'
import { buildClientApiPath, clientApiNamespace, shouldRedetectFinalizeSourceLanguage } from '@/lib/api-contract'
import type { ConversationHydrationCursor, ConversationHydrationUtterance } from '@/lib/app-conversations'
import { canonicalizeTranslationLanguageCode } from '@/lib/translation-languages'
import { canonicalizeSonioxLanguageHintCode } from '@/lib/stt-languages'
import {
  resolveDefaultMingleClientReleaseVariant,
  resolveDefaultMingleBehaviorProfile,
  resolveMingleClientReleaseVariant,
  resolveMingleBehaviorProfile,
  type MingleClientReleaseVariant,
  type MingleBehaviorProfile,
} from '@/lib/client-behavior-profile'
import { assignSpeakerAvatarIndex, getSpeakerAvatar } from './speaker-avatar'
import { DEFAULT_SONIOX_SILENCE_MS } from './live-phone-demo.preferences'
import {
  readRequestedApiNamespaceFromSearch,
  resolveNativeAppTrackingContext,
} from './live-phone-demo.app-update.logic'
import {
  buildStorageKey,
  getOrCreateSessionKey,
  getOrCreateTrackingUserId,
} from './realtime-storage'
import type { UserSelectableTranslationModel } from '@/lib/translation-models'
import {
  buildEndpointingLatencyMetric,
  type EndpointingLatencyMetric,
} from './endpointing-latency-benchmark'

export {
  buildStorageKey,
  getOrCreateSessionKey,
  getOrCreateTrackingUserId,
} from './realtime-storage'

const WS_PORT = process.env.NEXT_PUBLIC_WS_PORT || '3001'
export const getWsUrl = (): string => {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL
  const wsPath = process.env.NEXT_PUBLIC_WS_PATH?.trim()
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const protocol = isSecure ? 'wss' : 'ws'
  if (wsPath) {
    const normalizedPath = wsPath.startsWith('/') ? wsPath : `/${wsPath}`
    const locationPort = typeof window !== 'undefined' ? window.location.port : ''
    const hostWithPort = locationPort ? `${host}:${locationPort}` : host
    return `${protocol}://${hostWithPort}${normalizedPath}`
  }
  return `${protocol}://${host}:${WS_PORT}`
}
const DEFAULT_USAGE_LIMIT_SEC = 60
const CONNECTION_ERROR_RESET_DELAY_MS = 1_000
const NATIVE_STOP_ACK_TIMEOUT_MS = 5_000
const LOG_CLIENT_EVENT_MAX_ATTEMPTS = 2
const LOG_CLIENT_EVENT_RETRY_DELAY_MS = 500

// Only events carrying a clientMessageId are safely deduped server-side, so only those
// are worth retrying; retrying the rest risks duplicate analytics rows.
export function resolveLogClientEventMaxAttempts(clientMessageId: string | undefined | null): number {
  return clientMessageId ? LOG_CLIENT_EVENT_MAX_ATTEMPTS : 1
}

// When a locally finalized turn is later reconciled with the server's final text, prefer
// the avatar already shown to the user over the payload's (freshly assigned) avatar so the
// turn doesn't visually reopen under a different animal.
export function resolveReconciledSpeakerAvatar(input: {
  reusedSpeakerAvatarSeed?: string
  reusedSpeakerAvatarIndex?: number
  fallbackSpeakerAvatarSeed?: string
  fallbackSpeakerAvatarIndex?: number
}): { speakerAvatarSeed?: string; speakerAvatarIndex?: number } {
  return {
    speakerAvatarSeed: input.reusedSpeakerAvatarSeed ?? input.fallbackSpeakerAvatarSeed,
    speakerAvatarIndex: input.reusedSpeakerAvatarIndex ?? input.fallbackSpeakerAvatarIndex,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

const LS_KEY_UTTERANCES = 'mingle_demo_utterances'
const LS_KEY_USAGE = 'mingle_demo_usage_sec'
const LS_KEY_MESSAGE_COUNT = 'mingle_demo_message_count'
const LS_KEY_STT_DEBUG = 'mingle_stt_debug'
export const LOCAL_UTTERANCE_CACHE_LIMIT = 100
const NATIVE_STT_QUERY_KEY = 'nativeStt'
const NATIVE_STT_EVENT = 'mingle:native-stt'
const RECENT_TURN_CONTEXT_WINDOW_MS = 10_000
const LIVE_TRANSLATE_CLIENT_BUNDLE_REV = 'translation-debug-20260320-1'
const DEFAULT_PARTIAL_TRANSLATE_INTERVAL_MS = 2_000
const DEFAULT_PARTIAL_TRANSLATE_STEP = 20
let activeNativeSttOwnerKey: string | null = null

function claimNativeSttOwner(ownerKey: string): void {
  activeNativeSttOwnerKey = ownerKey
}

function releaseNativeSttOwner(ownerKey: string): void {
  if (activeNativeSttOwnerKey !== ownerKey) return
  activeNativeSttOwnerKey = null
}

function isNativeSttOwner(ownerKey: string): boolean {
  return activeNativeSttOwnerKey === ownerKey
}

type NativeAppUpdateWindow = Window & {
  __MINGLE_NATIVE_APP_UPDATE_STATUS?: unknown
  __MINGLE_LAST_NATIVE_STT_STATUS?: unknown
  __MINGLE_LAST_NATIVE_MIC_PERMISSION?: unknown
}

function resolveRuntimeApiNamespace(): string {
  if (typeof window === 'undefined') {
    return clientApiNamespace
  }

  return readRequestedApiNamespaceFromSearch(window.location.search || '') || clientApiNamespace
}

function resolveSttRuntimeBehaviorContext(): {
  apiNamespace: string
  releaseVariant: MingleClientReleaseVariant
  behaviorProfile: MingleBehaviorProfile
} {
  const apiNamespace = resolveRuntimeApiNamespace()
  const releaseVariant = apiNamespace
    ? resolveMingleClientReleaseVariant(apiNamespace)
    : resolveDefaultMingleClientReleaseVariant()
  return {
    apiNamespace,
    releaseVariant,
    behaviorProfile: apiNamespace
      ? resolveMingleBehaviorProfile(apiNamespace)
      : resolveDefaultMingleBehaviorProfile(),
  }
}

export function buildPersistedUtteranceCache<T>(
  utterances: T[],
  maxItems?: number | null,
): T[] {
  if (typeof maxItems !== 'number' || !Number.isFinite(maxItems) || maxItems <= 0) {
    return utterances
  }

  const normalizedMaxItems = Math.floor(maxItems)
  if (utterances.length <= normalizedMaxItems) return utterances
  return utterances.slice(-normalizedMaxItems)
}

export function persistUtterancesSnapshot(
  utterances: Utterance[],
  storageNamespace?: string,
  options?: { maxItems?: number | null },
): void {
  if (typeof window === 'undefined') return

  try {
    const storageKey = buildStorageKey(LS_KEY_UTTERANCES, storageNamespace)
    const persistedUtterances = buildPersistedUtteranceCache(utterances, options?.maxItems)
    if (persistedUtterances.length === 0) {
      window.localStorage.removeItem(storageKey)
      return
    }

    window.localStorage.setItem(storageKey, JSON.stringify(persistedUtterances))
  } catch {
    // Ignore local persistence failures.
  }
}

export function normalizePersistedMessageCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

export function countPersistedUtterances(utterances: Utterance[]): number {
  const seenIds = new Set<string>()
  let count = 0
  for (const utterance of utterances) {
    const id = typeof utterance.id === 'string' ? utterance.id.trim() : ''
    const originalText = typeof utterance.originalText === 'string' ? utterance.originalText.trim() : ''
    if (!id || !originalText || seenIds.has(id)) continue
    seenIds.add(id)
    count += 1
  }
  return count
}

export function persistMessageCountSnapshot(
  messageCount: number,
  storageNamespace?: string,
): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(
      buildStorageKey(LS_KEY_MESSAGE_COUNT, storageNamespace),
      String(normalizePersistedMessageCount(messageCount)),
    )
  } catch {
    // Ignore local persistence failures.
  }
}

function isNativeAppRuntime(): boolean {
  return typeof window !== 'undefined'
    && typeof window.ReactNativeWebView?.postMessage === 'function'
}

export type PartialTranslateMode = 'time' | 'char' | 'both'

export function parsePartialTranslateMode(rawMode: string | undefined): PartialTranslateMode {
  const normalized = (rawMode || '').trim().toLowerCase()
  if (normalized === 'char') return 'char'
  if (normalized === 'both') return 'both'
  return 'time'
}

export function parsePositiveIntWithFallback(rawValue: string | undefined, fallback: number): number {
  const parsed = Number.parseInt((rawValue || '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return parsed
}

export function shouldTriggerPartialTranslate(input: {
  mode: PartialTranslateMode
  isInitialRequest: boolean
  targetLanguagesChanged: boolean
  textLength: number
  currentText: string
  lastRequestedText: string
  lastTranslateLen: number
  charStep: number
  elapsedSinceLastRequestMs: number
  intervalMs: number
}): { shouldRequest: boolean, nextLastTranslateLen: number } {
  if (input.textLength <= 0) {
    return { shouldRequest: false, nextLastTranslateLen: input.lastTranslateLen }
  }

  const normalizedLastRequestedText = input.lastRequestedText.trim()
  const normalizedCurrentText = input.currentText.trim()
  const nextLastTranslateLen = Math.floor(input.textLength / input.charStep) * input.charStep

  if (input.isInitialRequest || input.targetLanguagesChanged) {
    return { shouldRequest: true, nextLastTranslateLen }
  }

  const charTriggered = (
    (input.mode === 'char' || input.mode === 'both')
    && input.textLength >= (input.lastTranslateLen + input.charStep)
  )
  const timeTriggered = (
    (input.mode === 'time' || input.mode === 'both')
    && normalizedCurrentText !== normalizedLastRequestedText
    && input.elapsedSinceLastRequestMs >= input.intervalMs
  )

  return {
    shouldRequest: charTriggered || timeTriggered,
    nextLastTranslateLen: charTriggered || timeTriggered ? nextLastTranslateLen : input.lastTranslateLen,
  }
}

const PARTIAL_TRANSLATE_MODE = parsePartialTranslateMode(
  process.env.NEXT_PUBLIC_LIVE_PARTIAL_TRANSLATE_MODE,
)
const PARTIAL_TRANSLATE_INTERVAL_MS = parsePositiveIntWithFallback(
  process.env.NEXT_PUBLIC_LIVE_PARTIAL_TRANSLATE_INTERVAL_MS,
  DEFAULT_PARTIAL_TRANSLATE_INTERVAL_MS,
)
const PARTIAL_TRANSLATE_STEP = parsePositiveIntWithFallback(
  process.env.NEXT_PUBLIC_LIVE_PARTIAL_TRANSLATE_CHAR_STEP,
  DEFAULT_PARTIAL_TRANSLATE_STEP,
)

type ConnectionStatus = 'idle' | 'connecting' | 'ready' | 'error'

export function buildLanguageSelectionSignature(languages: string[]): string {
  return languages
    .map((language) => language.trim())
    .filter(Boolean)
    .join('\u001f')
}

export function buildSonioxLanguageHints(languages: string[]): string[] {
  const hints: string[] = []
  const seen = new Set<string>()
  for (const languageRaw of languages) {
    const language = canonicalizeSonioxLanguageHintCode(languageRaw)
    if (!language) continue
    const key = language.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    hints.push(language)
  }
  return hints
}

type NativeSttStartCommand = {
  type: 'native_stt_start'
  payload: {
    wsUrl: string
    sttModel: string
    aecEnabled: boolean
    apiNamespace: string
    releaseVariant: MingleClientReleaseVariant
    behaviorProfile: MingleBehaviorProfile
    sonioxLanguageHints: string[]
    sonioxManualFinalizeSilenceMs: number
  }
}

type NativeSttStopCommand = {
  type: 'native_stt_stop'
  payload: {
    pendingText: string
    pendingLanguage: string
  }
}

type NativeSttSetAecCommand = {
  type: 'native_stt_set_aec'
  payload: { enabled: boolean }
}

type NativeOpenAppSettingsCommand = {
  type: 'native_open_app_settings'
  payload: {
    reason: string
  }
}

type NativeSttBridgeCommand =
  | NativeSttStartCommand
  | NativeSttStopCommand
  | NativeSttSetAecCommand
  | NativeOpenAppSettingsCommand

export type NativeMicPermissionRecoveryAction = 'none' | 'open_ios_settings'

type NativeSttBridgeEvent =
  | { type: 'status', status: string }
  | { type: 'message', raw: string }
  | { type: 'error', message: string, code?: string, platform?: string }
  | { type: 'permission', permission: string, platform?: string }
  | { type: 'capabilities', openAppSettings: boolean }
  | { type: 'close', reason: string }

export function resolveNativeMicPermissionRecoveryAction(input: {
  message?: string
  code?: string
  platform?: string
  permission?: string
}): NativeMicPermissionRecoveryAction {
  const platform = (input.platform || '').trim().toLowerCase()
  if (platform !== 'ios') return 'none'

  const permission = (input.permission || '').trim().toLowerCase()
  if (permission === 'denied') {
    return 'open_ios_settings'
  }

  const code = (input.code || '').trim().toLowerCase()
  if (code === 'mic_permission') {
    return 'open_ios_settings'
  }

  const message = (input.message || '').trim().toLowerCase()
  if (message === 'mic_permission_denied' || message === 'mic_permission_denied_after_prompt') {
    return 'open_ios_settings'
  }

  return 'none'
}

export function resolveCachedNativeMicPermissionRecoveryAction(input: {
  apiNamespace?: string
  permission?: string
}): NativeMicPermissionRecoveryAction {
  const normalizedNamespace = (input.apiNamespace || '').trim().toLowerCase()
  const platform = normalizedNamespace.startsWith('ios/')
    ? 'ios'
    : normalizedNamespace.startsWith('android/')
      ? 'android'
      : undefined

  return resolveNativeMicPermissionRecoveryAction({
    platform,
    permission: input.permission,
  })
}

export function shouldOpenNativeMicSettingsOnRetry(input: {
  useNativeStt: boolean
  connectionStatus: ConnectionStatus
  recoveryAction: NativeMicPermissionRecoveryAction
  supportsNativeOpenAppSettingsCommand: boolean
}): boolean {
  if (!input.useNativeStt) return false
  if (input.connectionStatus !== 'idle') return false
  return input.recoveryAction === 'open_ios_settings'
}

export function shouldResetConnectionToIdleForNativeMicRecovery(input: {
  platform?: string
  code?: string
  message?: string
  permission?: string
}): boolean {
  return resolveNativeMicPermissionRecoveryAction(input) === 'open_ios_settings'
}

export function resolveConnectionStatusFromNativeBridgeStatus(input: {
  nativeStatus?: string | null
  previousConnectionStatus: ConnectionStatus
}): ConnectionStatus | null {
  const nativeStatus = (input.nativeStatus || '').trim().toLowerCase()
  if (!nativeStatus) return null

  if (nativeStatus === 'ready') {
    return 'ready'
  }

  if (
    nativeStatus === 'connecting'
    || nativeStatus === 'starting'
    || nativeStatus === 'recovering'
  ) {
    return 'connecting'
  }

  if (nativeStatus === 'running' || nativeStatus === 'silenced') {
    return input.previousConnectionStatus === 'ready' ? 'ready' : 'connecting'
  }

  if (nativeStatus === 'idle' || nativeStatus === 'stopped' || nativeStatus === 'closed') {
    return 'idle'
  }

  if (nativeStatus === 'error' || nativeStatus === 'failed') {
    return 'error'
  }

  return null
}

export function shouldApplyNativeBridgeConnectionStatus(input: {
  nextConnectionStatus: ConnectionStatus | null
  isStopping?: boolean
  nativeStopRequested?: boolean
}): boolean {
  if (!input.nextConnectionStatus) return false
  if (input.isStopping || input.nativeStopRequested) {
    return input.nextConnectionStatus === 'idle'
  }
  return true
}

export function shouldPromoteConnectionStatusFromNativeActivity(input: {
  previousConnectionStatus: ConnectionStatus
  isStopping?: boolean
  nativeStopRequested?: boolean
}): boolean {
  if (input.isStopping || input.nativeStopRequested) return false
  return input.previousConnectionStatus !== 'ready'
}

export function shouldHandleNativeBridgeServerMessage(input: {
  message: Record<string, unknown>
  isStopping?: boolean
  nativeStopRequested?: boolean
}): boolean {
  if (!(input.isStopping || input.nativeStopRequested)) return true
  return input.message.status !== 'ready'
}

export function shouldTrackUsageForConnectionStatus(connectionStatus: ConnectionStatus): boolean {
  return connectionStatus === 'ready'
}

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: (message: string) => void
    }
  }
}

function shouldUseNativeSttBridge(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof window.ReactNativeWebView?.postMessage !== 'function') return false
  try {
    const params = new URLSearchParams(window.location.search || '')
    const value = (params.get(NATIVE_STT_QUERY_KEY) || '').trim().toLowerCase()
    if (!value) return true
    if (value === '0' || value === 'false' || value === 'off') return false
    if (value === '1' || value === 'true' || value === 'on') return true
    return true
  } catch {
    return true
  }
}

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return output
}

function toBase64(data: Int16Array): string {
  const bytes = new Uint8Array(data.buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function inferUtteranceCreatedAtMs(utterance: Pick<Utterance, 'id' | 'createdAtMs'>): number | null {
  if (typeof utterance.createdAtMs === 'number' && Number.isFinite(utterance.createdAtMs) && utterance.createdAtMs > 0) {
    return Math.floor(utterance.createdAtMs)
  }
  const match = /^u-(\d+)-/.exec(utterance.id)
  if (!match) return null
  const parsed = Number(match[1])
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.floor(parsed)
}

function normalizeStoredUtterance(utterance: Utterance): Utterance {
  const createdAtMs = inferUtteranceCreatedAtMs(utterance)
  const normalizedOriginalLang = normalizeIncomingSourceLanguage(
    utterance.originalLang,
    utterance.originalText,
  )
  if (createdAtMs === null && normalizedOriginalLang === utterance.originalLang) return utterance
  return {
    ...utterance,
    ...(createdAtMs !== null ? { createdAtMs } : {}),
    originalLang: normalizedOriginalLang,
  }
}

function normalizeStoredUtteranceList(utterances: Utterance[]): Utterance[] {
  const seen = new Set<string>()
  return utterances
    .filter((utterance) => {
      if (!utterance || typeof utterance.id !== 'string' || !utterance.id.trim()) return false
      if (seen.has(utterance.id)) return false
      seen.add(utterance.id)
      return true
    })
    .map(normalizeStoredUtterance)
}

function parseStoredUtterances(rawValue: string): Utterance[] {
  return normalizeStoredUtteranceList(JSON.parse(rawValue) as Utterance[])
}

function isJsonQuoteEscaped(rawValue: string, quoteIndex: number): boolean {
  let backslashCount = 0
  for (let index = quoteIndex - 1; index >= 0 && rawValue[index] === '\\'; index -= 1) {
    backslashCount += 1
  }
  return backslashCount % 2 === 1
}

export function parseRecentStoredUtterances(rawValue: string, limit: number): {
  utterances: Utterance[]
  hasOlder: boolean
} | null {
  const raw = rawValue.trim()
  if (!raw.startsWith('[') || !raw.endsWith(']') || limit <= 0) return null

  const objectJsons: string[] = []
  let firstObjectStart = raw.length
  let objectEnd = -1
  let depth = 0
  let inString = false

  for (let index = raw.length - 1; index >= 0; index -= 1) {
    const char = raw[index]
    if (char === '"') {
      if (!isJsonQuoteEscaped(raw, index)) {
        inString = !inString
      }
      continue
    }
    if (inString) {
      continue
    }
    if (char === '}') {
      if (depth === 0) objectEnd = index
      depth += 1
      continue
    }
    if (char !== '{' || depth === 0) continue

    depth -= 1
    if (depth !== 0 || objectEnd < index) continue
    firstObjectStart = index
    objectJsons.unshift(raw.slice(index, objectEnd + 1))
    objectEnd = -1
    if (objectJsons.length >= limit) break
  }

  if (objectJsons.length === 0) {
    return raw === '[]' ? { utterances: [], hasOlder: false } : null
  }

  const parsed = normalizeStoredUtteranceList(JSON.parse(`[${objectJsons.join(',')}]`) as Utterance[])
  return {
    utterances: parsed,
    hasOlder: raw.slice(0, firstObjectStart).includes('{'),
  }
}

type ConversationHydrationPayload = {
  usageSec?: number
  messageCount?: number
  utterances?: ConversationHydrationUtterance[]
  hasMoreUtterances?: boolean
  oldestMessageCursor?: ConversationHydrationCursor | null
}

function normalizeConversationHydrationCursor(rawCursor: unknown): ConversationHydrationCursor | null {
  if (!rawCursor || typeof rawCursor !== 'object' || Array.isArray(rawCursor)) return null
  const cursor = rawCursor as Record<string, unknown>
  const createdAtMs = typeof cursor.createdAtMs === 'number' ? cursor.createdAtMs : Number(cursor.createdAtMs)
  const messageId = typeof cursor.messageId === 'string' ? cursor.messageId.trim() : ''
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0 || !messageId) return null
  return {
    createdAtMs: Math.floor(createdAtMs),
    messageId,
  }
}

function normalizeConversationHydrationUtterances(rawUtterances: unknown): Utterance[] {
  if (!Array.isArray(rawUtterances)) return []

  return rawUtterances
    .filter((utterance) => utterance && typeof utterance === 'object')
    .map((utterance) => {
      const record = utterance as ConversationHydrationUtterance
      return normalizeStoredUtterance({
        id: typeof record.id === 'string' ? record.id : '',
        originalText: typeof record.originalText === 'string' ? record.originalText : '',
        originalLang: typeof record.originalLang === 'string' ? record.originalLang : 'unknown',
        targetLanguages: Array.isArray(record.targetLanguages)
          ? record.targetLanguages.filter((language): language is string => typeof language === 'string')
          : [],
        translations: typeof record.translations === 'object' && record.translations
          ? Object.fromEntries(
              Object.entries(record.translations).filter((entry): entry is [string, string] => (
                typeof entry[0] === 'string' && typeof entry[1] === 'string'
              )),
            )
          : {},
        translationFinalized: typeof record.translationFinalized === 'object' && record.translationFinalized
          ? Object.fromEntries(
              Object.entries(record.translationFinalized).filter((entry): entry is [string, boolean] => (
                typeof entry[0] === 'string' && entry[1] === true
              )),
            )
          : {},
        createdAtMs: typeof record.createdAtMs === 'number' ? record.createdAtMs : undefined,
        ...(typeof record.speaker === 'string' && record.speaker.trim() ? { speaker: record.speaker.trim() } : {}),
        ...(typeof record.speakerAvatarSeed === 'string' && record.speakerAvatarSeed.trim()
          ? { speakerAvatarSeed: record.speakerAvatarSeed.trim() }
          : {}),
        ...(typeof record.speakerAvatarIndex === 'number'
          ? { speakerAvatarIndex: record.speakerAvatarIndex }
          : {}),
      })
    })
    .filter((utterance) => utterance.id && utterance.originalText.trim())
}

function buildConversationHydrationApiPath(
  conversationId: string,
  cursor?: ConversationHydrationCursor | null,
): string {
  const normalizedConversationId = conversationId.trim()
  const basePath = `/conversations/${encodeURIComponent(normalizedConversationId)}` as `/${string}`
  if (!cursor) return buildClientApiPath(basePath)

  const params = new URLSearchParams({
    beforeCreatedAtMs: String(cursor.createdAtMs),
    beforeMessageId: cursor.messageId,
  })
  return buildClientApiPath(`${basePath}?${params.toString()}` as `/${string}`)
}

export function normalizeSttTurnText(rawText: string): string {
  // Strip endpoint markers at the client boundary so downstream paths
  // (bubble/render/log/translate) all operate on marker-free text.
  return rawText
    .replace(/<\/?(?:end|fin)>/giu, '')
    .replace(/^[\s.,!?;:，。、…—–-]+/u, '')
    .trim()
}

export function normalizeLangForCompare(rawLanguage: string): string {
  return (rawLanguage || '').trim().replace('_', '-').toLowerCase().split('-')[0] || ''
}

function normalizeTranslationLanguageCode(rawLanguage: string): string {
  const canonical = canonicalizeTranslationLanguageCode(rawLanguage)
  if (canonical) return canonical
  return (rawLanguage || '').trim().replace(/_/g, '-')
}

function normalizeTranslationLanguageKey(rawLanguage: string): string {
  return normalizeTranslationLanguageCode(rawLanguage).toLowerCase()
}

function normalizeSourceLanguageMatchKey(rawLanguage: string): string {
  const normalizedTranslationKey = normalizeTranslationLanguageKey(rawLanguage)
  if (normalizedTranslationKey === 'zh') return 'zh-cn'
  if (normalizedTranslationKey === 'zh-cn' || normalizedTranslationKey === 'zh-tw') {
    return normalizedTranslationKey
  }
  return normalizeLangForCompare(rawLanguage)
}

function normalizeIncomingSourceLanguage(rawLanguage: string, rawText = ''): string {
  void rawText
  const canonical = canonicalizeTranslationLanguageCode(rawLanguage)
  if (canonical === 'zh') {
    return 'zh-CN'
  }
  if (canonical === 'zh-CN' || canonical === 'zh-TW') return canonical
  return (rawLanguage || '').trim().replace(/_/g, '-')
}

function shouldKeepSourceLanguageBubble(options?: {
  sourceLanguagesMixed?: boolean
  sourceTextHasForeignScript?: boolean
}): boolean {
  return options?.sourceLanguagesMixed === true || options?.sourceTextHasForeignScript === true
}

export function stripSourceLanguageFromTranslations(
  translationsRaw: Record<string, string>,
  sourceLanguageRaw: string,
  options?: {
    keepSourceLanguage?: boolean
  },
): Record<string, string> {
  const sourceLanguage = normalizeTranslationLanguageKey(sourceLanguageRaw)
  const translations: Record<string, string> = {}
  for (const [language, translatedText] of Object.entries(translationsRaw)) {
    const normalizedLanguage = (language || '').trim()
    const normalizedLanguageForCompare = normalizeTranslationLanguageKey(normalizedLanguage)
    const cleaned = translatedText.trim()
    if (!normalizedLanguage || !cleaned) continue
    if (!options?.keepSourceLanguage && sourceLanguage && normalizedLanguageForCompare === sourceLanguage) continue
    translations[normalizedLanguage] = cleaned
  }
  return translations
}

export function buildTurnTargetLanguagesSnapshot(
  languagesRaw: string[],
  sourceLanguageRaw: string,
  options?: {
    includeSourceLanguage?: boolean
  },
): string[] {
  const sourceLanguage = normalizeTranslationLanguageKey(sourceLanguageRaw)
  const targetLanguages: string[] = []
  const seen = new Set<string>()
  for (const languageRaw of languagesRaw) {
    const language = (languageRaw || '').trim()
    if (!language) continue
    const normalizedLanguage = normalizeTranslationLanguageKey(language)
    if (!options?.includeSourceLanguage && sourceLanguage && normalizedLanguage === sourceLanguage) continue
    const key = normalizedLanguage || language.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    targetLanguages.push(language)
  }
  return targetLanguages
}

export function filterTranslationsToTargetLanguages(
  translationsRaw: Record<string, string>,
  targetLanguagesRaw: string[],
): Record<string, string> {
  const allowedLanguages = new Set(
    targetLanguagesRaw
      .map((language) => normalizeTranslationLanguageKey(language))
      .filter(Boolean),
  )
  if (allowedLanguages.size === 0) return {}

  const translations: Record<string, string> = {}
  for (const [languageRaw, translatedText] of Object.entries(translationsRaw)) {
    const language = (languageRaw || '').trim()
    const cleaned = translatedText.trim()
    if (!language || !cleaned) continue
    if (!allowedLanguages.has(normalizeTranslationLanguageKey(language))) continue
    translations[language] = cleaned
  }
  return translations
}

export function pruneUnresolvedTranslationTargets(input: {
  targetLanguages?: string[]
  translations: Record<string, string>
  translationFinalized?: Record<string, boolean>
}): Pick<Utterance, 'targetLanguages' | 'translations' | 'translationFinalized'> {
  const translations: Record<string, string> = {}
  for (const [languageRaw, translatedText] of Object.entries(input.translations || {})) {
    const language = (languageRaw || '').trim()
    const cleaned = translatedText.trim()
    if (!language || !cleaned) continue
    translations[language] = cleaned
  }

  const targetLanguages: string[] = []
  const seen = new Set<string>()
  const pushLanguage = (languageRaw: string) => {
    const language = (languageRaw || '').trim()
    if (!language || seen.has(language) || !translations[language]) return
    seen.add(language)
    targetLanguages.push(language)
  }

  for (const language of input.targetLanguages || []) pushLanguage(language)
  for (const language of Object.keys(translations)) pushLanguage(language)

  const translationFinalized: Record<string, boolean> = {}
  for (const language of targetLanguages) {
    const finalized = input.translationFinalized?.[language]
    if (typeof finalized === 'boolean') translationFinalized[language] = finalized
  }

  return {
    targetLanguages,
    translations,
    translationFinalized,
  }
}

interface PendingUtteranceTranslationUpdate {
  translations: Record<string, string>
  translationFinalized: Record<string, boolean>
  priorities: Map<string, TranslationPriority>
  detectedSourceLanguage?: string
  sourceLanguagesMixed?: boolean
  sourceTextHasForeignScript?: boolean
  selectedLanguages?: string[]
  sourceText?: string
}

export interface UtteranceStoreState {
  utterances: Utterance[]
  translationPriorities: Map<string, TranslationPriority>
  pendingTranslationUpdates: Map<string, PendingUtteranceTranslationUpdate>
}

interface SeedTranslationState {
  translations: Record<string, string>
  priorities: Map<string, TranslationPriority>
}

export interface CurrentTurnPreviousStatePayload {
  sourceLanguage: string
  sourceText: string
  translations: Record<string, string>
}

export function buildCurrentTurnPreviousStatePayload(
  sourceLanguageRaw: string,
  sourceTextRaw: string,
  translationsRaw: Record<string, string>,
): CurrentTurnPreviousStatePayload | null {
  const sourceText = normalizeSttTurnText(sourceTextRaw)
  if (!sourceText) return null
  const sourceLanguage = normalizeIncomingSourceLanguage(sourceLanguageRaw, sourceText) || 'unknown'

  const translations = stripSourceLanguageFromTranslations(translationsRaw, sourceLanguage)

  return {
    sourceLanguage,
    sourceText,
    translations,
  }
}

export interface ParsedSttTranscriptMessage {
  rawText: string
  text: string
  language: string
  isFinal: boolean
  speaker: string
  finalizeSource?: string
  providerAudioEndMs?: number
}

export function parseSttTranscriptMessage(
  message: Record<string, unknown>,
): ParsedSttTranscriptMessage | null {
  if (message.type !== 'transcript') return null
  if (typeof message.data !== 'object' || message.data === null) return null

  const data = message.data as Record<string, unknown>
  if (typeof data.utterance !== 'object' || data.utterance === null) return null

  const utterance = data.utterance as Record<string, unknown>
  const rawText = typeof utterance.text === 'string' ? utterance.text : ''
  const text = normalizeSttTurnText(rawText)
  const language = normalizeIncomingSourceLanguage(
    typeof utterance.language === 'string' ? utterance.language : 'unknown',
    text || rawText,
  ) || 'unknown'
  const isFinal = data.is_final === true
  const finalizeSource = typeof data.finalize_source === 'string' && data.finalize_source.trim()
    ? data.finalize_source.trim()
    : ''
  const providerAudioEndMs = typeof data.provider_audio_end_ms === 'number'
    && Number.isFinite(data.provider_audio_end_ms)
    ? Math.max(0, Math.floor(data.provider_audio_end_ms))
    : undefined
  const speaker = typeof utterance.speaker === 'string' && utterance.speaker.trim()
    ? utterance.speaker.trim()
    : 'unknown'

  return {
    rawText,
    text,
    language,
    isFinal,
    speaker,
    ...(finalizeSource ? { finalizeSource } : {}),
    ...(providerAudioEndMs !== undefined ? { providerAudioEndMs } : {}),
  }
}

export interface BuildFinalizedUtterancePayloadInput {
  speaker?: string
  speakerAvatarSeed?: string
  speakerAvatarIndex?: number
  rawText: string
  rawLanguage: string
  languages: string[]
  partialTranslations: Record<string, string>
  currentTurnPreviousTranslations?: Record<string, string>
  seedUtteranceTranslations?: boolean
  utteranceSerial: number
  utteranceId?: string
  nowMs?: number
  createdAtMs?: number
  previousStateSourceLanguage?: string
  previousStateSourceText?: string
}

export interface BuildFinalizedUtterancePayloadResult {
  utteranceId: string
  text: string
  language: string
  createdAtMs: number
  utterance: Utterance
  currentTurnPreviousState: CurrentTurnPreviousStatePayload | null
}

export function buildFinalizedUtterancePayload(
  input: BuildFinalizedUtterancePayloadInput,
): BuildFinalizedUtterancePayloadResult | null {
  const text = normalizeSttTurnText(input.rawText)
  const language = normalizeIncomingSourceLanguage(input.rawLanguage, text) || 'unknown'
  if (!text) return null

  const createdAtMs = typeof input.createdAtMs === 'number' && Number.isFinite(input.createdAtMs)
    ? Math.floor(input.createdAtMs)
    : typeof input.nowMs === 'number' && Number.isFinite(input.nowMs)
      ? Math.floor(input.nowMs)
    : Date.now()

  const priorTranslations = stripSourceLanguageFromTranslations(
    input.currentTurnPreviousTranslations ?? input.partialTranslations,
    language,
  )
  const seedTranslations = input.seedUtteranceTranslations === false ? {} : priorTranslations
  const targetLanguages = buildTurnTargetLanguagesSnapshot(input.languages, language)
  const translationFinalized: Record<string, boolean> = {}
  for (const key of Object.keys(seedTranslations)) {
    translationFinalized[key] = false
  }

  const currentTurnPreviousState = buildCurrentTurnPreviousStatePayload(
    input.previousStateSourceLanguage ?? input.rawLanguage,
    input.previousStateSourceText ?? input.rawText,
    priorTranslations,
  )

  const utteranceId = input.utteranceId || buildUtteranceId(createdAtMs, input.utteranceSerial)
  const utterance: Utterance = {
    id: utteranceId,
    speaker: (input.speaker || '').trim() || 'unknown',
    ...(input.speakerAvatarSeed?.trim() ? { speakerAvatarSeed: input.speakerAvatarSeed.trim() } : {}),
    ...(typeof input.speakerAvatarIndex === 'number' ? { speakerAvatarIndex: input.speakerAvatarIndex } : {}),
    originalText: text,
    originalLang: language,
    targetLanguages,
    translations: seedTranslations,
    translationFinalized,
    createdAtMs,
  }

  return {
    utteranceId,
    text,
    language,
    createdAtMs,
    utterance,
    currentTurnPreviousState,
  }
}

interface UseRealtimeSTTOptions {
  languages?: string[]
  targetLanguages?: string[]
  speechLanguages?: string[]
  onLimitReached?: () => void
  onTtsRequested?: (utteranceId: string, language: string) => void
  onTtsAudio?: (utteranceId: string, audioBlob: Blob, language: string, ttsText?: string) => void
  onTtsCanceled?: (utteranceId: string) => void
  enableTts?: boolean
  enableAec?: boolean
  sonioxManualFinalizeSilenceMs?: number
  usageLimitSec?: number | null
  conversationId?: string
  sessionKeyOverride?: string
  storageNamespace?: string
  translationModel?: UserSelectableTranslationModel
  onEndpointingLatencyMetric?: (metric: EndpointingLatencyMetric) => void
}

type StopRecordingOptions = {
  discardPendingFinalization?: boolean
}

interface SubmitExternalUtteranceInput {
  text: string
  sourceLanguage?: string
  speaker?: string
}

interface LocalFinalizeResult {
  utteranceId: string
  text: string
  lang: string
  currentTurnPreviousState: CurrentTurnPreviousStatePayload | null
  speaker: string
  speakerAvatarSeed?: string
  speakerAvatarIndex?: number
}

interface PendingSpeakerTurn {
  utteranceId: string
  utteranceSerial: number
  createdAtMs: number
  speaker: string
  speakerAvatarSeed: string
  speakerAvatarIndex: number
  rawText: string
  text: string
  language: string
  partialTranslations: Record<string, string>
  partialTranslationPriorities: Map<string, TranslationPriority>
  currentTurnPreviousState: CurrentTurnPreviousStatePayload | null
  updatedAtMs: number
}

type PendingSpeakerTurnSnapshot = Pick<
  PendingSpeakerTurn,
  | 'utteranceId'
  | 'createdAtMs'
  | 'speaker'
  | 'speakerAvatarSeed'
  | 'speakerAvatarIndex'
  | 'language'
  | 'partialTranslations'
  | 'text'
  | 'updatedAtMs'
>

function buildPendingSpeakerTurnSnapshots(
  pendingTurnsBySpeaker: Record<string, PendingSpeakerTurn>,
): PendingSpeakerTurnSnapshot[] {
  return Object.values(pendingTurnsBySpeaker).map((turn) => ({
    utteranceId: turn.utteranceId,
    createdAtMs: turn.createdAtMs,
    speaker: turn.speaker,
    speakerAvatarSeed: turn.speakerAvatarSeed,
    speakerAvatarIndex: turn.speakerAvatarIndex,
    language: turn.language,
    partialTranslations: { ...turn.partialTranslations },
    text: turn.text,
    updatedAtMs: turn.updatedAtMs,
  }))
}

function buildPendingSpeakerTurnSignature(
  pendingTurnsBySpeaker: Record<string, PendingSpeakerTurn>,
): string {
  return buildPendingSpeakerTurnSnapshots(pendingTurnsBySpeaker)
    .sort((left, right) => left.speaker.localeCompare(right.speaker))
    .map((turn) => (
      [
        turn.utteranceId,
        String(turn.createdAtMs),
        turn.speaker,
        turn.speakerAvatarSeed,
        String(turn.speakerAvatarIndex),
        turn.language,
        Object.entries(turn.partialTranslations)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([language, text]) => `${language}:${text}`)
          .join('\u001d'),
        turn.text,
        String(turn.updatedAtMs),
      ].join('\u001f')
    ))
    .join('\u001e')
}

export type RecentFinalizedUtterance = {
  id: string
  text: string
  language: string
  speaker?: string
  expiresAt: number
  source: 'local' | 'server'
}

const RECENT_FINALIZED_UTTERANCE_LIMIT = 12

type RecentFinalizedUtteranceMatch =
  | { kind: 'none' }
  | { kind: 'reuse_local'; utteranceId: string }
  | { kind: 'skip_duplicate_server'; utteranceId: string }

function buildUtteranceId(createdAtMs: number, utteranceSerial: number): string {
  return `u-${createdAtMs}-${utteranceSerial}`
}

function reservePendingSpeakerTurnIdentity(
  nextUtteranceSerial: number,
  createdAtMs: number,
): Pick<PendingSpeakerTurn, 'utteranceId' | 'utteranceSerial' | 'createdAtMs'> {
  return {
    utteranceId: buildUtteranceId(createdAtMs, nextUtteranceSerial),
    utteranceSerial: nextUtteranceSerial,
    createdAtMs,
  }
}

export function buildLiveUtterance(input: {
  pendingTurn: Pick<PendingSpeakerTurn, 'utteranceId' | 'createdAtMs' | 'speaker' | 'speakerAvatarSeed' | 'speakerAvatarIndex' | 'language'> | null
  partialTranscript: string
  partialLang?: string | null
  partialTranslations: Record<string, string>
  languages: string[]
}): Utterance | null {
  const transcript = input.partialTranscript.trim()
  if (!input.pendingTurn || !transcript) return null

  const sourceLanguage = normalizeIncomingSourceLanguage(
    input.partialLang || input.pendingTurn.language || 'unknown',
    transcript,
  ) || 'unknown'
  const targetLanguages = buildTurnTargetLanguagesSnapshot(
    input.languages,
    sourceLanguage,
  )
  const translations = filterTranslationsToTargetLanguages(
    stripSourceLanguageFromTranslations(
      input.partialTranslations,
      sourceLanguage,
    ),
    targetLanguages,
  )

  return {
    id: input.pendingTurn.utteranceId,
    speaker: input.pendingTurn.speaker,
    speakerAvatarSeed: input.pendingTurn.speakerAvatarSeed,
    speakerAvatarIndex: input.pendingTurn.speakerAvatarIndex,
    originalText: input.partialTranscript,
    originalLang: sourceLanguage,
    targetLanguages,
    translations,
    translationFinalized: Object.fromEntries(
      Object.keys(translations).map(language => [language, false]),
    ),
    createdAtMs: input.pendingTurn.createdAtMs,
  }
}

export function buildLiveUtterances(input: {
  pendingTurns: Array<Pick<PendingSpeakerTurn, 'utteranceId' | 'createdAtMs' | 'speaker' | 'speakerAvatarSeed' | 'speakerAvatarIndex' | 'language' | 'text' | 'partialTranslations'>>
  languages: string[]
}): Utterance[] {
  const sortedPendingTurns = [...input.pendingTurns].sort((left, right) => {
    const leftCreatedAt = typeof left.createdAtMs === 'number' ? left.createdAtMs : 0
    const rightCreatedAt = typeof right.createdAtMs === 'number' ? right.createdAtMs : 0
    if (leftCreatedAt !== rightCreatedAt) return leftCreatedAt - rightCreatedAt
    return left.utteranceId.localeCompare(right.utteranceId)
  })

  return sortedPendingTurns.flatMap((pendingTurn) => {
    const utterance = buildLiveUtterance({
      pendingTurn,
      partialTranscript: pendingTurn.text,
      partialLang: pendingTurn.language,
      partialTranslations: pendingTurn.partialTranslations,
      languages: input.languages,
    })
    return utterance ? [utterance] : []
  })
}

export function mergeDisplayUtterances(input: {
  utterances: Utterance[]
  liveUtterances: Utterance[]
}): Utterance[] {
  const committedIds = new Set(input.utterances.map((utterance) => utterance.id))
  const combined = [
    ...input.utterances.map((utterance, originalIndex) => ({
      utterance: normalizeStoredUtterance(utterance),
      originalIndex,
    })),
    ...input.liveUtterances
      .filter((utterance) => !committedIds.has(utterance.id))
      .map((utterance, index) => ({
        utterance: normalizeStoredUtterance(utterance),
        originalIndex: input.utterances.length + index,
      })),
  ]

  combined.sort((left, right) => {
    const leftCreatedAt = inferUtteranceCreatedAtMs(left.utterance)
    const rightCreatedAt = inferUtteranceCreatedAtMs(right.utterance)
    if (leftCreatedAt !== null && rightCreatedAt !== null && leftCreatedAt !== rightCreatedAt) {
      return leftCreatedAt - rightCreatedAt
    }
    if (leftCreatedAt !== null && rightCreatedAt === null) return -1
    if (leftCreatedAt === null && rightCreatedAt !== null) return 1
    return left.originalIndex - right.originalIndex
  })

  return combined.map(({ utterance }) => utterance)
}

type TranslationPriorityKind = 'initial' | 'partial' | 'final'

interface TranslationPriority {
  kind: TranslationPriorityKind
  seq: number
}

interface PendingTurnTranslationRuntime {
  hasFiredInitialRequest: boolean
  lastTranslateLen: number
  latestRequestSeq: number
  lastRequestSignature: string
  lastTargetSignature: string
  lastRequestedText: string
  lastRequestedAtMs: number
  controller: AbortController | null
}

interface TranslationApplyFallbackMatch {
  sourceText: string
  sourceLanguage: string
}

const TRANSLATION_PRIORITY_KIND_ORDER: Record<TranslationPriorityKind, number> = {
  initial: 0,
  partial: 1,
  final: 2,
}

export function buildLiveTranslateRequestSignature(input: {
  utteranceId: number | string
  speaker?: string | null
  language: string
  text: string
  targetLanguages?: string[]
}): string {
  const normalizedSpeaker = (input.speaker || '').trim() || 'unknown'
  const normalizedLanguage = (input.language || 'unknown').trim() || 'unknown'
  const normalizedText = input.text.trim()
  const targetLanguageSignature = buildLanguageSelectionSignature(input.targetLanguages || [])
  return `${String(input.utteranceId)}::${normalizedSpeaker}::${normalizedLanguage}::${targetLanguageSignature}::${normalizedText}`
}

export function isDuplicateTimedSignature(input: {
  previousSig: string
  previousExpiresAt: number
  nextSig: string
  nowMs: number
}): boolean {
  return Boolean(
    input.nextSig
    && input.previousSig === input.nextSig
    && input.nowMs < input.previousExpiresAt
  )
}

function normalizeFinalizeReuseText(rawText: string): string {
  return normalizeSttTurnText(rawText)
    .replace(/[\s.,!?;:，。、…—–-]+$/u, '')
    .trim()
}

function normalizeFinalizeExpansionText(rawText: string): string {
  return normalizeSttTurnText(rawText)
    .toLowerCase()
    .replace(/[“”]/gu, '"')
    .replace(/[‘’]/gu, "'")
    .replace(/[\s.,!?;:，。、…—–-]+/gu, ' ')
    .trim()
}

function hasCjkOrHangulText(text: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(text)
}

function isFinalizeExpansionCompatible(recentTextRaw: string, nextTextRaw: string): boolean {
  const recentText = normalizeFinalizeExpansionText(recentTextRaw)
  const nextText = normalizeFinalizeExpansionText(nextTextRaw)
  if (!recentText || !nextText || recentText === nextText) return false
  if (!nextText.startsWith(recentText)) return false

  const nextChar = nextText[recentText.length] || ''
  if (!nextChar || /\s/u.test(nextChar)) return true

  const recentLength = Array.from(recentText).length
  if (recentLength >= 6) return true
  return recentLength >= 3 && hasCjkOrHangulText(recentText)
}

function normalizeRecentFinalizedSpeaker(rawSpeaker?: string | null): string {
  return (rawSpeaker || '').trim() || 'unknown'
}

function isRecentFinalizedSpeakerCompatible(
  recentFinalizedUtterance: RecentFinalizedUtterance,
  speaker?: string | null,
): boolean {
  if (!recentFinalizedUtterance.speaker || !speaker) return true
  return normalizeRecentFinalizedSpeaker(recentFinalizedUtterance.speaker) === normalizeRecentFinalizedSpeaker(speaker)
}

export function rememberRecentFinalizedUtterance(input: {
  recentFinalizedUtterances: RecentFinalizedUtterance[]
  utterance: RecentFinalizedUtterance
  nowMs: number
  limit?: number
}): RecentFinalizedUtterance[] {
  const limit = Math.max(1, input.limit ?? RECENT_FINALIZED_UTTERANCE_LIMIT)
  return [
    ...input.recentFinalizedUtterances.filter((utterance) => (
      utterance.expiresAt > input.nowMs
      && utterance.id !== input.utterance.id
    )),
    input.utterance,
  ].slice(-limit)
}

export function classifyRecentFinalizedUtteranceMatch(input: {
  pendingUtteranceId?: string | null
  finalizedUtteranceId: string
  recentFinalizedUtterance?: RecentFinalizedUtterance | null
  recentFinalizedUtterances?: RecentFinalizedUtterance[]
  nowMs: number
  text: string
  language: string
  speaker?: string | null
}): RecentFinalizedUtteranceMatch {
  if (input.pendingUtteranceId) return { kind: 'none' }
  const candidates = input.recentFinalizedUtterances?.length
    ? input.recentFinalizedUtterances
    : (input.recentFinalizedUtterance ? [input.recentFinalizedUtterance] : [])
  for (const recentFinalizedUtterance of [...candidates].reverse()) {
    if (input.nowMs >= recentFinalizedUtterance.expiresAt) continue
    if (!isRecentFinalizedSpeakerCompatible(recentFinalizedUtterance, input.speaker)) continue
    if (normalizeSourceLanguageMatchKey(recentFinalizedUtterance.language) !== normalizeSourceLanguageMatchKey(input.language)) {
      continue
    }
    if (recentFinalizedUtterance.id === input.finalizedUtteranceId) continue
    const sameText = normalizeFinalizeReuseText(recentFinalizedUtterance.text) === normalizeFinalizeReuseText(input.text)
    const compatibleLocalExpansion = recentFinalizedUtterance.source === 'local'
      && isFinalizeExpansionCompatible(recentFinalizedUtterance.text, input.text)
    if (!sameText && !compatibleLocalExpansion) continue
    if (recentFinalizedUtterance.source === 'local') {
      return { kind: 'reuse_local', utteranceId: recentFinalizedUtterance.id }
    }
    return { kind: 'skip_duplicate_server', utteranceId: recentFinalizedUtterance.id }
  }
  return { kind: 'none' }
}

export function shouldApplyPartialTranslationResponse(input: {
  requestUtteranceId: number
  currentUtteranceId: number
  requestSpeaker: string | null
  currentSpeaker: string | null
}): boolean {
  return (
    input.requestUtteranceId === input.currentUtteranceId
    && (input.requestSpeaker || null) === (input.currentSpeaker || null)
  )
}

export function shouldApplyLatestPartialTranslationResponse(input: {
  requestUtteranceId: number
  currentUtteranceId: number
  requestSpeaker: string | null
  currentSpeaker: string | null
  requestSeq: number
  latestRequestSeq: number
  aborted: boolean
}): boolean {
  if (input.aborted) return false
  if (input.requestSeq !== input.latestRequestSeq) return false
  return shouldApplyPartialTranslationResponse({
    requestUtteranceId: input.requestUtteranceId,
    currentUtteranceId: input.currentUtteranceId,
    requestSpeaker: input.requestSpeaker,
    currentSpeaker: input.currentSpeaker,
  })
}

export function shouldApplyPendingTurnPartialTranslationResponse(input: {
  requestUtteranceId: string
  currentPendingUtteranceId: string | null
  requestSeq: number
  latestRequestSeq: number
  aborted: boolean
}): boolean {
  if (input.aborted) return false
  if (input.requestSeq !== input.latestRequestSeq) return false
  return input.requestUtteranceId === (input.currentPendingUtteranceId || null)
}

export function shouldOverrideTranslationByPriority(
  currentPriority: TranslationPriority | undefined,
  nextPriority: TranslationPriority,
): boolean {
  if (!currentPriority) return true

  const currentKindPriority = TRANSLATION_PRIORITY_KIND_ORDER[currentPriority.kind]
  const nextKindPriority = TRANSLATION_PRIORITY_KIND_ORDER[nextPriority.kind]
  if (nextKindPriority !== currentKindPriority) {
    return nextKindPriority > currentKindPriority
  }

  return nextPriority.seq > currentPriority.seq
}

export function findRecentMatchingUtteranceIndex(input: {
  utterances: Utterance[]
  sourceText: string
  sourceLanguage: string
}): number {
  const normalizedText = normalizeSttTurnText(input.sourceText)
  const normalizedLanguage = normalizeSourceLanguageMatchKey(input.sourceLanguage)
  if (!normalizedText || !normalizedLanguage) return -1

  for (let index = input.utterances.length - 1; index >= 0; index -= 1) {
    const utterance = input.utterances[index]
    if (normalizeSttTurnText(utterance.originalText) !== normalizedText) continue
    if (normalizeSourceLanguageMatchKey(utterance.originalLang) !== normalizedLanguage) continue
    return index
  }

  return -1
}

function mergeTranslationsByPriority(input: {
  utteranceId: string
  currentTranslations: Record<string, string>
  currentTranslationFinalized?: Record<string, boolean>
  currentPriorities: Map<string, TranslationPriority>
  nextTranslations: Record<string, string>
  nextPriority: TranslationPriority
  markFinalized: boolean
}): PendingUtteranceTranslationUpdate {
  const translations = { ...input.currentTranslations }
  const translationFinalized = { ...(input.currentTranslationFinalized || {}) }
  const priorities = new Map(input.currentPriorities)

  for (const [lang, text] of Object.entries(input.nextTranslations)) {
    const cleaned = text.trim()
    if (!cleaned) continue

    const bubbleKey = `${input.utteranceId}:${lang}`
    const currentPriority = priorities.get(bubbleKey)
    if (!shouldOverrideTranslationByPriority(currentPriority, input.nextPriority)) continue

    priorities.set(bubbleKey, input.nextPriority)
    translations[lang] = cleaned
    if (input.markFinalized) translationFinalized[lang] = true
  }

  return {
    translations,
    translationFinalized,
    priorities,
  }
}

export function createUtteranceStoreState(
  utterances: Utterance[],
): UtteranceStoreState {
  return {
    utterances,
    translationPriorities: new Map(),
    pendingTranslationUpdates: new Map(),
  }
}

function buildSeedTranslationState(
  targetLanguagesRaw: string[],
  sourceLanguageRaw: string,
  translationsRaw: Record<string, string>,
  prioritiesRaw: Map<string, TranslationPriority>,
): SeedTranslationState {
  const targetLanguages = buildTurnTargetLanguagesSnapshot(targetLanguagesRaw, sourceLanguageRaw)
  const translations = filterTranslationsToTargetLanguages(
    stripSourceLanguageFromTranslations(translationsRaw, sourceLanguageRaw),
    targetLanguages,
  )
  const priorities = new Map<string, TranslationPriority>()

  for (const language of Object.keys(translations)) {
    const priority = prioritiesRaw.get(language)
    if (!priority) continue
    priorities.set(language, priority)
  }

  return {
    translations,
    priorities,
  }
}

function mergePendingTranslationUpdateIntoUtterance(
  utterance: Utterance,
  pendingUpdate: PendingUtteranceTranslationUpdate,
): Utterance {
  const settledState = pruneUnresolvedTranslationTargets({
    targetLanguages: utterance.targetLanguages,
    translations: pendingUpdate.translations,
    translationFinalized: pendingUpdate.translationFinalized,
  })

  return {
    ...utterance,
    targetLanguages: settledState.targetLanguages,
    translations: settledState.translations,
    translationFinalized: settledState.translationFinalized,
  }
}

function reconcileUtteranceTranslationBase(input: {
  utterance: Utterance
  currentPriorities: Map<string, TranslationPriority>
  detectedSourceLanguage?: string
  sourceLanguagesMixed?: boolean
  sourceTextHasForeignScript?: boolean
  selectedLanguages?: string[]
  sourceText?: string
}): { utterance: Utterance, priorities: Map<string, TranslationPriority> } {
  const normalizedDetectedSourceLanguage = normalizeTranslationLanguageCode(input.detectedSourceLanguage || '')
  const keepSourceLanguageBubble = shouldKeepSourceLanguageBubble({
    sourceLanguagesMixed: input.sourceLanguagesMixed,
    sourceTextHasForeignScript: input.sourceTextHasForeignScript,
  })
  if (!normalizedDetectedSourceLanguage) {
    return {
      utterance: input.utterance,
      priorities: input.currentPriorities,
    }
  }

  const selectedLanguages = (
    input.selectedLanguages && input.selectedLanguages.length > 0
      ? input.selectedLanguages
      : [input.utterance.originalLang, ...(input.utterance.targetLanguages || [])]
  )
  const nextTargetLanguages = buildTurnTargetLanguagesSnapshot(
    selectedLanguages,
    normalizedDetectedSourceLanguage,
    {
      includeSourceLanguage: keepSourceLanguageBubble,
    },
  )
  const nextTargetLanguageSet = new Set(nextTargetLanguages)
  const nextOriginalText = input.sourceText
    ? (normalizeSttTurnText(input.sourceText) || input.utterance.originalText)
    : input.utterance.originalText
  const baseTranslations = filterTranslationsToTargetLanguages(
    stripSourceLanguageFromTranslations(input.utterance.translations, normalizedDetectedSourceLanguage, {
      keepSourceLanguage: keepSourceLanguageBubble,
    }),
    nextTargetLanguages,
  )
  const baseTranslationFinalized = Object.fromEntries(
    Object.entries(input.utterance.translationFinalized || {})
      .filter(([language, isFinalized]) => nextTargetLanguageSet.has(language) && isFinalized === true),
  )
  const nextPriorities = new Map(
    Array.from(input.currentPriorities.entries()).filter(([bubbleKey]) => {
      if (!bubbleKey.startsWith(`${input.utterance.id}:`)) return true
      const language = bubbleKey.slice(input.utterance.id.length + 1)
      return nextTargetLanguageSet.has(language)
    }),
  )
  const nextUtterance: Utterance = { ...input.utterance }
  delete nextUtterance.sourceLanguagesMixed
  delete nextUtterance.sourceTextHasForeignScript
  nextUtterance.originalText = nextOriginalText
  nextUtterance.originalLang = normalizedDetectedSourceLanguage
  if (input.sourceLanguagesMixed === true) {
    nextUtterance.sourceLanguagesMixed = true
  }
  if (input.sourceTextHasForeignScript === true) {
    nextUtterance.sourceTextHasForeignScript = true
  }
  nextUtterance.targetLanguages = nextTargetLanguages
  nextUtterance.translations = baseTranslations
  nextUtterance.translationFinalized = baseTranslationFinalized

  return {
    utterance: nextUtterance,
    priorities: nextPriorities,
  }
}

function applyPendingTranslationUpdateToUtteranceState(input: {
  utterance: Utterance
  currentPriorities: Map<string, TranslationPriority>
  pendingUpdate: PendingUtteranceTranslationUpdate
}): { utterance: Utterance, priorities: Map<string, TranslationPriority> } {
  const reconciled = reconcileUtteranceTranslationBase({
    utterance: input.utterance,
    currentPriorities: input.currentPriorities,
    detectedSourceLanguage: input.pendingUpdate.detectedSourceLanguage,
    sourceLanguagesMixed: input.pendingUpdate.sourceLanguagesMixed,
    sourceTextHasForeignScript: input.pendingUpdate.sourceTextHasForeignScript,
    selectedLanguages: input.pendingUpdate.selectedLanguages,
    sourceText: input.pendingUpdate.sourceText,
  })
  let nextTranslations = { ...reconciled.utterance.translations }
  let nextTranslationFinalized = { ...(reconciled.utterance.translationFinalized || {}) }
  let nextPriorities = new Map(reconciled.priorities)

  for (const [language, translatedText] of Object.entries(input.pendingUpdate.translations)) {
    const priority = input.pendingUpdate.priorities.get(`${reconciled.utterance.id}:${language}`)
    if (!priority) continue

    const merged = mergeTranslationsByPriority({
      utteranceId: reconciled.utterance.id,
      currentTranslations: nextTranslations,
      currentTranslationFinalized: nextTranslationFinalized,
      currentPriorities: nextPriorities,
      nextTranslations: { [language]: translatedText },
      nextPriority: priority,
      markFinalized: input.pendingUpdate.translationFinalized[language] === true,
    })

    nextTranslations = merged.translations
    nextTranslationFinalized = merged.translationFinalized
    nextPriorities = merged.priorities
  }

  const settledState = pruneUnresolvedTranslationTargets({
    targetLanguages: reconciled.utterance.targetLanguages,
    translations: nextTranslations,
    translationFinalized: nextTranslationFinalized,
  })

  return {
    utterance: {
      ...reconciled.utterance,
      targetLanguages: settledState.targetLanguages,
      translations: settledState.translations,
      translationFinalized: settledState.translationFinalized,
    },
    priorities: nextPriorities,
  }
}

function appendOrReplaceUtterance(
  utterances: Utterance[],
  nextUtterance: Utterance,
): Utterance[] {
  const existingIndex = utterances.findIndex((utterance) => utterance.id === nextUtterance.id)
  const normalizedNextUtterance = normalizeStoredUtterance(nextUtterance)
  const existingUtterance = existingIndex >= 0 ? utterances[existingIndex] : null
  if (existingUtterance === normalizedNextUtterance) return utterances

  const withoutExisting = existingIndex >= 0
    ? [
      ...utterances.slice(0, existingIndex),
      ...utterances.slice(existingIndex + 1),
    ]
    : utterances
  const nextCreatedAt = inferUtteranceCreatedAtMs(normalizedNextUtterance)
  if (nextCreatedAt === null) return [...withoutExisting, normalizedNextUtterance]

  const insertIndex = withoutExisting.findIndex((utterance) => {
    const createdAt = inferUtteranceCreatedAtMs(utterance)
    return createdAt !== null && createdAt > nextCreatedAt
  })

  if (insertIndex < 0) {
    return [...withoutExisting, normalizedNextUtterance]
  }

  return [
    ...withoutExisting.slice(0, insertIndex),
    normalizedNextUtterance,
    ...withoutExisting.slice(insertIndex),
  ]
}

export function appendFinalizedUtteranceToStoreState(
  store: UtteranceStoreState,
  utterance: Utterance,
  seedTranslationState?: SeedTranslationState,
): UtteranceStoreState {
  const existingIndex = store.utterances.findIndex((item) => item.id === utterance.id)
  const baseUtterance = existingIndex >= 0 ? store.utterances[existingIndex] : utterance
  const pendingUpdate = store.pendingTranslationUpdates.get(utterance.id)
  const nextTranslationPriorities = new Map(store.translationPriorities)
  const seededTranslations = seedTranslationState?.translations || {}
  const seededTranslationFinalized: Record<string, boolean> = {
    ...(baseUtterance.translationFinalized || {}),
  }

  for (const language of Object.keys(seededTranslations)) {
    const priority = seedTranslationState?.priorities.get(language)
    if (!priority) continue
    const bubbleKey = `${utterance.id}:${language}`
    nextTranslationPriorities.set(bubbleKey, priority)
    seededTranslationFinalized[language] = false
  }

  const baseWithSeedTranslations = Object.keys(seededTranslations).length > 0
    ? mergePendingTranslationUpdateIntoUtterance({
      ...baseUtterance,
      translations: seededTranslations,
      translationFinalized: seededTranslationFinalized,
    }, {
      translations: seededTranslations,
      translationFinalized: seededTranslationFinalized,
      priorities: new Map(),
    })
    : baseUtterance

  const resolvedPendingState = pendingUpdate
    ? applyPendingTranslationUpdateToUtteranceState({
      utterance: baseWithSeedTranslations,
      currentPriorities: nextTranslationPriorities,
      pendingUpdate,
    })
    : null
  const nextUtterance = resolvedPendingState?.utterance || baseWithSeedTranslations

  const nextUtterances = appendOrReplaceUtterance(store.utterances, nextUtterance)
  if (!pendingUpdate) {
    if (nextUtterances === store.utterances) return store
    return {
      ...store,
      utterances: nextUtterances,
      translationPriorities: nextTranslationPriorities,
    }
  }

  const nextPendingTranslationUpdates = new Map(store.pendingTranslationUpdates)
  nextPendingTranslationUpdates.delete(utterance.id)

  return {
    utterances: nextUtterances,
    translationPriorities: resolvedPendingState?.priorities || nextTranslationPriorities,
    pendingTranslationUpdates: nextPendingTranslationUpdates,
  }
}

function removeTranslationPrioritiesForUtterance(
  priorities: Map<string, TranslationPriority>,
  utteranceId: string,
): Map<string, TranslationPriority> {
  let nextPriorities = priorities
  const prefix = `${utteranceId}:`
  for (const bubbleKey of priorities.keys()) {
    if (!bubbleKey.startsWith(prefix)) continue
    if (nextPriorities === priorities) {
      nextPriorities = new Map(priorities)
    }
    nextPriorities.delete(bubbleKey)
  }
  return nextPriorities
}

export function mergeServerHydrationUtteranceIntoStoreState(
  store: UtteranceStoreState,
  utterance: Utterance,
): UtteranceStoreState {
  const serverUtterance = normalizeStoredUtterance(utterance)
  const pendingUpdate = store.pendingTranslationUpdates.get(serverUtterance.id)
  const basePriorities = removeTranslationPrioritiesForUtterance(
    store.translationPriorities,
    serverUtterance.id,
  )
  const resolvedPendingState = pendingUpdate
    ? applyPendingTranslationUpdateToUtteranceState({
        utterance: serverUtterance,
        currentPriorities: basePriorities,
        pendingUpdate,
      })
    : null
  const nextUtterance = resolvedPendingState?.utterance || serverUtterance
  const nextUtterances = appendOrReplaceUtterance(store.utterances, nextUtterance)

  if (!pendingUpdate) {
    return {
      ...store,
      utterances: nextUtterances,
      translationPriorities: basePriorities,
    }
  }

  const nextPendingTranslationUpdates = new Map(store.pendingTranslationUpdates)
  nextPendingTranslationUpdates.delete(serverUtterance.id)

  return {
    utterances: nextUtterances,
    translationPriorities: resolvedPendingState?.priorities || basePriorities,
    pendingTranslationUpdates: nextPendingTranslationUpdates,
  }
}

export function applyTranslationToUtteranceStoreState(input: {
  store: UtteranceStoreState
  utteranceId: string
  translations: Record<string, string>
  priority: TranslationPriority
  markFinalized: boolean
  fallbackMatch?: TranslationApplyFallbackMatch
  detectedSourceLanguage?: string
  sourceLanguagesMixed?: boolean
  sourceTextHasForeignScript?: boolean
  selectedLanguages?: string[]
  sourceText?: string
}): UtteranceStoreState {
  const normalizedDetectedSourceLanguage = normalizeIncomingSourceLanguage(
    input.detectedSourceLanguage || '',
    input.sourceText || '',
  )
  const keepSourceLanguageBubble = shouldKeepSourceLanguageBubble({
    sourceLanguagesMixed: input.sourceLanguagesMixed,
    sourceTextHasForeignScript: input.sourceTextHasForeignScript,
  })
  let idx = input.store.utterances.findIndex((utterance) => utterance.id === input.utteranceId)
  if (idx < 0 && input.fallbackMatch) {
    idx = findRecentMatchingUtteranceIndex({
      utterances: input.store.utterances,
      sourceText: input.fallbackMatch.sourceText,
      sourceLanguage: input.fallbackMatch.sourceLanguage,
    })
  }

  if (idx < 0) {
    const queuedTranslations = normalizedDetectedSourceLanguage
      ? stripSourceLanguageFromTranslations(input.translations, normalizedDetectedSourceLanguage, {
        keepSourceLanguage: keepSourceLanguageBubble,
      })
      : input.translations
    const existingPending = input.store.pendingTranslationUpdates.get(input.utteranceId)
    const mergedPending = mergeTranslationsByPriority({
      utteranceId: input.utteranceId,
      currentTranslations: existingPending?.translations || {},
      currentTranslationFinalized: existingPending?.translationFinalized,
      currentPriorities: existingPending?.priorities || new Map(),
      nextTranslations: queuedTranslations,
      nextPriority: input.priority,
      markFinalized: input.markFinalized,
    })

    const nextPendingTranslationUpdates = new Map(input.store.pendingTranslationUpdates)
    nextPendingTranslationUpdates.set(input.utteranceId, {
      ...mergedPending,
      detectedSourceLanguage: input.detectedSourceLanguage ?? existingPending?.detectedSourceLanguage,
      sourceLanguagesMixed: input.sourceLanguagesMixed ?? existingPending?.sourceLanguagesMixed,
      sourceTextHasForeignScript: input.sourceTextHasForeignScript ?? existingPending?.sourceTextHasForeignScript,
      selectedLanguages: input.selectedLanguages ?? existingPending?.selectedLanguages,
      sourceText: input.sourceText ?? existingPending?.sourceText,
    })

    return {
      ...input.store,
      pendingTranslationUpdates: nextPendingTranslationUpdates,
    }
  }

  const target = input.store.utterances[idx]
  const reconciled = reconcileUtteranceTranslationBase({
    utterance: target,
    currentPriorities: input.store.translationPriorities,
    detectedSourceLanguage: input.detectedSourceLanguage,
    sourceLanguagesMixed: input.sourceLanguagesMixed,
    sourceTextHasForeignScript: input.sourceTextHasForeignScript,
    selectedLanguages: input.selectedLanguages,
    sourceText: input.sourceText,
  })
  const baseTarget = reconciled.utterance
  const nextTranslations = normalizedDetectedSourceLanguage
    ? filterTranslationsToTargetLanguages(
      stripSourceLanguageFromTranslations(input.translations, normalizedDetectedSourceLanguage, {
        keepSourceLanguage: keepSourceLanguageBubble,
      }),
      baseTarget.targetLanguages || [],
    )
    : input.translations
  const merged = mergeTranslationsByPriority({
    utteranceId: baseTarget.id,
    currentTranslations: baseTarget.translations,
    currentTranslationFinalized: baseTarget.translationFinalized,
    currentPriorities: reconciled.priorities,
    nextTranslations,
    nextPriority: input.priority,
    markFinalized: input.markFinalized,
  })

  const settledState = input.markFinalized
    ? pruneUnresolvedTranslationTargets({
      targetLanguages: baseTarget.targetLanguages,
      translations: merged.translations,
      translationFinalized: merged.translationFinalized,
    })
    : null

  const nextTarget: Utterance = {
    ...baseTarget,
    targetLanguages: settledState?.targetLanguages || baseTarget.targetLanguages,
    translations: settledState?.translations || merged.translations,
    translationFinalized: settledState?.translationFinalized || merged.translationFinalized,
  }

  const nextUtterances = [
    ...input.store.utterances.slice(0, idx),
    nextTarget,
    ...input.store.utterances.slice(idx + 1),
  ]

  let nextPendingTranslationUpdates = input.store.pendingTranslationUpdates
  if (
    input.utteranceId !== target.id
    && input.store.pendingTranslationUpdates.has(input.utteranceId)
  ) {
    nextPendingTranslationUpdates = new Map(input.store.pendingTranslationUpdates)
    nextPendingTranslationUpdates.delete(input.utteranceId)
  }

  return {
    utterances: nextUtterances,
    translationPriorities: merged.priorities,
    pendingTranslationUpdates: nextPendingTranslationUpdates,
  }
}

export function replaceFinalizedUtteranceSourceInStoreState(input: {
  store: UtteranceStoreState
  utteranceId: string
  sourceText: string
  sourceLanguage: string
  selectedLanguages: string[]
}): UtteranceStoreState {
  const sourceText = normalizeSttTurnText(input.sourceText)
  if (!sourceText) return input.store

  const idx = input.store.utterances.findIndex((utterance) => utterance.id === input.utteranceId)
  if (idx < 0) return input.store

  const target = input.store.utterances[idx]
  const normalizedSourceLanguage = normalizeIncomingSourceLanguage(input.sourceLanguage, sourceText)
  const reconciled = normalizedSourceLanguage
    ? reconcileUtteranceTranslationBase({
      utterance: target,
      currentPriorities: input.store.translationPriorities,
      detectedSourceLanguage: normalizedSourceLanguage,
      selectedLanguages: input.selectedLanguages,
      sourceText,
    })
    : {
      utterance: {
        ...target,
        originalText: sourceText,
      },
      priorities: input.store.translationPriorities,
    }

  const nextUtterances = [
    ...input.store.utterances.slice(0, idx),
    reconciled.utterance,
    ...input.store.utterances.slice(idx + 1),
  ]

  return {
    ...input.store,
    utterances: nextUtterances,
    translationPriorities: reconciled.priorities,
  }
}

interface TranslateApiResult {
  translations: Record<string, string>
  sourceLanguage?: string
  sourceLanguagesMixed?: boolean
  sourceTextHasForeignScript?: boolean
  ttsLanguage?: string
  ttsAudioBase64?: string
  ttsAudioMime?: string
  provider?: string
  infrastructureProvider?: string
  model?: string
  translationPromptTokens?: number
  translationCompletionTokens?: number
  translationTotalTokens?: number
}

function buildRenderableTargetLanguagesForUtterance(utterance: Pick<
  Utterance,
  'originalLang' | 'targetLanguages' | 'translations' | 'translationFinalized' | 'sourceLanguagesMixed' | 'sourceTextHasForeignScript'
>): string[] {
  const sourceLanguage = normalizeTranslationLanguageKey(utterance.originalLang)
  const candidates: string[] = []
  const seen = new Set<string>()
  const keepSourceLanguageBubble = shouldKeepSourceLanguageBubble({
    sourceLanguagesMixed: utterance.sourceLanguagesMixed,
    sourceTextHasForeignScript: utterance.sourceTextHasForeignScript,
  })

  const pushCandidate = (rawLanguage: string | undefined) => {
    const language = (rawLanguage || '').trim()
    if (!language) return
    const key = normalizeTranslationLanguageKey(language) || language.toLowerCase()
    if (!keepSourceLanguageBubble && sourceLanguage && key === sourceLanguage) return
    if (seen.has(key)) return
    seen.add(key)
    candidates.push(language)
  }

  for (const language of utterance.targetLanguages || []) pushCandidate(language)
  for (const language of Object.keys(utterance.translations || {})) pushCandidate(language)
  for (const language of Object.keys(utterance.translationFinalized || {})) pushCandidate(language)

  return candidates
}

export function resolveRenderedTtsCandidateFromUtterance(utterance: Pick<
  Utterance,
  'originalLang' | 'targetLanguages' | 'translations' | 'translationFinalized' | 'sourceLanguagesMixed' | 'sourceTextHasForeignScript'
>): { language: string, text: string } | null {
  for (const language of buildRenderableTargetLanguagesForUtterance(utterance)) {
    const text = (utterance.translations[language] || '').trim()
    if (!text) continue
    return { language, text }
  }

  return null
}

interface RecentTurnContextPayload {
  sourceLanguage: string
  sourceText: string
  translations: Record<string, string>
  occurredAtMs: number
  ageMs: number
  isFinalized: boolean
}

interface ClientEventLogPayload {
  eventType: 'stt_session_started' | 'stt_session_stopped' | 'stt_turn_started' | 'stt_turn_finalized'
  clientMessageId?: string
  sourceLanguage?: string
  sourceText?: string
  translations?: Record<string, string>
  sttDurationMs?: number
  totalDurationMs?: number
  provider?: string
  infrastructureProvider?: string
  model?: string
  translationPromptTokens?: number
  translationCompletionTokens?: number
  translationTotalTokens?: number
  metadata?: Record<string, unknown>
  keepalive?: boolean
}

function createSpeakerAvatarSeed(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `avatar_${crypto.randomUUID().replace(/-/g, '')}`
  }
  return `avatar_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
}

function buildClientContextPayload(usageSec: number): Record<string, unknown> {
  if (typeof window === 'undefined') {
    return { usageSec }
  }

  const nativeTracking = resolveNativeAppTrackingContext({
    detail: (window as NativeAppUpdateWindow).__MINGLE_NATIVE_APP_UPDATE_STATUS,
    apiNamespace: resolveRuntimeApiNamespace(),
    isNativeAppRuntime: isNativeAppRuntime(),
  })

  let timezone: string | null = null
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    timezone = null
  }

  return {
    language: navigator.language || null,
    pageLanguage: document.documentElement?.lang || null,
    referrer: document.referrer || null,
    fullUrl: window.location.href || null,
    queryParams: window.location.search || null,
    pathname: window.location.pathname || null,
    screenWidth: window.screen?.width ?? null,
    screenHeight: window.screen?.height ?? null,
    timezone,
    platform: navigator.platform || null,
    clientPlatform: nativeTracking.clientPlatform,
    apiNamespace: nativeTracking.apiNamespace,
    appVersion: nativeTracking.appVersion || process.env.NEXT_PUBLIC_APP_VERSION || null,
    usageSec,
  }
}

function isSttDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const forced = window.localStorage.getItem(LS_KEY_STT_DEBUG)
    if (forced === '1') return true
    if (forced === '0') return false
  } catch {
    // no-op
  }
  return /(?:\?|&)sttDebug=1(?:&|$)/.test(window.location.search || '')
}

function logSttDebug(event: string, payload?: Record<string, unknown>) {
  if (!isSttDebugEnabled()) return
  if (payload) {
    console.log('[MingleSTT]', event, payload)
    return
  }
  console.log('[MingleSTT]', event)
}

function buildDebugTextPreview(rawText: string): string {
  const normalized = rawText.trim().replace(/\s+/g, ' ')
  if (!normalized) return ''
  return normalized.slice(0, 120)
}

const LOAD_BATCH_SIZE = LOCAL_UTTERANCE_CACHE_LIMIT

export default function useRealtimeSTT({
  languages,
  targetLanguages,
  speechLanguages,
  onLimitReached,
  onTtsRequested,
  onTtsAudio,
  onTtsCanceled,
  enableTts,
  enableAec = false,
  sonioxManualFinalizeSilenceMs = DEFAULT_SONIOX_SILENCE_MS,
  usageLimitSec = DEFAULT_USAGE_LIMIT_SEC,
  conversationId,
  sessionKeyOverride,
  storageNamespace,
  translationModel,
  onEndpointingLatencyMetric,
}: UseRealtimeSTTOptions) {
  const effectiveTargetLanguages = useMemo(
    () => targetLanguages ?? languages ?? [],
    [languages, targetLanguages],
  )
  const effectiveSpeechLanguages = useMemo(
    () => speechLanguages ?? languages ?? effectiveTargetLanguages,
    [effectiveTargetLanguages, languages, speechLanguages],
  )
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle')
  const connectionStatusRef = useRef<ConnectionStatus>(connectionStatus)
  connectionStatusRef.current = connectionStatus

  // Cached utterances from localStorage. Conversation rooms keep only a latest-message warm cache.
  const storedUtterancesRef = useRef<Utterance[]>([])
  const storageLoadedCountRef = useRef(0)
  const [hasOlderUtterances, setHasOlderUtterances] = useState(false)
  const [isStorageHydrated, setIsStorageHydrated] = useState(false)
  const storageHydratedRef = useRef(false)
  const pendingHasOlderUtterancesRef = useRef<boolean | null>(null)
  const serverOlderCursorRef = useRef<ConversationHydrationCursor | null>(null)
  const hasOlderServerUtterancesRef = useRef(false)
  const isLoadingOlderServerUtterancesRef = useRef(false)

  const [utteranceStore, setUtteranceStore] = useState<UtteranceStoreState>(() => createUtteranceStoreState([]))
  const utterances = utteranceStore.utterances
  const [partialTranscript, setPartialTranscript] = useState('')
  const [partialTranslations, setPartialTranslations] = useState<Record<string, string>>({})
  const [partialLang, setPartialLang] = useState<string | null>(null)
  const [pendingTurnRenderVersion, setPendingTurnRenderVersion] = useState(0)
  const [partialTranslateTick, setPartialTranslateTick] = useState(0)
  const [volume, setVolume] = useState(0)
  const [usageSec, setUsageSec] = useState(0)
  const [messageCount, setMessageCount] = useState(0)
  const localUtteranceCacheLimit = conversationId ? LOCAL_UTTERANCE_CACHE_LIMIT : undefined
  const buildLocalUtteranceCache = useCallback((items: Utterance[]) => (
    buildPersistedUtteranceCache(items, localUtteranceCacheLimit)
  ), [localUtteranceCacheLimit])
  const persistLocalUtterancesSnapshot = useCallback((items: Utterance[]) => {
    persistUtterancesSnapshot(items, storageNamespace, { maxItems: localUtteranceCacheLimit })
  }, [localUtteranceCacheLimit, storageNamespace])

  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false
    let fullStorageParseTimer: ReturnType<typeof setTimeout> | null = null
    let messageCountFromUtteranceSnapshot = 0

    const applyStoredUtterances = (
      all: Utterance[],
      options?: { updateMessageCount?: boolean },
    ) => {
      if (cancelled) return
      const nextMessageCount = countPersistedUtterances(all)
      messageCountFromUtteranceSnapshot = Math.max(messageCountFromUtteranceSnapshot, nextMessageCount)
      const cached = buildLocalUtteranceCache(all)
      storedUtterancesRef.current = cached
      const initial = cached.slice(-LOAD_BATCH_SIZE)
      storageLoadedCountRef.current = initial.length
      setUtteranceStore(createUtteranceStoreState(initial))
      setHasOlderUtterances(cached.length > initial.length)
      if (cached.length !== all.length) {
        persistLocalUtterancesSnapshot(cached)
      }
      if (options?.updateMessageCount) {
        setMessageCount((current) => Math.max(current, nextMessageCount))
      }
    }

    try {
      const stored = localStorage.getItem(buildStorageKey(LS_KEY_UTTERANCES, storageNamespace))
      if (stored) {
        const recent = parseRecentStoredUtterances(stored, LOAD_BATCH_SIZE)
        if (recent) {
          messageCountFromUtteranceSnapshot = countPersistedUtterances(recent.utterances)
          const cachedRecent = buildLocalUtteranceCache(recent.utterances)
          storedUtterancesRef.current = cachedRecent
          storageLoadedCountRef.current = cachedRecent.length
          setUtteranceStore(createUtteranceStoreState(cachedRecent))
          setHasOlderUtterances(recent.hasOlder)
          fullStorageParseTimer = setTimeout(() => {
            fullStorageParseTimer = null
            try {
              applyStoredUtterances(parseStoredUtterances(stored), { updateMessageCount: true })
            } catch {
              // Keep the already-rendered recent batch when full history parsing fails.
            }
          }, 0)
        } else {
          applyStoredUtterances(parseStoredUtterances(stored))
        }
      }
    } catch {
      storedUtterancesRef.current = []
      storageLoadedCountRef.current = 0
      setUtteranceStore(createUtteranceStoreState([]))
      setHasOlderUtterances(false)
    }

    try {
      const parsedUsage = Number.parseInt(
        localStorage.getItem(buildStorageKey(LS_KEY_USAGE, storageNamespace)) || '0',
        10,
      )
      setUsageSec(Number.isFinite(parsedUsage) && parsedUsage >= 0 ? parsedUsage : 0)
    } catch {
      setUsageSec(0)
    }

    try {
      const parsedMessageCount = Number.parseInt(
        localStorage.getItem(buildStorageKey(LS_KEY_MESSAGE_COUNT, storageNamespace)) || '0',
        10,
      )
      setMessageCount(Math.max(
        normalizePersistedMessageCount(parsedMessageCount),
        messageCountFromUtteranceSnapshot,
      ))
    } catch {
      setMessageCount(messageCountFromUtteranceSnapshot)
    }

    storageHydratedRef.current = true
    setIsStorageHydrated(true)

    return () => {
      cancelled = true
      if (fullStorageParseTimer) {
        clearTimeout(fullStorageParseTimer)
      }
    }
  }, [buildLocalUtteranceCache, persistLocalUtterancesSnapshot, storageNamespace])

  const audioContextRef = useRef<AudioContext | null>(null)
  const utterancesRef = useRef<Utterance[]>(utterances)
  const streamRef = useRef<MediaStream | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const utteranceIdRef = useRef(0)
  const usageIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastAudioChunkAtRef = useRef(0)
  const sessionAudioStartedAtMsRef = useRef<number | null>(null)
  const isBackgroundRecoveringRef = useRef(false)
  const wasBackgroundedRef = useRef(false)
  const onLimitReachedRef = useRef(onLimitReached)
  onLimitReachedRef.current = onLimitReached
  const onEndpointingLatencyMetricRef = useRef(onEndpointingLatencyMetric)
  onEndpointingLatencyMetricRef.current = onEndpointingLatencyMetric

  // Ref mirror of partialTranslations for synchronous read
  // (avoids nesting setUtterances inside setPartialTranslations updater,
  //  which causes duplicates in React Strict Mode)
  const partialTranslationsRef = useRef<Record<string, string>>({})
  const partialTranscriptRef = useRef('')
  const partialLangRef = useRef<string | null>(null)
  const pendingTurnsBySpeakerRef = useRef<Record<string, PendingSpeakerTurn>>({})
  const pendingTurnTranslationRuntimeRef = useRef<Record<string, PendingTurnTranslationRuntime>>({})
  const finalizedTurnTranslationControllersRef = useRef<Record<string, AbortController>>({})
  const activePartialSpeakerRef = useRef<string | null>(null)
  const isStoppingRef = useRef(false)
  const onTtsRequestedRef = useRef(onTtsRequested)
  onTtsRequestedRef.current = onTtsRequested
  const onTtsAudioRef = useRef(onTtsAudio)
  onTtsAudioRef.current = onTtsAudio
  const onTtsCanceledRef = useRef(onTtsCanceled)
  onTtsCanceledRef.current = onTtsCanceled
  const enableTtsRef = useRef(enableTts)
  enableTtsRef.current = enableTts
  const stopFinalizeDedupRef = useRef<{ utteranceId: string, expiresAt: number }>({ utteranceId: '', expiresAt: 0 })

  const finalizedTtsSignatureRef = useRef<Map<string, string>>(new Map())
  const pendingFinalizedTtsUtteranceIdsRef = useRef<Set<string>>(new Set())
  // Monotonically increasing sequence number for translation requests.
  // Final translations use this to keep newer final responses ahead of older ones.
  const translateSeqRef = useRef(0)
  const conversationClearSequenceRef = useRef(0)
  const recentFinalizedUtterancesRef = useRef<RecentFinalizedUtterance[]>([])
  const sessionKeyRef = useRef('')
  const speakerAvatarSessionSeedRef = useRef('')
  const speakerAvatarAssignmentsRef = useRef<Record<string, number>>({})
  const turnStartedAtRef = useRef<number | null>(null)

  const hasActiveSessionRef = useRef(false)
  const useNativeSttRef = useRef(false)
  const nativeStopRequestedRef = useRef(false)
  const targetLanguagesRef = useRef(effectiveTargetLanguages)
  targetLanguagesRef.current = effectiveTargetLanguages
  const connectionErrorResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sonioxLanguageHintsEnabledRef = useRef(false)

  const getCurrentTargetLanguages = useCallback(() => targetLanguagesRef.current, [])
  const bumpPendingTurnRenderVersion = useCallback(() => {
    setPendingTurnRenderVersion((prev) => prev + 1)
  }, [])

  const getPendingTurnTranslationRuntime = useCallback((utteranceId: string): PendingTurnTranslationRuntime => {
    const existing = pendingTurnTranslationRuntimeRef.current[utteranceId]
    if (existing) return existing
    const runtime: PendingTurnTranslationRuntime = {
      hasFiredInitialRequest: false,
      lastTranslateLen: 0,
      latestRequestSeq: 0,
      lastRequestSignature: '',
      lastTargetSignature: buildLanguageSelectionSignature(targetLanguagesRef.current),
      lastRequestedText: '',
      lastRequestedAtMs: 0,
      controller: null,
    }
    pendingTurnTranslationRuntimeRef.current[utteranceId] = runtime
    return runtime
  }, [])

  const clearPendingTurnTranslationRuntime = useCallback((utteranceId: string) => {
    const runtime = pendingTurnTranslationRuntimeRef.current[utteranceId]
    if (runtime?.controller) {
      runtime.controller.abort()
    }
    delete pendingTurnTranslationRuntimeRef.current[utteranceId]
  }, [])

  const clearAllPendingTurnTranslationRuntime = useCallback(() => {
    for (const runtime of Object.values(pendingTurnTranslationRuntimeRef.current)) {
      runtime.controller?.abort()
    }
    pendingTurnTranslationRuntimeRef.current = {}
  }, [])

  const clearFinalizedTurnTranslationController = useCallback((utteranceId: string) => {
    const controller = finalizedTurnTranslationControllersRef.current[utteranceId]
    if (!controller) return
    controller.abort()
    delete finalizedTurnTranslationControllersRef.current[utteranceId]
  }, [])

  const clearAllFinalizedTurnTranslationControllers = useCallback(() => {
    for (const controller of Object.values(finalizedTurnTranslationControllersRef.current)) {
      controller.abort()
    }
    finalizedTurnTranslationControllersRef.current = {}
  }, [])

  const removePendingTurn = useCallback((speaker: string) => {
    const pendingTurn = pendingTurnsBySpeakerRef.current[speaker]
    if (!pendingTurn) return
    clearPendingTurnTranslationRuntime(pendingTurn.utteranceId)
    delete pendingTurnsBySpeakerRef.current[speaker]
    bumpPendingTurnRenderVersion()
  }, [bumpPendingTurnRenderVersion, clearPendingTurnTranslationRuntime])

  const clearConnectionErrorResetTimer = useCallback(() => {
    if (!connectionErrorResetTimerRef.current) return
    clearTimeout(connectionErrorResetTimerRef.current)
    connectionErrorResetTimerRef.current = null
  }, [])
  const pendingNativeStopAckResolverRef = useRef<(() => void) | null>(null)
  const pendingNativeStopAckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearPendingNativeStopAckTimeout = useCallback(() => {
    if (!pendingNativeStopAckTimeoutRef.current) return
    clearTimeout(pendingNativeStopAckTimeoutRef.current)
    pendingNativeStopAckTimeoutRef.current = null
  }, [])
  const resolvePendingNativeStopAck = useCallback(() => {
    clearPendingNativeStopAckTimeout()
    const resolve = pendingNativeStopAckResolverRef.current
    pendingNativeStopAckResolverRef.current = null
    resolve?.()
  }, [clearPendingNativeStopAckTimeout])
  const clearUtterancePersistTimer = useCallback(() => {
    if (!utterancePersistTimerRef.current) return
    clearTimeout(utterancePersistTimerRef.current)
    utterancePersistTimerRef.current = null
  }, [])
  const nativeMicPermissionRecoveryActionRef = useRef<NativeMicPermissionRecoveryAction>('none')
  const nativeShellSupportsOpenAppSettingsRef = useRef(false)
  const serverHydrationKeyRef = useRef('')
  const nativeSttOwnerKeyRef = useRef('')
  if (!nativeSttOwnerKeyRef.current) {
    nativeSttOwnerKeyRef.current = [
      'native-stt-owner',
      conversationId || 'no-conversation',
      storageNamespace || sessionKeyOverride || 'default',
    ].join(':')
  }

  const claimCurrentNativeSttOwner = useCallback(() => {
    claimNativeSttOwner(nativeSttOwnerKeyRef.current)
  }, [])

  const releaseCurrentNativeSttOwner = useCallback(() => {
    releaseNativeSttOwner(nativeSttOwnerKeyRef.current)
  }, [])

  const isCurrentNativeSttOwner = useCallback(() => (
    isNativeSttOwner(nativeSttOwnerKeyRef.current)
  ), [])

  const claimCurrentNativeSttOwnerIfUnclaimed = useCallback(() => {
    if (!activeNativeSttOwnerKey) {
      claimCurrentNativeSttOwner()
    }
    return isCurrentNativeSttOwner()
  }, [claimCurrentNativeSttOwner, isCurrentNativeSttOwner])

  const sendNativeSttCommand = useCallback((command: NativeSttBridgeCommand): boolean => {
    if (typeof window === 'undefined') return false
    const bridge = window.ReactNativeWebView
    if (!bridge || typeof bridge.postMessage !== 'function') return false
    try {
      bridge.postMessage(JSON.stringify(command))
      return true
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    useNativeSttRef.current = shouldUseNativeSttBridge()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!shouldUseNativeSttBridge()) return
    const cachedWindow = window as NativeAppUpdateWindow
    const cachedNativeStatus = typeof cachedWindow.__MINGLE_LAST_NATIVE_STT_STATUS === 'string'
      ? cachedWindow.__MINGLE_LAST_NATIVE_STT_STATUS
      : null
    const nextConnectionStatus = resolveConnectionStatusFromNativeBridgeStatus({
      nativeStatus: cachedNativeStatus,
      previousConnectionStatus: connectionStatusRef.current,
    })
    if (!nextConnectionStatus) return
    if (nextConnectionStatus === 'connecting' || nextConnectionStatus === 'ready') {
      if (!claimCurrentNativeSttOwnerIfUnclaimed()) return
    } else if (activeNativeSttOwnerKey && !isCurrentNativeSttOwner()) {
      return
    }
    if (nextConnectionStatus === 'ready') {
      hasActiveSessionRef.current = true
      nativeMicPermissionRecoveryActionRef.current = 'none'
    }
    if (nextConnectionStatus === 'connecting') {
      nativeMicPermissionRecoveryActionRef.current = 'none'
    }
    setConnectionStatus(nextConnectionStatus)
  }, [claimCurrentNativeSttOwnerIfUnclaimed, isCurrentNativeSttOwner])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!shouldUseNativeSttBridge()) return
    if (connectionStatus !== 'connecting') return

    let cancelled = false
    let attemptsRemaining = 20

    const reconcileNativeStatus = () => {
      if (cancelled) return
      const cachedWindow = window as NativeAppUpdateWindow
      const cachedNativeStatus = typeof cachedWindow.__MINGLE_LAST_NATIVE_STT_STATUS === 'string'
        ? cachedWindow.__MINGLE_LAST_NATIVE_STT_STATUS
        : null
      const nextConnectionStatus = resolveConnectionStatusFromNativeBridgeStatus({
        nativeStatus: cachedNativeStatus,
        previousConnectionStatus: connectionStatusRef.current,
      })
      if (!nextConnectionStatus) return

      if (nextConnectionStatus === 'ready') {
        if (!claimCurrentNativeSttOwnerIfUnclaimed()) return
        hasActiveSessionRef.current = true
        nativeMicPermissionRecoveryActionRef.current = 'none'
        setConnectionStatus('ready')
        return
      }

      if (nextConnectionStatus === 'idle' || nextConnectionStatus === 'error') {
        if (activeNativeSttOwnerKey && !isCurrentNativeSttOwner()) return
        setConnectionStatus(nextConnectionStatus)
      }
    }

    const timer = window.setInterval(() => {
      reconcileNativeStatus()
      attemptsRemaining -= 1
      if (attemptsRemaining <= 0 || connectionStatusRef.current !== 'connecting') {
        window.clearInterval(timer)
      }
    }, 120)

    reconcileNativeStatus()

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [claimCurrentNativeSttOwnerIfUnclaimed, connectionStatus, isCurrentNativeSttOwner])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!shouldUseNativeSttBridge()) return
    const cachedWindow = window as NativeAppUpdateWindow
    const cachedPermission = typeof cachedWindow.__MINGLE_LAST_NATIVE_MIC_PERMISSION === 'string'
      ? cachedWindow.__MINGLE_LAST_NATIVE_MIC_PERMISSION
      : null
    if (!cachedPermission) return
    nativeMicPermissionRecoveryActionRef.current = resolveCachedNativeMicPermissionRecoveryAction({
      apiNamespace: resolveRuntimeApiNamespace(),
      permission: cachedPermission,
    })
  }, [])

  const hasOlderUtterancesFromRefs = useCallback(() => (
    storedUtterancesRef.current.length > storageLoadedCountRef.current
    || hasOlderServerUtterancesRef.current
  ), [])

  const applyPendingHasOlderUtterances = useCallback(() => {
    const pendingHasOlderUtterances = pendingHasOlderUtterancesRef.current
    if (pendingHasOlderUtterances === null) return
    pendingHasOlderUtterancesRef.current = null
    setHasOlderUtterances(pendingHasOlderUtterances)
  }, [])

  const queueHasOlderUtterancesRefresh = useCallback(() => {
    pendingHasOlderUtterancesRef.current = hasOlderUtterancesFromRefs()
    void Promise.resolve().then(applyPendingHasOlderUtterances)
  }, [applyPendingHasOlderUtterances, hasOlderUtterancesFromRefs])

  const buildConversationHydrationHeaders = useCallback(() => {
    const nativeTracking = resolveNativeAppTrackingContext({
      detail: (window as NativeAppUpdateWindow).__MINGLE_NATIVE_APP_UPDATE_STATUS,
      apiNamespace: resolveRuntimeApiNamespace(),
      isNativeAppRuntime: isNativeAppRuntime(),
    })

    const headers: Record<string, string> = {
      'x-mingle-user-id': getOrCreateTrackingUserId(),
      'x-mingle-api-namespace': nativeTracking.apiNamespace || resolveRuntimeApiNamespace(),
    }

    if (nativeTracking.clientPlatform) {
      headers['x-mingle-client-platform'] = nativeTracking.clientPlatform
    }
    if (nativeTracking.appVersion) {
      headers['x-mingle-app-version'] = nativeTracking.appVersion
    }

    return headers
  }, [])

  // Initialize hasOlderUtterances after mount
  useEffect(() => {
    if (pendingHasOlderUtterancesRef.current !== null) {
      applyPendingHasOlderUtterances()
      return
    }

    setHasOlderUtterances(hasOlderUtterancesFromRefs())
  }, [applyPendingHasOlderUtterances, hasOlderUtterancesFromRefs, utterances])

  // Merge current state with cached utterances for persistence.
  // Conversation-room persistence is trimmed on write so localStorage stays a warm cache, not history SoT.
  const buildMergedUtterances = useCallback((current: Utterance[]) => {
    const stored = storedUtterancesRef.current
    if (stored.length === 0) return current
    const visibleIds = new Set(current.map(u => u.id))
    const olderNotLoaded = stored.filter(u => !visibleIds.has(u.id))
    return [...olderNotLoaded, ...current]
  }, [])

  const bumpMessageCountForNewUtterance = useCallback((utterance: Utterance) => {
    const id = typeof utterance.id === 'string' ? utterance.id.trim() : ''
    const originalText = typeof utterance.originalText === 'string' ? utterance.originalText.trim() : ''
    if (!id || !originalText) return
    const isKnownUtterance = utterancesRef.current.some((item) => item.id === id)
      || storedUtterancesRef.current.some((item) => item.id === id)
    if (isKnownUtterance) return

    const visibleMessageCount = countPersistedUtterances(buildMergedUtterances(utterancesRef.current))
    setMessageCount((current) => Math.max(normalizePersistedMessageCount(current), visibleMessageCount) + 1)
  }, [buildMergedUtterances])

  const mergeServerHydrationUtterances = useCallback((
    store: UtteranceStoreState,
    utterancesFromServer: Utterance[],
  ): UtteranceStoreState => {
    let nextStore = store
    for (const utterance of utterancesFromServer) {
      nextStore = mergeServerHydrationUtteranceIntoStoreState(nextStore, utterance)
    }
    return nextStore
  }, [])

  const loadOlderUtterances = useCallback(async (): Promise<boolean> => {
    const stored = storedUtterancesRef.current
    const alreadyLoaded = storageLoadedCountRef.current
    if (alreadyLoaded < stored.length) {
      const nextCount = Math.min(alreadyLoaded + LOAD_BATCH_SIZE, stored.length)
      const startIdx = stored.length - nextCount
      const endIdx = stored.length - alreadyLoaded
      const olderBatch = stored.slice(startIdx, endIdx)

      storageLoadedCountRef.current = nextCount
      setHasOlderUtterances(nextCount < stored.length || hasOlderServerUtterancesRef.current)
      setUtteranceStore((prev) => ({
        ...prev,
        utterances: [...olderBatch, ...prev.utterances],
      }))
      return true
    }

    const serverCursor = serverOlderCursorRef.current
    if (
      !conversationId
      || !serverCursor
      || !hasOlderServerUtterancesRef.current
      || isLoadingOlderServerUtterancesRef.current
    ) {
      setHasOlderUtterances(hasOlderUtterancesFromRefs())
      return false
    }

    isLoadingOlderServerUtterancesRef.current = true
    try {
      const response = await fetch(buildConversationHydrationApiPath(conversationId, serverCursor), {
        cache: 'no-store',
        headers: buildConversationHydrationHeaders(),
      })
      if (!response.ok) return false

      const payload = await response.json() as ConversationHydrationPayload
      const nextMessageCount = normalizePersistedMessageCount(
        typeof payload.messageCount === 'number' ? payload.messageCount : Number(payload.messageCount),
      )
      if (nextMessageCount > 0) {
        setMessageCount((current) => Math.max(current, nextMessageCount))
      }
      const nextServerCursor = normalizeConversationHydrationCursor(payload.oldestMessageCursor)
      hasOlderServerUtterancesRef.current = payload.hasMoreUtterances === true && nextServerCursor !== null
      serverOlderCursorRef.current = nextServerCursor

      const utterancesFromServer = normalizeConversationHydrationUtterances(payload.utterances)
      if (utterancesFromServer.length === 0) {
        setHasOlderUtterances(hasOlderUtterancesFromRefs())
        return false
      }

      setUtteranceStore((current) => {
        const nextStore = mergeServerHydrationUtterances(current, utterancesFromServer)
        const nextStoredUtterances = buildLocalUtteranceCache(buildMergedUtterances(nextStore.utterances))
        storedUtterancesRef.current = nextStoredUtterances
        storageLoadedCountRef.current = nextStore.utterances.length
        pendingHasOlderUtterancesRef.current = hasOlderUtterancesFromRefs()
        return nextStore
      })
      queueHasOlderUtterancesRefresh()
      return true
    } catch {
      return false
    } finally {
      isLoadingOlderServerUtterancesRef.current = false
    }
  }, [
    buildConversationHydrationHeaders,
    buildLocalUtteranceCache,
    buildMergedUtterances,
    conversationId,
    hasOlderUtterancesFromRefs,
    mergeServerHydrationUtterances,
    queueHasOlderUtterancesRefresh,
  ])

  // Forward AEC toggle to native module in real-time (hot-swap mid-session).
  const prevEnableAecRef = useRef(enableAec)
  useEffect(() => {
    if (prevEnableAecRef.current === enableAec) return
    prevEnableAecRef.current = enableAec
    if (!useNativeSttRef.current) return
    sendNativeSttCommand({ type: 'native_stt_set_aec', payload: { enabled: enableAec } })
  }, [enableAec, sendNativeSttCommand])

  // Persist utterances to localStorage (debounced to avoid stringify on every update)
  const utterancePersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!storageHydratedRef.current) return
    clearUtterancePersistTimer()
    utterancePersistTimerRef.current = setTimeout(() => {
      utterancePersistTimerRef.current = null
      persistLocalUtterancesSnapshot(buildMergedUtterances(utterances))
    }, 1000)
    return () => {
      clearUtterancePersistTimer()
    }
  }, [utterances, buildMergedUtterances, clearUtterancePersistTimer, persistLocalUtterancesSnapshot])

  // Flush pending localStorage write when app goes to background
  useEffect(() => {
    if (!storageHydratedRef.current) return
    const flushUtterances = () => {
      if (!utterancePersistTimerRef.current) return
      clearUtterancePersistTimer()
      persistLocalUtterancesSnapshot(buildMergedUtterances(utterancesRef.current))
    }
    document.addEventListener('visibilitychange', flushUtterances)
    return () => document.removeEventListener('visibilitychange', flushUtterances)
  }, [buildMergedUtterances, clearUtterancePersistTimer, persistLocalUtterancesSnapshot])

  // Persist usage to localStorage
  useEffect(() => {
    if (!storageHydratedRef.current) return
    try {
      localStorage.setItem(buildStorageKey(LS_KEY_USAGE, storageNamespace), String(usageSec))
    } catch { /* ignore */ }
  }, [storageNamespace, usageSec])

  // Persist message count separately from the utterance warm cache.
  useEffect(() => {
    if (!storageHydratedRef.current) return
    persistMessageCountSnapshot(messageCount, storageNamespace)
  }, [messageCount, storageNamespace])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!conversationId) return
    if (!isStorageHydrated) return

    const hydrationKey = `${conversationId}:${sessionKeyOverride || ''}`
    if (serverHydrationKeyRef.current === hydrationKey) return
    serverHydrationKeyRef.current = hydrationKey

    let cancelled = false

    void fetch(buildConversationHydrationApiPath(conversationId), {
      cache: 'no-store',
      headers: buildConversationHydrationHeaders(),
    })
      .then(async (response) => {
        if (!response.ok) return null
        return response.json() as Promise<ConversationHydrationPayload>
      })
      .then((payload) => {
        if (cancelled || !payload) return

        const nextUsageSec = (
          typeof payload.usageSec === 'number'
          && Number.isFinite(payload.usageSec)
          && payload.usageSec > 0
        ) ? Math.floor(payload.usageSec) : 0

        if (nextUsageSec > 0) {
          setUsageSec((current) => Math.max(current, nextUsageSec))
        }

        const nextMessageCount = normalizePersistedMessageCount(
          typeof payload.messageCount === 'number' ? payload.messageCount : Number(payload.messageCount),
        )
        if (nextMessageCount > 0) {
          setMessageCount((current) => Math.max(current, nextMessageCount))
        }

        const nextServerCursor = normalizeConversationHydrationCursor(payload.oldestMessageCursor)
        hasOlderServerUtterancesRef.current = payload.hasMoreUtterances === true && nextServerCursor !== null
        serverOlderCursorRef.current = nextServerCursor
        const utterancesFromServer = normalizeConversationHydrationUtterances(payload.utterances)

        if (utterancesFromServer.length === 0) {
          setHasOlderUtterances(hasOlderUtterancesFromRefs())
          return
        }

        setUtteranceStore((current) => {
          const nextStore = mergeServerHydrationUtterances(current, utterancesFromServer)
          const nextStoredUtterances = buildLocalUtteranceCache(buildMergedUtterances(nextStore.utterances))
          storedUtterancesRef.current = nextStoredUtterances
          storageLoadedCountRef.current = nextStore.utterances.length
          pendingHasOlderUtterancesRef.current = hasOlderUtterancesFromRefs()
          return nextStore
        })
        queueHasOlderUtterancesRefresh()
      })
      .catch(() => {
        // Keep local state when server hydration fails.
      })

    return () => {
      cancelled = true
    }
  }, [
    buildConversationHydrationHeaders,
    buildLocalUtteranceCache,
    buildMergedUtterances,
    conversationId,
    hasOlderUtterancesFromRefs,
    isStorageHydrated,
    mergeServerHydrationUtterances,
    queueHasOlderUtterancesRefresh,
    sessionKeyOverride,
  ])

  useEffect(() => {
    utterancesRef.current = utterances
  }, [utterances])

  useEffect(() => {
    partialTranscriptRef.current = partialTranscript
  }, [partialTranscript])

  useEffect(() => {
    partialLangRef.current = partialLang
  }, [partialLang])

  const ensureSessionKey = useCallback(() => {
    if (sessionKeyRef.current) return sessionKeyRef.current
    const resolved = getOrCreateSessionKey(storageNamespace, sessionKeyOverride)
    sessionKeyRef.current = resolved
    return resolved
  }, [sessionKeyOverride, storageNamespace])

  const ensureSpeakerAvatarSessionSeed = useCallback(() => {
    if (speakerAvatarSessionSeedRef.current) return speakerAvatarSessionSeedRef.current
    const resolved = createSpeakerAvatarSeed()
    speakerAvatarSessionSeedRef.current = resolved
    return resolved
  }, [])

  const clearSpeakerAvatarSession = useCallback(() => {
    speakerAvatarSessionSeedRef.current = ''
    speakerAvatarAssignmentsRef.current = {}
  }, [])

  const ensureSpeakerAvatarAssignment = useCallback((rawSpeaker: string): {
    speakerAvatarSeed: string
    speakerAvatarIndex: number
  } => {
    const speakerAvatarSeed = ensureSpeakerAvatarSessionSeed()
    const { speakerKey, avatarIndex } = assignSpeakerAvatarIndex(
      rawSpeaker,
      speakerAvatarAssignmentsRef.current,
      speakerAvatarSeed,
    )
    speakerAvatarAssignmentsRef.current[speakerKey] = avatarIndex
    return {
      speakerAvatarSeed,
      speakerAvatarIndex: avatarIndex,
    }
  }, [ensureSpeakerAvatarSessionSeed])

  useEffect(() => {
    ensureSessionKey()
  }, [ensureSessionKey])

  const appendUtterances = useCallback((items: Utterance[]) => {
    if (items.length === 0) return
    setUtteranceStore((prev) => {
      const seen = new Set(prev.utterances.map((utterance) => utterance.id))
      const merged = [...prev.utterances]
      for (const item of items) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        merged.push(item)
      }
      if (merged.length === prev.utterances.length) return prev
      return {
        ...prev,
        utterances: merged,
      }
    })
  }, [])

  const normalizedUsageLimitSec = (
    typeof usageLimitSec === 'number'
    && Number.isFinite(usageLimitSec)
    && usageLimitSec > 0
  ) ? usageLimitSec : null
  const isLimitReached = normalizedUsageLimitSec !== null && usageSec >= normalizedUsageLimitSec
  const persistedUtteranceCount = useMemo(
    () => Math.max(messageCount, countPersistedUtterances(buildMergedUtterances(utterances))),
    [buildMergedUtterances, messageCount, utterances],
  )

  const stopAudioPipeline = useCallback((options?: { closeContext?: boolean }) => {
    const shouldCloseContext = options?.closeContext === true
    if (usageIntervalRef.current) {
      clearInterval(usageIntervalRef.current)
      usageIntervalRef.current = null
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect()
      sourceRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    const context = audioContextRef.current
    if (context && context.state !== 'closed') {
      if (shouldCloseContext) {
        audioContextRef.current = null
        void context.close().catch(() => {})
      } else if (context.state === 'running') {
        // Keep context for next STT start; closing can disrupt playback route on iOS.
        void context.suspend().catch(() => {})
      }
    }
    analyserRef.current = null
    setVolume(0)
  }, [])

  const cleanup = useCallback(() => {
    stopAudioPipeline({ closeContext: true })
    if (socketRef.current) {
      socketRef.current.close()
      socketRef.current = null
    }
  }, [stopAudioPipeline])

  const resetToIdle = useCallback(() => {
    clearConnectionErrorResetTimer()
    resolvePendingNativeStopAck()
    isStoppingRef.current = false
    hasActiveSessionRef.current = false
    nativeStopRequestedRef.current = false
    stopFinalizeDedupRef.current = { utteranceId: '', expiresAt: 0 }
    turnStartedAtRef.current = null
    clearSpeakerAvatarSession()
    cleanup()
    releaseCurrentNativeSttOwner()
    setConnectionStatus('idle')
  }, [cleanup, clearConnectionErrorResetTimer, clearSpeakerAvatarSession, releaseCurrentNativeSttOwner, resolvePendingNativeStopAck])

  const scheduleConnectionErrorReset = useCallback(() => {
    clearConnectionErrorResetTimer()
    connectionErrorResetTimerRef.current = setTimeout(() => {
      connectionErrorResetTimerRef.current = null
      resetToIdle()
    }, CONNECTION_ERROR_RESET_DELAY_MS)
  }, [clearConnectionErrorResetTimer, resetToIdle])

  const resetVisiblePartialState = useCallback(() => {
    setPartialTranslations({})
    partialTranslationsRef.current = {}
    setPartialTranscript('')
    partialTranscriptRef.current = ''
    setPartialLang(null)
    partialLangRef.current = null
  }, [])

  const getLatestPendingTurn = useCallback((): PendingSpeakerTurn | null => {
    const pendingTurns = Object.values(pendingTurnsBySpeakerRef.current)
      .filter((turn) => turn.text.trim())
      .sort((left, right) => right.updatedAtMs - left.updatedAtMs)
    return pendingTurns[0] || null
  }, [])

  const findPendingTurnByUtteranceId = useCallback((utteranceId: string): PendingSpeakerTurn | null => {
    for (const pendingTurn of Object.values(pendingTurnsBySpeakerRef.current)) {
      if (pendingTurn.utteranceId === utteranceId) return pendingTurn
    }
    return null
  }, [])

  const syncVisiblePendingTurn = useCallback((preferredSpeaker?: string | null) => {
    const preferredTurn = preferredSpeaker
      ? pendingTurnsBySpeakerRef.current[preferredSpeaker] || null
      : null
    const nextTurn = preferredTurn || getLatestPendingTurn()
    const nextSpeaker = nextTurn?.speaker || null
    const shouldPreserveVisibleState = Boolean(
      nextSpeaker
      && activePartialSpeakerRef.current === nextSpeaker,
    )

    if (!shouldPreserveVisibleState) {
      resetVisiblePartialState()
    }

    activePartialSpeakerRef.current = nextSpeaker
    setPartialTranscript(nextTurn?.text || '')
    partialTranscriptRef.current = nextTurn?.text || ''
    setPartialLang(nextTurn?.language || null)
    partialLangRef.current = nextTurn?.language || null
    const nextTranslations = nextTurn?.partialTranslations || {}
    setPartialTranslations(nextTranslations)
    partialTranslationsRef.current = nextTranslations
  }, [getLatestPendingTurn, resetVisiblePartialState])

  const clearPartialBuffers = useCallback(() => {
    pendingTurnsBySpeakerRef.current = {}
    activePartialSpeakerRef.current = null
    clearAllPendingTurnTranslationRuntime()
    resetVisiblePartialState()
    turnStartedAtRef.current = null
    bumpPendingTurnRenderVersion()
  }, [bumpPendingTurnRenderVersion, clearAllPendingTurnTranslationRuntime, resetVisiblePartialState])

  const buildRecentTurnContextPayload = useCallback((excludeUtteranceId?: string): RecentTurnContextPayload[] => {
    const now = Date.now()
    const windowStart = now - RECENT_TURN_CONTEXT_WINDOW_MS
    const recentTurns: RecentTurnContextPayload[] = []

    for (const utterance of utterancesRef.current) {
      if (excludeUtteranceId && utterance.id === excludeUtteranceId) continue
      const occurredAtMs = inferUtteranceCreatedAtMs(utterance)
      if (occurredAtMs === null || occurredAtMs < windowStart || occurredAtMs > now) continue

      const sourceText = utterance.originalText.trim()
      if (!sourceText) continue

      const sourceLanguage = (utterance.originalLang || 'unknown').trim() || 'unknown'
      const translations = stripSourceLanguageFromTranslations(utterance.translations || {}, sourceLanguage)
      const translationLanguages = Object.keys(translations)
      const isFinalized = (
        translationLanguages.length > 0
        && translationLanguages.every((language) => utterance.translationFinalized?.[language] === true)
      )

      recentTurns.push({
        sourceLanguage,
        sourceText,
        translations,
        occurredAtMs,
        ageMs: Math.max(0, now - occurredAtMs),
        isFinalized,
      })
    }

    recentTurns.sort((a, b) => a.occurredAtMs - b.occurredAtMs)
    return recentTurns
  }, [])

  // ===== HTTP Translation via versioned API namespace =====
  const translateViaApi = useCallback(async (
    text: string,
    sourceLanguage: string,
    targetLanguages: string[],
    options?: {
      signal?: AbortSignal
      ttsLanguage?: string
      enableTts?: boolean
      isFinal?: boolean
      clientMessageId?: string
      currentTurnPreviousState?: CurrentTurnPreviousStatePayload | null
      excludeUtteranceId?: string
      sttDurationMs?: number
      totalDurationMs?: number
    },
  ): Promise<TranslateApiResult> => {
    const apiPath = buildClientApiPath('/translate/finalize')
    const shouldRedetectSourceLanguage = (
      options?.isFinal === true
      && shouldRedetectFinalizeSourceLanguage(apiPath)
    )
    const langs = shouldRedetectSourceLanguage
      ? targetLanguages
      : targetLanguages.filter(l => l !== sourceLanguage)
    if (!text.trim() || langs.length === 0) return { translations: {} }
    const recentTurns = buildRecentTurnContextPayload(options?.excludeUtteranceId)
    try {
      const body: Record<string, unknown> = { text, targetLanguages: langs }
      if (sourceLanguage.trim()) {
        body.sourceLanguage = sourceLanguage
      }
      if (recentTurns.length > 0) {
        body.recentTurns = recentTurns
        body.immediatePreviousTurn = recentTurns[recentTurns.length - 1]
      }
      body.isFinal = options?.isFinal === true
      body.sessionKey = ensureSessionKey()
      body.clientContext = buildClientContextPayload(usageSec)
      if (options?.clientMessageId) {
        body.clientMessageId = options.clientMessageId
      }
      if (typeof options?.sttDurationMs === 'number' && Number.isFinite(options.sttDurationMs) && options.sttDurationMs >= 0) {
        body.sttDurationMs = Math.floor(options.sttDurationMs)
      }
      if (typeof options?.totalDurationMs === 'number' && Number.isFinite(options.totalDurationMs) && options.totalDurationMs >= 0) {
        body.totalDurationMs = Math.floor(options.totalDurationMs)
      }
      if (options?.currentTurnPreviousState) {
        body.currentTurnPreviousState = options.currentTurnPreviousState
      }
      body.clientBundleRev = LIVE_TRANSLATE_CLIENT_BUNDLE_REV
      if (translationModel) {
        body.translationModel = translationModel
      }
      const normalizedTtsLang = (options?.ttsLanguage || '').trim()
      if (normalizedTtsLang && options?.isFinal !== true) {
        body.tts = { language: normalizedTtsLang, enabled: options?.enableTts === true }
      }
      const res = await fetch(buildClientApiPath('/translate/finalize'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mingle-user-id': getOrCreateTrackingUserId(),
        },
        body: JSON.stringify(body),
        signal: options?.signal,
      })
      if (!res.ok) {
        return { translations: {} }
      }
      const data = await res.json()
      const ttsAudioBase64 = typeof data.ttsAudioBase64 === 'string' ? data.ttsAudioBase64 : undefined
      return {
        translations: (data.translations || {}) as Record<string, string>,
        sourceLanguage: typeof data.sourceLanguage === 'string'
          ? normalizeIncomingSourceLanguage(data.sourceLanguage, text)
          : undefined,
        sourceLanguagesMixed: data.sourceLanguagesMixed === true,
        sourceTextHasForeignScript: data.sourceTextHasForeignScript === true,
        ttsLanguage: typeof data.ttsLanguage === 'string' ? data.ttsLanguage : undefined,
        ttsAudioBase64,
        ttsAudioMime: typeof data.ttsAudioMime === 'string' ? data.ttsAudioMime : undefined,
        provider: typeof data.provider === 'string' ? data.provider : undefined,
        infrastructureProvider: typeof data.infrastructureProvider === 'string' ? data.infrastructureProvider : undefined,
        model: typeof data.model === 'string' ? data.model : undefined,
        translationPromptTokens: typeof data.translationPromptTokens === 'number' ? data.translationPromptTokens : undefined,
        translationCompletionTokens: typeof data.translationCompletionTokens === 'number' ? data.translationCompletionTokens : undefined,
        translationTotalTokens: typeof data.translationTotalTokens === 'number' ? data.translationTotalTokens : undefined,
      }
    } catch {
      return { translations: {} }
    }
  }, [buildRecentTurnContextPayload, ensureSessionKey, translationModel, usageSec])

  const logClientEvent = useCallback(async (payload: ClientEventLogPayload) => {
    try {
      const body: Record<string, unknown> = {
        eventType: payload.eventType,
        sessionKey: ensureSessionKey(),
        clientContext: buildClientContextPayload(usageSec),
      }

      if (payload.clientMessageId) body.clientMessageId = payload.clientMessageId
      if (payload.sourceLanguage) body.sourceLanguage = payload.sourceLanguage
      if (payload.sourceText) body.sourceText = payload.sourceText
      if (payload.translations && Object.keys(payload.translations).length > 0) {
        body.translations = payload.translations
      }
      if (typeof payload.sttDurationMs === 'number' && Number.isFinite(payload.sttDurationMs) && payload.sttDurationMs >= 0) {
        body.sttDurationMs = Math.floor(payload.sttDurationMs)
      }
      if (typeof payload.totalDurationMs === 'number' && Number.isFinite(payload.totalDurationMs) && payload.totalDurationMs >= 0) {
        body.totalDurationMs = Math.floor(payload.totalDurationMs)
      }
      if (payload.provider) body.provider = payload.provider
      if (payload.infrastructureProvider) body.infrastructureProvider = payload.infrastructureProvider
      if (payload.model) body.model = payload.model
      if (typeof payload.translationPromptTokens === 'number' && Number.isFinite(payload.translationPromptTokens) && payload.translationPromptTokens >= 0) {
        body.translationPromptTokens = Math.floor(payload.translationPromptTokens)
      }
      if (typeof payload.translationCompletionTokens === 'number' && Number.isFinite(payload.translationCompletionTokens) && payload.translationCompletionTokens >= 0) {
        body.translationCompletionTokens = Math.floor(payload.translationCompletionTokens)
      }
      if (typeof payload.translationTotalTokens === 'number' && Number.isFinite(payload.translationTotalTokens) && payload.translationTotalTokens >= 0) {
        body.translationTotalTokens = Math.floor(payload.translationTotalTokens)
      }
      if (payload.metadata) body.metadata = payload.metadata

      const requestInit: RequestInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mingle-user-id': getOrCreateTrackingUserId(),
        },
        body: JSON.stringify(body),
        keepalive: payload.keepalive === true,
      }

      const maxAttempts = resolveLogClientEventMaxAttempts(payload.clientMessageId)
      let lastError: unknown = null
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
          const res = await fetch(buildClientApiPath('/log/client-event'), requestInit)
          if (res.ok) return
          lastError = new Error(`log/client-event responded with ${res.status}`)
        } catch (error) {
          lastError = error
        }
        if (attempt < maxAttempts - 1) {
          await sleep(LOG_CLIENT_EVENT_RETRY_DELAY_MS)
        }
      }
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[log-client-event] giving up after retries', { eventType: payload.eventType, lastError })
      }
    } catch {
      // Logging must not affect UX.
    }
  }, [ensureSessionKey, usageSec])

  const synthesizeTtsViaApi = useCallback(async (text: string, language: string): Promise<Blob | null> => {
    const normalizedText = text.trim()
    const normalizedLang = language.trim()
    if (!normalizedText || !normalizedLang) return null
    try {
      const res = await fetch(buildClientApiPath('/tts/inworld'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mingle-user-id': getOrCreateTrackingUserId(),
        },
        body: JSON.stringify({
          text: normalizedText,
          language: normalizedLang,
          sessionKey: ensureSessionKey(),
          clientContext: buildClientContextPayload(usageSec),
        }),
      })
      if (!res.ok) return null
      const arrayBuffer = await res.arrayBuffer()
      if (!arrayBuffer || arrayBuffer.byteLength === 0) return null
      const mime = res.headers.get('content-type') || 'audio/mpeg'
      return new Blob([arrayBuffer], { type: mime })
    } catch {
      return null
    }
  }, [ensureSessionKey, usageSec])

  const requestTtsForRenderedTranslation = useCallback((
    utteranceId: string,
    options?: {
      renderedLanguage?: string
      renderedText?: string
    },
  ) => {
    if (!enableTtsRef.current) return
    const ttsTargetLang = (options?.renderedLanguage || '').trim()
    if (!ttsTargetLang) {
      onTtsCanceledRef.current?.(utteranceId)
      return
    }
    const ttsText = (options?.renderedText || '').trim()
    if (!ttsText) {
      onTtsCanceledRef.current?.(utteranceId)
      return
    }

    const signature = `${ttsTargetLang}::${ttsText}`
    if (finalizedTtsSignatureRef.current.get(utteranceId) === signature) return

    const queueAudioIfValid = (audioBlob: Blob | null): boolean => {
      if (!audioBlob || audioBlob.size === 0) return false
      if (finalizedTtsSignatureRef.current.get(utteranceId) === signature) {
        // 이미 같은 시그니처로 큐잉됨 — 중복 차단
        return true
      }
      finalizedTtsSignatureRef.current.set(utteranceId, signature)
      onTtsAudioRef.current?.(utteranceId, audioBlob, ttsTargetLang, ttsText)
      return true
    }

    void synthesizeTtsViaApi(ttsText, ttsTargetLang).then((fallbackBlob) => {
      if (queueAudioIfValid(fallbackBlob)) return
      onTtsCanceledRef.current?.(utteranceId)
    })
  }, [synthesizeTtsViaApi])

  useEffect(() => {
    if (pendingFinalizedTtsUtteranceIdsRef.current.size === 0) return

    const consumedUtteranceIds: string[] = []
    for (const utteranceId of pendingFinalizedTtsUtteranceIdsRef.current.values()) {
      const utterance = utterances.find((item) => item.id === utteranceId)
      if (!utterance) continue

      const renderedTtsCandidate = resolveRenderedTtsCandidateFromUtterance(utterance)
      if (!renderedTtsCandidate) {
        onTtsCanceledRef.current?.(utteranceId)
        consumedUtteranceIds.push(utteranceId)
        continue
      }

      requestTtsForRenderedTranslation(utteranceId, {
        renderedLanguage: renderedTtsCandidate.language,
        renderedText: renderedTtsCandidate.text,
      })
      consumedUtteranceIds.push(utteranceId)
    }

    for (const utteranceId of consumedUtteranceIds) {
      pendingFinalizedTtsUtteranceIdsRef.current.delete(utteranceId)
    }
  }, [requestTtsForRenderedTranslation, utterances])

  const applyTranslationToUtterance = useCallback((
    utteranceId: string,
    translations: Record<string, string>,
    priority: TranslationPriority,
    markFinalized: boolean,
    fallbackMatch?: TranslationApplyFallbackMatch,
    options?: {
      detectedSourceLanguage?: string
      sourceLanguagesMixed?: boolean
      sourceTextHasForeignScript?: boolean
      selectedLanguages?: string[]
      sourceText?: string
    },
  ) => {
    setUtteranceStore((prev) => applyTranslationToUtteranceStoreState({
      store: prev,
      utteranceId,
      translations,
      priority,
      markFinalized,
      fallbackMatch,
      detectedSourceLanguage: options?.detectedSourceLanguage,
      sourceLanguagesMixed: options?.sourceLanguagesMixed,
      sourceTextHasForeignScript: options?.sourceTextHasForeignScript,
      selectedLanguages: options?.selectedLanguages,
      sourceText: options?.sourceText,
    }))
  }, [])

  const finalizePendingLocally = useCallback((
    rawText: string,
    rawLang: string,
    options?: {
      speaker?: string
      speakerAvatarSeed?: string
      speakerAvatarIndex?: number
      partialTranslations?: Record<string, string>
      partialTranslationPriorities?: Map<string, TranslationPriority>
      utteranceId?: string
      utteranceSerial?: number
      createdAtMs?: number
      previousStateSourceLanguage?: string
      previousStateSourceText?: string
      fallbackCurrentTurnPreviousState?: CurrentTurnPreviousStatePayload | null
    },
  ): LocalFinalizeResult | null => {
    const text = normalizeSttTurnText(rawText)
    if (!text) return null

    const now = Date.now()
    const reservedUtteranceSerial = options?.utteranceSerial ?? (utteranceIdRef.current + 1)
    if (options?.utteranceSerial === undefined) {
      utteranceIdRef.current = reservedUtteranceSerial
    }
    const targetLanguages = getCurrentTargetLanguages()
    const seedTranslationState = buildSeedTranslationState(
      targetLanguages,
      rawLang,
      options?.partialTranslations ?? partialTranslationsRef.current,
      options?.partialTranslationPriorities ?? new Map(),
    )
    const localPayload = buildFinalizedUtterancePayload({
      speaker: options?.speaker,
      speakerAvatarSeed: options?.speakerAvatarSeed,
      speakerAvatarIndex: options?.speakerAvatarIndex,
      rawText,
      rawLanguage: rawLang,
      languages: targetLanguages,
      partialTranslations: seedTranslationState.translations,
      currentTurnPreviousTranslations: seedTranslationState.translations,
      utteranceSerial: reservedUtteranceSerial,
      utteranceId: options?.utteranceId,
      nowMs: now,
      createdAtMs: options?.createdAtMs,
      previousStateSourceLanguage: options?.previousStateSourceLanguage,
      previousStateSourceText: options?.previousStateSourceText,
    })
    if (!localPayload) return null
    if (isDuplicateTimedSignature({
      previousSig: stopFinalizeDedupRef.current.utteranceId,
      previousExpiresAt: stopFinalizeDedupRef.current.expiresAt,
      nextSig: localPayload.utteranceId,
      nowMs: now,
    })) {
      return null
    }
    stopFinalizeDedupRef.current = {
      utteranceId: localPayload.utteranceId,
      expiresAt: now + 5_000,
    }
    const fallbackCurrentTurnPreviousState = options?.fallbackCurrentTurnPreviousState ?? null
    const currentTurnPreviousState = (
      localPayload.currentTurnPreviousState
      && Object.keys(localPayload.currentTurnPreviousState.translations).length > 0
    ) ? localPayload.currentTurnPreviousState : (fallbackCurrentTurnPreviousState || localPayload.currentTurnPreviousState)

    bumpMessageCountForNewUtterance(localPayload.utterance)
    setUtteranceStore((prev) => appendFinalizedUtteranceToStoreState(
      prev,
      localPayload.utterance,
      seedTranslationState,
    ))
    recentFinalizedUtterancesRef.current = rememberRecentFinalizedUtterance({
      recentFinalizedUtterances: recentFinalizedUtterancesRef.current,
      utterance: {
        id: localPayload.utteranceId,
        text: localPayload.text,
        language: localPayload.language,
        speaker: localPayload.utterance.speaker,
        expiresAt: now + 5_000,
        source: 'local',
      },
      nowMs: now,
    })
    return {
      utteranceId: localPayload.utteranceId,
      text: localPayload.text,
      lang: localPayload.language,
      currentTurnPreviousState,
      speaker: localPayload.utterance.speaker || 'unknown',
      speakerAvatarSeed: localPayload.utterance.speakerAvatarSeed,
      speakerAvatarIndex: localPayload.utterance.speakerAvatarIndex,
    }
  }, [bumpMessageCountForNewUtterance, getCurrentTargetLanguages])

  const buildLocalFinalizeOptionsForSpeaker = useCallback((speaker: string, fallbackLanguage: string) => {
    const pendingTurn = pendingTurnsBySpeakerRef.current[speaker] || null
    const speakerLanguage = pendingTurn?.language || fallbackLanguage || 'unknown'
    const fallbackCurrentTurnPreviousState = pendingTurn?.currentTurnPreviousState || null

    return {
      pendingTurn,
      options: {
        speaker,
        speakerAvatarSeed: pendingTurn?.speakerAvatarSeed,
        speakerAvatarIndex: pendingTurn?.speakerAvatarIndex,
        partialTranslations: pendingTurn?.partialTranslations || {},
        partialTranslationPriorities: new Map(pendingTurn?.partialTranslationPriorities || []),
        utteranceId: pendingTurn?.utteranceId,
        utteranceSerial: pendingTurn?.utteranceSerial,
        createdAtMs: pendingTurn?.createdAtMs,
        previousStateSourceLanguage: pendingTurn?.language || speakerLanguage,
        previousStateSourceText: pendingTurn?.text || '',
        fallbackCurrentTurnPreviousState,
      },
    }
  }, [])

  const getPendingTurnsForLocalFinalize = useCallback((): PendingSpeakerTurn[] => (
    Object.values(pendingTurnsBySpeakerRef.current)
      .filter((turn) => turn.text.trim())
      .sort((left, right) => left.updatedAtMs - right.updatedAtMs)
  ), [])

  const getActivePendingTurn = useCallback((): PendingSpeakerTurn | null => {
    const activeSpeaker = activePartialSpeakerRef.current
    if (activeSpeaker) {
      return pendingTurnsBySpeakerRef.current[activeSpeaker] || null
    }
    return getLatestPendingTurn()
  }, [getLatestPendingTurn])

  const finalizeTurnWithTranslation = useCallback((
    localFinalizeResult: LocalFinalizeResult,
    options?: {
      sttDurationMs?: number
      reason?: string
      speaker?: string
      speakerAvatarSeed?: string
      speakerAvatarIndex?: number
    },
  ) => {
    const { utteranceId, text, lang, currentTurnPreviousState } = localFinalizeResult
    const resolvedSpeaker = options?.speaker ?? localFinalizeResult.speaker
    const resolvedSpeakerAvatarSeed = options?.speakerAvatarSeed ?? localFinalizeResult.speakerAvatarSeed
    const resolvedSpeakerAvatarIndex = options?.speakerAvatarIndex ?? localFinalizeResult.speakerAvatarIndex
    const seq = ++translateSeqRef.current
    const requestStartedAt = Date.now()
    const targetLanguages = [...getCurrentTargetLanguages()]
    const conversationClearSequence = conversationClearSequenceRef.current
    const isStaleConversationFinalize = () => conversationClearSequenceRef.current !== conversationClearSequence

    // 단일 언어 모드: 선택 언어가 1개인 경우
    const isSingleLanguageMode = targetLanguages.length === 1
    const detectedLangNorm = normalizeTranslationLanguageKey(lang)
    const selectedLangNorm = normalizeTranslationLanguageKey(targetLanguages[0] || '')

    if (isSingleLanguageMode && detectedLangNorm === selectedLangNorm) {
      // 감지 언어 = 선택 언어 → 번역/TTS 없이 transcript만 (로깅만)
      if (isStaleConversationFinalize()) return
      void logClientEvent({
        eventType: 'stt_turn_finalized',
        clientMessageId: utteranceId,
        sourceLanguage: lang,
        sourceText: text,
        translations: {},
        sttDurationMs: options?.sttDurationMs,
        totalDurationMs: options?.sttDurationMs ?? 0,
        metadata: {
          reason: options?.reason || 'unknown',
          singleLanguageMode: true,
          skipTranslation: true,
          speaker: resolvedSpeaker || null,
          speakerAvatarSeed: resolvedSpeakerAvatarSeed || null,
          speakerAvatarIndex:
            typeof resolvedSpeakerAvatarIndex === 'number'
              ? resolvedSpeakerAvatarIndex
              : null,
        },
        keepalive: true,
      })
      return
    }

    // 단일 언어 모드이지만 다른 언어 감지: 선택 언어로 번역 + TTS
    // 다중 언어 모드: 기존 동작 유지
    const ttsTargetLang = isSingleLanguageMode
      ? (targetLanguages[0] || '')
      : (targetLanguages.filter(l => l !== lang)[0] || '')
    const effectiveTargetLanguages = isSingleLanguageMode
      ? targetLanguages                  // [selectedLang] — translateViaApi 내부에서 sourceLanguage(detected) 제거 후 번역
      : targetLanguages

    // Reserve a TTS queue slot before the API call so playback order matches utterance order
    if (enableTtsRef.current && ttsTargetLang) {
      onTtsRequestedRef.current?.(utteranceId, ttsTargetLang)
    }

    clearFinalizedTurnTranslationController(utteranceId)
    const controller = new AbortController()
    finalizedTurnTranslationControllersRef.current[utteranceId] = controller

    void translateViaApi(text, lang, effectiveTargetLanguages, {
      signal: controller.signal,
      ttsLanguage: ttsTargetLang,
      enableTts: enableTtsRef.current,
      isFinal: true,
      clientMessageId: utteranceId,
      currentTurnPreviousState,
      excludeUtteranceId: utteranceId,
      sttDurationMs: options?.sttDurationMs,
    }).then(result => {
      if (isStaleConversationFinalize()) {
        if (enableTtsRef.current && ttsTargetLang) {
          onTtsCanceledRef.current?.(utteranceId)
        }
        return
      }

      const hasTranslations = Object.keys(result.translations).length > 0
      if (hasTranslations) {
        applyTranslationToUtterance(
          utteranceId,
          result.translations,
          { kind: 'final', seq },
          true,
          {
            sourceText: text,
            sourceLanguage: lang,
          },
          {
            detectedSourceLanguage: result.sourceLanguage,
            sourceLanguagesMixed: result.sourceLanguagesMixed,
            sourceTextHasForeignScript: result.sourceTextHasForeignScript,
            selectedLanguages: targetLanguages,
            sourceText: text,
          },
        )
        if (enableTtsRef.current && ttsTargetLang) {
          pendingFinalizedTtsUtteranceIdsRef.current.add(utteranceId)
        }
      } else if (enableTtsRef.current && ttsTargetLang) {
        onTtsCanceledRef.current?.(utteranceId)
      }

      const translationLatencyMs = Math.max(0, Date.now() - requestStartedAt)
      const totalDurationMs = (options?.sttDurationMs ?? 0) + translationLatencyMs
      void logClientEvent({
        eventType: 'stt_turn_finalized',
        clientMessageId: utteranceId,
        sourceLanguage: result.sourceLanguage || lang,
        sourceText: text,
        translations: result.translations,
        sttDurationMs: options?.sttDurationMs,
        totalDurationMs,
        provider: result.provider,
        infrastructureProvider: result.infrastructureProvider,
        model: result.model,
        translationPromptTokens: result.translationPromptTokens,
        translationCompletionTokens: result.translationCompletionTokens,
        translationTotalTokens: result.translationTotalTokens,
        metadata: {
          reason: options?.reason || 'unknown',
          hasInlineTts: Boolean(result.ttsAudioBase64),
          singleLanguageMode: isSingleLanguageMode,
          speaker: resolvedSpeaker || null,
          speakerAvatarSeed: resolvedSpeakerAvatarSeed || null,
          speakerAvatarIndex:
            typeof resolvedSpeakerAvatarIndex === 'number'
              ? resolvedSpeakerAvatarIndex
              : null,
        },
        keepalive: true,
      })
    }).finally(() => {
      if (finalizedTurnTranslationControllersRef.current[utteranceId] !== controller) return
      delete finalizedTurnTranslationControllersRef.current[utteranceId]
    })
  }, [applyTranslationToUtterance, clearFinalizedTurnTranslationController, getCurrentTargetLanguages, logClientEvent, translateViaApi])

  const submitExternalUtterance = useCallback((input: SubmitExternalUtteranceInput): string | null => {
    const text = normalizeSttTurnText(input.text)
    if (!text) return null

    const speaker = (input.speaker || '').trim() || 'manual'
    const sourceLanguage = normalizeIncomingSourceLanguage(input.sourceLanguage || '', text) || 'unknown'
    const speakerAvatar = ensureSpeakerAvatarAssignment(speaker)
    const localFinalizeResult = finalizePendingLocally(text, sourceLanguage, {
      speaker,
      speakerAvatarSeed: speakerAvatar.speakerAvatarSeed,
      speakerAvatarIndex: speakerAvatar.speakerAvatarIndex,
      partialTranslations: {},
      partialTranslationPriorities: new Map(),
      previousStateSourceLanguage: sourceLanguage,
      previousStateSourceText: text,
      fallbackCurrentTurnPreviousState: null,
    })

    if (!localFinalizeResult) return null

    finalizeTurnWithTranslation(localFinalizeResult, {
      reason: 'manual_text_input',
    })

    return localFinalizeResult.utteranceId
  }, [ensureSpeakerAvatarAssignment, finalizePendingLocally, finalizeTurnWithTranslation])

  const clearConversationHistory = useCallback(() => {
    const wasActiveSession = hasActiveSessionRef.current

    conversationClearSequenceRef.current += 1
    clearConnectionErrorResetTimer()
    clearAllFinalizedTurnTranslationControllers()
    clearUtterancePersistTimer()
    isStoppingRef.current = true
    stopFinalizeDedupRef.current = { utteranceId: '', expiresAt: 0 }

    if (useNativeSttRef.current) {
      nativeStopRequestedRef.current = true
      void sendNativeSttCommand({
        type: 'native_stt_stop',
        payload: {
          pendingText: '',
          pendingLanguage: '',
        },
      })
    }

    clearPartialBuffers()
    resetToIdle()
    storedUtterancesRef.current = []
    storageLoadedCountRef.current = 0
    utterancesRef.current = []
    recentFinalizedUtterancesRef.current = []
    finalizedTtsSignatureRef.current.clear()
    pendingFinalizedTtsUtteranceIdsRef.current.clear()
    utteranceIdRef.current = 0
    persistLocalUtterancesSnapshot([])
    setMessageCount(0)
    setHasOlderUtterances(false)
    setUtteranceStore(createUtteranceStoreState([]))

    if (wasActiveSession) {
      void logClientEvent({
        eventType: 'stt_session_stopped',
        metadata: {
          reason: 'conversation_history_cleared',
        },
        keepalive: true,
      })
    }
  }, [
    clearAllFinalizedTurnTranslationControllers,
    clearConnectionErrorResetTimer,
    clearUtterancePersistTimer,
    clearPartialBuffers,
    logClientEvent,
    persistLocalUtterancesSnapshot,
    resetToIdle,
    sendNativeSttCommand,
  ])

  const replaceConversationHistoryForQa = useCallback((items: Utterance[], options?: { loadAll?: boolean }) => {
    clearUtterancePersistTimer()

    const seen = new Set<string>()
    const normalized = items
      .filter((item) => {
        if (!item || typeof item.id !== 'string' || !item.id.trim()) return false
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
      })
      .map(normalizeStoredUtterance)

    const cached = options?.loadAll ? normalized : buildLocalUtteranceCache(normalized)
    storedUtterancesRef.current = cached
    const initial = options?.loadAll ? cached : cached.slice(-LOAD_BATCH_SIZE)
    storageLoadedCountRef.current = initial.length
    utterancesRef.current = initial
    recentFinalizedUtterancesRef.current = []
    finalizedTtsSignatureRef.current.clear()
    pendingFinalizedTtsUtteranceIdsRef.current.clear()
    stopFinalizeDedupRef.current = { utteranceId: '', expiresAt: 0 }
    setHasOlderUtterances(!options?.loadAll && (cached.length > initial.length || hasOlderServerUtterancesRef.current))
    setUtteranceStore(createUtteranceStoreState(initial))
    setMessageCount(countPersistedUtterances(normalized))
    persistLocalUtterancesSnapshot(normalized)
  }, [buildLocalUtteranceCache, clearUtterancePersistTimer, persistLocalUtterancesSnapshot])
  const prepareForDeletion = useCallback(() => {
    conversationClearSequenceRef.current += 1
    clearConnectionErrorResetTimer()
    clearAllFinalizedTurnTranslationControllers()
    clearPartialBuffers()
    stopFinalizeDedupRef.current = { utteranceId: '', expiresAt: 0 }
    turnStartedAtRef.current = null
    recentFinalizedUtterancesRef.current = []
    pendingFinalizedTtsUtteranceIdsRef.current.clear()
    finalizedTtsSignatureRef.current.clear()
  }, [
    clearAllFinalizedTurnTranslationControllers,
    clearConnectionErrorResetTimer,
    clearPartialBuffers,
  ])

  const stopRecordingGracefully = useCallback(async (notifyLimitReached = false, stopReason?: string) => {
    if (isStoppingRef.current) return
    isStoppingRef.current = true
    const useNativeStt = useNativeSttRef.current
    let waitingForNativeStopAck = false

    stopAudioPipeline({ closeContext: false })

    const socket = socketRef.current
    const activePendingTurn = (
      activePartialSpeakerRef.current
      ? pendingTurnsBySpeakerRef.current[activePartialSpeakerRef.current] || null
      : getLatestPendingTurn()
    )
    const pendingText = activePendingTurn?.text.trim() || ''
    const pendingLang = activePendingTurn?.language || 'unknown'
    const localFinalizeResults: LocalFinalizeResult[] = []

    for (const pendingTurn of getPendingTurnsForLocalFinalize()) {
      const { options } = buildLocalFinalizeOptionsForSpeaker(pendingTurn.speaker, pendingTurn.language)
      const localFinalizeResult = finalizePendingLocally(
        pendingTurn.rawText,
        pendingTurn.language,
        options,
      )
      if (localFinalizeResult) {
        localFinalizeResults.push(localFinalizeResult)
      }
    }
    const sttDurationMs = turnStartedAtRef.current ? Math.max(0, Date.now() - turnStartedAtRef.current) : undefined
    clearPartialBuffers()

    if (useNativeStt) {
      nativeStopRequestedRef.current = true
      const posted = sendNativeSttCommand({
        type: 'native_stt_stop',
        payload: {
          pendingText,
          pendingLanguage: pendingLang,
        },
      })
      if (posted) {
        waitingForNativeStopAck = true
      } else {
        nativeStopRequestedRef.current = false
      }
      if (waitingForNativeStopAck) {
        clearPendingNativeStopAckTimeout()
        const nativeStopAckPromise = new Promise<void>((resolve) => {
          pendingNativeStopAckResolverRef.current = resolve
          pendingNativeStopAckTimeoutRef.current = setTimeout(() => {
            pendingNativeStopAckTimeoutRef.current = null
            pendingNativeStopAckResolverRef.current = null
            nativeStopRequestedRef.current = false
            releaseCurrentNativeSttOwner()
            setConnectionStatus('idle')
            resolve()
          }, NATIVE_STOP_ACK_TIMEOUT_MS)
        })
        setConnectionStatus('idle')
        const wasActiveSession = hasActiveSessionRef.current
        hasActiveSessionRef.current = false
        clearSpeakerAvatarSession()

        if (notifyLimitReached) {
          onLimitReachedRef.current?.()
        }

        const resolvedStopReason = stopReason || (notifyLimitReached ? 'usage_limit_reached' : 'manual_stop')
        if (wasActiveSession) {
          void logClientEvent({
            eventType: 'stt_session_stopped',
            metadata: {
              reason: resolvedStopReason,
            },
            keepalive: true,
          })
        }

        turnStartedAtRef.current = null
        for (const localFinalizeResult of localFinalizeResults) {
          finalizeTurnWithTranslation(localFinalizeResult, {
            sttDurationMs,
            reason: notifyLimitReached ? 'usage_limit_reached' : 'manual_stop',
          })
        }

        try {
          await nativeStopAckPromise
        } finally {
          isStoppingRef.current = false
        }
        return
      } else {
        nativeStopRequestedRef.current = false
        releaseCurrentNativeSttOwner()
      }
    } else {
      // Fire-and-forget stop_recording to server (so it can clean up STT provider)
      try {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'stop_recording',
            data: {
              pending_text: pendingText,
              pending_language: pendingLang,
            },
          }))
        }
      } catch { /* ignore */ }

      // Close socket immediately — no need to wait for ACK since translation is HTTP.
      if (socketRef.current) {
        socketRef.current.close()
        socketRef.current = null
      }
    }
    if (!waitingForNativeStopAck) {
      setConnectionStatus('idle')
    }
    isStoppingRef.current = false
    const wasActiveSession = hasActiveSessionRef.current
    hasActiveSessionRef.current = false
    clearSpeakerAvatarSession()

    if (notifyLimitReached) {
      onLimitReachedRef.current?.()
    }

    const resolvedStopReason = stopReason || (notifyLimitReached ? 'usage_limit_reached' : 'manual_stop')
    if (wasActiveSession) {
      void logClientEvent({
        eventType: 'stt_session_stopped',
        metadata: {
          reason: resolvedStopReason,
        },
        keepalive: true,
      })
    }

    turnStartedAtRef.current = null
    for (const localFinalizeResult of localFinalizeResults) {
      finalizeTurnWithTranslation(localFinalizeResult, {
        sttDurationMs,
        reason: notifyLimitReached ? 'usage_limit_reached' : 'manual_stop',
      })
    }
  }, [
    buildLocalFinalizeOptionsForSpeaker,
    clearPartialBuffers,
    finalizePendingLocally,
    finalizeTurnWithTranslation,
    getLatestPendingTurn,
    getPendingTurnsForLocalFinalize,
    logClientEvent,
    sendNativeSttCommand,
    clearPendingNativeStopAckTimeout,
    clearSpeakerAvatarSession,
    releaseCurrentNativeSttOwner,
    stopAudioPipeline,
  ])

  const stopRecordingWithOptions = useCallback(async (options?: StopRecordingOptions) => {
    if (options?.discardPendingFinalization) {
      prepareForDeletion()
    }
    await stopRecordingGracefully()
  }, [prepareForDeletion, stopRecordingGracefully])

  const visualize = useCallback(() => {
    if (analyserRef.current) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
      analyserRef.current.getByteTimeDomainData(dataArray)
      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        sum += Math.pow((dataArray[i] - 128) / 128, 2)
      }
      const rms = Math.sqrt(sum / dataArray.length)
      setVolume(rms)
      animationFrameRef.current = requestAnimationFrame(visualize)
    } else {
      setVolume(0)
    }
  }, [])

  const startAudioProcessing = useCallback(() => {
    if (!audioContextRef.current || !streamRef.current || !socketRef.current) return

    const context = audioContextRef.current
    const stream = streamRef.current
    const socket = socketRef.current

    const source = context.createMediaStreamSource(stream)
    sourceRef.current = source
    const analyser = context.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)
    analyserRef.current = analyser
    visualize()

    const processor = context.createScriptProcessor(4096, 1, 1)
    processorRef.current = processor
    source.connect(processor)
    processor.connect(context.destination)
    processor.onaudioprocess = (e) => {
      if (socket.readyState === WebSocket.OPEN) {
        lastAudioChunkAtRef.current = Date.now()
        const inputData = e.inputBuffer.getChannelData(0)
        const pcmData = floatTo16BitPCM(inputData)
        const base64Data = toBase64(pcmData)
        socket.send(JSON.stringify({
          type: 'audio_chunk',
          data: { chunk: base64Data }
        }))
      }
    }
  }, [visualize])

  const finalizePendingTurnsLocallyForStop = useCallback((reason: string) => {
    const localFinalizeResults: LocalFinalizeResult[] = []
    for (const pendingTurn of getPendingTurnsForLocalFinalize()) {
      const { options } = buildLocalFinalizeOptionsForSpeaker(pendingTurn.speaker, pendingTurn.language)
      const result = finalizePendingLocally(
        pendingTurn.rawText,
        pendingTurn.language,
        options,
      )
      if (result) {
        localFinalizeResults.push(result)
      }
    }
    if (localFinalizeResults.length === 0) return

    const sttDurationMs = turnStartedAtRef.current ? Math.max(0, Date.now() - turnStartedAtRef.current) : undefined
    clearPartialBuffers()
    turnStartedAtRef.current = null
    for (const result of localFinalizeResults) {
      finalizeTurnWithTranslation(result, {
        sttDurationMs,
        reason,
      })
    }
  }, [
    buildLocalFinalizeOptionsForSpeaker,
    clearPartialBuffers,
    finalizePendingLocally,
    finalizeTurnWithTranslation,
    getPendingTurnsForLocalFinalize,
  ])

  const handleSttTransportError = useCallback((details?: Record<string, unknown>) => {
    logSttDebug('transport.error', details)
    console.error('[MingleSTT] transport.error', details || {})
    const wasActiveSession = hasActiveSessionRef.current
    hasActiveSessionRef.current = false

    const localFinalizeResults: LocalFinalizeResult[] = []
    for (const pendingTurn of getPendingTurnsForLocalFinalize()) {
      const { options } = buildLocalFinalizeOptionsForSpeaker(pendingTurn.speaker, pendingTurn.language)
      const result = finalizePendingLocally(
        pendingTurn.rawText,
        pendingTurn.language,
        options,
      )
      if (result) {
        localFinalizeResults.push(result)
      }
    }
    const sttDurationMs = turnStartedAtRef.current ? Math.max(0, Date.now() - turnStartedAtRef.current) : undefined
    clearPartialBuffers()
    turnStartedAtRef.current = null
    for (const result of localFinalizeResults) {
      finalizeTurnWithTranslation(result, {
        sttDurationMs,
        reason: 'transport_error',
      })
    }

    if (wasActiveSession) {
      void logClientEvent({
        eventType: 'stt_session_stopped',
        metadata: {
          reason: 'transport_error',
          details: details || null,
        },
        keepalive: true,
      })
    }

    cleanup()
    clearSpeakerAvatarSession()
    setConnectionStatus('error')
    scheduleConnectionErrorReset()
  }, [
    buildLocalFinalizeOptionsForSpeaker,
    cleanup,
    clearPartialBuffers,
    clearSpeakerAvatarSession,
    finalizePendingLocally,
    finalizeTurnWithTranslation,
    getPendingTurnsForLocalFinalize,
    logClientEvent,
    scheduleConnectionErrorReset,
  ])

  const handleSttTransportClose = useCallback((details?: Record<string, unknown>) => {
    logSttDebug('transport.close', details)
    console.warn('[MingleSTT] transport.close', details || {})
    const wasActiveSession = hasActiveSessionRef.current
    hasActiveSessionRef.current = false

    if (!isStoppingRef.current) {
      const localFinalizeResults: LocalFinalizeResult[] = []
      for (const pendingTurn of getPendingTurnsForLocalFinalize()) {
        const { options } = buildLocalFinalizeOptionsForSpeaker(pendingTurn.speaker, pendingTurn.language)
        const result = finalizePendingLocally(
          pendingTurn.rawText,
          pendingTurn.language,
          options,
        )
        if (result) {
          localFinalizeResults.push(result)
        }
      }
      const sttDurationMs = turnStartedAtRef.current ? Math.max(0, Date.now() - turnStartedAtRef.current) : undefined
      clearPartialBuffers()
      turnStartedAtRef.current = null
      for (const result of localFinalizeResults) {
        finalizeTurnWithTranslation(result, {
          sttDurationMs,
          reason: 'transport_close',
        })
      }
    }

    if (wasActiveSession) {
      void logClientEvent({
        eventType: 'stt_session_stopped',
        metadata: {
          reason: isStoppingRef.current ? 'stt_stop_close' : 'transport_close',
          details: details || null,
        },
        keepalive: true,
      })
    }

    resetToIdle()
  }, [
    buildLocalFinalizeOptionsForSpeaker,
    clearPartialBuffers,
    finalizePendingLocally,
    finalizeTurnWithTranslation,
    getPendingTurnsForLocalFinalize,
    logClientEvent,
    resetToIdle,
  ])

  const handleSttServerMessage = useCallback((message: Record<string, unknown>) => {
    if (message.status === 'ready') {
      sonioxLanguageHintsEnabledRef.current = message.soniox_language_hints_enabled === true
      logSttDebug('transport.ready', {
        sonioxLanguageHintsEnabled: sonioxLanguageHintsEnabledRef.current,
      })
      setConnectionStatus('ready')
      lastAudioChunkAtRef.current = Date.now()
      sessionAudioStartedAtMsRef.current = Date.now()
      if (!hasActiveSessionRef.current) {
        hasActiveSessionRef.current = true
        void logClientEvent({
          eventType: 'stt_session_started',
        })
      }
      if (!useNativeSttRef.current) {
        startAudioProcessing()
      } else {
        setVolume(0)
      }

      return
    }

    if (message.type === 'stop_recording_ack') {
      if (nativeStopRequestedRef.current) {
        finalizePendingTurnsLocallyForStop('native_stop_ack')
      }
      return
    }

    const transcript = parseSttTranscriptMessage(message)
    if (transcript) {
      const {
        rawText,
        text,
        language: lang,
        isFinal,
        speaker,
        finalizeSource,
        providerAudioEndMs,
      } = transcript
      logSttDebug('transcript.received', {
        speaker,
        isFinal,
        language: lang,
        finalizeSource: finalizeSource || null,
        rawTextPreview: buildDebugTextPreview(rawText),
        textPreview: buildDebugTextPreview(text),
      })

      if (isStoppingRef.current && !isFinal) {
        return
      }

      if (isFinal) {
        const latencyMetric = buildEndpointingLatencyMetric({
          finalizeSource,
          providerAudioEndMs,
          sessionAudioStartedAtMs: sessionAudioStartedAtMsRef.current,
          clientFinalReceivedAtMs: Date.now(),
        })
        if (latencyMetric) {
          onEndpointingLatencyMetricRef.current?.(latencyMetric)
        }
        // Ignore non-meaningful turns (only "." / spaces) entirely.
        // No bubble, translation, or TTS should be produced.
        const pendingTurn = pendingTurnsBySpeakerRef.current[speaker] || null
        const { options } = buildLocalFinalizeOptionsForSpeaker(speaker, lang)
        if (!text) {
          removePendingTurn(speaker)
          syncVisiblePendingTurn()
          return
        }
        const now = Date.now()
        const hadTurnStart = turnStartedAtRef.current !== null
        const sttDurationMs = hadTurnStart && turnStartedAtRef.current
          ? Math.max(0, now - turnStartedAtRef.current)
          : undefined
        turnStartedAtRef.current = null

        const targetLanguages = getCurrentTargetLanguages()
        const nextUtteranceSerial = pendingTurn?.utteranceSerial ?? (utteranceIdRef.current + 1)
        const seedTranslationState = buildSeedTranslationState(
          targetLanguages,
          lang,
          options.partialTranslations,
          options.partialTranslationPriorities,
        )
        const finalizedPayload = buildFinalizedUtterancePayload({
          speaker,
          speakerAvatarSeed: pendingTurn?.speakerAvatarSeed || ensureSpeakerAvatarAssignment(speaker).speakerAvatarSeed,
          speakerAvatarIndex: (
            typeof pendingTurn?.speakerAvatarIndex === 'number'
              ? pendingTurn.speakerAvatarIndex
              : ensureSpeakerAvatarAssignment(speaker).speakerAvatarIndex
          ),
          rawText,
          rawLanguage: lang,
          languages: targetLanguages,
          partialTranslations: seedTranslationState.translations,
          currentTurnPreviousTranslations: seedTranslationState.translations,
          utteranceSerial: nextUtteranceSerial,
          utteranceId: pendingTurn?.utteranceId,
          nowMs: now,
          createdAtMs: pendingTurn?.createdAtMs ?? now,
          previousStateSourceLanguage: options.previousStateSourceLanguage || lang,
          previousStateSourceText: options.previousStateSourceText || pendingTurn?.text || text,
        })
        if (!finalizedPayload) {
          return
        }
        const finalizedAvatar = getSpeakerAvatar(
          finalizedPayload.utterance.speaker,
          finalizedPayload.utterance.speakerAvatarSeed,
          finalizedPayload.utterance.speakerAvatarIndex,
        )
        logSttDebug('transcript.avatar_mapping', {
          speaker: finalizedPayload.utterance.speaker || 'unknown',
          speakerAvatarSeed: finalizedPayload.utterance.speakerAvatarSeed || null,
          speakerAvatarIndex: finalizedPayload.utterance.speakerAvatarIndex ?? null,
          isFinal: true,
          avatarName: finalizedAvatar.name,
          avatarSrc: finalizedAvatar.src,
          utteranceId: finalizedPayload.utteranceId,
        })
        const recentFinalizedMatch = classifyRecentFinalizedUtteranceMatch({
          pendingUtteranceId: pendingTurn?.utteranceId || null,
          finalizedUtteranceId: finalizedPayload.utteranceId,
          recentFinalizedUtterances: recentFinalizedUtterancesRef.current,
          nowMs: now,
          text: finalizedPayload.text,
          language: finalizedPayload.language,
          speaker,
        })
        if (recentFinalizedMatch.kind === 'skip_duplicate_server') {
          logSttDebug('finalize.skip_duplicate_server', {
            reusedUtteranceId: recentFinalizedMatch.utteranceId,
            text: finalizedPayload.text,
            language: finalizedPayload.language,
          })
          removePendingTurn(speaker)
          syncVisiblePendingTurn()
          return
        }
        const recentLocalReuseUtteranceId = (
          recentFinalizedMatch.kind === 'reuse_local'
            ? recentFinalizedMatch.utteranceId
            : null
        )
        let reusedSpeakerAvatarSeed: string | undefined
        let reusedSpeakerAvatarIndex: number | undefined
        if (recentLocalReuseUtteranceId) {
          logSttDebug('finalize.reuse_recent_utterance', {
            reusedUtteranceId: recentLocalReuseUtteranceId,
            text: finalizedPayload.text,
            language: finalizedPayload.language,
          })
          setUtteranceStore((prev) => {
            const existingUtterance = prev.utterances.find(
              (utterance) => utterance.id === recentLocalReuseUtteranceId,
            )
            reusedSpeakerAvatarSeed = existingUtterance?.speakerAvatarSeed
            reusedSpeakerAvatarIndex = existingUtterance?.speakerAvatarIndex
            return replaceFinalizedUtteranceSourceInStoreState({
              store: prev,
              utteranceId: recentLocalReuseUtteranceId,
              sourceText: finalizedPayload.text,
              sourceLanguage: finalizedPayload.language,
              selectedLanguages: targetLanguages,
            })
          })
        } else {
          utteranceIdRef.current = nextUtteranceSerial
        }
        const fallbackCurrentTurnPreviousState = options.fallbackCurrentTurnPreviousState
        const currentTurnPreviousState = (
          finalizedPayload.currentTurnPreviousState
          && Object.keys(finalizedPayload.currentTurnPreviousState.translations).length > 0
        ) ? finalizedPayload.currentTurnPreviousState : (fallbackCurrentTurnPreviousState || finalizedPayload.currentTurnPreviousState)
        if (!recentLocalReuseUtteranceId) {
          bumpMessageCountForNewUtterance(finalizedPayload.utterance)
          setUtteranceStore((prev) => appendFinalizedUtteranceToStoreState(
            prev,
            finalizedPayload.utterance,
            seedTranslationState,
          ))
        }
        recentFinalizedUtterancesRef.current = rememberRecentFinalizedUtterance({
          recentFinalizedUtterances: recentFinalizedUtterancesRef.current,
          utterance: {
            id: recentLocalReuseUtteranceId || finalizedPayload.utteranceId,
            text: finalizedPayload.text,
            language: finalizedPayload.language,
            speaker: finalizedPayload.utterance.speaker || speaker,
            expiresAt: now + 2_000,
            source: 'server',
          },
          nowMs: now,
        })

        finalizeTurnWithTranslation(
          {
            utteranceId: recentLocalReuseUtteranceId || finalizedPayload.utteranceId,
            text: finalizedPayload.text,
            lang: finalizedPayload.language,
            currentTurnPreviousState,
            speaker: finalizedPayload.utterance.speaker || speaker,
          },
          {
            sttDurationMs,
            reason: finalizeSource ? `stt_server_final:${finalizeSource}` : 'stt_server_final',
            speaker: finalizedPayload.utterance.speaker,
            ...resolveReconciledSpeakerAvatar({
              reusedSpeakerAvatarSeed,
              reusedSpeakerAvatarIndex,
              fallbackSpeakerAvatarSeed: finalizedPayload.utterance.speakerAvatarSeed,
              fallbackSpeakerAvatarIndex: finalizedPayload.utterance.speakerAvatarIndex,
            }),
          },
        )
        removePendingTurn(speaker)
        syncVisiblePendingTurn()
      } else {
        if (!turnStartedAtRef.current && text) {
          turnStartedAtRef.current = Date.now()
          void logClientEvent({
            eventType: 'stt_turn_started',
            sourceLanguage: lang,
            sourceText: text,
          })
        }
        const now = Date.now()
        const existingPendingTurn = pendingTurnsBySpeakerRef.current[speaker] || null
        const turnIdentity = existingPendingTurn || reservePendingSpeakerTurnIdentity(utteranceIdRef.current + 1, now)
        const pendingSpeakerAvatarAssignment = ensureSpeakerAvatarAssignment(speaker)
        const pendingSpeakerAvatarSeed = existingPendingTurn?.speakerAvatarSeed || pendingSpeakerAvatarAssignment.speakerAvatarSeed
        const pendingSpeakerAvatarIndex = (
          typeof existingPendingTurn?.speakerAvatarIndex === 'number'
            ? existingPendingTurn.speakerAvatarIndex
            : pendingSpeakerAvatarAssignment.speakerAvatarIndex
        )
        if (!existingPendingTurn) {
          utteranceIdRef.current = turnIdentity.utteranceSerial
        }
        pendingTurnsBySpeakerRef.current[speaker] = {
          ...turnIdentity,
          speaker,
          speakerAvatarSeed: pendingSpeakerAvatarSeed,
          speakerAvatarIndex: pendingSpeakerAvatarIndex,
          rawText,
          text,
          language: lang,
          partialTranslations: existingPendingTurn?.partialTranslations || {},
          partialTranslationPriorities: existingPendingTurn?.partialTranslationPriorities || new Map(),
          currentTurnPreviousState: existingPendingTurn?.currentTurnPreviousState || null,
          updatedAtMs: now,
        }
        const pendingAvatar = getSpeakerAvatar(speaker, pendingSpeakerAvatarSeed, pendingSpeakerAvatarIndex)
        logSttDebug('transcript.avatar_mapping', {
          speaker,
          speakerAvatarSeed: pendingSpeakerAvatarSeed,
          speakerAvatarIndex: pendingSpeakerAvatarIndex,
          isFinal: false,
          avatarName: pendingAvatar.name,
          avatarSrc: pendingAvatar.src,
          utteranceId: turnIdentity.utteranceId,
        })
        bumpPendingTurnRenderVersion()
        syncVisiblePendingTurn(speaker)
      }
    }
  }, [
    buildLocalFinalizeOptionsForSpeaker,
    bumpMessageCountForNewUtterance,
    bumpPendingTurnRenderVersion,
    finalizePendingTurnsLocallyForStop,
    finalizeTurnWithTranslation,
    getCurrentTargetLanguages,
    logClientEvent,
    ensureSpeakerAvatarAssignment,
    removePendingTurn,
    startAudioProcessing,
    syncVisiblePendingTurn,
  ])

  const startRecording = useCallback(async () => {
    if (isStoppingRef.current) return
    const useNativeStt = shouldUseNativeSttBridge()
    const targetLanguages = [...getCurrentTargetLanguages()]
    const currentSpeechLanguages = [...effectiveSpeechLanguages]
    useNativeSttRef.current = useNativeStt
    if (shouldOpenNativeMicSettingsOnRetry({
      useNativeStt,
      connectionStatus: connectionStatusRef.current,
      recoveryAction: nativeMicPermissionRecoveryActionRef.current,
      supportsNativeOpenAppSettingsCommand: nativeShellSupportsOpenAppSettingsRef.current,
    })) {
      const opened = sendNativeSttCommand({
        type: 'native_open_app_settings',
        payload: {
          reason: 'microphone_permission_denied',
        },
      })
      if (opened) {
        nativeMicPermissionRecoveryActionRef.current = 'none'
        return
      }
    }
    logSttDebug('recording.start.request', {
      useNativeStt,
      wsUrl: getWsUrl(),
      targetLanguagesCount: targetLanguages.length,
    })
    if (!useNativeStt && (
      socketRef.current
      && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)
    )) {
      return
    }

    // Check limit before starting
    if (normalizedUsageLimitSec !== null && usageSec >= normalizedUsageLimitSec) {
      onLimitReachedRef.current?.()
      return
    }

    try {
      setConnectionStatus('connecting')
      stopFinalizeDedupRef.current = { utteranceId: '', expiresAt: 0 }
      turnStartedAtRef.current = null
      sessionAudioStartedAtMsRef.current = null
      recentFinalizedUtterancesRef.current = []
      hasActiveSessionRef.current = false
      pendingTurnsBySpeakerRef.current = {}
      clearAllPendingTurnTranslationRuntime()
      activePartialSpeakerRef.current = null
      setPartialTranscript('')
      partialTranscriptRef.current = ''
      setPartialTranslations({})
      partialTranslationsRef.current = {}
      setPartialLang(null)
      partialLangRef.current = null
      bumpPendingTurnRenderVersion()

      if (useNativeStt) {
        claimCurrentNativeSttOwner()
        const runtimeBehaviorContext = resolveSttRuntimeBehaviorContext()
        const sonioxLanguageHints = buildSonioxLanguageHints(currentSpeechLanguages)
        logSttDebug('native.start.begin')
        const posted = sendNativeSttCommand({
          type: 'native_stt_start',
          payload: {
            wsUrl: getWsUrl(),
            sttModel: 'soniox',
            aecEnabled: enableAec,
            apiNamespace: runtimeBehaviorContext.apiNamespace,
            releaseVariant: runtimeBehaviorContext.releaseVariant,
            behaviorProfile: runtimeBehaviorContext.behaviorProfile,
            sonioxLanguageHints,
            sonioxManualFinalizeSilenceMs,
          },
        })
        if (!posted) {
          releaseCurrentNativeSttOwner()
          throw new Error('native_stt_bridge_unavailable')
        }
        return
      }

      logSttDebug('web.start.begin')
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        throw new Error('secure_context_required_for_microphone')
      }
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        throw new Error('media_devices_api_unavailable')
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: enableAec,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        }
      })
      streamRef.current = stream

      let context = audioContextRef.current
      if (!context || context.state === 'closed') {
        context = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
        audioContextRef.current = context
      }
      if (context.state === 'suspended') {
        try {
          await context.resume()
        } catch { /* no-op */ }
      }

      const socket = new WebSocket(getWsUrl())
      socketRef.current = socket

      socket.onopen = () => {
        const runtimeBehaviorContext = resolveSttRuntimeBehaviorContext()
        const sonioxLanguageHints = buildSonioxLanguageHints(currentSpeechLanguages)
        const config = {
          sample_rate: context.sampleRate,
          stt_model: 'soniox',
          api_namespace: runtimeBehaviorContext.apiNamespace,
          release_variant: runtimeBehaviorContext.releaseVariant,
          behavior_profile: runtimeBehaviorContext.behaviorProfile,
          soniox_language_hints: sonioxLanguageHints,
          soniox_manual_finalize_silence_ms: sonioxManualFinalizeSilenceMs,
        }
        socket.send(JSON.stringify(config))
      }

      socket.onmessage = (event) => {
        if (socket !== socketRef.current) return
        try {
          const rawMessage = typeof event.data === 'string' ? event.data : String(event.data)
          const message = JSON.parse(rawMessage) as Record<string, unknown>
          handleSttServerMessage(message)
        } catch {
          // ignore malformed payload
        }
      }

      socket.onerror = () => {
        if (socket !== socketRef.current) return
        handleSttTransportError({ native: false })
      }

      socket.onclose = () => {
        if (socket !== socketRef.current) return
        handleSttTransportClose({ native: false })
      }
    } catch (error) {
      logSttDebug('recording.start.failed', {
        native: useNativeStt,
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : 'unknown',
      })
      console.error('[MingleSTT] recording.start.failed', {
        native: useNativeStt,
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : 'unknown',
        wsUrl: getWsUrl(),
        origin: typeof window !== 'undefined' ? window.location.origin : null,
        isSecureContext: typeof window !== 'undefined' ? window.isSecureContext : null,
      })
      cleanup()
      releaseCurrentNativeSttOwner()
      setConnectionStatus('error')
      scheduleConnectionErrorReset()
    }
  }, [bumpPendingTurnRenderVersion, claimCurrentNativeSttOwner, cleanup, clearAllPendingTurnTranslationRuntime, effectiveSpeechLanguages, enableAec, getCurrentTargetLanguages, handleSttServerMessage, handleSttTransportClose, handleSttTransportError, normalizedUsageLimitSec, releaseCurrentNativeSttOwner, scheduleConnectionErrorReset, sendNativeSttCommand, sonioxManualFinalizeSilenceMs, usageSec])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!shouldUseNativeSttBridge()) return
    useNativeSttRef.current = true

    const handleNativeEvent = (event: Event) => {
      const detail = (event as CustomEvent<NativeSttBridgeEvent>).detail
      if (!detail || typeof detail !== 'object') return

      if (detail.type === 'capabilities') {
        nativeShellSupportsOpenAppSettingsRef.current = detail.openAppSettings === true
        return
      }

      if (detail.type === 'status') {
        if (!claimCurrentNativeSttOwnerIfUnclaimed()) {
          return
        }
        logSttDebug('native.status', { status: detail.status })
        const nextConnectionStatus = resolveConnectionStatusFromNativeBridgeStatus({
          nativeStatus: detail.status,
          previousConnectionStatus: connectionStatusRef.current,
        })
        if (!shouldApplyNativeBridgeConnectionStatus({
          nextConnectionStatus,
          isStopping: isStoppingRef.current,
          nativeStopRequested: nativeStopRequestedRef.current,
        })) {
          logSttDebug('native.status.skip_stop_pending', { status: detail.status })
          return
        }
        if (nextConnectionStatus === 'connecting' || nextConnectionStatus === 'ready') {
          nativeMicPermissionRecoveryActionRef.current = 'none'
        }
        if (nextConnectionStatus === 'ready') {
          hasActiveSessionRef.current = true
        }
        if (nextConnectionStatus) {
          setConnectionStatus(nextConnectionStatus)
        }
        return
      }

      if (detail.type === 'message') {
        if (!claimCurrentNativeSttOwnerIfUnclaimed()) {
          return
        }
        if (shouldPromoteConnectionStatusFromNativeActivity({
          previousConnectionStatus: connectionStatusRef.current,
          isStopping: isStoppingRef.current,
          nativeStopRequested: nativeStopRequestedRef.current,
        })) {
          logSttDebug('native.message.promote_ready', {
            previousConnectionStatus: connectionStatusRef.current,
          })
          nativeMicPermissionRecoveryActionRef.current = 'none'
          hasActiveSessionRef.current = true
          setConnectionStatus('ready')
        }
        try {
          const message = JSON.parse(detail.raw) as Record<string, unknown>
          if (!shouldHandleNativeBridgeServerMessage({
            message,
            isStopping: isStoppingRef.current,
            nativeStopRequested: nativeStopRequestedRef.current,
          })) {
            logSttDebug('native.message.skip_stop_pending_ready')
            return
          }
          handleSttServerMessage(message)
        } catch {
          // ignore malformed payload
        }
        return
      }

      if (detail.type === 'permission') {
        logSttDebug('native.permission', {
          permission: detail.permission,
          platform: detail.platform,
        })
        const recoveryAction = resolveNativeMicPermissionRecoveryAction(detail)
        nativeMicPermissionRecoveryActionRef.current = recoveryAction
        if (
          recoveryAction === 'open_ios_settings'
          && isCurrentNativeSttOwner()
          && connectionStatusRef.current !== 'idle'
        ) {
          resetToIdle()
        }
        return
      }

      if (detail.type === 'error') {
        if (!claimCurrentNativeSttOwnerIfUnclaimed()) {
          return
        }
        logSttDebug('native.error', { message: detail.message })
        if (nativeStopRequestedRef.current) {
          finalizePendingTurnsLocallyForStop('native_stop_error')
          nativeStopRequestedRef.current = false
          releaseCurrentNativeSttOwner()
          resolvePendingNativeStopAck()
          setConnectionStatus('idle')
          return
        }
        const recoveryAction = resolveNativeMicPermissionRecoveryAction(detail)
        nativeMicPermissionRecoveryActionRef.current = recoveryAction
        if (shouldResetConnectionToIdleForNativeMicRecovery(detail)) {
          logSttDebug('native.error.permission_recovery_idle', {
            message: detail.message,
            code: detail.code,
            platform: detail.platform,
          })
          resetToIdle()
          return
        }
        handleSttTransportError({ native: true, message: detail.message })
        return
      }

      if (detail.type === 'close') {
        if (!claimCurrentNativeSttOwnerIfUnclaimed()) {
          return
        }
        logSttDebug('native.close', { reason: detail.reason })
        if (nativeStopRequestedRef.current) {
          finalizePendingTurnsLocallyForStop('native_stop_close')
          nativeStopRequestedRef.current = false
          releaseCurrentNativeSttOwner()
          resolvePendingNativeStopAck()
          setConnectionStatus('idle')
          return
        }
        handleSttTransportClose({ native: true, reason: detail.reason })
      }
    }

    window.addEventListener(NATIVE_STT_EVENT, handleNativeEvent as EventListener)
    return () => {
      window.removeEventListener(NATIVE_STT_EVENT, handleNativeEvent as EventListener)
    }
  }, [claimCurrentNativeSttOwnerIfUnclaimed, finalizePendingTurnsLocallyForStop, handleSttServerMessage, handleSttTransportClose, handleSttTransportError, isCurrentNativeSttOwner, releaseCurrentNativeSttOwner, resetToIdle, resolvePendingNativeStopAck])

  useEffect(() => {
    if (!shouldTrackUsageForConnectionStatus(connectionStatus)) {
      if (usageIntervalRef.current) {
        clearInterval(usageIntervalRef.current)
        usageIntervalRef.current = null
      }
      return
    }

    if (usageIntervalRef.current) return

    usageIntervalRef.current = setInterval(() => {
      setUsageSec(prev => {
        const next = prev + 1
        if (normalizedUsageLimitSec !== null && next >= normalizedUsageLimitSec) {
          setTimeout(() => {
            void stopRecordingGracefully(true)
          }, 0)
        }
        return next
      })
    }, 1000)

    return () => {
      if (usageIntervalRef.current) {
        clearInterval(usageIntervalRef.current)
        usageIntervalRef.current = null
      }
    }
  }, [connectionStatus, normalizedUsageLimitSec, stopRecordingGracefully])

  const recoverFromBackgroundIfNeeded = useCallback(async () => {
    if (useNativeSttRef.current) return
    if (connectionStatus !== 'ready') return
    if (isBackgroundRecoveringRef.current) return
    isBackgroundRecoveringRef.current = true

    try {
      const context = audioContextRef.current
      if (context?.state === 'suspended') {
        try {
          await context.resume()
        } catch { /* no-op */ }
      }

      const track = streamRef.current?.getAudioTracks()?.[0] ?? null
      const trackDead = !track || track.readyState !== 'live'
      const contextNotRunning = !audioContextRef.current || audioContextRef.current.state !== 'running'
      const noChunksTooLong = (Date.now() - lastAudioChunkAtRef.current) > 3000

      if (trackDead || contextNotRunning || noChunksTooLong) {
        await stopRecordingGracefully()
        await new Promise<void>((resolve) => {
          window.setTimeout(() => resolve(), 120)
        })
        await startRecording()
      }
    } finally {
      isBackgroundRecoveringRef.current = false
    }
  }, [connectionStatus, startRecording, stopRecordingGracefully])

  useEffect(() => {
    const pendingTurns = Object.entries(pendingTurnsBySpeakerRef.current)
    if (pendingTurns.length === 0) return

    for (const [speaker, pendingTurn] of pendingTurns) {
      const targetLanguages = buildTurnTargetLanguagesSnapshot(effectiveTargetLanguages, pendingTurn.language)
      const nextTranslations = filterTranslationsToTargetLanguages(
        stripSourceLanguageFromTranslations(pendingTurn.partialTranslations, pendingTurn.language),
        targetLanguages,
      )
      const nextPriorities = new Map<string, TranslationPriority>()
      for (const language of Object.keys(nextTranslations)) {
        const priority = pendingTurn.partialTranslationPriorities.get(language)
        if (priority) {
          nextPriorities.set(language, priority)
        }
      }

      pendingTurnsBySpeakerRef.current[speaker] = {
        ...pendingTurn,
        partialTranslations: nextTranslations,
        partialTranslationPriorities: nextPriorities,
        currentTurnPreviousState: buildCurrentTurnPreviousStatePayload(
          pendingTurn.language,
          pendingTurn.text,
          nextTranslations,
        ),
      }
    }

    bumpPendingTurnRenderVersion()
    syncVisiblePendingTurn(activePartialSpeakerRef.current)
  }, [bumpPendingTurnRenderVersion, effectiveTargetLanguages, syncVisiblePendingTurn])

  useEffect(() => {
    if (PARTIAL_TRANSLATE_MODE !== 'time' && PARTIAL_TRANSLATE_MODE !== 'both') return
    if (connectionStatus !== 'ready') return

    const timer = window.setInterval(() => {
      setPartialTranslateTick((prev) => prev + 1)
    }, PARTIAL_TRANSLATE_INTERVAL_MS)

    return () => {
      window.clearInterval(timer)
    }
  }, [connectionStatus])

  // ===== Partial translation: fire immediately once, then re-trigger per configured mode =====
  useEffect(() => {
    const pendingTurns = Object.values(pendingTurnsBySpeakerRef.current)
    const targetLanguages = [...effectiveTargetLanguages]
    const targetLanguageSignature = buildLanguageSelectionSignature(targetLanguages)
    if (connectionStatus !== 'ready' || targetLanguages.length === 0 || pendingTurns.length === 0) return

    for (const pendingTurn of pendingTurns) {
      const trimmed = pendingTurn.text.trim()
      const currentLang = pendingTurn.language || 'unknown'
      const len = trimmed.length
      if (len === 0) continue

      if (
        targetLanguages.length === 1
        && normalizeTranslationLanguageKey(currentLang) === normalizeTranslationLanguageKey(targetLanguages[0] || '')
      ) {
        continue
      }

      const runtime = getPendingTurnTranslationRuntime(pendingTurn.utteranceId)
      const isInitialPartialRequest = !runtime.hasFiredInitialRequest
      const targetLanguagesChanged = runtime.lastTargetSignature !== targetLanguageSignature
      const scheduleDecision = shouldTriggerPartialTranslate({
        mode: PARTIAL_TRANSLATE_MODE,
        isInitialRequest: isInitialPartialRequest,
        targetLanguagesChanged,
        textLength: len,
        currentText: trimmed,
        lastRequestedText: runtime.lastRequestedText,
        lastTranslateLen: runtime.lastTranslateLen,
        charStep: PARTIAL_TRANSLATE_STEP,
        elapsedSinceLastRequestMs: Math.max(0, Date.now() - runtime.lastRequestedAtMs),
        intervalMs: PARTIAL_TRANSLATE_INTERVAL_MS,
      })
      if (!scheduleDecision.shouldRequest) continue
      runtime.hasFiredInitialRequest = true
      runtime.lastTranslateLen = scheduleDecision.nextLastTranslateLen

      const requestSignature = buildLiveTranslateRequestSignature({
        utteranceId: pendingTurn.utteranceId,
        speaker: pendingTurn.speaker,
        language: currentLang,
        text: trimmed,
        targetLanguages,
      })
      if (runtime.lastRequestSignature === requestSignature) {
        logSttDebug('partial.translate.skip_duplicate', {
          requestUtteranceId: pendingTurn.utteranceId,
          requestSpeaker: pendingTurn.speaker,
          currentLang,
          targetLanguages,
          text: trimmed,
        })
        continue
      }

      runtime.lastRequestSignature = requestSignature
      runtime.lastTargetSignature = targetLanguageSignature
      runtime.lastRequestedText = trimmed
      runtime.lastRequestedAtMs = Date.now()
      const requestSeq = runtime.latestRequestSeq + 1
      runtime.latestRequestSeq = requestSeq
      const requestPriority: TranslationPriority = {
        kind: isInitialPartialRequest ? 'initial' : 'partial',
        seq: requestSeq,
      }
      runtime.controller?.abort()
      const controller = new AbortController()
      runtime.controller = controller

      translateViaApi(trimmed, currentLang, targetLanguages, {
        signal: controller.signal,
        currentTurnPreviousState: pendingTurn.currentTurnPreviousState,
      }).then((result) => {
        const latestPendingTurn = findPendingTurnByUtteranceId(pendingTurn.utteranceId)
        const latestRuntime = pendingTurnTranslationRuntimeRef.current[pendingTurn.utteranceId]
        if (latestRuntime?.controller === controller) {
          latestRuntime.controller = null
        }
        if (!latestPendingTurn) return
        if (!latestRuntime) return
        if (!shouldApplyPendingTurnPartialTranslationResponse({
          requestUtteranceId: pendingTurn.utteranceId,
          currentPendingUtteranceId: latestPendingTurn.utteranceId,
          requestSeq,
          latestRequestSeq: latestRuntime.latestRequestSeq,
          aborted: controller.signal.aborted,
        })) {
          logSttDebug('partial.translate.skip_stale', {
            requestUtteranceId: pendingTurn.utteranceId,
            currentPendingUtteranceId: latestPendingTurn.utteranceId,
            requestSpeaker: pendingTurn.speaker,
            currentSpeaker: latestPendingTurn.speaker,
            requestSeq,
            latestRequestSeq: latestRuntime.latestRequestSeq,
            aborted: controller.signal.aborted,
            text: trimmed,
          })
          return
        }

        const latestTargetLanguages = buildTurnTargetLanguagesSnapshot(targetLanguages, currentLang)
        const filteredExisting = filterTranslationsToTargetLanguages(
          stripSourceLanguageFromTranslations(latestPendingTurn.partialTranslations, currentLang),
          latestTargetLanguages,
        )
        const filteredNew = filterTranslationsToTargetLanguages(
          stripSourceLanguageFromTranslations(result.translations, currentLang),
          latestTargetLanguages,
        )
        const nextTranslations = { ...filteredExisting }
        const nextPriorities = new Map(latestPendingTurn.partialTranslationPriorities)
        for (const [language, translatedText] of Object.entries(filteredNew)) {
          const currentPriority = nextPriorities.get(language)
          if (!shouldOverrideTranslationByPriority(currentPriority, requestPriority)) continue
          nextTranslations[language] = translatedText
          nextPriorities.set(language, requestPriority)
        }

        const updatedPendingTurn: PendingSpeakerTurn = {
          ...latestPendingTurn,
          partialTranslations: nextTranslations,
          partialTranslationPriorities: nextPriorities,
          currentTurnPreviousState: buildCurrentTurnPreviousStatePayload(
            currentLang,
            trimmed,
            nextTranslations,
          ),
        }
        pendingTurnsBySpeakerRef.current[latestPendingTurn.speaker] = updatedPendingTurn
        if (activePartialSpeakerRef.current === latestPendingTurn.speaker) {
          partialTranslationsRef.current = nextTranslations
          setPartialTranslations(nextTranslations)
        }
        bumpPendingTurnRenderVersion()
      })
    }
  }, [
    bumpPendingTurnRenderVersion,
    connectionStatus,
    findPendingTurnByUtteranceId,
    getPendingTurnTranslationRuntime,
    effectiveTargetLanguages,
    partialTranslateTick,
    pendingTurnRenderVersion,
    translateViaApi,
  ])

  const toggleRecording = useCallback(() => {
    if (connectionStatus === 'ready' || connectionStatus === 'connecting') {
      void stopRecordingGracefully()
    } else {
      void startRecording()
    }
  }, [connectionStatus, startRecording, stopRecordingGracefully])

  useEffect(() => {
    return () => {
      clearConnectionErrorResetTimer()
      releaseCurrentNativeSttOwner()
      cleanup()
    }
  }, [clearConnectionErrorResetTimer, cleanup, releaseCurrentNativeSttOwner])

  useEffect(() => {
    const shouldStop = () => connectionStatus === 'ready' || connectionStatus === 'connecting'

    const handleOffline = () => {
      if (!shouldStop()) return
      void stopRecordingGracefully()
    }

    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('offline', handleOffline)
    }
  }, [connectionStatus, stopRecordingGracefully])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        wasBackgroundedRef.current = true
        return
      }
      if (!wasBackgroundedRef.current) return
      wasBackgroundedRef.current = false
      void recoverFromBackgroundIfNeeded()
    }

    const handlePageShow = () => {
      if (document.hidden) return
      wasBackgroundedRef.current = false
      void recoverFromBackgroundIfNeeded()
    }

    const handleFocus = () => {
      if (document.hidden) return
      void recoverFromBackgroundIfNeeded()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pageshow', handlePageShow)
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pageshow', handlePageShow)
      window.removeEventListener('focus', handleFocus)
    }
  }, [recoverFromBackgroundIfNeeded])

  const pendingTurnsSignature = `${pendingTurnRenderVersion}\u001d${buildPendingSpeakerTurnSignature(pendingTurnsBySpeakerRef.current)}`
  const liveUtteranceLanguages = getCurrentTargetLanguages()
  const pendingTurnSnapshots = useMemo(() => {
    void pendingTurnsSignature
    return buildPendingSpeakerTurnSnapshots(pendingTurnsBySpeakerRef.current)
  }, [pendingTurnsSignature])
  const activePendingTurn = getActivePendingTurn()
  const liveUtterances = useMemo(() => buildLiveUtterances({
    pendingTurns: pendingTurnSnapshots,
    languages: liveUtteranceLanguages,
  }), [pendingTurnSnapshots, liveUtteranceLanguages])
  const liveUtterance = useMemo(() => buildLiveUtterance({
    pendingTurn: activePendingTurn,
    partialTranscript: activePendingTurn?.text || partialTranscript,
    partialLang: activePendingTurn?.language || partialLang,
    partialTranslations: activePendingTurn?.partialTranslations || partialTranslations,
    languages: liveUtteranceLanguages,
  }), [
    activePendingTurn,
    partialLang,
    partialTranscript,
    partialTranslations,
    liveUtteranceLanguages,
  ])

  return {
    connectionStatus,
    utterances,
    liveUtterances,
    liveUtterance,
    partialTranscript,
    volume,
    toggleRecording,
    isActive: connectionStatus !== 'idle' && connectionStatus !== 'error',
    isReady: connectionStatus === 'ready',
    isConnecting: connectionStatus === 'connecting',
    isError: connectionStatus === 'error',
    isNativeSttSessionOwner: useNativeSttRef.current ? isCurrentNativeSttOwner() : false,
    partialTranslations,
    partialLang,
    usageSec,
    isLimitReached,
    usageLimitSec: normalizedUsageLimitSec,
    appendUtterances,
    submitExternalUtterance,
    clearConversationHistory,
    prepareForDeletion,
    loadOlderUtterances,
    hasOlderUtterances,
    isStorageHydrated,
    persistedUtteranceCount,
    replaceConversationHistoryForQa,
    ensureSessionKey,
    startRecording,
    stopRecording: stopRecordingWithOptions,
  }
}
