'use client'

import { memo } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { canonicalizeTranslationLanguageCode } from '@/lib/translation-languages'
import { getSttLanguageFlag } from '@/lib/stt-languages'
import {
  hasRenderableChatBubbleTimestamp,
} from './chat-bubble.timestamp'
import ChatBubbleTimestamp from './ChatBubbleTimestamp'
import CopyableBubbleSurface from './CopyableBubbleSurface'
import MessageCopyButton from './MessageCopyButton'
import TranslationBubbleRow from './TranslationBubbleRow'
import { resolveLivePhoneDemoCopyActionCopy } from './live-phone-demo.copy-actions'
import { resolveLivePhoneDemoTtsActionCopy } from './live-phone-demo.tts-actions'
import { getSpeakerAvatar } from './speaker-avatar'

const CHAT_BUBBLE_TEXT_LINE_HEIGHT = 1.25
const ORIGINAL_BUBBLE_MAX_WIDTH = '85%'
const TRANSLATION_BUBBLE_MAX_WIDTH = '90%'

// 재생키 빌더 (LivePhoneDemo의 것과 동일 규칙)
function buildOriginalPlaybackKey(utteranceId: string, lang: string): string {
  return `original:${utteranceId}:${lang.trim().toLowerCase()}`
}
function buildTranslationPlaybackKey(utteranceId: string, lang: string): string {
  return `translation:${utteranceId}:${lang.trim().toLowerCase()}`
}

/** 버블 텍스트 끝에 표시되는 음파 재생 중 표시 */
function SpeakingIndicator() {
  return (
    <span
      className="ml-1.5 inline-flex items-end gap-[2px] align-middle"
      style={{ height: '13px' }}
      aria-label="playing"
    >
      {[0, 0.15, 0.3].map((delay, i) => (
        <motion.span
          key={i}
          className="block w-[2.5px] rounded-full bg-sky-400"
          animate={{ height: ['30%', '100%', '30%'] }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay,
            ease: 'easeInOut',
          }}
          style={{ height: '30%' }}
        />
      ))}
    </span>
  )
}

export interface Utterance {
  id: string
  speaker?: string
  speakerAvatarSeed?: string
  speakerAvatarIndex?: number
  originalText: string
  originalLang: string
  sourceLanguagesMixed?: boolean
  sourceTextHasForeignScript?: boolean
  targetLanguages?: string[]
  translations: Record<string, string>
  translationFinalized?: Record<string, boolean>
  createdAtMs?: number
}

interface ChatBubbleProps {
  utterance: Utterance
  uiLocale: string
  isDraft?: boolean
  onPlayOriginal?: (utterance: Utterance) => void
  onPlayTranslation?: (utterance: Utterance, language: string, text: string) => void
  bubbleTextClassName?: string
  speakingPlaybackKey?: string
  shouldAnimateEntrance?: boolean
}

