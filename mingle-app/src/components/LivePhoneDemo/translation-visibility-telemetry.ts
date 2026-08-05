'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { Utterance } from './ChatBubble'
import { canonicalizeTranslationLanguageCode } from '@/lib/translation-languages'

type VisibilityUtterance = Pick<
  Utterance,
  | 'id'
  | 'originalLang'
  | 'targetLanguages'
  | 'translations'
  | 'translationFinalized'
  | 'sourceLanguagesMixed'
  | 'sourceTextHasForeignScript'
>

type TranslationVisibilityTracker = {
  trackingStartedAtMs: number
  sourceVisibleAtMs?: number
  firstVisibleAtMs?: number
  allVisibleAtMs?: number
  loggingStarted: boolean
}

export type TranslationVisibilityLogPayload = {
  clientMessageId: string
  metadata: Record<string, unknown>
}

type UseTranslationVisibilityTelemetryArgs = {
  utterances: VisibilityUtterance[]
  logVisibility: (payload: TranslationVisibilityLogPayload) => Promise<void>
}

export type FinalTranslationVisibility = {
  expectedLanguages: string[]
  visibleLanguages: string[]
}

const TRACKER_RETENTION_MS = 2 * 60 * 1000

function normalizeTranslationLanguageCode(rawLanguage: string): string {
  const canonical = canonicalizeTranslationLanguageCode(rawLanguage)
  if (canonical) return canonical
  return (rawLanguage || '').trim().replace(/_/g, '-')
}

function normalizeTranslationLanguageKey(rawLanguage: string): string {
  return normalizeTranslationLanguageCode(rawLanguage).toLowerCase()
}

function shouldKeepSourceLanguageBubble(utterance: VisibilityUtterance): boolean {
  return utterance.sourceLanguagesMixed === true || utterance.sourceTextHasForeignScript === true
}

function buildRenderableTargetLanguages(utterance: VisibilityUtterance): string[] {
  const sourceLanguage = normalizeTranslationLanguageKey(utterance.originalLang)
  const languages: string[] = []
  const seen = new Set<string>()
  const keepSourceLanguageBubble = shouldKeepSourceLanguageBubble(utterance)

  const pushLanguage = (rawLanguage: string | undefined) => {
    const language = (rawLanguage || '').trim()
    if (!language) return
    const key = normalizeTranslationLanguageKey(language) || language.toLowerCase()
    if (!keepSourceLanguageBubble && sourceLanguage && key === sourceLanguage) return
    if (seen.has(key)) return
    seen.add(key)
    languages.push(language)
  }

  for (const language of utterance.targetLanguages || []) pushLanguage(language)
  for (const language of Object.keys(utterance.translations || {})) pushLanguage(language)
  for (const language of Object.keys(utterance.translationFinalized || {})) pushLanguage(language)

  return languages
}

export function getFinalTranslationVisibility(
  utterance: VisibilityUtterance,
): FinalTranslationVisibility {
  const translationsByLanguage = new Map<string, string>()
  for (const [language, text] of Object.entries(utterance.translations || {})) {
    translationsByLanguage.set(normalizeTranslationLanguageKey(language), text)
  }

  const finalizedByLanguage = new Map<string, boolean>()
  for (const [language, finalized] of Object.entries(utterance.translationFinalized || {})) {
    finalizedByLanguage.set(normalizeTranslationLanguageKey(language), finalized === true)
  }

  const expectedLanguages = buildRenderableTargetLanguages(utterance)
  const visibleLanguages = expectedLanguages.filter((language) => {
    const key = normalizeTranslationLanguageKey(language)
    return Boolean(translationsByLanguage.get(key)?.trim()) && finalizedByLanguage.get(key) === true
  })

  return { expectedLanguages, visibleLanguages }
}

export function buildTranslationVisibilityMetadata(input: {
  sourceVisibleAtMs: number
  firstVisibleAtMs: number
  allVisibleAtMs: number
  visibleLanguages: string[]
}): Record<string, unknown> {
  return {
    translationFirstVisibleMs: Math.max(0, input.firstVisibleAtMs - input.sourceVisibleAtMs),
    translationAllVisibleMs: Math.max(0, input.allVisibleAtMs - input.sourceVisibleAtMs),
    translationLanguages: input.visibleLanguages,
  }
}

