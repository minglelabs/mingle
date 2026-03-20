'use client'

import { memo } from 'react'
import { motion } from 'framer-motion'
import { getSttLanguageFlag } from '@/lib/stt-languages'
import { formatChatBubbleTimestampLines } from './chat-bubble.timestamp'
import TranslationBubbleRow from './TranslationBubbleRow'

const RELATIVE_TIMESTAMP_THRESHOLD_MS = 24 * 60 * 60 * 1000

export interface Utterance {
  id: string
  originalText: string
  originalLang: string
  targetLanguages?: string[]
  translations: Record<string, string>
  translationFinalized?: Record<string, boolean>
  createdAtMs?: number
}

interface ChatBubbleProps {
  utterance: Utterance
  uiLocale: string
  isSpeaking?: boolean
  speakingLanguage?: string | null
}

function normalizeLanguageCode(rawLanguage: string): string {
  return (rawLanguage || '').trim().replace('_', '-').toLowerCase().split('-')[0] || ''
}

function buildTargetLanguagesForUtterance(utterance: Utterance): string[] {
  const sourceLanguage = normalizeLanguageCode(utterance.originalLang)
  const targetLanguages: string[] = []
  const seen = new Set<string>()

  const pushLanguage = (rawLanguage: string) => {
    const language = (rawLanguage || '').trim()
    if (!language) return
    const normalized = normalizeLanguageCode(language)
    if (sourceLanguage && normalized === sourceLanguage) return
    const key = normalized || language.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    targetLanguages.push(language)
  }

  for (const language of utterance.targetLanguages || []) pushLanguage(language)
  for (const language of Object.keys(utterance.translations || {})) pushLanguage(language)
  for (const language of Object.keys(utterance.translationFinalized || {})) pushLanguage(language)

  return targetLanguages
}

function SpeakingIndicator() {
  return (
    <div className="flex items-end gap-0.5" aria-label="tts-speaking">
      <span className="w-0.5 h-2 bg-amber-400/90 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
      <span className="w-0.5 h-3 bg-amber-500 rounded-full animate-pulse" style={{ animationDelay: '120ms' }} />
      <span className="w-0.5 h-2.5 bg-amber-400/90 rounded-full animate-pulse" style={{ animationDelay: '240ms' }} />
      <span className="w-0.5 h-1.5 bg-amber-300/90 rounded-full animate-pulse" style={{ animationDelay: '360ms' }} />
    </div>
  )
}

