import {
  resolvePrimaryUiLocaleTag,
  type PrimaryUiLocale,
} from "@/i18n/mingle-locales";

// What the user mostly uses HashChat for, asked once during onboarding.
// Work users (meetings, sales calls) need long utterances, so they start on
// silence-based split with a 3s silence. Everyone else starts on the longest
// automatic-detection step (step 5 of 5).
export const USAGE_PURPOSE_CODES = ["social", "work", "other"] as const;

export type UsagePurpose = (typeof USAGE_PURPOSE_CODES)[number];

export const USAGE_PURPOSE_NOTE_MAX_LENGTH = 200;

export function normalizeUsagePurposeNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const note = value.trim().slice(0, USAGE_PURPOSE_NOTE_MAX_LENGTH);
  return note.length > 0 ? note : null;
}

export function isUsagePurpose(value: unknown): value is UsagePurpose {
  return typeof value === "string"
    && (USAGE_PURPOSE_CODES as readonly string[]).includes(value);
}

export type UsagePurposeSegmentationDefaults =
  | { sttSegmentationMode: "fin"; demoSilenceFinalizeMs: number }
  | { sttSegmentationMode: "end"; demoEndpointTuningStep: number };

/** Speech split defaults stored together with the purpose. */
export function resolveUsagePurposeSegmentationDefaults(
  purpose: UsagePurpose,
): UsagePurposeSegmentationDefaults {
  if (purpose === "work") return { sttSegmentationMode: "fin", demoSilenceFinalizeMs: 3000 };
  return { sttSegmentationMode: "end", demoEndpointTuningStep: 4 };
}

export type UsagePurposeCopy = {
  step: string;
  title: string;
  /** Placeholder of the optional free-text reason shown under "other". */
  otherNotePlaceholder: string;
  options: ReadonlyArray<{
    code: UsagePurpose;
    label: string;
    hint: string | null;
  }>;
};

type UsagePurposeLabels = Omit<UsagePurposeCopy, "options"> & {
  options: Record<UsagePurpose, { label: string; hint: string | null }>;
};

