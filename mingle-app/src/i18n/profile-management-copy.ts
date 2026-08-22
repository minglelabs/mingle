import {
  DEFAULT_LOCALE,
  resolveLegalDocumentLocale,
  resolveSupportedLocaleTag,
  type LegalDocumentLocale,
} from '@/i18n/config'

export type ProfileUsageCopy = {
  title: string
  totalUsage: string
  messages: string
  conversations: string
  speechLanguages: string
  translationLanguages: string
  messageCountSuffix: string
  noData: string
  loadError: string
  unknownLanguage: string
}

export type ProfileManagementCopy = {
  defaultLanguages: string
  defaultLanguagesDescription: string
  defaultLanguagesSaveError: string
  usage: ProfileUsageCopy
}

const PROFILE_MANAGEMENT_COPY_BY_LOCALE: Record<LegalDocumentLocale, ProfileManagementCopy> = {
  ko: {
    defaultLanguages: '대화 기본 언어',
    defaultLanguagesDescription: '새 대화방을 만들 때 사용할 언어를 원하는 순서대로 선택하세요.',
    defaultLanguagesSaveError: '기본 언어를 저장하지 못했습니다.',
    usage: {
      title: '사용량', totalUsage: '총 사용시간', messages: '메시지', conversations: '대화방',
      speechLanguages: '음성 인식 언어별', translationLanguages: '번역 언어별 메시지', messageCountSuffix: '개',
      noData: '아직 사용량이 없습니다.', loadError: '사용량을 불러오지 못했습니다.', unknownLanguage: '알 수 없는 언어',
    },
  },
  en: {
    defaultLanguages: 'Default conversation languages',
    defaultLanguagesDescription: 'Choose the languages and order used when you create a new conversation.',
    defaultLanguagesSaveError: 'Could not save the default languages.',
    usage: {
      title: 'Usage', totalUsage: 'Total time', messages: 'Messages', conversations: 'Conversations',
      speechLanguages: 'By speech language', translationLanguages: 'Messages by translation language', messageCountSuffix: 'messages',
      noData: 'No usage yet.', loadError: 'Could not load your usage.', unknownLanguage: 'Unknown language',
    },
  },
  ja: {
    defaultLanguages: '会話のデフォルト言語',
    defaultLanguagesDescription: '新しい会話で使う言語と順番を選択してください。',
    defaultLanguagesSaveError: 'デフォルト言語を保存できませんでした。',
    usage: {
      title: '使用量', totalUsage: '合計時間', messages: 'メッセージ', conversations: '会話',
      speechLanguages: '音声認識言語別', translationLanguages: '翻訳言語別メッセージ', messageCountSuffix: '件',
      noData: '使用量はまだありません。', loadError: '使用量を読み込めませんでした。', unknownLanguage: '不明な言語',
    },
  },
  'zh-CN': {
    defaultLanguages: '对话默认语言',
    defaultLanguagesDescription: '选择创建新对话时使用的语言和顺序。',
    defaultLanguagesSaveError: '无法保存默认语言。',
    usage: {
      title: '使用量', totalUsage: '总时长', messages: '消息', conversations: '对话',
      speechLanguages: '按语音识别语言', translationLanguages: '按翻译语言统计消息', messageCountSuffix: '条消息',
      noData: '暂无使用记录。', loadError: '无法加载使用量。', unknownLanguage: '未知语言',
    },
  },
  'zh-TW': {
    defaultLanguages: '對話預設語言',
    defaultLanguagesDescription: '選擇建立新對話時使用的語言與順序。',
    defaultLanguagesSaveError: '無法儲存預設語言。',
    usage: {
      title: '用量', totalUsage: '總時間', messages: '訊息', conversations: '對話',
      speechLanguages: '依語音辨識語言', translationLanguages: '依翻譯語言統計訊息', messageCountSuffix: '則訊息',
      noData: '目前沒有使用量。', loadError: '無法載入用量。', unknownLanguage: '未知語言',
    },
  },
  fr: {
    defaultLanguages: 'Langues de conversation par défaut',
    defaultLanguagesDescription: 'Choisissez les langues et leur ordre pour les nouvelles conversations.',
    defaultLanguagesSaveError: 'Impossible d’enregistrer les langues par défaut.',
    usage: {
      title: 'Utilisation', totalUsage: 'Temps total', messages: 'Messages', conversations: 'Conversations',
      speechLanguages: 'Par langue parlée', translationLanguages: 'Messages par langue de traduction', messageCountSuffix: 'messages',
      noData: 'Aucune utilisation pour le moment.', loadError: 'Impossible de charger votre utilisation.', unknownLanguage: 'Langue inconnue',
    },
  },
  de: {
    defaultLanguages: 'Standardsprachen für Gespräche',
    defaultLanguagesDescription: 'Wählen Sie Sprachen und Reihenfolge für neue Gespräche aus.',
    defaultLanguagesSaveError: 'Standardsprache konnte nicht gespeichert werden.',
    usage: {
      title: 'Nutzung', totalUsage: 'Gesamtzeit', messages: 'Nachrichten', conversations: 'Gespräche',
      speechLanguages: 'Nach gesprochener Sprache', translationLanguages: 'Nach Übersetzungssprache', messageCountSuffix: 'Nachrichten',
      noData: 'Noch keine Nutzung.', loadError: 'Nutzung konnte nicht geladen werden.', unknownLanguage: 'Unbekannte Sprache',
    },
  },
  es: {
    defaultLanguages: 'Idiomas predeterminados de conversación',
    defaultLanguagesDescription: 'Elige los idiomas y el orden para las conversaciones nuevas.',
    defaultLanguagesSaveError: 'No se pudieron guardar los idiomas predeterminados.',
    usage: {
      title: 'Uso', totalUsage: 'Tiempo total', messages: 'Mensajes', conversations: 'Conversaciones',
      speechLanguages: 'Por idioma hablado', translationLanguages: 'Mensajes por idioma de traducción', messageCountSuffix: 'mensajes',
      noData: 'Aún no hay uso.', loadError: 'No se pudo cargar tu uso.', unknownLanguage: 'Idioma desconocido',
    },
  },
  pt: {
    defaultLanguages: 'Idiomas padrão das conversas',
    defaultLanguagesDescription: 'Escolha os idiomas e a ordem para novas conversas.',
    defaultLanguagesSaveError: 'Não foi possível salvar os idiomas padrão.',
    usage: {
      title: 'Uso', totalUsage: 'Tempo total', messages: 'Mensagens', conversations: 'Conversas',
      speechLanguages: 'Por idioma falado', translationLanguages: 'Mensagens por idioma de tradução', messageCountSuffix: 'mensagens',
      noData: 'Ainda não há uso.', loadError: 'Não foi possível carregar seu uso.', unknownLanguage: 'Idioma desconhecido',
    },
  },
  it: {
    defaultLanguages: 'Lingue predefinite delle conversazioni',
    defaultLanguagesDescription: 'Scegli le lingue e l’ordine per le nuove conversazioni.',
    defaultLanguagesSaveError: 'Impossibile salvare le lingue predefinite.',
    usage: {
      title: 'Utilizzo', totalUsage: 'Tempo totale', messages: 'Messaggi', conversations: 'Conversazioni',
      speechLanguages: 'Per lingua parlata', translationLanguages: 'Messaggi per lingua di traduzione', messageCountSuffix: 'messaggi',
      noData: 'Nessun utilizzo per ora.', loadError: 'Impossibile caricare il tuo utilizzo.', unknownLanguage: 'Lingua sconosciuta',
    },
  },
  ru: {
    defaultLanguages: 'Языки разговоров по умолчанию',
    defaultLanguagesDescription: 'Выберите языки и порядок для новых разговоров.',
    defaultLanguagesSaveError: 'Не удалось сохранить языки по умолчанию.',
    usage: {
      title: 'Использование', totalUsage: 'Общее время', messages: 'Сообщения', conversations: 'Разговоры',
      speechLanguages: 'По языку речи', translationLanguages: 'Сообщения по языку перевода', messageCountSuffix: 'сообщений',
      noData: 'Данных об использовании пока нет.', loadError: 'Не удалось загрузить данные.', unknownLanguage: 'Неизвестный язык',
    },
  },
  ar: {
    defaultLanguages: 'لغات المحادثة الافتراضية',
    defaultLanguagesDescription: 'اختر اللغات وترتيبها للمحادثات الجديدة.',
    defaultLanguagesSaveError: 'تعذر حفظ اللغات الافتراضية.',
    usage: {
      title: 'الاستخدام', totalUsage: 'الوقت الإجمالي', messages: 'الرسائل', conversations: 'المحادثات',
      speechLanguages: 'حسب لغة الكلام', translationLanguages: 'الرسائل حسب لغة الترجمة', messageCountSuffix: 'رسالة',
      noData: 'لا يوجد استخدام بعد.', loadError: 'تعذر تحميل الاستخدام.', unknownLanguage: 'لغة غير معروفة',
    },
  },
  hi: {
    defaultLanguages: 'डिफ़ॉल्ट बातचीत भाषाएँ',
    defaultLanguagesDescription: 'नई बातचीत बनाते समय इस्तेमाल होने वाली भाषाएँ और क्रम चुनें।',
    defaultLanguagesSaveError: 'डिफ़ॉल्ट भाषाएँ सहेजी नहीं जा सकीं।',
    usage: {
      title: 'उपयोग', totalUsage: 'कुल समय', messages: 'संदेश', conversations: 'बातचीत',
      speechLanguages: 'बोली गई भाषा के अनुसार', translationLanguages: 'अनुवाद भाषा के अनुसार संदेश', messageCountSuffix: 'संदेश',
      noData: 'अभी कोई उपयोग नहीं है।', loadError: 'उपयोग लोड नहीं किया जा सका।', unknownLanguage: 'अज्ञात भाषा',
    },
  },
  th: {
    defaultLanguages: 'ภาษาการสนทนาเริ่มต้น',
    defaultLanguagesDescription: 'เลือกภาษาและลำดับที่จะใช้เมื่อสร้างบทสนทนาใหม่',
    defaultLanguagesSaveError: 'บันทึกภาษาเริ่มต้นไม่สำเร็จ',
    usage: {
      title: 'การใช้งาน', totalUsage: 'เวลารวม', messages: 'ข้อความ', conversations: 'บทสนทนา',
      speechLanguages: 'ตามภาษาพูด', translationLanguages: 'ข้อความตามภาษาที่แปล', messageCountSuffix: 'ข้อความ',
      noData: 'ยังไม่มีข้อมูลการใช้งาน', loadError: 'โหลดข้อมูลการใช้งานไม่สำเร็จ', unknownLanguage: 'ภาษาไม่ทราบชื่อ',
    },
  },
  vi: {
    defaultLanguages: 'Ngôn ngữ trò chuyện mặc định',
    defaultLanguagesDescription: 'Chọn ngôn ngữ và thứ tự dùng khi tạo cuộc trò chuyện mới.',
    defaultLanguagesSaveError: 'Không thể lưu ngôn ngữ mặc định.',
    usage: {
      title: 'Mức sử dụng', totalUsage: 'Tổng thời gian', messages: 'Tin nhắn', conversations: 'Cuộc trò chuyện',
      speechLanguages: 'Theo ngôn ngữ nói', translationLanguages: 'Tin nhắn theo ngôn ngữ dịch', messageCountSuffix: 'tin nhắn',
      noData: 'Chưa có dữ liệu sử dụng.', loadError: 'Không thể tải dữ liệu sử dụng.', unknownLanguage: 'Ngôn ngữ không xác định',
    },
  },
}

export function resolveProfileManagementCopy(rawLocale: string): ProfileManagementCopy {
  const supportedLocale = resolveSupportedLocaleTag(rawLocale) ?? DEFAULT_LOCALE
  return PROFILE_MANAGEMENT_COPY_BY_LOCALE[resolveLegalDocumentLocale(supportedLocale)]
}