function normalizeLanguageCode(rawLanguage: string): string {
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

function getOriginalLanguageBadgeLabel(rawLanguage: string): string {
  const normalized = normalizeLanguageCode(rawLanguage)
  if (!normalized || normalized === 'unknown') {
    return '❓'
  }
  return rawLanguage
}

function buildTargetLanguagesForUtterance(utterance: Utterance): string[] {
  const sourceLanguage = normalizeTranslationLanguageKey(utterance.originalLang)
  const keepSourceLanguageBubble = (
    utterance.sourceLanguagesMixed === true
    || utterance.sourceTextHasForeignScript === true
  )
  const targetLanguages: string[] = []
  const seen = new Set<string>()

  const pushLanguage = (rawLanguage: string) => {
    const language = (rawLanguage || '').trim()
    if (!language) return
    const normalized = normalizeTranslationLanguageKey(language)
    if (!keepSourceLanguageBubble && sourceLanguage && normalized === sourceLanguage) return
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

function buildCombinedUtteranceCopyText(
  originalFlag: string,
  originalText: string,
  translationEntries: Array<{ lang: string, text: string }>,
): string {
  const lines = [`${originalFlag} ${originalText}`]

  for (const entry of translationEntries) {
    lines.push(`${getSttLanguageFlag(entry.lang)} ${entry.text}`)
  }

  return lines.join('\n')
}

function ChatBubble({
  utterance,
  uiLocale,
  isDraft = false,
  onPlayOriginal,
  onPlayTranslation,
  bubbleTextClassName = 'text-sm',
  speakingPlaybackKey,
  shouldAnimateEntrance = true,
}: ChatBubbleProps) {
  const flag = getSttLanguageFlag(utterance.originalLang)
  const originalLanguageBadgeLabel = getOriginalLanguageBadgeLabel(utterance.originalLang)
  const avatar = getSpeakerAvatar(
    utterance.speaker,
    utterance.speakerAvatarSeed,
    utterance.speakerAvatarIndex,
  )
  const speakerLabel = (utterance.speaker || '').trim() || 'speaker'
  const copyActionCopy = resolveLivePhoneDemoCopyActionCopy(uiLocale)
  const ttsActionCopy = resolveLivePhoneDemoTtsActionCopy(uiLocale)
  const isOriginalSpeaking = !!speakingPlaybackKey
    && speakingPlaybackKey === buildOriginalPlaybackKey(utterance.id, utterance.originalLang)
  // Keep target language list fixed per utterance so language toggles
  // do not retroactively add/remove bubbles on old messages.
  const targetLangs = buildTargetLanguagesForUtterance(utterance)
  const translationEntries = targetLangs
    .filter(lang => utterance.translations[lang])
    .map(lang => ({
      lang,
      text: utterance.translations[lang],
      state: utterance.translationFinalized?.[lang] === false
        ? 'interim' as const
        : 'final' as const,
    }))
  const pendingLangs = targetLangs
    .filter(lang => !utterance.translations[lang])
  const originalTextClassName = isDraft
    ? `${bubbleTextClassName} text-gray-400`
    : `${bubbleTextClassName} text-gray-900`
  const hasTimestamp = hasRenderableChatBubbleTimestamp(utterance.createdAtMs)
  const combinedUtteranceCopyText = buildCombinedUtteranceCopyText(
    flag,
    utterance.originalText,
    translationEntries,
  )

  const bubbleContent = (
    <>
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
        <div
          data-original-bubble-row
          className="flex w-full items-start gap-1.5"
        >
          <CopyableBubbleSurface
            data-original-bubble-body
            text={utterance.originalText}
            allText={combinedUtteranceCopyText}
            copyBubbleLabel={copyActionCopy.copyBubbleLabel}
            copyAllBubblesLabel={copyActionCopy.copyAllBubblesLabel}
            playPronunciationLabel={!isDraft ? ttsActionCopy.playPronunciationLabel : undefined}
            onPlayPronunciation={!isDraft ? (() => onPlayOriginal?.(utterance)) : undefined}
            style={{ maxWidth: ORIGINAL_BUBBLE_MAX_WIDTH }}
            className="w-fit rounded-2xl border border-gray-200 bg-white px-3.5 py-2 shadow-sm"
          >
            <div data-original-bubble-content className="min-w-0">
              <p style={{ lineHeight: CHAT_BUBBLE_TEXT_LINE_HEIGHT }} className={originalTextClassName}>
                <span
                  data-original-bubble-meta
                  className="mr-1.5 inline-flex items-center gap-1 whitespace-nowrap align-middle rounded-full px-1 py-0.5 text-gray-400"
                >
                  <span className="text-base leading-none">{flag}</span>
                  <span className="text-[11px] font-semibold uppercase leading-none">
                    {originalLanguageBadgeLabel}
                  </span>
                </span>
                <span data-original-bubble-text className="align-middle">
                    {utterance.originalText}
                    {isOriginalSpeaking && <SpeakingIndicator />}
                    {isDraft && (
                      <span className="ml-0.5 inline-block h-3 w-1 rounded-full bg-amber-400 align-middle animate-pulse" />
                    )}
                  </span>
              </p>
            </div>
          </CopyableBubbleSurface>
          <MessageCopyButton
            label={copyActionCopy.copyAllBubblesLabel}
            text={combinedUtteranceCopyText}
            className="self-end h-5 items-start pb-1"
          />
        </div>

        {/* Translation bubbles */}
        {translationEntries.map(({ lang, text, state }) => (
          <TranslationBubbleRow
            key={lang}
            lang={lang}
            translationState={state}
            maxWidth={TRANSLATION_BUBBLE_MAX_WIDTH}
            bubbleClassName="bg-amber-50 border border-amber-100 transition-colors"
            metaClassName={state === 'interim' ? 'text-gray-500' : 'text-amber-500'}
            contentStyle={{ lineHeight: CHAT_BUBBLE_TEXT_LINE_HEIGHT }}
            contentClassName={`${bubbleTextClassName} ${state === 'interim' ? 'text-gray-400' : 'text-gray-700'}`}
            copyText={text}
            copyBubbleLabel={copyActionCopy.copyBubbleLabel}
            allText={combinedUtteranceCopyText}
            copyAllBubblesLabel={copyActionCopy.copyAllBubblesLabel}
            playPronunciationLabel={ttsActionCopy.playPronunciationLabel}
            onPlayPronunciation={() => onPlayTranslation?.(utterance, lang, text)}
            actions={speakingPlaybackKey === buildTranslationPlaybackKey(utterance.id, lang)
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
            maxWidth={TRANSLATION_BUBBLE_MAX_WIDTH}
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
    </>
  )

  if (!shouldAnimateEntrance) {
    return (
      <div className="flex items-start gap-1.5">
        {bubbleContent}
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-start gap-1.5"
    >
      {bubbleContent}
    </motion.div>
  )
}

function chatBubbleAreEqual(prev: ChatBubbleProps, next: ChatBubbleProps): boolean {
  if (prev.uiLocale !== next.uiLocale) return false
  if (prev.isDraft !== next.isDraft) return false
  if (prev.bubbleTextClassName !== next.bubbleTextClassName) return false
  if (prev.speakingPlaybackKey !== next.speakingPlaybackKey) return false
  if (prev.shouldAnimateEntrance !== next.shouldAnimateEntrance) return false

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
    if (pu.sourceLanguagesMixed !== nu.sourceLanguagesMixed) return false
    if (pu.sourceTextHasForeignScript !== nu.sourceTextHasForeignScript) return false
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
