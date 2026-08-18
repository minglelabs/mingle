'use client'

import { memo, useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { canonicalizeTranslationLanguageCode } from '@/lib/translation-languages'
import { getSttLanguageFlag } from '@/lib/stt-languages'
import LanguageFlag from '@/components/language-flag'
import {
  hasRenderableChatBubbleTimestamp,
} from './chat-bubble.timestamp'
import ChatBubbleTimestamp from './ChatBubbleTimestamp'
import CopyableBubbleSurface from './CopyableBubbleSurface'
import MessageCopyButton from './MessageCopyButton'
import { resolveLivePhoneDemoCopyActionCopy } from './live-phone-demo.copy-actions'
import { resolveLivePhoneDemoTtsActionCopy } from './live-phone-demo.tts-actions'
import { getSpeakerAvatar } from './speaker-avatar'

const CHAT_BUBBLE_TEXT_LINE_HEIGHT = 1.25
const MESSAGE_BUBBLE_MAX_WIDTH = '90%'

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
  preferredDisplayLanguage?: string | null
  preferredDisplayLanguages?: readonly string[]
  defaultDisplayLanguage?: string | null
  languageOrder?: readonly string[]
  isDraft?: boolean
  onPlayOriginal?: (utterance: Utterance) => void
  onPlayTranslation?: (utterance: Utterance, language: string, text: string) => void
  bubbleTextClassName?: string
  speakingPlaybackKey?: string
  shouldAnimateEntrance?: boolean
  /**
   * Overrides the generated animal avatar with a real profile photo — for
   * screens (like direct messages) where the speaker is a known account
   * rather than an anonymous room participant. Falls back to the existing
   * seed-based avatar when omitted, so STT rooms are unaffected.
   */
  avatarSrc?: string | null
  avatarAlt?: string
  /** When set, the avatar becomes a button — used to open the speaker's profile. */
  onAvatarClick?: () => void
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

function findLanguageByKey(
  languages: readonly string[],
  targetKey: string,
): string | null {
  return languages.find((language) => normalizeTranslationLanguageKey(language) === targetKey) || null
}

export function resolveOriginalDisplayLanguage(
  originalLanguage: string,
  candidateLanguages: readonly string[] = [],
  roomLanguageOrder: readonly string[] = [],
): string {
  if (normalizeTranslationLanguageKey(originalLanguage) !== 'zh') {
    return originalLanguage
  }

  // Soniox reports generic Chinese as zh, while Gemini/translation targets
  // use the script-specific zh-CN/zh-TW labels. Represent that source with
  // one display language, preferring Simplified Chinese whenever both exist.
  const roomSimplifiedChinese = findLanguageByKey(roomLanguageOrder, 'zh-cn')
  if (roomSimplifiedChinese) return roomSimplifiedChinese

  const roomTraditionalChinese = findLanguageByKey(roomLanguageOrder, 'zh-tw')
  if (roomTraditionalChinese) return roomTraditionalChinese

  if (roomLanguageOrder.length > 0) return 'zh-CN'

  return (
    findLanguageByKey(candidateLanguages, 'zh-cn')
    || findLanguageByKey(candidateLanguages, 'zh-tw')
    || 'zh-CN'
  )
}

function normalizeLanguageKeyForOriginalDisplay(
  rawLanguage: string,
  originalDisplayLanguage: string,
): string {
  const normalized = normalizeTranslationLanguageKey(rawLanguage)
  if (
    normalized === 'zh'
    && normalizeTranslationLanguageKey(originalDisplayLanguage) !== 'zh'
  ) {
    return normalizeTranslationLanguageKey(originalDisplayLanguage)
  }
  return normalized
}

function getOriginalLanguageBadgeLabel(rawLanguage: string): string {
  const normalized = normalizeLanguageCode(rawLanguage)
  if (!normalized || normalized === 'unknown') {
    return '❓'
  }
  return rawLanguage
}

function buildTargetLanguagesForUtterance(
  utterance: Utterance,
  originalDisplayLanguage = utterance.originalLang,
): string[] {
  const sourceLanguage = normalizeTranslationLanguageKey(originalDisplayLanguage)
  const hasGenericChineseSource = normalizeTranslationLanguageKey(utterance.originalLang) === 'zh'
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
    if (
      hasGenericChineseSource
      && (normalized === 'zh' || normalized === sourceLanguage)
    ) {
      return
    }
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

function buildLanguageOptionsForUtterance(
  originalLanguage: string,
  targetLanguages: readonly string[],
  languageOrder?: readonly string[],
): string[] {
  const availableLanguages = [originalLanguage, ...targetLanguages]
  const availableByKey = new Map<string, string>()
  for (const language of availableLanguages) {
    const key = normalizeLanguageKeyForOriginalDisplay(language, originalLanguage)
    if (key && !availableByKey.has(key)) availableByKey.set(key, language)
  }

  const options: string[] = []
  const seen = new Set<string>()
  const pushLanguage = (rawLanguage: string) => {
    const language = (rawLanguage || '').trim()
    if (!language) return
    const key = normalizeTranslationLanguageKey(language) || language.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    options.push(language)
  }

  const hasExplicitLanguageOrder = Boolean(languageOrder?.length)
  const orderedCandidates = hasExplicitLanguageOrder
    ? [...languageOrder!, ...targetLanguages, originalLanguage]
    : [originalLanguage, ...targetLanguages]

  for (const language of orderedCandidates) {
    const normalizedKey = normalizeLanguageKeyForOriginalDisplay(language, originalLanguage)
    pushLanguage(normalizedKey ? (availableByKey.get(normalizedKey) || language) : language)
  }

  return options
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

function findLanguageRecordValue<T>(
  record: Record<string, T> | undefined,
  language: string,
): T | undefined {
  if (!record) return undefined

  const targetKey = normalizeTranslationLanguageKey(language)
  const matchingKey = Object.keys(record).find((key) => (
    normalizeTranslationLanguageKey(key) === targetKey
  ))
  return matchingKey ? record[matchingKey] : undefined
}

export function resolveInitialDisplayLanguage(
  preferredLanguages: readonly string[] | null | undefined,
  explicitDisplayLanguage: string | null | undefined,
  originalLanguage: string,
  targetLanguages: readonly string[],
  roomLanguageOrder: readonly string[] = [],
): string {
  const availableLanguages = [originalLanguage, ...targetLanguages]
  const findAvailableLanguage = (rawLanguage: string | null | undefined) => {
    const languageKey = normalizeLanguageKeyForOriginalDisplay(rawLanguage || '', originalLanguage)
    if (!languageKey) return null
    return availableLanguages.find((language) => (
      normalizeLanguageKeyForOriginalDisplay(language, originalLanguage) === languageKey
    )) || null
  }

  const explicitMatch = findAvailableLanguage(explicitDisplayLanguage)
  if (explicitMatch) {
    return explicitMatch
  }

  const originalKey = normalizeTranslationLanguageKey(originalLanguage)
  for (const preferredLanguage of preferredLanguages || []) {
    const preferredKey = normalizeLanguageKeyForOriginalDisplay(preferredLanguage, originalLanguage)
    if (!preferredKey) continue

    if (preferredKey === originalKey) {
      return originalLanguage
    }

    const roomLanguage = roomLanguageOrder.find((language) => (
      normalizeTranslationLanguageKey(language) === preferredKey
    ))
    if (!roomLanguage) continue

    const roomLanguageMatch = findAvailableLanguage(roomLanguage)
    if (roomLanguageMatch) {
      return roomLanguageMatch
    }
  }

  for (const roomLanguage of roomLanguageOrder) {
    const roomLanguageMatch = findAvailableLanguage(roomLanguage)
    if (roomLanguageMatch) {
      return roomLanguageMatch
    }
  }

  return availableLanguages[0] || originalLanguage
}

function ChatLanguageBadge({
  lang,
  isOriginal = false,
  isSelected = false,
  onSelect,
}: {
  lang: string
  isOriginal?: boolean
  isSelected?: boolean
  onSelect?: () => void
}) {
  const languageLabel = isOriginal
    ? getOriginalLanguageBadgeLabel(lang)
    : lang

  return (
    <button
      type="button"
      data-chat-language-badge
      data-chat-language={lang}
      data-chat-language-role={isOriginal ? 'original' : 'translation'}
      aria-label={`${isOriginal ? 'Original' : 'Translation'} language ${languageLabel}`}
      aria-pressed={isSelected}
      title={languageLabel}
      onPointerDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onTouchEnd={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        onSelect?.()
      }}
      className={`relative inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border bg-white text-[17px] leading-none shadow-[0_2px_7px_rgba(15,23,42,0.12)] transition-transform active:scale-95 ${
        isSelected
          ? 'border-amber-400 ring-1 ring-amber-200/80'
          : 'border-gray-200/80'
      }`}
    >
      <LanguageFlag language={lang} className="text-[17px] leading-none" />
      {isOriginal && (
        <span
          data-original-language-quote-badge
          aria-hidden="true"
          className="absolute -right-1 -top-1 inline-flex h-[12px] w-[12px] items-center justify-center overflow-hidden rounded-full border border-white bg-white text-black shadow-[0_1px_3px_rgba(15,23,42,0.18)]"
        >
          <Image
            data-original-language-quote-icon
            aria-hidden="true"
            src="/chat/original-language-quote.png"
            alt=""
            width={12}
            height={12}
            className="h-[11px] w-[11px] object-contain"
            unoptimized
          />
        </span>
      )}
    </button>
  )
}

function ChatBubble({
  utterance,
  uiLocale,
  preferredDisplayLanguage,
  preferredDisplayLanguages,
  defaultDisplayLanguage,
  languageOrder,
  isDraft = false,
  onPlayOriginal,
  onPlayTranslation,
  bubbleTextClassName = 'text-sm',
  speakingPlaybackKey,
  shouldAnimateEntrance = true,
  avatarSrc,
  avatarAlt,
  onAvatarClick,
}: ChatBubbleProps) {
  const originalDisplayLanguage = resolveOriginalDisplayLanguage(
    utterance.originalLang,
    [
      ...(utterance.targetLanguages || []),
      ...Object.keys(utterance.translations || {}),
      ...Object.keys(utterance.translationFinalized || {}),
    ],
    languageOrder,
  )
  const flag = getSttLanguageFlag(originalDisplayLanguage)
  const originalLanguageBadgeLabel = getOriginalLanguageBadgeLabel(originalDisplayLanguage)
  const avatar = getSpeakerAvatar(
    utterance.speaker,
    utterance.speakerAvatarSeed,
    utterance.speakerAvatarIndex,
  )
  const speakerLabel = (utterance.speaker || '').trim() || 'speaker'
  const copyActionCopy = resolveLivePhoneDemoCopyActionCopy(uiLocale)
  const ttsActionCopy = resolveLivePhoneDemoTtsActionCopy(uiLocale)
  // Keep target language list fixed per utterance so language toggles
  // do not retroactively add/remove bubbles on old messages.
  const targetLangs = buildTargetLanguagesForUtterance(utterance, originalDisplayLanguage)
  const translationEntries = targetLangs
    .map((lang) => {
      const text = findLanguageRecordValue(utterance.translations, lang) || ''
      const finalized = findLanguageRecordValue(utterance.translationFinalized, lang)
      return {
        lang,
        text,
        state: text && finalized !== false ? 'final' as const : 'interim' as const,
      }
  })
  const completedTranslationEntries = translationEntries.filter(({ text }) => Boolean(text))
  const languageOptions = buildLanguageOptionsForUtterance(
    originalDisplayLanguage,
    targetLangs,
    languageOrder,
  )
  const [displayLanguage, setDisplayLanguage] = useState(() => (
    resolveInitialDisplayLanguage(
      preferredDisplayLanguages?.length
        ? preferredDisplayLanguages
        : (preferredDisplayLanguage ? [preferredDisplayLanguage] : []),
      defaultDisplayLanguage,
      originalDisplayLanguage,
      targetLangs,
      languageOrder,
    )
  ))
  const activeLanguage = languageOptions.find((language) => (
    normalizeTranslationLanguageKey(language) === normalizeTranslationLanguageKey(displayLanguage)
  )) || originalDisplayLanguage
  const isOriginalLanguageSelected = normalizeTranslationLanguageKey(activeLanguage)
    === normalizeTranslationLanguageKey(originalDisplayLanguage)
  const activeTranslationEntry = isOriginalLanguageSelected
    ? null
    : translationEntries.find((entry) => (
      normalizeTranslationLanguageKey(entry.lang) === normalizeTranslationLanguageKey(activeLanguage)
    )) || null
  const activeText = isOriginalLanguageSelected
    ? utterance.originalText
    : activeTranslationEntry?.text || ''
  const activeIsPending = !isOriginalLanguageSelected && !activeText
  const activePlaybackKey = isOriginalLanguageSelected
    ? buildOriginalPlaybackKey(utterance.id, utterance.originalLang)
    : buildTranslationPlaybackKey(utterance.id, activeLanguage)
  const isActiveSpeaking = !!speakingPlaybackKey && speakingPlaybackKey === activePlaybackKey
  const originalTextClassName = isDraft
    ? `${bubbleTextClassName} text-gray-400`
    : `${bubbleTextClassName} ${isOriginalLanguageSelected ? 'text-gray-900' : activeTranslationEntry?.state === 'interim' ? 'text-gray-400' : 'text-gray-700'}`
  const hasTimestamp = hasRenderableChatBubbleTimestamp(utterance.createdAtMs)
  const combinedUtteranceCopyText = buildCombinedUtteranceCopyText(
    flag,
    utterance.originalText,
    completedTranslationEntries,
  )

  const activeBubbleText = (
    <span
      data-current-bubble-content
      className="min-w-0"
    >
      <span
        data-current-bubble-text
        style={{ lineHeight: CHAT_BUBBLE_TEXT_LINE_HEIGHT }}
        className={originalTextClassName}
      >
        {isOriginalLanguageSelected ? (
          <span data-original-bubble-meta className="sr-only">
            {originalLanguageBadgeLabel}
          </span>
        ) : (
          <span data-translation-bubble-meta className="sr-only">
            {activeLanguage}
          </span>
        )}
        <span
          data-chat-bubble-language-badges
          className="mr-1 inline-flex items-center gap-1.5 align-middle whitespace-nowrap"
        >
          {languageOptions.map((lang) => {
            const isOriginal = normalizeTranslationLanguageKey(lang)
              === normalizeTranslationLanguageKey(originalDisplayLanguage)
            return (
              <ChatLanguageBadge
                key={lang}
                lang={lang}
                isOriginal={isOriginal}
                isSelected={normalizeTranslationLanguageKey(activeLanguage) === normalizeTranslationLanguageKey(lang)}
                onSelect={() => {
                  setDisplayLanguage(lang)
                }}
              />
            )
          })}
        </span>
        {activeIsPending ? (
          <span
            data-interim-translation-cursor
            className="inline-flex h-4 items-center gap-0.5 align-middle"
          >
            <span className="h-1 w-1 animate-bounce rounded-full bg-amber-400" style={{ animationDelay: '0ms' }} />
            <span className="h-1 w-1 animate-bounce rounded-full bg-amber-400" style={{ animationDelay: '150ms' }} />
            <span className="h-1 w-1 animate-bounce rounded-full bg-amber-400" style={{ animationDelay: '300ms' }} />
          </span>
        ) : (
          <span data-current-bubble-text-value className="align-middle">
            {activeText}
            {isActiveSpeaking && <SpeakingIndicator />}
            {isOriginalLanguageSelected && isDraft && (
              <span className="ml-0.5 inline-block h-3 w-1 rounded-full bg-amber-400 align-middle animate-pulse" />
            )}
          </span>
        )}
      </span>
    </span>
  )

  const activeBubbleBody = activeIsPending ? (
    <span
      data-translation-bubble-body
      data-translation-state="interim"
      className="inline rounded-xl bg-transparent px-0 py-0"
    >
      {activeBubbleText}
    </span>
  ) : (
    <CopyableBubbleSurface
      {...(isOriginalLanguageSelected ? { 'data-original-bubble-body': true } : { 'data-translation-bubble-body': true })}
      text={activeText}
      allText={combinedUtteranceCopyText}
      copyBubbleLabel={copyActionCopy.copyBubbleLabel}
      copyAllBubblesLabel={copyActionCopy.copyAllBubblesLabel}
      playPronunciationLabel={isOriginalLanguageSelected && isDraft ? undefined : ttsActionCopy.playPronunciationLabel}
      onPlayPronunciation={isOriginalLanguageSelected
        ? (!isDraft ? (() => onPlayOriginal?.(utterance)) : undefined)
        : (() => onPlayTranslation?.(utterance, activeLanguage, activeText))}
      style={{ maxWidth: '100%' }}
      className="inline rounded-xl bg-transparent px-0 py-0 shadow-none"
    >
      {activeBubbleText}
    </CopyableBubbleSurface>
  )

  const bubbleContent = (
    <>
      <div data-speaker-avatar-column className="mt-0.5 flex w-10 shrink-0 flex-col items-center gap-1">
        {onAvatarClick ? (
          <button
            type="button"
            onClick={onAvatarClick}
            aria-label={avatarAlt || `${speakerLabel} ${avatar.name} avatar`}
            className="rounded-full bg-gradient-to-br from-rose-50 via-white to-amber-50 p-0.5 shadow-sm ring-1 ring-black/5 transition active:scale-95"
          >
            <Image
              src={avatarSrc || avatar.src}
              alt={avatarAlt || `${speakerLabel} ${avatar.name} avatar`}
              className="h-8 w-8 rounded-full bg-white object-cover"
              width={32}
              height={32}
              unoptimized
            />
          </button>
        ) : (
          <div className="rounded-full bg-gradient-to-br from-rose-50 via-white to-amber-50 p-0.5 shadow-sm ring-1 ring-black/5">
            <Image
              src={avatarSrc || avatar.src}
              alt={avatarAlt || `${speakerLabel} ${avatar.name} avatar`}
              className="h-8 w-8 rounded-full bg-white object-cover"
              width={32}
              height={32}
              unoptimized
            />
          </div>
        )}
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
      <div className="flex min-w-0 flex-1 items-end gap-1.5">
        <div
          data-chat-message-bubble-stack
          style={{ maxWidth: MESSAGE_BUBBLE_MAX_WIDTH }}
          className="min-w-0 w-fit"
        >
          <div
            data-chat-message-bubble
            data-display-language={activeLanguage}
            data-translation-state={isOriginalLanguageSelected ? undefined : activeTranslationEntry?.state}
            className="w-fit max-w-full rounded-2xl border border-gray-200 bg-white px-3.5 py-2 shadow-sm"
          >
            <div
              data-original-bubble-row
              data-translation-bubble-row
              className="w-full"
            >
              {activeBubbleBody}
            </div>
          </div>
        </div>

        <MessageCopyButton
          label={copyActionCopy.copyBubbleLabel}
          text={activeText}
          className="mb-3 h-5 self-end items-start pb-1"
        />
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
  if (prev.preferredDisplayLanguage !== next.preferredDisplayLanguage) return false
  if (prev.preferredDisplayLanguages !== next.preferredDisplayLanguages) return false
  if (prev.defaultDisplayLanguage !== next.defaultDisplayLanguage) return false
  if (prev.languageOrder !== next.languageOrder) return false
  if (prev.isDraft !== next.isDraft) return false
  if (prev.bubbleTextClassName !== next.bubbleTextClassName) return false
  if (prev.speakingPlaybackKey !== next.speakingPlaybackKey) return false
  if (prev.shouldAnimateEntrance !== next.shouldAnimateEntrance) return false
  if (prev.avatarSrc !== next.avatarSrc) return false
  if (prev.avatarAlt !== next.avatarAlt) return false
  if (prev.onAvatarClick !== next.onAvatarClick) return false

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
