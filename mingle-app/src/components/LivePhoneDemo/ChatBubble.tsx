'use client'

import { memo, useEffect, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import { UserRound } from 'lucide-react'
import { canonicalizeTranslationLanguageCode } from '@/lib/translation-languages'
import { getSttLanguageDisplayName, getSttLanguageFlag } from '@/lib/stt-languages'
import LanguageFlag from '@/components/language-flag'
import {
  hasRenderableChatBubbleTimestamp,
} from './chat-bubble.timestamp'
import ChatBubbleTimestamp from './ChatBubbleTimestamp'
import CopyableBubbleSurface from './CopyableBubbleSurface'
import { resolveLivePhoneDemoCopyActionCopy } from './live-phone-demo.copy-actions'
import { resolveLivePhoneDemoTtsActionCopy } from './live-phone-demo.tts-actions'
import { getSpeakerAvatar } from './speaker-avatar'
import {
  DEFAULT_BUBBLE_DISPLAY_MODE,
  type LivePhoneDemoBubbleDisplayMode,
} from './live-phone-demo.bubble-display'
import { resolveLivePhoneDemoBubbleDisplayCopy } from './live-phone-demo.bubble-display-copy'

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
function SpeakingIndicator({ label }: { label: string }) {
  return (
    <span
      className="ml-1.5 inline-flex items-end gap-[2px] align-middle"
      style={{ height: '13px' }}
      aria-label={label}
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
  // The real account that sent this message, if known — distinct from
  // `speaker`, which is a free-text diarization label used within one
  // solo session. Lets the bubble tell "mine" from "theirs" in a room
  // shared by more than one real account.
  speakerUserId?: string | null
  // The sender's real uploaded profile photo. Populated only once the room
  // has 2+ real members — a real photo (not the generated animal avatar) is
  // what makes a shared room read as "a conversation with a person" rather
  // than a solo interpreter session.
  speakerImage?: string | null
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
   * The current viewer's own account id. When it matches the utterance's
   * `speakerUserId`, the bubble renders on the right (avatar after the
   * bubble) instead of the room's default left-anchored layout — used by
   * rooms with more than one real member. Omitted (or non-matching) keeps
   * today's solo-room layout exactly as-is.
   */
  viewerUserId?: string | null
  /**
   * Opens the given real account's profile. Called when the viewer taps
   * an identified member's avatar in a shared room. The profile surface
   * resolves the viewer's own id through `/profile` and another member's id
   * through `/users/{id}`, so both directions use the same callback.
   */
  onOpenProfile?: (userId: string) => void
  bubbleDisplayMode?: LivePhoneDemoBubbleDisplayMode
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
  uiLocale,
  originalLanguageLabel,
  translationLanguageLabel,
  onSelect,
}: {
  lang: string
  isOriginal?: boolean
  isSelected?: boolean
  uiLocale: string
  originalLanguageLabel: string
  translationLanguageLabel: string
  onSelect?: () => void
}) {
  const languageLabel = getSttLanguageDisplayName(lang, uiLocale)
    || (isOriginal ? getOriginalLanguageBadgeLabel(lang) : lang)

  return (
    <button
      type="button"
      data-chat-language-badge
      data-chat-language={lang}
      data-chat-language-role={isOriginal ? 'original' : 'translation'}
      aria-label={`${isOriginal ? originalLanguageLabel : translationLanguageLabel}: ${languageLabel}`}
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
      className="relative inline-flex h-[30px] w-[42px] shrink-0 items-center justify-center bg-transparent p-0 text-[17px] leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80 focus-visible:ring-offset-1"
    >
      <span
        data-chat-language-badge-visual
        aria-hidden="true"
        className={`pointer-events-none relative inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border bg-white text-[17px] leading-none shadow-[0_2px_7px_rgba(15,23,42,0.12)] transition-transform active:scale-95 ${
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
      </span>
    </button>
  )
}

interface ExpandedChatBubbleRowProps {
  utterance: Utterance
  lang: string
  text: string
  isOriginal: boolean
  isDraft: boolean
  translationState?: 'interim' | 'final'
  bubbleTextClassName: string
  copyActionCopy: ReturnType<typeof resolveLivePhoneDemoCopyActionCopy>
  ttsActionCopy: ReturnType<typeof resolveLivePhoneDemoTtsActionCopy>
  allText: string
  isOwnMessage: boolean
  uiLocale: string
  originalLanguageLabel: string
  translationLanguageLabel: string
  isSelected: boolean
  showDivider: boolean
  speakingPlaybackKey?: string
  onPlayOriginal?: (utterance: Utterance) => void
  onPlayTranslation?: (utterance: Utterance, language: string, text: string) => void
  onSelectLanguage?: (language: string) => void
}

function ExpandedChatBubbleRow({
  utterance,
  lang,
  text,
  isOriginal,
  isDraft,
  translationState,
  bubbleTextClassName,
  copyActionCopy,
  ttsActionCopy,
  allText,
  isOwnMessage,
  uiLocale,
  originalLanguageLabel,
  translationLanguageLabel,
  isSelected,
  showDivider,
  speakingPlaybackKey,
  onPlayOriginal,
  onPlayTranslation,
  onSelectLanguage,
}: ExpandedChatBubbleRowProps) {
  const hasText = Boolean(text.trim())
  const isSpeaking = Boolean(
    speakingPlaybackKey
      && speakingPlaybackKey === (
        isOriginal
          ? buildOriginalPlaybackKey(utterance.id, utterance.originalLang)
          : buildTranslationPlaybackKey(utterance.id, lang)
      ),
  )
  const textClassName = isOriginal
    ? `${bubbleTextClassName} ${isDraft ? 'text-gray-400' : 'text-gray-900'}`
    : `${bubbleTextClassName} ${translationState === 'interim' ? 'text-gray-500' : 'text-gray-700'}`
  const bubbleBody = (
    <p
      data-expanded-bubble-content
      style={{ lineHeight: CHAT_BUBBLE_TEXT_LINE_HEIGHT }}
      className={`${textClassName} min-w-0 whitespace-pre-wrap break-words`}
    >
      {hasText ? (
        <span data-expanded-bubble-text className="align-middle">
          {text}
          {isSpeaking && <SpeakingIndicator label={copyActionCopy.playingIndicatorLabel} />}
          {isOriginal && isDraft && (
            <span className="ml-0.5 inline-block h-3 w-1 rounded-full bg-amber-400 align-middle animate-pulse" />
          )}
        </span>
      ) : (
        <span
          data-interim-translation-cursor
          className="inline-flex h-4 items-center gap-0.5 align-middle"
        >
          <span className="h-1 w-1 animate-bounce rounded-full bg-amber-400" style={{ animationDelay: '0ms' }} />
          <span className="h-1 w-1 animate-bounce rounded-full bg-amber-400" style={{ animationDelay: '150ms' }} />
          <span className="h-1 w-1 animate-bounce rounded-full bg-amber-400" style={{ animationDelay: '300ms' }} />
        </span>
      )}
    </p>
  )
  const bubbleSurfaceClassName = 'min-w-0 flex-1 rounded-xl bg-transparent px-0 py-0 shadow-none'
  const bubble = hasText ? (
    <CopyableBubbleSurface
      {...(isOriginal ? { 'data-original-bubble-body': true } : { 'data-translation-bubble-body': true })}
      text={text}
      allText={allText}
      copyBubbleLabel={copyActionCopy.copyBubbleLabel}
      copyAllBubblesLabel={copyActionCopy.copyAllBubblesLabel}
      playPronunciationLabel={isOriginal && isDraft ? undefined : ttsActionCopy.playPronunciationLabel}
      onPlayPronunciation={isOriginal
        ? (!isDraft ? (() => onPlayOriginal?.(utterance)) : undefined)
        : (() => onPlayTranslation?.(utterance, lang, text))}
      className={bubbleSurfaceClassName}
    >
      {bubbleBody}
    </CopyableBubbleSurface>
  ) : (
    <div
      {...(isOriginal ? { 'data-original-bubble-body': true } : { 'data-translation-bubble-body': true })}
      data-translation-state={translationState}
      className={bubbleSurfaceClassName}
    >
      {bubbleBody}
    </div>
  )

  return (
    <>
      {showDivider && (
        <div
          data-expanded-bubble-divider
          aria-hidden="true"
          className="my-1.5 h-px w-full bg-gray-200/60"
        />
      )}
      <div
        data-expanded-chat-bubble-row
        data-translation-state={translationState}
        className={`flex w-full min-w-0 items-start gap-1.5 ${isOwnMessage ? 'flex-row-reverse' : ''}`}
      >
        <div data-expanded-bubble-meta className="shrink-0 pt-0.5">
          <ChatLanguageBadge
            lang={lang}
            isOriginal={isOriginal}
            isSelected={isSelected}
            uiLocale={uiLocale}
            originalLanguageLabel={originalLanguageLabel}
            translationLanguageLabel={translationLanguageLabel}
            onSelect={() => onSelectLanguage?.(lang)}
          />
        </div>
        <div
          data-expanded-bubble-content-wrapper
          data-display-language={lang}
          data-translation-state={isOriginal ? undefined : translationState}
          className="min-w-0 flex-1"
        >
          {bubble}
        </div>
      </div>
    </>
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
  viewerUserId,
  onOpenProfile,
  bubbleDisplayMode = DEFAULT_BUBBLE_DISPLAY_MODE,
}: ChatBubbleProps) {
  const isOwnMessage = Boolean(
    viewerUserId && utterance.speakerUserId && utterance.speakerUserId === viewerUserId,
  )
  // A real, identified account only exists once speakerUserId is populated
  // — the server only sets it once the room has 2+ real members, so this
  // doubles as "is this a shared-room bubble" without a separate prop.
  const isSharedRoomMember = Boolean(utterance.speakerUserId)
  const canOpenSpeakerProfile = isSharedRoomMember && typeof onOpenProfile === 'function'
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
  const bubbleDisplayCopy = resolveLivePhoneDemoBubbleDisplayCopy(uiLocale)
  const [isBubbleExpanded, setIsBubbleExpanded] = useState(
    bubbleDisplayMode === 'expanded',
  )
  useEffect(() => {
    setIsBubbleExpanded(bubbleDisplayMode === 'expanded')
  }, [bubbleDisplayMode])
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
  const bubbleBackgroundClassName = isOwnMessage ? 'bg-amber-50/80' : 'bg-white'
  const combinedUtteranceCopyText = buildCombinedUtteranceCopyText(
    flag,
    utterance.originalText,
    completedTranslationEntries,
  )

  const expandedBubbleEntries = [
    {
      key: `original:${originalDisplayLanguage}`,
      lang: originalDisplayLanguage,
      text: utterance.originalText,
      isOriginal: true,
      isDraft,
      translationState: undefined,
    },
    ...translationEntries.map((entry) => ({
      key: `translation:${entry.lang}`,
      lang: entry.lang,
      text: entry.text,
      isOriginal: false,
      isDraft: false,
      translationState: entry.state,
    })),
  ]

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
          className="mr-2 inline-flex items-center gap-1.5 align-middle whitespace-nowrap"
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
                uiLocale={uiLocale}
                originalLanguageLabel={copyActionCopy.originalLanguageLabel}
                translationLanguageLabel={copyActionCopy.translationLanguageLabel}
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
            {isActiveSpeaking && <SpeakingIndicator label={copyActionCopy.playingIndicatorLabel} />}
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

  const bubbleControls = (
    <div
      data-chat-bubble-controls
      className="mb-1.5 flex shrink-0 flex-col items-center gap-1 self-end"
    >
      <button
        type="button"
        data-chat-bubble-toggle
        aria-label={isBubbleExpanded ? bubbleDisplayCopy.collapseBubbleLabel : bubbleDisplayCopy.expandBubbleLabel}
        aria-expanded={isBubbleExpanded}
        title={isBubbleExpanded ? bubbleDisplayCopy.collapseBubbleLabel : bubbleDisplayCopy.expandBubbleLabel}
        onPointerDown={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          setIsBubbleExpanded((expanded) => !expanded)
        }}
        className="inline-flex h-7 min-w-[3.25rem] touch-manipulation items-center justify-center rounded-md px-1.5 text-xs font-medium text-gray-400 transition hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 active:scale-95"
      >
        {isBubbleExpanded ? bubbleDisplayCopy.collapseBubbleLabel : bubbleDisplayCopy.expandBubbleLabel}
      </button>
    </div>
  )

  const avatarImage = utterance.speakerImage ? (
    <Image
      src={utterance.speakerImage}
      alt={speakerLabel}
      className="h-8 w-8 rounded-full bg-white object-cover"
      width={32}
      height={32}
      unoptimized
    />
  ) : isSharedRoomMember ? (
    // A real shared-room member with no uploaded photo gets a neutral
    // placeholder, never the generated animal avatar — that system is for
    // solo-session speaker diarization, not real account identity.
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
      <UserRound size={18} className="text-gray-400" aria-hidden="true" />
    </div>
  ) : (
    <Image
      src={avatar.src}
      alt={`${speakerLabel} ${avatar.name} avatar`}
      className="h-8 w-8 rounded-full bg-white object-cover"
      width={32}
      height={32}
      unoptimized
    />
  )

  const avatarColumn = (
    <div key="avatar" data-speaker-avatar-column className="mt-0.5 flex w-10 shrink-0 flex-col items-center gap-1">
      <div className="rounded-full bg-gradient-to-br from-rose-50 via-white to-amber-50 p-0.5 shadow-sm ring-1 ring-black/5">
        {canOpenSpeakerProfile && utterance.speakerUserId ? (
          <button
            type="button"
            onClick={() => onOpenProfile?.(utterance.speakerUserId as string)}
            // The visual avatar is a 32px circle, well under Apple's 44pt
            // minimum touch target — this padding/negative-margin pair
            // expands the tappable hit area without shifting layout, since
            // a precise desktop mouse click can land on a 32px circle but a
            // real finger tap on a small mobile screen often can't.
            className="-m-2 block rounded-full p-2"
            aria-label={speakerLabel}
          >
            {avatarImage}
          </button>
        ) : (
          avatarImage
        )}
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
  )

  const messageColumn = (
    <motion.div
      key="message"
      layout
      transition={{ layout: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } }}
      className={`flex min-w-0 flex-1 items-end gap-1.5 ${isOwnMessage ? 'flex-row-reverse' : ''}`}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {isBubbleExpanded ? (
          <motion.div
            key="expanded"
            data-chat-bubble-content-switch="expanded"
            layout="position"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="min-w-0 w-fit"
          >
            <div
              data-chat-message-bubble-stack
              style={{ maxWidth: MESSAGE_BUBBLE_MAX_WIDTH }}
              className="min-w-0 w-fit"
            >
              <div
                data-chat-message-bubble
                data-expanded-bubble-container
                data-display-language={originalDisplayLanguage}
                className={`inline-block w-fit max-w-full rounded-2xl border border-gray-200 ${bubbleBackgroundClassName} px-3.5 py-2.5 shadow-sm`}
              >
                {expandedBubbleEntries.map((entry, index) => (
                  <ExpandedChatBubbleRow
                    key={entry.key}
                    utterance={utterance}
                    lang={entry.lang}
                    text={entry.text}
                    isOriginal={entry.isOriginal}
                    isDraft={entry.isDraft}
                    translationState={entry.translationState}
                    bubbleTextClassName={bubbleTextClassName}
                    copyActionCopy={copyActionCopy}
                    ttsActionCopy={ttsActionCopy}
                    allText={combinedUtteranceCopyText}
                    isOwnMessage={isOwnMessage}
                    uiLocale={uiLocale}
                    originalLanguageLabel={copyActionCopy.originalLanguageLabel}
                    translationLanguageLabel={copyActionCopy.translationLanguageLabel}
                    isSelected={normalizeTranslationLanguageKey(activeLanguage) === normalizeTranslationLanguageKey(entry.lang)}
                    showDivider={index > 0}
                    speakingPlaybackKey={speakingPlaybackKey}
                    onPlayOriginal={onPlayOriginal}
                    onPlayTranslation={onPlayTranslation}
                    onSelectLanguage={setDisplayLanguage}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="collapsed"
            data-chat-bubble-content-switch="collapsed"
            layout="position"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="min-w-0 w-fit"
          >
            <div
              data-chat-message-bubble-stack
              style={{ maxWidth: MESSAGE_BUBBLE_MAX_WIDTH }}
              className="min-w-0 w-fit"
            >
              <div
                data-chat-message-bubble
                data-display-language={activeLanguage}
                data-translation-state={isOriginalLanguageSelected ? undefined : activeTranslationEntry?.state}
                className={`w-fit max-w-full rounded-2xl border border-gray-200 ${bubbleBackgroundClassName} px-3.5 py-2 shadow-sm`}
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
          </motion.div>
        )}
      </AnimatePresence>

      {bubbleControls}
    </motion.div>
  )

  const bubbleContent = isOwnMessage
    ? <>{messageColumn}{avatarColumn}</>
    : <>{avatarColumn}{messageColumn}</>

  if (!shouldAnimateEntrance) {
    return (
      <div className={`flex items-start gap-1.5 ${isOwnMessage ? 'w-full justify-end' : ''}`}>
        {bubbleContent}
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex items-start gap-1.5 ${isOwnMessage ? 'w-full justify-end' : ''}`}
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
  if (prev.viewerUserId !== next.viewerUserId) return false
  if (prev.onOpenProfile !== next.onOpenProfile) return false
  if (prev.bubbleDisplayMode !== next.bubbleDisplayMode) return false

  if (prev.utterance !== next.utterance) {
    const pu = prev.utterance
    const nu = next.utterance
    if (pu.id !== nu.id) return false
    if (pu.speaker !== nu.speaker) return false
    if (pu.speakerAvatarSeed !== nu.speakerAvatarSeed) return false
    if (pu.speakerAvatarIndex !== nu.speakerAvatarIndex) return false
    if (pu.speakerUserId !== nu.speakerUserId) return false
    if (pu.speakerImage !== nu.speakerImage) return false
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
