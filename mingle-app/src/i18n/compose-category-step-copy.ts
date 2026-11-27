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
  /** Under a "1 hour" post being written: "{time}" is when it would be deleted if posted now. */
  hourDeletesAt: string;
  /** On top of a voice talk post being written, beside the author's photo. */
  callHeadline: string;
};

type Row = [question: string, freeHint: string, introShort: string, change: string, next: string, hourDeletesAt: string, callHeadline: string];

const ROWS: Record<PrimaryUiLocale, Row> = {
  ko: ["어떤 글을 올릴까요?", "사진이나 생각을 자유롭게 올려요.", "취미와 함께 나를 소개해요.", "바꾸기", "계속", "지금 게시하면 {time}에 삭제돼요", "1대1 보이스톡해요!"],
  en: ["What are you posting?", "Share a photo or a thought, anything goes.", "Introduce yourself with your hobbies.", "Change", "Continue", "Post now and it’s deleted at {time}", "Let’s have a 1:1 voice talk!"],
  ja: ["どんな投稿にしますか？", "写真や思ったことを自由に投稿します。", "趣味と一緒に自己紹介します。", "変更", "続ける", "今投稿すると{time}に削除されます", "1対1でボイストークしましょう！"],
  "zh-CN": ["要发什么帖子？", "自由分享照片或想法。", "用爱好来介绍自己。", "更改", "继续", "现在发布将于 {time} 删除", "来一对一语音聊天吧！"],
  "zh-TW": ["要發什麼貼文？", "自由分享照片或想法。", "用興趣來介紹自己。", "更改", "繼續", "現在發布將於 {time} 刪除", "來一對一語音聊天吧！"],
  fr: ["Que publiez-vous ?", "Une photo ou une idée, comme vous voulez.", "Présentez-vous avec vos loisirs.", "Changer", "Continuer", "Publiée maintenant, supprimée à {time}", "Parlons en appel vocal 1:1 !"],
  de: ["Was möchtest du posten?", "Ein Foto oder ein Gedanke, ganz frei.", "Stell dich mit deinen Hobbys vor.", "Ändern", "Weiter", "Jetzt gepostet, um {time} gelöscht", "Lass uns 1:1 telefonieren!"],
  es: ["¿Qué vas a publicar?", "Una foto o una idea, lo que quieras.", "Preséntate con tus aficiones.", "Cambiar", "Continuar", "Si publicas ahora, se borra a las {time}", "¡Hablemos en una llamada 1:1!"],
  pt: ["O que você vai postar?", "Uma foto ou uma ideia, do jeito que quiser.", "Apresente-se com seus hobbies.", "Trocar", "Continuar", "Se postar agora, some às {time}", "Bora conversar numa chamada 1:1!"],
  it: ["Cosa vuoi pubblicare?", "Una foto o un pensiero, come preferisci.", "Presentati con i tuoi hobby.", "Cambia", "Continua", "Se pubblichi ora, sparisce alle {time}", "Facciamo una chiamata vocale 1:1!"],
  ru: ["Что вы публикуете?", "Фото или мысль, что угодно.", "Расскажите о себе и своих увлечениях.", "Изменить", "Продолжить", "Если опубликовать сейчас, удалится в {time}", "Давайте поговорим 1 на 1 голосом!"],
  ar: ["ماذا تريد أن تنشر؟", "صورة أو فكرة، كما تحب.", "عرّف بنفسك وبهواياتك.", "تغيير", "متابعة", "إذا نشرته الآن يُحذف عند {time}", "لنتحدث في مكالمة صوتية فردية!"],
  hi: ["आप क्या पोस्ट करेंगे?", "कोई फ़ोटो या ख़याल, जो चाहें।", "अपने शौक के साथ अपना परिचय दें।", "बदलें", "जारी रखें", "अभी पोस्ट करें तो {time} पर हट जाएगी", "चलो 1:1 वॉइस टॉक करें!"],
  th: ["จะโพสต์อะไรดี?", "รูปหรือความคิด โพสต์ได้อิสระ", "แนะนำตัวพร้อมงานอดิเรก", "เปลี่ยน", "ต่อไป", "โพสต์ตอนนี้ จะถูกลบเวลา {time}", "มาคุยเสียงแบบตัวต่อตัวกัน!"],
  vi: ["Bạn muốn đăng gì?", "Một tấm ảnh hay một suy nghĩ, tùy bạn.", "Giới thiệu bản thân cùng sở thích.", "Đổi", "Tiếp tục", "Đăng bây giờ sẽ bị xoá lúc {time}", "Cùng gọi thoại 1:1 nhé!"],
};

export function resolveComposeCategoryStepCopy(rawLocale: string): ComposeCategoryStepCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  const row = ROWS[locale] ?? ROWS.en;
  return { question: row[0], freeHint: row[1], introShort: row[2], change: row[3], continue: row[4], hourDeletesAt: row[5], callHeadline: row[6] };
}
