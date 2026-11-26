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
  /** The app's own gallery (labels sent with the request). */
  galleryNext: string;
  galleryClose: string;
  galleryLimited: string;
  galleryDenied: string;
  galleryOpenSettings: string;
};

type Row = [pickTitle: string, pickHint: string, addMore: string, captionPlaceholder: string, textOnly: string, previewLabel: string, needContent: string, textTooLong: string,
  galleryNext: string, galleryClose: string, galleryLimited: string, galleryDenied: string, galleryOpenSettings: string];

const ROWS: Record<PrimaryUiLocale, Row> = {
  ko: ["사진 고르기", "여러 장 고를 수 있어요 · 최대 {max}장", "추가", "문구를 입력하세요…", "사진 없이 글만 올려도 돼요", "미리보기", "사진이나 글을 넣어 주세요", "글이 너무 길어요", "다음", "닫기", "사진 더 보기 허용", "사진을 여기서 고르려면 사진 접근을 허용해 주세요.", "설정 열기"],
  en: ["Choose photos", "Pick several · up to {max}", "Add", "Write a caption…", "You can also post text only", "Preview", "Add a photo or some text", "The text is too long", "Next", "Close", "Allow more photos", "Allow access to your photos to pick them here.", "Open Settings"],
  ja: ["写真を選ぶ", "複数選べます · 最大{max}枚", "追加", "キャプションを入力…", "写真なしで文章だけでも投稿できます", "プレビュー", "写真か文章を入れてください", "文章が長すぎます", "次へ", "閉じる", "ほかの写真も許可", "ここで写真を選ぶには写真へのアクセスを許可してください。", "設定を開く"],
  "zh-CN": ["选择照片", "可多选 · 最多 {max} 张", "添加", "写点什么…", "不放照片只发文字也可以", "预览", "请添加照片或文字", "文字太长了", "下一步", "关闭", "允许更多照片", "要在这里选照片，请允许访问照片。", "打开设置"],
  "zh-TW": ["選擇照片", "可多選 · 最多 {max} 張", "新增", "寫點什麼…", "不放照片只發文字也可以", "預覽", "請加入照片或文字", "文字太長了", "下一步", "關閉", "允許更多照片", "要在這裡選照片，請允許取用照片。", "開啟設定"],
  fr: ["Choisir des photos", "Plusieurs possibles · jusqu’à {max}", "Ajouter", "Écrivez une légende…", "Vous pouvez aussi publier du texte seul", "Aperçu", "Ajoutez une photo ou du texte", "Le texte est trop long", "Suivant", "Fermer", "Autoriser plus de photos", "Autorisez l’accès à vos photos pour les choisir ici.", "Ouvrir les réglages"],
  de: ["Fotos auswählen", "Mehrere möglich · bis zu {max}", "Hinzufügen", "Bildunterschrift schreiben…", "Du kannst auch nur Text posten", "Vorschau", "Füge ein Foto oder Text hinzu", "Der Text ist zu lang", "Weiter", "Schließen", "Mehr Fotos erlauben", "Erlaube den Zugriff auf deine Fotos, um sie hier auszuwählen.", "Einstellungen öffnen"],
  es: ["Elegir fotos", "Puedes elegir varias · hasta {max}", "Añadir", "Escribe un pie de foto…", "También puedes publicar solo texto", "Vista previa", "Añade una foto o texto", "El texto es demasiado largo", "Siguiente", "Cerrar", "Permitir más fotos", "Permite el acceso a tus fotos para elegirlas aquí.", "Abrir Ajustes"],
  pt: ["Escolher fotos", "Dá para escolher várias · até {max}", "Adicionar", "Escreva uma legenda…", "Você também pode postar só texto", "Prévia", "Adicione uma foto ou texto", "O texto está longo demais", "Avançar", "Fechar", "Permitir mais fotos", "Permita o acesso às suas fotos para escolhê-las aqui.", "Abrir Ajustes"],
  it: ["Scegli le foto", "Puoi sceglierne più di una · fino a {max}", "Aggiungi", "Scrivi una didascalia…", "Puoi anche pubblicare solo testo", "Anteprima", "Aggiungi una foto o del testo", "Il testo è troppo lungo", "Avanti", "Chiudi", "Consenti altre foto", "Consenti l’accesso alle foto per sceglierle qui.", "Apri Impostazioni"],
  ru: ["Выбрать фото", "Можно несколько · до {max}", "Добавить", "Напишите подпись…", "Можно опубликовать и только текст", "Предпросмотр", "Добавьте фото или текст", "Текст слишком длинный", "Далее", "Закрыть", "Разрешить другие фото", "Разрешите доступ к фото, чтобы выбирать их здесь.", "Открыть настройки"],
  ar: ["اختيار الصور", "يمكنك اختيار عدة صور · حتى {max}", "إضافة", "اكتب تعليقًا…", "يمكنك أيضًا نشر نص فقط", "معاينة", "أضف صورة أو نصًا", "النص طويل جدًا", "التالي", "إغلاق", "السماح بمزيد من الصور", "اسمح بالوصول إلى صورك لاختيارها هنا.", "فتح الإعدادات"],
  hi: ["फ़ोटो चुनें", "कई चुन सकते हैं · ज़्यादा से ज़्यादा {max}", "जोड़ें", "कैप्शन लिखें…", "बिना फ़ोटो सिर्फ़ टेक्स्ट भी पोस्ट कर सकते हैं", "प्रीव्यू", "फ़ोटो या टेक्स्ट जोड़ें", "टेक्स्ट बहुत लंबा है", "आगे", "बंद करें", "और फ़ोटो की अनुमति दें", "यहाँ फ़ोटो चुनने के लिए फ़ोटो की अनुमति दें।", "सेटिंग खोलें"],
  th: ["เลือกรูป", "เลือกได้หลายรูป · สูงสุด {max} รูป", "เพิ่ม", "เขียนแคปชัน…", "โพสต์แค่ข้อความก็ได้", "ดูตัวอย่าง", "ใส่รูปหรือข้อความก่อน", "ข้อความยาวเกินไป", "ถัดไป", "ปิด", "อนุญาตรูปเพิ่ม", "อนุญาตให้เข้าถึงรูปเพื่อเลือกรูปที่นี่", "เปิดการตั้งค่า"],
  vi: ["Chọn ảnh", "Chọn được nhiều ảnh · tối đa {max}", "Thêm", "Viết chú thích…", "Bạn cũng có thể chỉ đăng chữ", "Xem trước", "Hãy thêm ảnh hoặc chữ", "Nội dung quá dài", "Tiếp", "Đóng", "Cho phép thêm ảnh", "Hãy cho phép truy cập ảnh để chọn ảnh tại đây.", "Mở Cài đặt"],
};

export function resolveComposePhotoCopy(rawLocale: string): ComposePhotoCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  const row = ROWS[locale] ?? ROWS.en;
  return {
    pickTitle: row[0], pickHint: row[1], addMore: row[2], captionPlaceholder: row[3], textOnly: row[4],
    previewLabel: row[5], needContent: row[6], textTooLong: row[7],
    galleryNext: row[8], galleryClose: row[9], galleryLimited: row[10], galleryDenied: row[11], galleryOpenSettings: row[12],
  };
}
