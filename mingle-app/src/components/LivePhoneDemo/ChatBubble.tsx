'use client'

import { memo } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { getSttLanguageFlag } from '@/lib/stt-languages'
import {
  hasRenderableChatBubbleTimestamp,
} from './chat-bubble.timestamp'
import ChatBubbleTimestamp from './ChatBubbleTimestamp'
import TranslationBubbleRow from './TranslationBubbleRow'
import { getSpeakerAvatar } from './speaker-avatar'

const CHAT_BUBBLE_TEXT_LINE_HEIGHT = 1.25
const CHAT_BUBBLE_MAX_WIDTH = '93%'

export interface Utterance {
  id: string
  speaker?: string
  speakerAvatarSeed?: string
  speakerAvatarIndex?: number
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
  isDraft?: boolean
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
    <span className="inline-flex items-end gap-0.5 align-middle" aria-label="tts-speaking">
      <span className="w-0.5 h-2 bg-amber-400/90 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
      <span className="w-0.5 h-3 bg-amber-500 rounded-full animate-pulse" style={{ animationDelay: '120ms' }} />
      <span className="w-0.5 h-2.5 bg-amber-400/90 rounded-full animate-pulse" style={{ animationDelay: '240ms' }} />
      <span className="w-0.5 h-1.5 bg-amber-300/90 rounded-full animate-pulse" style={{ animationDelay: '360ms' }} />
    </span>
  )
}

function ChatBubble({
  utterance,
  uiLocale,
  isDraft = false,
  isSpeaking = false,
  speakingLanguage = null,
}: ChatBubbleProps) {
  const flag = getSttLanguageFlag(utterance.originalLang)
  const avatar = getSpeakerAvatar(
    utterance.speaker,
    utterance.speakerAvatarSeed,
    utterance.speakerAvatarIndex,
  )
  const speakerLabel = (utterance.speaker || '').trim() || 'speaker'
  // Keep target language list fixed per utterance so language toggles
  // do not retroactively add/remove bubbles on old messages.
  const targetLangs = buildTargetLanguagesForUtterance(utterance)
  const translationEntries = targetLangs
    .filter(lang => utterance.translations[lang])
    .map(lang => ({
      lang,
      text: utterance.translations[lang],
    }))
  const pendingLangs = targetLangs
    .filter(lang => !utterance.translations[lang])
  const originalTextClassName = isDraft ? 'text-sm text-gray-400' : 'text-sm text-gray-900'
  const hasTimestamp = hasRenderableChatBubbleTimestamp(utterance.createdAtMs)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-start gap-1.5"
    >
      <div data-speaker-avatar-column className="mt-0.5 flex w-10 shrink-0 flex-col items-center gap-1">
        <div className="rounded-full bg-gradient-to-br from-rose-50 via-white to-amber-50 p-0.5 shadow-sm ring-1 ring-black/5">
          <Image
            src={avatar.src}
            alt={`${speakerLabel} ${avatar.name} avatar`}
            className="h-8 w-8 rounded-full bg-white object-cover"
            width={32}
            height={32}
            unoptimized
          />
        </div>
        {hasTimestamp && (
          <ChatBubbleTimestamp
            createdAtMs={utterance.createdAtMs}
            uiLocale={uiLocale}
            align="center"
            minWidth="2.5rem"
            className="text-[10px] text-black/[0.3]"
          />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Original bubble */}
        <div data-original-bubble-row className="flex w-full items-start">
          <div
            data-original-bubble-body
            style={{ maxWidth: CHAT_BUBBLE_MAX_WIDTH }}
            className="relative w-fit rounded-2xl border border-gray-200 bg-white px-3.5 py-2 shadow-sm"
          >
            <span
              data-original-bubble-tail
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-1/2 h-3.5 w-3.5 -translate-x-[42%] -translate-y-1/2 rotate-45 rounded-[0.45rem] border-b border-l border-gray-200 bg-white shadow-sm"
            />
            <div data-original-bubble-content className="min-w-0">
              <p style={{ lineHeight: CHAT_BUBBLE_TEXT_LINE_HEIGHT }} className={originalTextClassName}>
                <span
                  data-original-bubble-meta
                  className="mr-1.5 inline-flex items-center gap-1 whitespace-nowrap align-middle rounded-full px-1 py-0.5 text-gray-400"
                >
                  <span className="text-base leading-none">{flag}</span>
                  <span className="text-[11px] font-semibold uppercase leading-none">
                    {utterance.originalLang}
                  </span>
                </span>
                <span data-original-bubble-text className="align-middle">
                  {utterance.originalText}
                  {isDraft && (
                    <span className="ml-0.5 inline-block h-3 w-1 rounded-full bg-amber-400 align-middle animate-pulse" />
                  )}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Translation bubbles */}
        {translationEntries.map(({ lang, text }) => (
          <TranslationBubbleRow
            key={lang}
            lang={lang}
            maxWidth={CHAT_BUBBLE_MAX_WIDTH}
            bubbleClassName="bg-amber-50 border border-amber-100 transition-colors"
            metaClassName="text-amber-500"
            contentStyle={{ lineHeight: CHAT_BUBBLE_TEXT_LINE_HEIGHT }}
            contentClassName="text-sm text-gray-700"
            accessory={
              isSpeaking && speakingLanguage === lang
                ? <SpeakingIndicator />
                : undefined
            }
          >
            {text}
          </TranslationBubbleRow>
        ))}
        {/* Bouncing dots for pending translations */}
        {pendingLangs.map((lang) => (
          <TranslationBubbleRow
            key={`pending-${lang}`}
            lang={lang}
            maxWidth={CHAT_BUBBLE_MAX_WIDTH}
            bubbleClassName="bg-amber-50/60 border border-amber-100"
            metaClassName="text-amber-400"
            inlineMeta={false}
          >
            <div className="flex items-center gap-0.5 h-4">
              <span className="w-1 h-1 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </TranslationBubbleRow>
        ))}
      </div>
    </motion.div>
  )
}

function chatBubbleAreEqual(prev: ChatBubbleProps, next: ChatBubbleProps): boolean {
  if (prev.uiLocale !== next.uiLocale) return false
  if (prev.isDraft !== next.isDraft) return false
  if (prev.isSpeaking !== next.isSpeaking) return false
  if (prev.speakingLanguage !== next.speakingLanguage) return false

  if (prev.utterance !== next.utterance) {
    const pu = prev.utterance
    const nu = next.utterance
    if (pu.id !== nu.id) return false
    if (pu.speaker !== nu.speaker) return false
    if (pu.speakerAvatarSeed !== nu.speakerAvatarSeed) return false
    if (pu.speakerAvatarIndex !== nu.speakerAvatarIndex) return false
    if (pu.createdAtMs !== nu.createdAtMs) return false
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
