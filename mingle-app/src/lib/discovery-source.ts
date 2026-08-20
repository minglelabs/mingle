import {
  resolvePrimaryUiLocaleTag,
  type PrimaryUiLocale,
} from "@/i18n/mingle-locales";

export const DISCOVERY_SOURCE_CODES = [
  "friend",
  "hellotalk",
  "threads",
  "social_media_other",
  "online_ad",
  "google_search",
  "ai_recommendation",
  "app_store_search",
  "community",
  "other",
] as const;

const LEGACY_DISCOVERY_SOURCE_CODES = [
  "social_media",
  "search",
  "app_store",
] as const;

export type DiscoverySource =
  | (typeof DISCOVERY_SOURCE_CODES)[number]
  | (typeof LEGACY_DISCOVERY_SOURCE_CODES)[number];

export function shuffleDiscoverySourceCodes(): readonly (typeof DISCOVERY_SOURCE_CODES)[number][] {
  const shuffled = [...DISCOVERY_SOURCE_CODES].filter((code) => code !== "other");
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return [...shuffled, "other"];
}

export type DiscoverySourceCopy = {
  step: string;
  title: string;
  description: string;
  options: ReadonlyArray<{
    code: DiscoverySource;
    label: string;
  }>;
};

const DISCOVERY_SOURCE_LABELS: Record<PrimaryUiLocale, Omit<DiscoverySourceCopy, "options"> & {
    options: Partial<Record<DiscoverySource, string>>;
}> = {
  ko: {
    step: "밍글을 알게 된 경로",
    title: "밍글을 어떻게 알게 되셨나요?",
    description: "더 나은 서비스를 만드는 데 참고할게요.",
    options: {
      friend: "친구나 지인의 추천",
      hellotalk: "HelloTalk",
      threads: "Threads",
      social_media_other: "Instagram·TikTok·YouTube·X 등",
      online_ad: "온라인 광고",
      google_search: "구글 검색",
      ai_recommendation: "ChatGPT 등 AI의 추천",
      app_store_search: "앱스토어·플레이스토어 검색",
      community: "온라인 커뮤니티·학교·회사",
      other: "기타",
      social_media: "Instagram·TikTok·YouTube·X 등",
      search: "구글 검색",
      app_store: "앱스토어·플레이스토어 검색",
    },
  },
  en: {
    step: "How you found Mingle",
    title: "How did you hear about Mingle?",
    description: "Your answer helps us improve Mingle.",
    options: {
      friend: "A friend or family member",
      hellotalk: "HelloTalk",
      threads: "Threads",
      social_media_other: "Instagram, TikTok, YouTube, X, etc.",
      online_ad: "An online ad",
      google_search: "Google Search",
      ai_recommendation: "ChatGPT or another AI",
      app_store_search: "App Store or Google Play search",
      community: "An online community, school, or workplace",
      other: "Other",
      social_media: "Instagram, TikTok, YouTube, X, etc.",
      search: "Google Search",
      app_store: "App Store or Google Play search",
    },
  },
  ja: {
    step: "Mingleを知ったきっかけ",
    title: "Mingleをどのように知りましたか？",
    description: "より良いMingleづくりの参考にします。",
    options: {
      friend: "友人や家族からの紹介",
      social_media: "SNSやオンライン広告",
      search: "検索",
      app_store: "App StoreやGoogle Play",
      community: "オンラインコミュニティ・学校・職場",
      other: "その他",
    },
  },
  "zh-CN": {
    step: "了解 Mingle 的渠道",
    title: "您是如何了解到 Mingle 的？",
    description: "您的回答将帮助我们改进 Mingle。",
    options: {
      friend: "朋友或家人推荐",
      social_media: "社交媒体或网络广告",
      search: "搜索",
      app_store: "App Store 或 Google Play",
      community: "在线社区、学校或工作场所",
      other: "其他",
    },
  },
  "zh-TW": {
    step: "認識 Mingle 的管道",
    title: "您是如何知道 Mingle 的？",
    description: "您的回答將幫助我們改善 Mingle。",
    options: {
      friend: "朋友或家人推薦",
      social_media: "社群媒體或網路廣告",
      search: "搜尋",
      app_store: "App Store 或 Google Play",
      community: "線上社群、學校或工作場所",
      other: "其他",
    },
  },
  fr: {
    step: "Comment vous avez connu Mingle",
    title: "Comment avez-vous connu Mingle ?",
    description: "Votre réponse nous aidera à améliorer Mingle.",
    options: {
      friend: "Par un ami ou un proche",
      social_media: "Réseaux sociaux ou publicité en ligne",
      search: "Recherche en ligne",
      app_store: "App Store ou Google Play",
      community: "Communauté en ligne, école ou travail",
      other: "Autre",
    },
  },
  de: {
    step: "Wie Sie Mingle gefunden haben",
    title: "Wie haben Sie von Mingle erfahren?",
    description: "Ihre Antwort hilft uns, Mingle zu verbessern.",
    options: {
      friend: "Empfehlung von Freunden oder Familie",
      social_media: "Soziale Medien oder Online-Werbung",
      search: "Suche",
      app_store: "App Store oder Google Play",
      community: "Online-Community, Schule oder Arbeitsplatz",
      other: "Sonstiges",
    },
  },
  es: {
    step: "Cómo conociste Mingle",
    title: "¿Cómo conociste Mingle?",
    description: "Tu respuesta nos ayuda a mejorar Mingle.",
    options: {
      friend: "Recomendación de un amigo o familiar",
      social_media: "Redes sociales o anuncio en línea",
      search: "Búsqueda en internet",
      app_store: "App Store o Google Play",
      community: "Comunidad en línea, escuela o trabajo",
      other: "Otro",
    },
  },
  pt: {
    step: "Como você conheceu o Mingle",
    title: "Como você ficou sabendo do Mingle?",
    description: "Sua resposta nos ajuda a melhorar o Mingle.",
    options: {
      friend: "Indicação de um amigo ou familiar",
      social_media: "Redes sociais ou anúncio online",
      search: "Pesquisa na internet",
      app_store: "App Store ou Google Play",
      community: "Comunidade online, escola ou trabalho",
      other: "Outro",
    },
  },
  it: {
    step: "Come hai conosciuto Mingle",
    title: "Come hai conosciuto Mingle?",
    description: "La tua risposta ci aiuta a migliorare Mingle.",
    options: {
      friend: "Consiglio di un amico o familiare",
      social_media: "Social media o pubblicità online",
      search: "Ricerca online",
      app_store: "App Store o Google Play",
      community: "Comunità online, scuola o lavoro",
      other: "Altro",
    },
  },
  ru: {
    step: "Как вы узнали о Mingle",
    title: "Как вы узнали о Mingle?",
    description: "Ваш ответ поможет нам улучшить Mingle.",
    options: {
      friend: "Совет друга или родственника",
      social_media: "Социальные сети или онлайн-реклама",
      search: "Поиск в интернете",
      app_store: "App Store или Google Play",
      community: "Онлайн-сообщество, учёба или работа",
      other: "Другое",
    },
  },
  ar: {
    step: "كيف عرفت Mingle",
    title: "كيف تعرفت على Mingle؟",
    description: "تساعدنا إجابتك على تحسين Mingle.",
    options: {
      friend: "ترشيح من صديق أو أحد أفراد العائلة",
      social_media: "وسائل التواصل الاجتماعي أو إعلان عبر الإنترنت",
      search: "البحث على الإنترنت",
      app_store: "App Store أو Google Play",
      community: "مجتمع عبر الإنترنت أو مدرسة أو مكان عمل",
      other: "أخرى",
    },
  },
  hi: {
    step: "आपको Mingle के बारे में कैसे पता चला",
    title: "आपको Mingle के बारे में कैसे पता चला?",
    description: "आपका जवाब Mingle को बेहतर बनाने में मदद करेगा।",
    options: {
      friend: "दोस्त या परिवार की सलाह",
      social_media: "सोशल मीडिया या ऑनलाइन विज्ञापन",
      search: "ऑनलाइन खोज",
      app_store: "App Store या Google Play",
      community: "ऑनलाइन समुदाय, स्कूल या कार्यस्थल",
      other: "अन्य",
    },
  },
  th: {
    step: "คุณรู้จัก Mingle ได้อย่างไร",
    title: "คุณรู้จัก Mingle ได้อย่างไร?",
    description: "คำตอบของคุณช่วยให้เราพัฒนา Mingle ได้ดีขึ้น",
    options: {
      friend: "เพื่อนหรือครอบครัวแนะนำ",
      social_media: "โซเชียลมีเดียหรือโฆษณาออนไลน์",
      search: "ค้นหาบนอินเทอร์เน็ต",
      app_store: "App Store หรือ Google Play",
      community: "ชุมชนออนไลน์ โรงเรียน หรือที่ทำงาน",
      other: "อื่น ๆ",
    },
  },
  vi: {
    step: "Bạn biết đến Mingle như thế nào",
    title: "Bạn biết đến Mingle như thế nào?",
    description: "Câu trả lời giúp chúng tôi cải thiện Mingle.",
    options: {
      friend: "Bạn bè hoặc gia đình giới thiệu",
      social_media: "Mạng xã hội hoặc quảng cáo trực tuyến",
      search: "Tìm kiếm trên mạng",
      app_store: "App Store hoặc Google Play",
      community: "Cộng đồng trực tuyến, trường học hoặc nơi làm việc",
      other: "Khác",
    },
  },
};

export function isDiscoverySource(value: unknown): value is DiscoverySource {
  return typeof value === "string"
    && (DISCOVERY_SOURCE_CODES as readonly string[]).includes(value);
}

export function resolveDiscoverySourceCopy(rawLocale: string): DiscoverySourceCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  const copy = DISCOVERY_SOURCE_LABELS[locale] ?? DISCOVERY_SOURCE_LABELS.en;
  return {
    step: copy.step,
    title: copy.title,
    description: copy.description,
    options: DISCOVERY_SOURCE_CODES.map((code) => ({
      code,
      label: copy.options[code] ?? DISCOVERY_SOURCE_LABELS.en.options[code] ?? code,
    })),
  };
}
