import {
  resolvePrimaryUiLocaleTag,
  type PrimaryUiLocale,
} from "@/i18n/mingle-locales";

// What the user mostly uses HashChat for, asked once during onboarding.
// "work" users (meetings, sales calls) need long utterances, so they start
// with the longest automatic-detection step instead of the middle one.
export const USAGE_PURPOSE_CODES = ["social", "work", "other"] as const;

export type UsagePurpose = (typeof USAGE_PURPOSE_CODES)[number];

export function isUsagePurpose(value: unknown): value is UsagePurpose {
  return typeof value === "string"
    && (USAGE_PURPOSE_CODES as readonly string[]).includes(value);
}

/** Speech split defaults to store with the purpose, or null to keep the account defaults. */
export function resolveUsagePurposeSegmentationDefaults(purpose: UsagePurpose): {
  sttSegmentationMode: "end";
  demoEndpointTuningStep: number;
} | null {
  if (purpose !== "work") return null;
  return { sttSegmentationMode: "end", demoEndpointTuningStep: 4 };
}

export type UsagePurposeCopy = {
  step: string;
  title: string;
  description: string;
  options: ReadonlyArray<{
    code: UsagePurpose;
    label: string;
    hint: string;
  }>;
};

type UsagePurposeLabels = Omit<UsagePurposeCopy, "options"> & {
  options: Record<UsagePurpose, { label: string; hint: string }>;
};

