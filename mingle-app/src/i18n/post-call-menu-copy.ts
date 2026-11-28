import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/** The language button and the menu on the 1:1 voice talk screen (owner, 2026-11-26). */
export type PostCallMenuCopy = {
  menu: string;
  /** The language the viewer hears and reads the other person in. */
  language: string;
  languageHint: string;
  search: string;
  /** Next to the viewer's first comfortable language. */
  defaultBadge: string;
  textSize: string;
  small: string;
  medium: string;
  large: string;
  profile: string;
  report: string;
  block: string;
  blockFailed: string;
  close: string;
};

type Row = [
  menu: string, language: string, languageHint: string, search: string, defaultBadge: string, textSize: string,
  small: string, medium: string, large: string, profile: string, report: string, block: string, blockFailed: string, close: string,
];

const ROWS: Record<PrimaryUiLocale, Row> = {
  ko: ["통화 메뉴", "번역 받을 언어", "상대의 말과 글을 이 언어로 번역해 드려요.", "언어 검색", "기본", "글자 크기", "작게", "보통", "크게", "프로필 보기", "신고하기", "차단하고 끊기", "차단하지 못했어요. 잠시 후 다시 시도해 주세요.", "닫기"],
  en: ["Call menu", "Translate into", "What the other person says and writes is translated into this language.", "Search languages", "Default", "Text size", "Small", "Medium", "Large", "View profile", "Report", "Block and hang up", "Could not block. Please try again.", "Close"],
  ja: ["通話メニュー", "翻訳する言語", "相手の話した言葉と書いた文をこの言語に翻訳します。", "言語を検索", "デフォルト", "文字サイズ", "小", "中", "大", "プロフィールを見る", "報告する", "ブロックして切る", "ブロックできませんでした。もう一度お試しください。", "閉じる"],
  "zh-CN": ["通话菜单", "翻译成", "对方说的话和写的字会翻译成这种语言。", "搜索语言", "默认", "字体大小", "小", "中", "大", "查看资料", "举报", "拉黑并挂断", "无法拉黑，请稍后再试。", "关闭"],
  "zh-TW": ["通話選單", "翻譯成", "對方說的話和寫的字會翻譯成這種語言。", "搜尋語言", "預設", "字體大小", "小", "中", "大", "查看個人資料", "檢舉", "封鎖並掛斷", "無法封鎖，請稍後再試。", "關閉"],
  fr: ["Menu de l’appel", "Traduire en", "Ce que l’autre personne dit et écrit est traduit dans cette langue.", "Rechercher une langue", "Par défaut", "Taille du texte", "Petite", "Moyenne", "Grande", "Voir le profil", "Signaler", "Bloquer et raccrocher", "Blocage impossible. Réessayez.", "Fermer"],
  de: ["Anrufmenü", "Übersetzen in", "Was die andere Person sagt und schreibt, wird in diese Sprache übersetzt.", "Sprache suchen", "Standard", "Textgröße", "Klein", "Mittel", "Groß", "Profil ansehen", "Melden", "Blockieren und auflegen", "Blockieren fehlgeschlagen. Bitte erneut versuchen.", "Schließen"],
  es: ["Menú de la llamada", "Traducir al", "Lo que la otra persona dice y escribe se traduce a este idioma.", "Buscar idioma", "Predeterminado", "Tamaño del texto", "Pequeño", "Mediano", "Grande", "Ver perfil", "Denunciar", "Bloquear y colgar", "No se pudo bloquear. Inténtalo de nuevo.", "Cerrar"],
  pt: ["Menu da chamada", "Traduzir para", "O que a outra pessoa diz e escreve é traduzido para este idioma.", "Buscar idioma", "Padrão", "Tamanho do texto", "Pequeno", "Médio", "Grande", "Ver perfil", "Denunciar", "Bloquear e desligar", "Não foi possível bloquear. Tente novamente.", "Fechar"],
  it: ["Menu chiamata", "Traduci in", "Ciò che l’altra persona dice e scrive viene tradotto in questa lingua.", "Cerca lingua", "Predefinita", "Dimensione testo", "Piccolo", "Medio", "Grande", "Vedi profilo", "Segnala", "Blocca e riaggancia", "Impossibile bloccare. Riprova.", "Chiudi"],
  ru: ["Меню звонка", "Переводить на", "Сказанное и написанное собеседником переводится на этот язык.", "Поиск языка", "По умолчанию", "Размер текста", "Мелкий", "Средний", "Крупный", "Профиль", "Пожаловаться", "Заблокировать и завершить", "Не удалось заблокировать. Попробуйте ещё раз.", "Закрыть"],
  ar: ["قائمة المكالمة", "الترجمة إلى", "تُترجم أقوال الطرف الآخر وكتاباته إلى هذه اللغة.", "ابحث عن لغة", "افتراضي", "حجم النص", "صغير", "متوسط", "كبير", "عرض الملف الشخصي", "إبلاغ", "حظر وإنهاء المكالمة", "تعذّر الحظر. حاول مرة أخرى.", "إغلاق"],
  hi: ["कॉल मेनू", "इस भाषा में अनुवाद", "सामने वाले की बातें और लिखा हुआ इस भाषा में अनुवाद होगा।", "भाषा खोजें", "डिफ़ॉल्ट", "अक्षर का आकार", "छोटा", "मध्यम", "बड़ा", "प्रोफ़ाइल देखें", "रिपोर्ट करें", "ब्लॉक करके काटें", "ब्लॉक नहीं हो सका। फिर कोशिश करें।", "बंद करें"],
  th: ["เมนูการโทร", "แปลเป็นภาษา", "สิ่งที่อีกฝ่ายพูดและเขียนจะแปลเป็นภาษานี้", "ค้นหาภาษา", "ค่าเริ่มต้น", "ขนาดตัวอักษร", "เล็ก", "กลาง", "ใหญ่", "ดูโปรไฟล์", "รายงาน", "บล็อกและวางสาย", "บล็อกไม่สำเร็จ ลองอีกครั้ง", "ปิด"],
  vi: ["Menu cuộc gọi", "Dịch sang", "Lời nói và tin nhắn của người kia được dịch sang ngôn ngữ này.", "Tìm ngôn ngữ", "Mặc định", "Cỡ chữ", "Nhỏ", "Vừa", "Lớn", "Xem hồ sơ", "Báo cáo", "Chặn và cúp máy", "Không chặn được. Hãy thử lại.", "Đóng"],
};

export function resolvePostCallMenuCopy(rawLocale: string): PostCallMenuCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  const row = ROWS[locale] ?? ROWS.en;
  return {
    menu: row[0], language: row[1], languageHint: row[2], search: row[3], defaultBadge: row[4], textSize: row[5],
    small: row[6], medium: row[7], large: row[8], profile: row[9], report: row[10], block: row[11], blockFailed: row[12], close: row[13],
  };
}
