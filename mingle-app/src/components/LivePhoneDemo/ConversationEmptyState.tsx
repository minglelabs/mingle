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
    title: '아무 언어로 말해보세요!',
    description: '언어를 선택하지 않아도 밍글이 알아듣고 번역해드려요',
    supportLabel: '60개 언어 실시간 지원',
    carouselLabel: '지원 언어 목록',
  },
  en: {
    title: 'Speak in any language!',
    description: 'Mingle understands and translates you without choosing a language.',
    supportLabel: '60 languages supported in real time',
    carouselLabel: 'Supported languages',
  },
  ja: {
    title: 'どんな言語でも話してみてください！',
    description: '言語を選ばなくても、Mingleが理解して翻訳します。',
    supportLabel: '60言語をリアルタイムでサポート',
    carouselLabel: '対応言語',
  },
  'zh-CN': {
    title: '请用任何语言说话！',
    description: '无需选择语言，Mingle也能理解并为您翻译。',
    supportLabel: '实时支持60种语言',
    carouselLabel: '支持的语言',
  },
  'zh-TW': {
    title: '請用任何語言說話！',
    description: '即使不選擇語言，Mingle也能理解並為您翻譯。',
    supportLabel: '即時支援60種語言',
    carouselLabel: '支援的語言',
  },
  fr: {
    title: 'Parlez dans la langue de votre choix !',
    description: 'Mingle comprend et traduit sans que vous ayez à choisir une langue.',
    supportLabel: '60 langues prises en charge en temps réel',
    carouselLabel: 'Langues prises en charge',
  },
  de: {
    title: 'Sprechen Sie in jeder Sprache!',
    description: 'Mingle versteht und übersetzt Sie, ohne dass Sie eine Sprache auswählen müssen.',
    supportLabel: '60 Sprachen in Echtzeit unterstützt',
    carouselLabel: 'Unterstützte Sprachen',
  },
  es: {
    title: '¡Habla en cualquier idioma!',
    description: 'Mingle te entiende y traduce sin que tengas que elegir un idioma.',
    supportLabel: '60 idiomas compatibles en tiempo real',
    carouselLabel: 'Idiomas compatibles',
  },
  pt: {
    title: 'Fale em qualquer idioma!',
    description: 'O Mingle entende e traduz você sem precisar escolher um idioma.',
    supportLabel: '60 idiomas compatíveis em tempo real',
    carouselLabel: 'Idiomas compatíveis',
  },
  it: {
    title: 'Parla in qualsiasi lingua!',
    description: 'Mingle ti capisce e traduce senza dover scegliere una lingua.',
    supportLabel: '60 lingue supportate in tempo reale',
    carouselLabel: 'Lingue supportate',
  },
  ru: {
    title: 'Говорите на любом языке!',
    description: 'Mingle поймёт и переведёт вас без выбора языка.',
    supportLabel: 'Поддержка 60 языков в реальном времени',
    carouselLabel: 'Поддерживаемые языки',
  },
  ar: {
    title: 'تحدث بأي لغة!',
    description: 'يفهمك Mingle ويترجم كلامك دون اختيار لغة.',
    supportLabel: 'دعم 60 لغة في الوقت الفعلي',
    carouselLabel: 'اللغات المدعومة',
  },
  hi: {
    title: 'किसी भी भाषा में बोलें!',
    description: 'भाषा चुने बिना भी Mingle आपको समझकर अनुवाद करता है।',
    supportLabel: 'रीयल टाइम में 60 भाषाओं का समर्थन',
    carouselLabel: 'समर्थित भाषाएं',
  },
  th: {
    title: 'พูดภาษาไหนก็ได้!',
    description: 'Mingle เข้าใจและแปลให้คุณได้โดยไม่ต้องเลือกภาษา',
    supportLabel: 'รองรับ 60 ภาษาแบบเรียลไทม์',
    carouselLabel: 'ภาษาที่รองรับ',
  },
  vi: {
    title: 'Hãy nói bằng bất kỳ ngôn ngữ nào!',
    description: 'Mingle hiểu và dịch cho bạn mà không cần chọn ngôn ngữ.',
    supportLabel: 'Hỗ trợ 60 ngôn ngữ theo thời gian thực',
    carouselLabel: 'Ngôn ngữ được hỗ trợ',
  },
}

const EMPTY_STATE_LANGUAGE_OPTIONS = STT_LANGUAGE_OPTIONS.slice(0, 60)

function resolveEmptyStateCopy(uiLocale: string): ConversationEmptyStateCopy {
  const locale = resolveSupportedLocaleTag(uiLocale) ?? 'en'
  return EMPTY_STATE_COPY_BY_LOCALE[locale] ?? EMPTY_STATE_COPY_BY_LOCALE.en!
}

type ConversationEmptyStateProps = {
  uiLocale: string
}

export default function ConversationEmptyState({ uiLocale }: ConversationEmptyStateProps) {
  const copy = resolveEmptyStateCopy(uiLocale)

  return (
    <div
      data-qa="live-demo-empty-state"
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white px-4 pb-28 pt-6"
    >
      <div className="flex w-full max-w-[390px] -translate-y-2 flex-col items-center text-center">
        <div className="mb-5 flex h-9 items-end justify-center gap-1.5 text-amber-500" aria-hidden="true">
          <span className="h-4 w-2 rounded-full bg-current" />
          <span className="h-8 w-2 rounded-full bg-current" />
          <span className="h-6 w-2 rounded-full bg-current" />
        </div>

        <h2
          data-qa="live-demo-empty-state-message"
          className="text-[1.8rem] font-extrabold leading-[1.18] tracking-[-0.045em] text-slate-900 sm:text-[2rem]"
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
          className="pointer-events-auto mt-5 w-full overflow-x-auto overscroll-x-contain pb-2 no-scrollbar"
          style={{ touchAction: 'pan-x', scrollSnapType: 'x proximity' }}
        >
          <div className="flex min-w-max items-center gap-3 px-5">
            {EMPTY_STATE_LANGUAGE_OPTIONS.map((language) => {
              const languageName = getSttLanguageDisplayName(language.code, uiLocale) ?? language.englishName

              return (
                <div
                  key={language.code}
                  role="listitem"
                  aria-label={languageName}
                  title={languageName}
                  className="flex h-14 w-14 shrink-0 snap-center items-center justify-center rounded-full border border-slate-200 bg-slate-50 shadow-[0_6px_16px_rgba(15,23,42,0.08)]"
                >
                  <LanguageFlag language={language.code} className="text-[2rem] leading-none" />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
