import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";
import type { ProfileGender } from "@/lib/profile-gender";

export type ProfileGenderCopy = {
  /** Field label in signup and profile edit. */
  label: string;
  /** Headline of the onboarding gender screen. */
  stepTitle: string;
  female: string;
  male: string;
  /** Shown under the choice: where the gender appears. */
  publicHint: string;
  required: string;
};

const PROFILE_GENDER_COPY_BY_LOCALE: Record<PrimaryUiLocale, ProfileGenderCopy> = {
  ko: { label: "성별", stepTitle: "성별을 알려주세요", female: "여성", male: "남성", publicHint: "프로필에 나이와 함께 표시돼요.", required: "성별을 선택해 주세요." },
  en: { label: "Gender", stepTitle: "What's your gender?", female: "Female", male: "Male", publicHint: "Shown on your profile with your age.", required: "Choose your gender." },
  ja: { label: "性別", stepTitle: "性別を教えてください", female: "女性", male: "男性", publicHint: "プロフィールに年齢と一緒に表示されます。", required: "性別を選択してください。" },
  "zh-CN": { label: "性别", stepTitle: "请选择你的性别", female: "女", male: "男", publicHint: "将与年龄一起显示在你的个人资料中。", required: "请选择性别。" },
  "zh-TW": { label: "性別", stepTitle: "請選擇你的性別", female: "女", male: "男", publicHint: "會與年齡一起顯示在你的個人檔案中。", required: "請選擇性別。" },
  fr: { label: "Genre", stepTitle: "Quel est votre genre ?", female: "Femme", male: "Homme", publicHint: "Affiché sur votre profil avec votre âge.", required: "Choisissez votre genre." },
  de: { label: "Geschlecht", stepTitle: "Was ist dein Geschlecht?", female: "Weiblich", male: "Männlich", publicHint: "Wird mit deinem Alter in deinem Profil angezeigt.", required: "Wähle dein Geschlecht." },
  es: { label: "Género", stepTitle: "¿Cuál es tu género?", female: "Mujer", male: "Hombre", publicHint: "Se muestra en tu perfil junto a tu edad.", required: "Elige tu género." },
  pt: { label: "Gênero", stepTitle: "Qual é o seu gênero?", female: "Feminino", male: "Masculino", publicHint: "Aparece no seu perfil junto com a sua idade.", required: "Escolha seu gênero." },
  it: { label: "Genere", stepTitle: "Qual è il tuo genere?", female: "Donna", male: "Uomo", publicHint: "Mostrato sul tuo profilo insieme alla tua età.", required: "Scegli il tuo genere." },
  ru: { label: "Пол", stepTitle: "Укажите ваш пол", female: "Женский", male: "Мужской", publicHint: "Показывается в профиле вместе с возрастом.", required: "Выберите пол." },
  ar: { label: "الجنس", stepTitle: "ما جنسك؟", female: "أنثى", male: "ذكر", publicHint: "يظهر في ملفك الشخصي مع عمرك.", required: "اختر الجنس." },
  hi: { label: "लिंग", stepTitle: "आपका लिंग क्या है?", female: "महिला", male: "पुरुष", publicHint: "आपकी उम्र के साथ प्रोफ़ाइल पर दिखाया जाता है।", required: "अपना लिंग चुनें।" },
  th: { label: "เพศ", stepTitle: "เพศของคุณคืออะไร", female: "หญิง", male: "ชาย", publicHint: "แสดงในโปรไฟล์พร้อมอายุของคุณ", required: "เลือกเพศของคุณ" },
  vi: { label: "Giới tính", stepTitle: "Giới tính của bạn là gì?", female: "Nữ", male: "Nam", publicHint: "Hiển thị trên hồ sơ cùng với tuổi của bạn.", required: "Hãy chọn giới tính." },
};

export function resolveProfileGenderCopy(rawLocale: string): ProfileGenderCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return PROFILE_GENDER_COPY_BY_LOCALE[locale] ?? PROFILE_GENDER_COPY_BY_LOCALE.en;
}

export function profileGenderLabel(gender: ProfileGender, rawLocale: string): string {
  const copy = resolveProfileGenderCopy(rawLocale);
  return gender === "female" ? copy.female : copy.male;
}
