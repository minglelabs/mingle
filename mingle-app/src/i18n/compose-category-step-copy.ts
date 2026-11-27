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
};

type Row = [question: string, freeHint: string, introShort: string, change: string];

const ROWS: Record<PrimaryUiLocale, Row> = {
  ko: ["어떤 글을 올릴까요?", "사진이나 생각을 자유롭게 올려요.", "취미와 함께 나를 소개해요.", "바꾸기"],
  en: ["What are you posting?", "Share a photo or a thought, anything goes.", "Introduce yourself with your hobbies.", "Change"],
  ja: ["どんな投稿にしますか？", "写真や思ったことを自由に投稿します。", "趣味と一緒に自己紹介します。", "変更"],
  "zh-CN": ["要发什么帖子？", "自由分享照片或想法。", "用爱好来介绍自己。", "更改"],
  "zh-TW": ["要發什麼貼文？", "自由分享照片或想法。", "用興趣來介紹自己。", "更改"],
  fr: ["Que publiez-vous ?", "Une photo ou une idée, comme vous voulez.", "Présentez-vous avec vos loisirs.", "Changer"],
  de: ["Was möchtest du posten?", "Ein Foto oder ein Gedanke, ganz frei.", "Stell dich mit deinen Hobbys vor.", "Ändern"],
  es: ["¿Qué vas a publicar?", "Una foto o una idea, lo que quieras.", "Preséntate con tus aficiones.", "Cambiar"],
  pt: ["O que você vai postar?", "Uma foto ou uma ideia, do jeito que quiser.", "Apresente-se com seus hobbies.", "Trocar"],
  it: ["Cosa vuoi pubblicare?", "Una foto o un pensiero, come preferisci.", "Presentati con i tuoi hobby.", "Cambia"],
  ru: ["Что вы публикуете?", "Фото или мысль, что угодно.", "Расскажите о себе и своих увлечениях.", "Изменить"],
  ar: ["ماذا تريد أن تنشر؟", "صورة أو فكرة، كما تحب.", "عرّف بنفسك وبهواياتك.", "تغيير"],
  hi: ["आप क्या पोस्ट करेंगे?", "कोई फ़ोटो या ख़याल, जो चाहें।", "अपने शौक के साथ अपना परिचय दें।", "बदलें"],
  th: ["จะโพสต์อะไรดี?", "รูปหรือความคิด โพสต์ได้อิสระ", "แนะนำตัวพร้อมงานอดิเรก", "เปลี่ยน"],
  vi: ["Bạn muốn đăng gì?", "Một tấm ảnh hay một suy nghĩ, tùy bạn.", "Giới thiệu bản thân cùng sở thích.", "Đổi"],
};

export function resolveComposeCategoryStepCopy(rawLocale: string): ComposeCategoryStepCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  const row = ROWS[locale] ?? ROWS.en;
  return { question: row[0], freeHint: row[1], introShort: row[2], change: row[3] };
}
