import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

export type ProfileNationalityCopy = {
  /** Field label in profile edit. */
  label: string;
  /** Shown under the field: where the nationality appears. */
  hint: string;
  searchPlaceholder: string;
  noResults: string;
};

const PROFILE_NATIONALITY_COPY_BY_LOCALE: Record<PrimaryUiLocale, ProfileNationalityCopy> = {
  ko: { label: "국적", hint: "프로필 사진 왼쪽 아래에 국기로 표시돼요.", searchPlaceholder: "국가 검색", noResults: "검색 결과가 없어요." },
  en: { label: "Nationality", hint: "Shown as a flag on your profile photo.", searchPlaceholder: "Search countries", noResults: "No matching countries." },
  ja: { label: "国籍", hint: "プロフィール写真の左下に国旗で表示されます。", searchPlaceholder: "国を検索", noResults: "該当する国がありません。" },
  "zh-CN": { label: "国籍", hint: "以国旗显示在头像左下角。", searchPlaceholder: "搜索国家", noResults: "没有匹配的国家。" },
  "zh-TW": { label: "國籍", hint: "以國旗顯示在大頭貼左下角。", searchPlaceholder: "搜尋國家", noResults: "沒有符合的國家。" },
  fr: { label: "Nationalité", hint: "Affichée par un drapeau sur votre photo de profil.", searchPlaceholder: "Rechercher un pays", noResults: "Aucun pays trouvé." },
  de: { label: "Nationalität", hint: "Wird als Flagge auf deinem Profilbild angezeigt.", searchPlaceholder: "Land suchen", noResults: "Keine passenden Länder." },
  es: { label: "Nacionalidad", hint: "Se muestra como una bandera en tu foto de perfil.", searchPlaceholder: "Buscar país", noResults: "No hay países que coincidan." },
  pt: { label: "Nacionalidade", hint: "Aparece como uma bandeira na sua foto de perfil.", searchPlaceholder: "Pesquisar país", noResults: "Nenhum país encontrado." },
  it: { label: "Nazionalità", hint: "Mostrata come bandiera sulla tua foto profilo.", searchPlaceholder: "Cerca un paese", noResults: "Nessun paese trovato." },
  ru: { label: "Гражданство", hint: "Показывается флагом на фото профиля.", searchPlaceholder: "Поиск страны", noResults: "Страны не найдены." },
  ar: { label: "الجنسية", hint: "تظهر كعلم على صورة ملفك الشخصي.", searchPlaceholder: "ابحث عن دولة", noResults: "لا توجد دول مطابقة." },
  hi: { label: "राष्ट्रीयता", hint: "आपकी प्रोफ़ाइल फ़ोटो पर झंडे के रूप में दिखाई जाती है।", searchPlaceholder: "देश खोजें", noResults: "कोई देश नहीं मिला।" },
  th: { label: "สัญชาติ", hint: "แสดงเป็นธงบนรูปโปรไฟล์ของคุณ", searchPlaceholder: "ค้นหาประเทศ", noResults: "ไม่พบประเทศที่ตรงกัน" },
  vi: { label: "Quốc tịch", hint: "Hiển thị bằng lá cờ trên ảnh hồ sơ của bạn.", searchPlaceholder: "Tìm quốc gia", noResults: "Không tìm thấy quốc gia." },
};

export function resolveProfileNationalityCopy(rawLocale: string): ProfileNationalityCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return PROFILE_NATIONALITY_COPY_BY_LOCALE[locale] ?? PROFILE_NATIONALITY_COPY_BY_LOCALE.en;
}
