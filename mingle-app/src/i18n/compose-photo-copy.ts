import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/**
 * The photo-first write screen (owner, 2026-11-27): the big photo area on
 * top, the caption under it, and why the post button is not ready yet.
 * {max} is filled in.
 */
export type ComposePhotoCopy = {
  pickTitle: string;
  pickHint: string;
  addMore: string;
  captionPlaceholder: string;
  textOnly: string;
  previewLabel: string;
  needContent: string;
  textTooLong: string;
};

type Row = [pickTitle: string, pickHint: string, addMore: string, captionPlaceholder: string, textOnly: string, previewLabel: string, needContent: string, textTooLong: string];

const ROWS: Record<PrimaryUiLocale, Row> = {
  ko: ["사진 고르기", "여러 장 고를 수 있어요 · 최대 {max}장", "추가", "문구를 입력하세요…", "사진 없이 글만 올려도 돼요", "미리보기", "사진이나 글을 넣어 주세요", "글이 너무 길어요"],
  en: ["Choose photos", "Pick several · up to {max}", "Add", "Write a caption…", "You can also post text only", "Preview", "Add a photo or some text", "The text is too long"],
  ja: ["写真を選ぶ", "複数選べます · 最大{max}枚", "追加", "キャプションを入力…", "写真なしで文章だけでも投稿できます", "プレビュー", "写真か文章を入れてください", "文章が長すぎます"],
  "zh-CN": ["选择照片", "可多选 · 最多 {max} 张", "添加", "写点什么…", "不放照片只发文字也可以", "预览", "请添加照片或文字", "文字太长了"],
  "zh-TW": ["選擇照片", "可多選 · 最多 {max} 張", "新增", "寫點什麼…", "不放照片只發文字也可以", "預覽", "請加入照片或文字", "文字太長了"],
  fr: ["Choisir des photos", "Plusieurs possibles · jusqu’à {max}", "Ajouter", "Écrivez une légende…", "Vous pouvez aussi publier du texte seul", "Aperçu", "Ajoutez une photo ou du texte", "Le texte est trop long"],
  de: ["Fotos auswählen", "Mehrere möglich · bis zu {max}", "Hinzufügen", "Bildunterschrift schreiben…", "Du kannst auch nur Text posten", "Vorschau", "Füge ein Foto oder Text hinzu", "Der Text ist zu lang"],
  es: ["Elegir fotos", "Puedes elegir varias · hasta {max}", "Añadir", "Escribe un pie de foto…", "También puedes publicar solo texto", "Vista previa", "Añade una foto o texto", "El texto es demasiado largo"],
  pt: ["Escolher fotos", "Dá para escolher várias · até {max}", "Adicionar", "Escreva uma legenda…", "Você também pode postar só texto", "Prévia", "Adicione uma foto ou texto", "O texto está longo demais"],
  it: ["Scegli le foto", "Puoi sceglierne più di una · fino a {max}", "Aggiungi", "Scrivi una didascalia…", "Puoi anche pubblicare solo testo", "Anteprima", "Aggiungi una foto o del testo", "Il testo è troppo lungo"],
  ru: ["Выбрать фото", "Можно несколько · до {max}", "Добавить", "Напишите подпись…", "Можно опубликовать и только текст", "Предпросмотр", "Добавьте фото или текст", "Текст слишком длинный"],
  ar: ["اختيار الصور", "يمكنك اختيار عدة صور · حتى {max}", "إضافة", "اكتب تعليقًا…", "يمكنك أيضًا نشر نص فقط", "معاينة", "أضف صورة أو نصًا", "النص طويل جدًا"],
  hi: ["फ़ोटो चुनें", "कई चुन सकते हैं · ज़्यादा से ज़्यादा {max}", "जोड़ें", "कैप्शन लिखें…", "बिना फ़ोटो सिर्फ़ टेक्स्ट भी पोस्ट कर सकते हैं", "प्रीव्यू", "फ़ोटो या टेक्स्ट जोड़ें", "टेक्स्ट बहुत लंबा है"],
  th: ["เลือกรูป", "เลือกได้หลายรูป · สูงสุด {max} รูป", "เพิ่ม", "เขียนแคปชัน…", "โพสต์แค่ข้อความก็ได้", "ดูตัวอย่าง", "ใส่รูปหรือข้อความก่อน", "ข้อความยาวเกินไป"],
  vi: ["Chọn ảnh", "Chọn được nhiều ảnh · tối đa {max}", "Thêm", "Viết chú thích…", "Bạn cũng có thể chỉ đăng chữ", "Xem trước", "Hãy thêm ảnh hoặc chữ", "Nội dung quá dài"],
};

export function resolveComposePhotoCopy(rawLocale: string): ComposePhotoCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  const row = ROWS[locale] ?? ROWS.en;
  return {
    pickTitle: row[0], pickHint: row[1], addMore: row[2], captionPlaceholder: row[3], textOnly: row[4],
    previewLabel: row[5], needContent: row[6], textTooLong: row[7],
  };
}