const USAGE_PURPOSE_LABELS: Record<PrimaryUiLocale, UsagePurposeLabels> = {
  ko: {
    step: "사용 목적",
    title: "HashChat을 주로 언제 쓰실 건가요?",
    description: "목적에 맞게 대화 설정을 맞춰 둘게요.",
    options: {
      social: { label: "친구·언어교환", hint: "외국인 친구와 수다, 언어교환, 여행" },
      work: { label: "일·비즈니스", hint: "회의, 미팅, 영업, 업무 통역" },
      other: { label: "기타", hint: "그 밖의 용도" },
    },
  },
  en: {
    step: "What it's for",
    title: "What will you mostly use HashChat for?",
    description: "We'll set up your conversations to fit.",
    options: {
      social: { label: "Friends & language exchange", hint: "Chatting, language exchange, travel" },
      work: { label: "Work & business", hint: "Meetings, sales calls, work interpreting" },
      other: { label: "Something else", hint: "Any other use" },
    },
  },
  ja: {
    step: "利用目的",
    title: "HashChatを主に何に使いますか？",
    description: "目的に合わせて会話の設定を調整します。",
    options: {
      social: { label: "友だち・言語交換", hint: "外国の友だちとの会話、言語交換、旅行" },
      work: { label: "仕事・ビジネス", hint: "会議、商談、営業、業務での通訳" },
      other: { label: "その他", hint: "そのほかの用途" },
    },
  },
  "zh-CN": {
    step: "使用目的",
    title: "你主要会在什么场合使用 HashChat？",
    description: "我们会按用途为你调整对话设置。",
    options: {
      social: { label: "交友·语言交换", hint: "和外国朋友聊天、语言交换、旅行" },
      work: { label: "工作·商务", hint: "会议、洽谈、销售、工作口译" },
      other: { label: "其他", hint: "其他用途" },
    },
  },
  "zh-TW": {
    step: "使用目的",
    title: "你主要會在什麼場合使用 HashChat？",
    description: "我們會依用途為你調整對話設定。",
    options: {
      social: { label: "交友·語言交換", hint: "和外國朋友聊天、語言交換、旅行" },
      work: { label: "工作·商務", hint: "會議、洽談、業務、工作口譯" },
      other: { label: "其他", hint: "其他用途" },
    },
  },
  fr: {
    step: "Votre usage",
    title: "Pour quoi utiliserez-vous surtout HashChat ?",
    description: "Nous adapterons vos conversations en conséquence.",
    options: {
      social: { label: "Amis et échange linguistique", hint: "Discuter, échange linguistique, voyage" },
      work: { label: "Travail et affaires", hint: "Réunions, rendez-vous clients, interprétation" },
      other: { label: "Autre chose", hint: "Tout autre usage" },
    },
  },
  de: {
    step: "Wofür",
    title: "Wofür nutzt du HashChat hauptsächlich?",
    description: "Wir passen deine Gespräche daran an.",
    options: {
      social: { label: "Freunde & Sprachaustausch", hint: "Plaudern, Sprachaustausch, Reisen" },
      work: { label: "Arbeit & Business", hint: "Meetings, Kundengespräche, Dolmetschen im Job" },
      other: { label: "Etwas anderes", hint: "Andere Zwecke" },
    },
  },
  es: {
    step: "Para qué lo usarás",
    title: "¿Para qué usarás HashChat principalmente?",
    description: "Ajustaremos tus conversaciones a ese uso.",
    options: {
      social: { label: "Amigos e intercambio de idiomas", hint: "Charlar, intercambio de idiomas, viajes" },
      work: { label: "Trabajo y negocios", hint: "Reuniones, ventas, interpretación laboral" },
      other: { label: "Otra cosa", hint: "Cualquier otro uso" },
    },
  },
  pt: {
    step: "Para que vai usar",
    title: "Para que você vai usar mais o HashChat?",
    description: "Vamos ajustar suas conversas para esse uso.",
    options: {
      social: { label: "Amigos e troca de idiomas", hint: "Bate-papo, troca de idiomas, viagens" },
      work: { label: "Trabalho e negócios", hint: "Reuniões, vendas, interpretação no trabalho" },
      other: { label: "Outra coisa", hint: "Qualquer outro uso" },
    },
  },
  it: {
    step: "A cosa ti serve",
    title: "Per cosa userai soprattutto HashChat?",
    description: "Adatteremo le conversazioni a questo uso.",
    options: {
      social: { label: "Amici e scambio linguistico", hint: "Chiacchiere, scambio linguistico, viaggi" },
      work: { label: "Lavoro e affari", hint: "Riunioni, vendite, interpretariato di lavoro" },
      other: { label: "Altro", hint: "Qualsiasi altro uso" },
    },
  },
  ru: {
    step: "Для чего",
    title: "Для чего вы чаще всего будете использовать HashChat?",
    description: "Мы настроим разговоры под эту цель.",
    options: {
      social: { label: "Друзья и языковой обмен", hint: "Общение, языковой обмен, путешествия" },
      work: { label: "Работа и бизнес", hint: "Встречи, продажи, перевод по работе" },
      other: { label: "Другое", hint: "Любая другая цель" },
    },
  },
  ar: {
    step: "الغرض من الاستخدام",
    title: "لأي غرض ستستخدم HashChat غالبًا؟",
    description: "سنضبط إعدادات المحادثة بما يناسب ذلك.",
    options: {
      social: { label: "الأصدقاء وتبادل اللغات", hint: "الدردشة، تبادل اللغات، السفر" },
      work: { label: "العمل والأعمال", hint: "الاجتماعات، المبيعات، الترجمة في العمل" },
      other: { label: "غرض آخر", hint: "أي استخدام آخر" },
    },
  },
  hi: {
    step: "किस लिए",
    title: "आप HashChat का ज़्यादातर किस लिए इस्तेमाल करेंगे?",
    description: "हम आपकी बातचीत की सेटिंग उसी हिसाब से रखेंगे।",
    options: {
      social: { label: "दोस्त और भाषा अभ्यास", hint: "गपशप, भाषा अभ्यास, यात्रा" },
      work: { label: "काम और बिज़नेस", hint: "मीटिंग, सेल्स, काम के लिए अनुवाद" },
      other: { label: "कुछ और", hint: "कोई और इस्तेमाल" },
    },
  },
  th: {
    step: "จุดประสงค์การใช้",
    title: "คุณจะใช้ HashChat ทำอะไรเป็นหลัก?",
    description: "เราจะปรับการตั้งค่าการสนทนาให้เหมาะกับคุณ",
    options: {
      social: { label: "เพื่อนและแลกเปลี่ยนภาษา", hint: "คุยเล่น แลกเปลี่ยนภาษา ท่องเที่ยว" },
      work: { label: "งานและธุรกิจ", hint: "ประชุม การขาย ล่ามในงาน" },
      other: { label: "อื่น ๆ", hint: "การใช้งานอื่น" },
    },
  },
  vi: {
    step: "Mục đích sử dụng",
    title: "Bạn sẽ dùng HashChat chủ yếu để làm gì?",
    description: "Chúng tôi sẽ điều chỉnh cài đặt hội thoại cho phù hợp.",
    options: {
      social: { label: "Bạn bè và trao đổi ngôn ngữ", hint: "Trò chuyện, trao đổi ngôn ngữ, du lịch" },
      work: { label: "Công việc và kinh doanh", hint: "Họp, bán hàng, phiên dịch công việc" },
      other: { label: "Mục đích khác", hint: "Bất kỳ mục đích nào khác" },
    },
  },
};

export function resolveUsagePurposeCopy(rawLocale: string): UsagePurposeCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  const copy = USAGE_PURPOSE_LABELS[locale] ?? USAGE_PURPOSE_LABELS.en;
  return {
    step: copy.step,
    title: copy.title,
    description: copy.description,
    options: USAGE_PURPOSE_CODES.map((code) => ({ code, ...copy.options[code] })),
  };
}
