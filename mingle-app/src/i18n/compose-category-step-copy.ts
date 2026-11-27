import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/**
 * The first step of a new post (owner, 2026-11-27): only the kind of post is
 * asked, one tap each, then the write form opens under it. The hints of
 * "1 hour" and "voice talk" come from @/i18n/post-category-copy.
 */
export type ComposeCategoryStepCopy = {
  question: string;
  freeHint: string;
  introShort: string;
  change: string;
  /** The bottom button while nothing can be posted yet: on to the writing. */
  continue: string;
};

type Row = [question: string, freeHint: string, introShort: string, change: string, next: string];

const ROWS: Record<PrimaryUiLocale, Row> = {
  ko: ["어떤 글을 올릴까요?", "사진이나 생각을 자유롭게 올려요.", "취미와 함께 나를 소개해요.", "바꾸기", "계속"],
  en: ["What are you posting?", "Share a photo or a thought, anything goes.", "Introduce yourself with your hobbies.", "Change", "Continue"],
  ja: ["どんな投稿にしますか？", "写真や思ったことを自由に投稿します。", "趣味と一緒に自己紹介します。", "変更", "続ける"],
  "zh-CN": ["要发什么帖子？", "自由分享照片或想法。", "用爱好来介绍自己。", "更改", "继续"],
  "zh-TW": ["要發什麼貼文？", "自由分享照片或想法。", "用興趣來介紹自己。", "更改", "繼續"],
  fr: ["Que publiez-vous ?", "Une photo ou une idée, comme vous voulez.", "Présentez-vous avec vos loisirs.", "Changer", "Continuer"],
  de: ["Was möchtest du posten?", "Ein Foto oder ein Gedanke, ganz frei.", "Stell dich mit deinen Hobbys vor.", "Ändern", "Weiter"],
  es: ["¿Qué vas a publicar?", "Una foto o una idea, lo que quieras.", "Preséntate con tus aficiones.", "Cambiar", "Continuar"],
  pt: ["O que você vai postar?", "Uma foto ou uma ideia, do jeito que quiser.", "Apresente-se com seus hobbies.", "Trocar", "Continuar"],
  it: ["Cosa vuoi pubblicare?", "Una foto o un pensiero, come preferisci.", "Presentati con i tuoi hobby.", "Cambia", "Continua"],
  ru: ["Что вы публикуете?", "Фото или мысль, что угодно.", "Расскажите о себе и своих увлечениях.", "Изменить", "Продолжить"],
  ar: ["ماذا تريد أن تنشر؟", "صورة أو فكرة، كما تحب.", "عرّف بنفسك وبهواياتك.", "تغيير", "متابعة"],
  hi: ["आप क्या पोस्ट करेंगे?", "कोई फ़ोटो या ख़याल, जो चाहें।", "अपने शौक के साथ अपना परिचय दें।", "बदलें", "जारी रखें"],
  th: ["จะโพสต์อะไรดี?", "รูปหรือความคิด โพสต์ได้อิสระ", "แนะนำตัวพร้อมงานอดิเรก", "เปลี่ยน", "ต่อไป"],
  vi: ["Bạn muốn đăng gì?", "Một tấm ảnh hay một suy nghĩ, tùy bạn.", "Giới thiệu bản thân cùng sở thích.", "Đổi", "Tiếp tục"],
};

export function resolveComposeCategoryStepCopy(rawLocale: string): ComposeCategoryStepCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  const row = ROWS[locale] ?? ROWS.en;
  return { question: row[0], freeHint: row[1], introShort: row[2], change: row[3], continue: row[4] };
}