const USAGE_PURPOSE_LABELS: Record<PrimaryUiLocale, UsagePurposeLabels> = {
  ko: {
    step: "사용 목적",
    title: "HashChat을 주로 언제 쓰실 건가요?",
    otherNotePlaceholder: "어떤 용도인지 적어주세요 (선택)",
    options: {
      social: { label: "수다용", hint: "외국인 친구와 수다, 언어교환, 여행 등 가벼운 대화" },
      work: { label: "업무용", hint: "회의, 영업 등 진지한 업무용 대화의 통번역" },
      other: { label: "기타", hint: null },
    },
  },
  en: {
    step: "What it's for",
    title: "What will you mostly use HashChat for?",
    otherNotePlaceholder: "Tell us what you'll use it for (optional)",
    options: {
      social: { label: "Casual chats", hint: "Chatting with friends abroad, language exchange, travel" },
      work: { label: "Work", hint: "Interpreting and translation for serious work conversations like meetings and sales" },
      other: { label: "Other", hint: null },
    },
  },
  ja: {
    step: "利用目的",
    title: "HashChatを主に何に使いますか？",
    otherNotePlaceholder: "用途を教えてください（任意）",
    options: {
      social: { label: "おしゃべり用", hint: "外国の友だちとの雑談、言語交換、旅行などの気軽な会話" },
      work: { label: "仕事用", hint: "会議や営業など、真剣な業務会話の通訳・翻訳" },
      other: { label: "その他", hint: null },
    },
  },
  "zh-CN": {
    step: "使用目的",
    title: "你主要会在什么场合使用 HashChat？",
    otherNotePlaceholder: "写下你的用途（选填）",
    options: {
      social: { label: "聊天用", hint: "和外国朋友闲聊、语言交换、旅行等轻松对话" },
      work: { label: "工作用", hint: "会议、销售等严肃工作对话的口译和翻译" },
      other: { label: "其他", hint: null },
    },
  },
  "zh-TW": {
    step: "使用目的",
    title: "你主要會在什麼場合使用 HashChat？",
    otherNotePlaceholder: "寫下你的用途（選填）",
    options: {
      social: { label: "聊天用", hint: "和外國朋友閒聊、語言交換、旅行等輕鬆對話" },
      work: { label: "工作用", hint: "會議、業務等嚴肅工作對話的口譯和翻譯" },
      other: { label: "其他", hint: null },
    },
  },
  fr: {
    step: "Votre usage",
    title: "Pour quoi utiliserez-vous surtout HashChat ?",
    otherNotePlaceholder: "Dites-nous à quoi il vous servira (facultatif)",
    options: {
      social: { label: "Discussions", hint: "Discuter avec des amis étrangers, échange linguistique, voyage" },
      work: { label: "Travail", hint: "Interprétation et traduction pour des conversations professionnelles sérieuses, comme les réunions et les ventes" },
      other: { label: "Autre", hint: null },
    },
  },
  de: {
    step: "Wofür",
    title: "Wofür nutzt du HashChat hauptsächlich?",
    otherNotePlaceholder: "Wofür nutzt du es? (optional)",
    options: {
      social: { label: "Zum Plaudern", hint: "Plaudern mit Freunden aus dem Ausland, Sprachaustausch, Reisen" },
      work: { label: "Für die Arbeit", hint: "Dolmetschen und Übersetzen für ernste Arbeitsgespräche wie Meetings und Vertrieb" },
      other: { label: "Sonstiges", hint: null },
    },
  },
  es: {
    step: "Para qué lo usarás",
    title: "¿Para qué usarás HashChat principalmente?",
    otherNotePlaceholder: "Cuéntanos para qué lo usarás (opcional)",
    options: {
      social: { label: "Para charlar", hint: "Charlar con amigos extranjeros, intercambio de idiomas, viajes" },
      work: { label: "Para trabajar", hint: "Interpretación y traducción para conversaciones de trabajo serias, como reuniones y ventas" },
      other: { label: "Otro", hint: null },
    },
  },
  pt: {
    step: "Para que vai usar",
    title: "Para que você vai usar mais o HashChat?",
    otherNotePlaceholder: "Conte para que vai usar (opcional)",
    options: {
      social: { label: "Para conversar", hint: "Bate-papo com amigos estrangeiros, troca de idiomas, viagens" },
      work: { label: "Para trabalho", hint: "Interpretação e tradução para conversas de trabalho sérias, como reuniões e vendas" },
      other: { label: "Outro", hint: null },
    },
  },
  it: {
    step: "A cosa ti serve",
    title: "Per cosa userai soprattutto HashChat?",
    otherNotePlaceholder: "Dicci per cosa lo userai (facoltativo)",
    options: {
      social: { label: "Per chiacchierare", hint: "Chiacchiere con amici stranieri, scambio linguistico, viaggi" },
      work: { label: "Per lavoro", hint: "Interpretariato e traduzione per conversazioni di lavoro serie, come riunioni e vendite" },
      other: { label: "Altro", hint: null },
    },
  },
  ru: {
    step: "Для чего",
    title: "Для чего вы чаще всего будете использовать HashChat?",
    otherNotePlaceholder: "Напишите, для чего (необязательно)",
    options: {
      social: { label: "Для общения", hint: "Болтать с друзьями из других стран, языковой обмен, путешествия" },
      work: { label: "Для работы", hint: "Устный и письменный перевод серьёзных рабочих разговоров: встречи, продажи" },
      other: { label: "Другое", hint: null },
    },
  },
  ar: {
    step: "الغرض من الاستخدام",
    title: "لأي غرض ستستخدم HashChat غالبًا؟",
    otherNotePlaceholder: "أخبرنا بالغرض (اختياري)",
    options: {
      social: { label: "للدردشة", hint: "الدردشة مع أصدقاء من الخارج، تبادل اللغات، السفر" },
      work: { label: "للعمل", hint: "الترجمة الفورية والتحريرية لمحادثات العمل الجادة مثل الاجتماعات والمبيعات" },
      other: { label: "أخرى", hint: null },
    },
  },
  hi: {
    step: "किस लिए",
    title: "आप HashChat का ज़्यादातर किस लिए इस्तेमाल करेंगे?",
    otherNotePlaceholder: "बताएं किस लिए (वैकल्पिक)",
    options: {
      social: { label: "गपशप के लिए", hint: "विदेशी दोस्तों से गपशप, भाषा अभ्यास, यात्रा" },
      work: { label: "काम के लिए", hint: "मीटिंग, सेल्स जैसी गंभीर काम की बातचीत का अनुवाद और दुभाषिया" },
      other: { label: "अन्य", hint: null },
    },
  },
  th: {
    step: "จุดประสงค์การใช้",
    title: "คุณจะใช้ HashChat ทำอะไรเป็นหลัก?",
    otherNotePlaceholder: "บอกเราว่าจะใช้ทำอะไร (ไม่บังคับ)",
    options: {
      social: { label: "คุยเล่น", hint: "คุยกับเพื่อนต่างชาติ แลกเปลี่ยนภาษา ท่องเที่ยว" },
      work: { label: "ใช้ทำงาน", hint: "ล่ามและแปลสำหรับบทสนทนาการทำงานที่จริงจัง เช่น การประชุมและการขาย" },
      other: { label: "อื่น ๆ", hint: null },
    },
  },
  vi: {
    step: "Mục đích sử dụng",
    title: "Bạn sẽ dùng HashChat chủ yếu để làm gì?",
    otherNotePlaceholder: "Cho chúng tôi biết bạn dùng để làm gì (không bắt buộc)",
    options: {
      social: { label: "Trò chuyện", hint: "Trò chuyện với bạn nước ngoài, trao đổi ngôn ngữ, du lịch" },
      work: { label: "Công việc", hint: "Phiên dịch và dịch cho các cuộc trò chuyện công việc nghiêm túc như họp, bán hàng" },
      other: { label: "Khác", hint: null },
    },
  },
};

export function resolveUsagePurposeCopy(rawLocale: string): UsagePurposeCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  const copy = USAGE_PURPOSE_LABELS[locale] ?? USAGE_PURPOSE_LABELS.en;
  return {
    step: copy.step,
    title: copy.title,
    otherNotePlaceholder: copy.otherNotePlaceholder,
    options: USAGE_PURPOSE_CODES.map((code) => ({ code, ...copy.options[code] })),
  };
}
