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
    step: "HashChat을 알게 된 경로",
    title: "HashChat을 어떻게 알게 되셨나요?",
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
    step: "How you found HashChat",
    title: "How did you hear about HashChat?",
    description: "Your answer helps us improve HashChat.",
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
    step: "HashChatを知ったきっかけ",
    title: "HashChatをどのように知りましたか？",
    description: "より良いHashChatづくりの参考にします。",
    options: {
      friend: "友人や家族からの紹介",
      hellotalk: "HelloTalk",
      threads: "Threads",
      social_media_other: "Instagram・TikTok・YouTube・Xなど",
      online_ad: "オンライン広告",
      google_search: "Google検索",
      ai_recommendation: "ChatGPTなどのAIのおすすめ",
      app_store_search: "App Store・Google Playでの検索",
      social_media: "SNSやオンライン広告",
      search: "検索",
      app_store: "App StoreやGoogle Play",
      community: "オンラインコミュニティ・学校・職場",
      other: "その他",
    },
  },
  "zh-CN": {
    step: "了解 HashChat 的渠道",
    title: "您是如何了解到 HashChat 的？",
    description: "您的回答将帮助我们改进 HashChat。",
    options: {
      friend: "朋友或家人推荐",
      hellotalk: "HelloTalk",
      threads: "Threads",
      social_media_other: "Instagram、TikTok、YouTube、X 等",
      online_ad: "网络广告",
      google_search: "Google 搜索",
      ai_recommendation: "ChatGPT 等 AI 推荐",
      app_store_search: "App Store 或 Google Play 搜索",
      social_media: "社交媒体或网络广告",
      search: "搜索",
      app_store: "App Store 或 Google Play",
      community: "在线社区、学校或工作场所",
      other: "其他",
    },
  },
  "zh-TW": {
    step: "認識 HashChat 的管道",
    title: "您是如何知道 HashChat 的？",
    description: "您的回答將幫助我們改善 HashChat。",
    options: {
      friend: "朋友或家人推薦",
      hellotalk: "HelloTalk",
      threads: "Threads",
      social_media_other: "Instagram、TikTok、YouTube、X 等",
      online_ad: "網路廣告",
      google_search: "Google 搜尋",
      ai_recommendation: "ChatGPT 等 AI 推薦",
      app_store_search: "App Store 或 Google Play 搜尋",
      social_media: "社群媒體或網路廣告",
      search: "搜尋",
      app_store: "App Store 或 Google Play",
      community: "線上社群、學校或工作場所",
      other: "其他",
    },
  },
  fr: {
    step: "Comment vous avez connu HashChat",
    title: "Comment avez-vous connu HashChat ?",
    description: "Votre réponse nous aidera à améliorer HashChat.",
    options: {
      friend: "Par un ami ou un proche",
      hellotalk: "HelloTalk",
      threads: "Threads",
      social_media_other: "Instagram, TikTok, YouTube, X, etc.",
      online_ad: "Une publicité en ligne",
      google_search: "Recherche Google",
      ai_recommendation: "ChatGPT ou une autre IA",
      app_store_search: "Recherche sur l’App Store ou Google Play",
      social_media: "Réseaux sociaux ou publicité en ligne",
      search: "Recherche en ligne",
      app_store: "App Store ou Google Play",
      community: "Communauté en ligne, école ou travail",
      other: "Autre",
    },
  },
  de: {
    step: "Wie Sie HashChat gefunden haben",
    title: "Wie haben Sie von HashChat erfahren?",
    description: "Ihre Antwort hilft uns, HashChat zu verbessern.",
    options: {
      friend: "Empfehlung von Freunden oder Familie",
      hellotalk: "HelloTalk",
      threads: "Threads",
      social_media_other: "Instagram, TikTok, YouTube, X usw.",
      online_ad: "Online-Werbung",
      google_search: "Google-Suche",
      ai_recommendation: "ChatGPT oder eine andere KI",
      app_store_search: "Suche im App Store oder bei Google Play",
      social_media: "Soziale Medien oder Online-Werbung",
      search: "Suche",
      app_store: "App Store oder Google Play",
      community: "Online-Community, Schule oder Arbeitsplatz",
      other: "Sonstiges",
    },
  },
  es: {
    step: "Cómo conociste HashChat",
    title: "¿Cómo conociste HashChat?",
    description: "Tu respuesta nos ayuda a mejorar HashChat.",
    options: {
      friend: "Recomendación de un amigo o familiar",
      hellotalk: "HelloTalk",
      threads: "Threads",
      social_media_other: "Instagram, TikTok, YouTube, X, etc.",
      online_ad: "Un anuncio en línea",
      google_search: "Búsqueda en Google",
      ai_recommendation: "ChatGPT u otra IA",
      app_store_search: "Búsqueda en App Store o Google Play",
      social_media: "Redes sociales o anuncio en línea",
      search: "Búsqueda en internet",
      app_store: "App Store o Google Play",
      community: "Comunidad en línea, escuela o trabajo",
      other: "Otro",
    },
  },
  pt: {
    step: "Como você conheceu o HashChat",
    title: "Como você ficou sabendo do HashChat?",
    description: "Sua resposta nos ajuda a melhorar o HashChat.",
    options: {
      friend: "Indicação de um amigo ou familiar",
      hellotalk: "HelloTalk",
      threads: "Threads",
      social_media_other: "Instagram, TikTok, YouTube, X etc.",
      online_ad: "Um anúncio online",
      google_search: "Pesquisa no Google",
      ai_recommendation: "ChatGPT ou outra IA",
      app_store_search: "Pesquisa na App Store ou no Google Play",
      social_media: "Redes sociais ou anúncio online",
      search: "Pesquisa na internet",
      app_store: "App Store ou Google Play",
      community: "Comunidade online, escola ou trabalho",
      other: "Outro",
    },
  },
  it: {
    step: "Come hai conosciuto HashChat",
    title: "Come hai conosciuto HashChat?",
    description: "La tua risposta ci aiuta a migliorare HashChat.",
    options: {
      friend: "Consiglio di un amico o familiare",
      hellotalk: "HelloTalk",
      threads: "Threads",
      social_media_other: "Instagram, TikTok, YouTube, X, ecc.",
      online_ad: "Una pubblicità online",
      google_search: "Ricerca Google",
      ai_recommendation: "ChatGPT o un’altra IA",
      app_store_search: "Ricerca su App Store o Google Play",
      social_media: "Social media o pubblicità online",
      search: "Ricerca online",
      app_store: "App Store o Google Play",
      community: "Comunità online, scuola o lavoro",
      other: "Altro",
    },
  },
  ru: {
    step: "Как вы узнали о HashChat",
    title: "Как вы узнали о HashChat?",
    description: "Ваш ответ поможет нам улучшить HashChat.",
    options: {
      friend: "Совет друга или родственника",
      hellotalk: "HelloTalk",
      threads: "Threads",
      social_media_other: "Instagram, TikTok, YouTube, X и др.",
      online_ad: "Реклама в интернете",
      google_search: "Поиск Google",
      ai_recommendation: "ChatGPT или другой ИИ",
      app_store_search: "Поиск в App Store или Google Play",
      social_media: "Социальные сети или онлайн-реклама",
      search: "Поиск в интернете",
      app_store: "App Store или Google Play",
      community: "Онлайн-сообщество, учёба или работа",
      other: "Другое",
    },
  },
  ar: {
    step: "كيف عرفت HashChat",
    title: "كيف تعرفت على HashChat؟",
    description: "تساعدنا إجابتك على تحسين HashChat.",
    options: {
      friend: "ترشيح من صديق أو أحد أفراد العائلة",
      hellotalk: "HelloTalk",
      threads: "Threads",
      social_media_other: "Instagram وTikTok وYouTube وX وغيرها",
      online_ad: "إعلان عبر الإنترنت",
      google_search: "بحث Google",
      ai_recommendation: "ChatGPT أو ذكاء اصطناعي آخر",
      app_store_search: "البحث في App Store أو Google Play",
      social_media: "وسائل التواصل الاجتماعي أو إعلان عبر الإنترنت",
      search: "البحث على الإنترنت",
      app_store: "App Store أو Google Play",
      community: "مجتمع عبر الإنترنت أو مدرسة أو مكان عمل",
      other: "أخرى",
    },
  },
  hi: {
    step: "आपको HashChat के बारे में कैसे पता चला",
    title: "आपको HashChat के बारे में कैसे पता चला?",
    description: "आपका जवाब HashChat को बेहतर बनाने में मदद करेगा।",
    options: {
      friend: "दोस्त या परिवार की सलाह",
      hellotalk: "HelloTalk",
      threads: "Threads",
      social_media_other: "Instagram, TikTok, YouTube, X आदि",
      online_ad: "ऑनलाइन विज्ञापन",
      google_search: "Google सर्च",
      ai_recommendation: "ChatGPT या कोई दूसरा AI",
      app_store_search: "App Store या Google Play पर खोज",
      social_media: "सोशल मीडिया या ऑनलाइन विज्ञापन",
      search: "ऑनलाइन खोज",
      app_store: "App Store या Google Play",
      community: "ऑनलाइन समुदाय, स्कूल या कार्यस्थल",
      other: "अन्य",
    },
  },
  th: {
    step: "คุณรู้จัก HashChat ได้อย่างไร",
    title: "คุณรู้จัก HashChat ได้อย่างไร?",
    description: "คำตอบของคุณช่วยให้เราพัฒนา HashChat ได้ดีขึ้น",
    options: {
      friend: "เพื่อนหรือครอบครัวแนะนำ",
      hellotalk: "HelloTalk",
      threads: "Threads",
      social_media_other: "Instagram, TikTok, YouTube, X ฯลฯ",
      online_ad: "โฆษณาออนไลน์",
      google_search: "ค้นหาใน Google",
      ai_recommendation: "ChatGPT หรือ AI อื่น ๆ",
      app_store_search: "ค้นหาใน App Store หรือ Google Play",
      social_media: "โซเชียลมีเดียหรือโฆษณาออนไลน์",
      search: "ค้นหาบนอินเทอร์เน็ต",
      app_store: "App Store หรือ Google Play",
      community: "ชุมชนออนไลน์ โรงเรียน หรือที่ทำงาน",
      other: "อื่น ๆ",
    },
  },
  vi: {
    step: "Bạn biết đến HashChat như thế nào",
    title: "Bạn biết đến HashChat như thế nào?",
    description: "Câu trả lời giúp chúng tôi cải thiện HashChat.",
    options: {
      friend: "Bạn bè hoặc gia đình giới thiệu",
      hellotalk: "HelloTalk",
      threads: "Threads",
      social_media_other: "Instagram, TikTok, YouTube, X, v.v.",
      online_ad: "Quảng cáo trực tuyến",
      google_search: "Tìm kiếm Google",
      ai_recommendation: "ChatGPT hoặc AI khác",
      app_store_search: "Tìm kiếm trên App Store hoặc Google Play",
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