function ChatBubble({ utterance, uiLocale, isSpeaking = false, speakingLanguage = null }: ChatBubbleProps) {
  const flag = getSttLanguageFlag(utterance.originalLang)
  // Keep target language list fixed per utterance so language toggles
  // do not retroactively add/remove bubbles on old messages.
  const targetLangs = buildTargetLanguagesForUtterance(utterance)
  const translationEntries = targetLangs
    .filter(lang => utterance.translations[lang])
    .map(lang => ({
      lang,
      text: utterance.translations[lang],
      isFinalized: utterance.translationFinalized?.[lang] !== false,
    }))
  const pendingLangs = targetLangs
    .filter(lang => !utterance.translations[lang])

  const timestampLines = formatChatBubbleTimestampLines(utterance.createdAtMs, uiLocale)
  const originalBubbleMaxWidth = timestampLines.length > 0
    ? 'calc(100% - 4.5rem)'
    : '85%'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-1"
    >
      {/* Original bubble */}
      <div data-original-bubble-row className="flex w-full max-w-[96%] items-end gap-2">
        <div
          data-original-bubble-body
          style={{ maxWidth: originalBubbleMaxWidth }}
          className="inline-flex w-fit items-center gap-2 rounded-2xl rounded-tl-sm border border-gray-200 bg-white px-3.5 py-2 shadow-sm"
        >
          <div
            data-original-bubble-meta
            className="flex min-h-5 shrink-0 items-center gap-1 whitespace-nowrap text-gray-400"
          >
            <span className="text-base">{flag}</span>
            <span className="text-xs font-semibold text-gray-400 uppercase">
              {utterance.originalLang}
            </span>
          </div>
          <div data-original-bubble-content className="min-w-0">
            <p className="text-sm leading-[1.3] text-gray-900">{utterance.originalText}</p>
          </div>
        </div>
        {timestampLines.length > 0 && (
          <div
            data-original-bubble-timestamp
            className="mb-0.5 flex w-16 shrink-0 flex-col items-end self-end text-right text-[10px] leading-[1.05] text-black/[0.34] tabular-nums"
          >
            {timestampLines.map((line, index) => (
              <span key={`${utterance.id}-timestamp-${index}`} className="whitespace-nowrap">
                {line}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Translation bubbles */}
      {translationEntries.map(({ lang, text, isFinalized }) => (
        <TranslationBubbleRow
          key={lang}
          lang={lang}
          bubbleClassName={`transition-colors ${
            isFinalized
              ? 'bg-amber-50 border border-amber-100'
              : 'bg-gray-100/80 border border-gray-200'
          }`}
          metaClassName={isFinalized ? 'text-amber-500' : 'text-gray-400'}
          accessory={
            isSpeaking && speakingLanguage === lang
              ? <SpeakingIndicator />
              : !isFinalized
                ? <span className="inline-block w-1 h-1 rounded-full bg-gray-400 animate-pulse" />
                : undefined
          }
        >
          <p className={`text-sm leading-[1.3] ${
            isFinalized ? 'text-gray-700' : 'text-gray-500'
          }`}>{text}</p>
        </TranslationBubbleRow>
      ))}
      {/* Bouncing dots for pending translations */}
      {pendingLangs.map((lang) => (
        <TranslationBubbleRow
          key={`pending-${lang}`}
          lang={lang}
          bubbleClassName="bg-amber-50/60 border border-amber-100"
          metaClassName="text-amber-400"
        >
          <div className="flex items-center gap-0.5 h-4">
            <span className="w-1 h-1 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-1 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-1 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </TranslationBubbleRow>
      ))}
    </motion.div>
  )
}

function chatBubbleAreEqual(prev: ChatBubbleProps, next: ChatBubbleProps): boolean {
  // Always re-render utterances that still render compact relative timestamps.
  const createdAtMs = next.utterance.createdAtMs
  if (createdAtMs && (Date.now() - createdAtMs) < RELATIVE_TIMESTAMP_THRESHOLD_MS) return false

  if (prev.uiLocale !== next.uiLocale) return false
  if (prev.isSpeaking !== next.isSpeaking) return false
  if (prev.speakingLanguage !== next.speakingLanguage) return false

  if (prev.utterance !== next.utterance) {
    const pu = prev.utterance
    const nu = next.utterance
    if (pu.id !== nu.id) return false
    if (pu.originalText !== nu.originalText) return false
    if (pu.originalLang !== nu.originalLang) return false
    if (pu.targetLanguages !== nu.targetLanguages) {
      const pt = pu.targetLanguages || []
      const nt = nu.targetLanguages || []
      if (pt.length !== nt.length) return false
      for (let i = 0; i < pt.length; i++) {
        if (pt[i] !== nt[i]) return false
      }
    }
    if (pu.translations !== nu.translations) {
      const pk = Object.keys(pu.translations)
      const nk = Object.keys(nu.translations)
      if (pk.length !== nk.length) return false
      for (const k of pk) {
        if (pu.translations[k] !== nu.translations[k]) return false
      }
    }
    if (pu.translationFinalized !== nu.translationFinalized) {
      const pf = pu.translationFinalized || {}
      const nf = nu.translationFinalized || {}
      const pk = Object.keys(pf)
      const nk = Object.keys(nf)
      if (pk.length !== nk.length) return false
      for (const k of pk) {
        if (pf[k] !== nf[k]) return false
      }
    }
  }

  return true
}

export default memo(ChatBubble, chatBubbleAreEqual)
