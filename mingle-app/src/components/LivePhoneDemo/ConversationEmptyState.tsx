import { useCallback, useEffect, useRef } from 'react'
import { resolveSupportedLocaleTag } from '@/i18n/config'
import { STT_LANGUAGE_OPTIONS, getSttLanguageDisplayName } from '@/lib/stt-languages'
import LanguageFlag from '@/components/language-flag'

type ConversationEmptyStateCopy = {
  title: string
  description: string
  supportLabel: string
  carouselLabel: string
}

const EMPTY_STATE_COPY_BY_LOCALE: Partial<Record<string, ConversationEmptyStateCopy>> = {
  ko: {
    title: 'Start 버튼을 누른 후\n아무 언어로 말해보세요!',
    description: '언어를 선택하지 않아도 밍글이 알아듣고 번역해드려요',
    supportLabel: '60개 언어 실시간 지원',
    carouselLabel: '지원 언어 목록',
  },
  en: {
    title: 'Press Start, then\nspeak in any language!',
    description: 'Mingle understands and translates you without choosing a language.',
    supportLabel: '60 languages supported in real time',
    carouselLabel: 'Supported languages',
  },
  ja: {
    title: 'Startを押して、\nどんな言語でも話してみてください！',
    description: '言語を選ばなくても、Mingleが理解して翻訳します。',
    supportLabel: '60言語をリアルタイムでサポート',
    carouselLabel: '対応言語',
  },
  'zh-CN': {
    title: '请点击 Start，\n用任何语言说话！',
    description: '无需选择语言，Mingle也能理解并为您翻译。',
    supportLabel: '实时支持60种语言',
    carouselLabel: '支持的语言',
  },
  'zh-TW': {
    title: '請點擊 Start，\n用任何語言說話！',
    description: '即使不選擇語言，Mingle也能理解並為您翻譯。',
    supportLabel: '即時支援60種語言',
    carouselLabel: '支援的語言',
  },
  fr: {
    title: 'Appuyez sur Start,\npuis parlez dans la langue de votre choix !',
    description: 'Mingle comprend et traduit sans que vous ayez à choisir une langue.',
    supportLabel: '60 langues prises en charge en temps réel',
    carouselLabel: 'Langues prises en charge',
  },
  de: {
    title: 'Drücken Sie Start,\nund sprechen Sie in jeder Sprache!',
    description: 'Mingle versteht und übersetzt Sie, ohne dass Sie eine Sprache auswählen müssen.',
    supportLabel: '60 Sprachen in Echtzeit unterstützt',
    carouselLabel: 'Unterstützte Sprachen',
  },
  es: {
    title: 'Pulsa Start\ny habla en cualquier idioma.',
    description: 'Mingle te entiende y traduce sin que tengas que elegir un idioma.',
    supportLabel: '60 idiomas compatibles en tiempo real',
    carouselLabel: 'Idiomas compatibles',
  },
  pt: {
    title: 'Toque em Start\ne fale em qualquer idioma!',
    description: 'O Mingle entende e traduz você sem precisar escolher um idioma.',
    supportLabel: '60 idiomas compatíveis em tempo real',
    carouselLabel: 'Idiomas compatíveis',
  },
  it: {
    title: 'Premi Start,\npoi parla in qualsiasi lingua!',
    description: 'Mingle ti capisce e traduce senza dover scegliere una lingua.',
    supportLabel: '60 lingue supportate in tempo reale',
    carouselLabel: 'Lingue supportate',
  },
  ru: {
    title: 'Нажмите Start,\nа затем говорите на любом языке!',
    description: 'Mingle поймёт и переведёт вас без выбора языка.',
    supportLabel: 'Поддержка 60 языков в реальном времени',
    carouselLabel: 'Поддерживаемые языки',
  },
  ar: {
    title: 'اضغط على Start،\nثم تحدث بأي لغة!',
    description: 'يفهمك Mingle ويترجم كلامك دون اختيار لغة.',
    supportLabel: 'دعم 60 لغة في الوقت الفعلي',
    carouselLabel: 'اللغات المدعومة',
  },
  hi: {
    title: 'Start दबाएँ,\nफिर किसी भी भाषा में बोलें!',
    description: 'भाषा चुने बिना भी Mingle आपको समझकर अनुवाद करता है।',
    supportLabel: 'रीयल टाइम में 60 भाषाओं का समर्थन',
    carouselLabel: 'समर्थित भाषाएं',
  },
  th: {
    title: 'กด Start\nแล้วพูดภาษาไหนก็ได้!',
    description: 'Mingle เข้าใจและแปลให้คุณได้โดยไม่ต้องเลือกภาษา',
    supportLabel: 'รองรับ 60 ภาษาแบบเรียลไทม์',
    carouselLabel: 'ภาษาที่รองรับ',
  },
  vi: {
    title: 'Nhấn Start,\nrồi nói bằng bất kỳ ngôn ngữ nào!',
    description: 'Mingle hiểu và dịch cho bạn mà không cần chọn ngôn ngữ.',
    supportLabel: 'Hỗ trợ 60 ngôn ngữ theo thời gian thực',
    carouselLabel: 'Ngôn ngữ được hỗ trợ',
  },
}