export function useTranslationVisibilityTelemetry({
  utterances,
  logVisibility,
}: UseTranslationVisibilityTelemetryArgs) {
  const utterancesRef = useRef(utterances)

  const trackersRef = useRef(new Map<string, TranslationVisibilityTracker>())
  const finalizedMessagePersistenceRef = useRef(new Map<string, Promise<void>>())
  const animationFramesRef = useRef(new Map<string, number>())

  const clear = useCallback(() => {
    if (typeof window !== 'undefined') {
      for (const frame of animationFramesRef.current.values()) {
        window.cancelAnimationFrame(frame)
      }
    }
    animationFramesRef.current.clear()
    trackersRef.current.clear()
    finalizedMessagePersistenceRef.current.clear()
  }, [])

  const beginTracking = useCallback((clientMessageId: string) => {
    const now = Date.now()
    for (const [utteranceId, tracker] of trackersRef.current) {
      if (now - tracker.trackingStartedAtMs <= TRACKER_RETENTION_MS) continue
      trackersRef.current.delete(utteranceId)
      finalizedMessagePersistenceRef.current.delete(utteranceId)
    }

    if (trackersRef.current.has(clientMessageId)) return

    trackersRef.current.set(clientMessageId, {
      trackingStartedAtMs: now,
      loggingStarted: false,
    })
  }, [])

  const rememberFinalizedMessagePersistence = useCallback((
    clientMessageId: string,
    persistence: Promise<void>,
  ) => {
    finalizedMessagePersistenceRef.current.set(clientMessageId, persistence)
  }, [])

  const observeRenderedTranslations = useCallback((clientMessageId: string) => {
    const tracker = trackersRef.current.get(clientMessageId)
    if (!tracker || tracker.loggingStarted) return

    const utterance = utterancesRef.current.find((item) => item.id === clientMessageId)
    if (!utterance) return

    const observedAtMs = Date.now()
    const sourceVisibleAtMs = tracker.sourceVisibleAtMs ?? observedAtMs
    tracker.sourceVisibleAtMs = sourceVisibleAtMs

    const { expectedLanguages, visibleLanguages } = getFinalTranslationVisibility(utterance)
    if (visibleLanguages.length > 0 && tracker.firstVisibleAtMs === undefined) {
      tracker.firstVisibleAtMs = observedAtMs
    }

    const areAllTranslationsVisible = (
      expectedLanguages.length > 0
      && visibleLanguages.length === expectedLanguages.length
    )
    if (!areAllTranslationsVisible || tracker.firstVisibleAtMs === undefined) return

    tracker.allVisibleAtMs = observedAtMs
    tracker.loggingStarted = true
    const metadata = buildTranslationVisibilityMetadata({
      sourceVisibleAtMs,
      firstVisibleAtMs: tracker.firstVisibleAtMs,
      allVisibleAtMs: tracker.allVisibleAtMs,
      visibleLanguages,
    })

    const writeVisibilityEvent = () => {
      if (trackersRef.current.get(clientMessageId) !== tracker) return
      void logVisibility({ clientMessageId, metadata })
    }

    const persistence = finalizedMessagePersistenceRef.current.get(clientMessageId)
    if (persistence) {
      void persistence.then(writeVisibilityEvent, writeVisibilityEvent)
      return
    }
    writeVisibilityEvent()
  }, [logVisibility])

  useEffect(() => {
    utterancesRef.current = utterances
  }, [utterances])

  useEffect(() => {
    if (typeof window === 'undefined') return

    for (const utterance of utterances) {
      const tracker = trackersRef.current.get(utterance.id)
      if (!tracker || tracker.loggingStarted || animationFramesRef.current.has(utterance.id)) continue

      const frame = window.requestAnimationFrame(() => {
        animationFramesRef.current.delete(utterance.id)
        observeRenderedTranslations(utterance.id)
      })
      animationFramesRef.current.set(utterance.id, frame)
    }
  }, [observeRenderedTranslations, utterances])

  useEffect(() => clear, [clear])

  return {
    beginTracking,
    rememberFinalizedMessagePersistence,
    clear,
  }
}