const EMPTY_STATE_LANGUAGE_OPTIONS = STT_LANGUAGE_OPTIONS.slice(0, 60)
const EMPTY_STATE_LANGUAGE_CAROUSEL_GROUP_COUNT = 3
const EMPTY_STATE_LANGUAGE_CAROUSEL_SPEED_PX_PER_SECOND = 18
const EMPTY_STATE_LANGUAGE_CAROUSEL_RESUME_DELAY_MS = 1400
const EMPTY_STATE_ARROW_END_Y = 78
const EMPTY_STATE_ARROW_HEAD_Y = 72

function resolveEmptyStateCopy(uiLocale: string): ConversationEmptyStateCopy {
  const locale = resolveSupportedLocaleTag(uiLocale) ?? 'en'
  return EMPTY_STATE_COPY_BY_LOCALE[locale] ?? EMPTY_STATE_COPY_BY_LOCALE.en!
}

type ConversationEmptyStateProps = {
  uiLocale: string
}

export default function ConversationEmptyState({ uiLocale }: ConversationEmptyStateProps) {
  const copy = resolveEmptyStateCopy(uiLocale)
  const carouselRef = useRef<HTMLDivElement | null>(null)
  const carouselGroupRefs = useRef<Array<HTMLDivElement | null>>([])
  const carouselCycleWidthRef = useRef(0)
  const carouselInteractingRef = useRef(false)
  const carouselResumeTimeoutRef = useRef<number | null>(null)
  const carouselInitialOffsetSetRef = useRef(false)

  const normalizeCarouselPosition = useCallback(() => {
    const carousel = carouselRef.current
    const cycleWidth = carouselCycleWidthRef.current
    if (!carousel || cycleWidth <= 0) return

    while (carousel.scrollLeft >= cycleWidth * 2) {
      carousel.scrollLeft -= cycleWidth
    }

    while (carousel.scrollLeft <= 0) {
      carousel.scrollLeft += cycleWidth
    }
  }, [])

  const pauseCarousel = useCallback(() => {
    carouselInteractingRef.current = true
    if (carouselResumeTimeoutRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(carouselResumeTimeoutRef.current)
      carouselResumeTimeoutRef.current = null
    }
  }, [])

  const resumeCarouselAfterInteraction = useCallback(() => {
    if (typeof window === 'undefined') return

    if (carouselResumeTimeoutRef.current !== null) {
      window.clearTimeout(carouselResumeTimeoutRef.current)
    }

    carouselResumeTimeoutRef.current = window.setTimeout(() => {
      carouselInteractingRef.current = false
      carouselResumeTimeoutRef.current = null
    }, EMPTY_STATE_LANGUAGE_CAROUSEL_RESUME_DELAY_MS)
  }, [])

  useEffect(() => {
    const carousel = carouselRef.current
    if (!carousel || typeof window === 'undefined') return

    carouselInitialOffsetSetRef.current = false
    let animationFrameId: number | null = null
    let initialMeasureFrameId: number | null = null
    let previousFrameTimestamp = 0

    const measureCycleWidth = () => {
      const firstGroup = carouselGroupRefs.current[0]
      const secondGroup = carouselGroupRefs.current[1]
      if (!firstGroup || !secondGroup) return

      const cycleWidth = secondGroup.offsetLeft - firstGroup.offsetLeft
      if (cycleWidth <= 0) return

      carouselCycleWidthRef.current = cycleWidth
      if (!carouselInitialOffsetSetRef.current) {
        carousel.scrollLeft = cycleWidth
        carouselInitialOffsetSetRef.current = true
        return
      }

      normalizeCarouselPosition()
    }

    const animateCarousel = (timestamp: number) => {
      if (previousFrameTimestamp === 0) {
        previousFrameTimestamp = timestamp
      }

      const elapsedMs = Math.min(64, Math.max(0, timestamp - previousFrameTimestamp))
      previousFrameTimestamp = timestamp

      if (!carouselInteractingRef.current && carouselCycleWidthRef.current > 0) {
        carousel.scrollLeft += (elapsedMs / 1000) * EMPTY_STATE_LANGUAGE_CAROUSEL_SPEED_PX_PER_SECOND
        normalizeCarouselPosition()
      }

      animationFrameId = window.requestAnimationFrame(animateCarousel)
    }

    measureCycleWidth()
    initialMeasureFrameId = window.requestAnimationFrame(measureCycleWidth)
    window.addEventListener('resize', measureCycleWidth)

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(measureCycleWidth)
      : null
    resizeObserver?.observe(carousel)

    animationFrameId = window.requestAnimationFrame(animateCarousel)

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId)
      }
      if (initialMeasureFrameId !== null) {
        window.cancelAnimationFrame(initialMeasureFrameId)
      }
      if (carouselResumeTimeoutRef.current !== null) {
        window.clearTimeout(carouselResumeTimeoutRef.current)
        carouselResumeTimeoutRef.current = null
      }
      window.removeEventListener('resize', measureCycleWidth)
      resizeObserver?.disconnect()
    }
  }, [normalizeCarouselPosition, uiLocale])

  return (
    <div
      data-qa="live-demo-empty-state"
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white px-4 pb-4 pt-6"
    >
      <div className="flex w-full max-w-[390px] -translate-y-2 flex-col items-center text-center">
        <div className="mb-5 flex h-9 items-end justify-center gap-1.5 text-amber-500" aria-hidden="true">
          <span className="h-4 w-2 rounded-full bg-current" />
          <span className="h-8 w-2 rounded-full bg-current" />
          <span className="h-6 w-2 rounded-full bg-current" />
        </div>

        <h2
          data-qa="live-demo-empty-state-message"
          className="whitespace-pre-line text-[1.8rem] font-extrabold leading-[1.18] tracking-[-0.045em] text-slate-900 sm:text-[2rem]"
        >
          {copy.title}
        </h2>
        <p className="mt-4 max-w-[19rem] text-[1.02rem] font-medium leading-[1.55] tracking-[-0.025em] text-slate-500">
          {copy.description}
        </p>
        <p className="mt-7 text-[0.95rem] font-bold tracking-[-0.02em] text-amber-600">
          {copy.supportLabel}
        </p>

        <div
          data-qa="live-demo-empty-state-language-carousel"
          role="list"
          aria-label={copy.carouselLabel}
          tabIndex={0}
          onScroll={normalizeCarouselPosition}
          onWheel={() => {
            pauseCarousel()
            resumeCarouselAfterInteraction()
          }}
          onPointerDown={pauseCarousel}
          onPointerUp={resumeCarouselAfterInteraction}
          onPointerCancel={resumeCarouselAfterInteraction}
          onKeyDown={pauseCarousel}
          onKeyUp={resumeCarouselAfterInteraction}
          onFocus={pauseCarousel}
          onBlur={resumeCarouselAfterInteraction}
          className="pointer-events-auto mt-5 w-full overflow-x-auto overscroll-x-contain pb-1 no-scrollbar"
          style={{ touchAction: 'pan-x', scrollSnapType: 'x proximity' }}
        >
          <div className="flex min-w-max items-start">
            {Array.from({ length: EMPTY_STATE_LANGUAGE_CAROUSEL_GROUP_COUNT }, (_, groupIndex) => (
              <div
                key={`empty-state-language-group-${groupIndex}`}
                ref={(node) => {
                  carouselGroupRefs.current[groupIndex] = node
                }}
                aria-hidden={groupIndex === 1 ? undefined : true}
                className="flex min-w-max items-start gap-3 px-5"
              >
                {EMPTY_STATE_LANGUAGE_OPTIONS.map((language) => {
                  const languageName = getSttLanguageDisplayName(language.code, uiLocale) ?? language.englishName

                  return (
                    <div
                      key={`${groupIndex}-${language.code}`}
                      role="listitem"
                      aria-label={languageName}
                      title={languageName}
                      className="flex w-[5rem] shrink-0 snap-center flex-col items-center gap-1.5"
                    >
                      <span className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[2rem] shadow-[0_6px_16px_rgba(15,23,42,0.08)]">
                        <LanguageFlag language={language.code} className="leading-none" />
                      </span>
                      <span className="w-full truncate text-[0.67rem] font-medium leading-4 text-slate-500">
                        {languageName}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <div
          data-qa="live-demo-empty-state-arrow"
          aria-hidden="true"
          className="mt-3 h-[clamp(7rem,24vh,12rem)] w-7"
        >
          <svg
            viewBox="0 0 24 100"
            preserveAspectRatio="none"
            className="h-full w-full text-gray-300/95"
          >
            <path
              d={`M12 4V${EMPTY_STATE_ARROW_END_Y}M12 ${EMPTY_STATE_ARROW_END_Y}L4 ${EMPTY_STATE_ARROW_HEAD_Y}M12 ${EMPTY_STATE_ARROW_END_Y}L20 ${EMPTY_STATE_ARROW_HEAD_Y}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  )
}
