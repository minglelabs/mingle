import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/** Copy for the height wheel (cm): asked of men with the profile basics, optional for everyone in profile edit. */
export type ProfileHeightCopy = {
  label: string;
  stepTitle: string;
  hint: string;
  invalid: string;
};

const COPY: Record<PrimaryUiLocale, ProfileHeightCopy> = {
  ko: { label: "키", stepTitle: "키를 알려주세요", hint: "프로필에 표시돼요. 한 번 정하면 바꿀 수 없어요.", invalid: "120~230 사이로 적어 주세요." },
  en: { label: "Height", stepTitle: "How tall are you?", hint: "Shown on your profile. It can't be changed later.", invalid: "Enter a height between 120 and 230." },
  ja: { label: "身長", stepTitle: "身長を教えてください", hint: "プロフィールに表示されます。一度決めると変更できません。", invalid: "120〜230の間で入力してください。" },
  "zh-CN": { label: "身高", stepTitle: "你的身高是多少？", hint: "会显示在你的个人资料中。一旦设定就不能修改。", invalid: "请输入 120 到 230 之间的数字。" },
  "zh-TW": { label: "身高", stepTitle: "你的身高是多少？", hint: "會顯示在你的個人檔案中。一旦設定就無法修改。", invalid: "請輸入 120 到 230 之間的數字。" },
  fr: { label: "Taille", stepTitle: "Quelle est votre taille ?", hint: "Affichée sur votre profil. Il ne pourra plus être modifié.", invalid: "Saisissez une taille entre 120 et 230." },
  de: { label: "Größe", stepTitle: "Wie groß bist du?", hint: "Wird in deinem Profil angezeigt. Sie kann später nicht geändert werden.", invalid: "Gib eine Größe zwischen 120 und 230 ein." },
  es: { label: "Estatura", stepTitle: "¿Cuánto mides?", hint: "Se muestra en tu perfil. No se puede cambiar después.", invalid: "Escribe una estatura entre 120 y 230." },
  pt: { label: "Altura", stepTitle: "Qual é a sua altura?", hint: "Aparece no seu perfil. Não poderá ser alterada depois.", invalid: "Digite uma altura entre 120 e 230." },
  it: { label: "Altezza", stepTitle: "Quanto sei alto?", hint: "Mostrata sul tuo profilo. Non potrà essere modificata in seguito.", invalid: "Inserisci un'altezza tra 120 e 230." },
  ru: { label: "Рост", stepTitle: "Какой у вас рост?", hint: "Показывается в профиле. Потом его нельзя изменить.", invalid: "Введите рост от 120 до 230." },
  ar: { label: "الطول", stepTitle: "كم طولك؟", hint: "يظهر في ملفك الشخصي. لا يمكن تغييره لاحقًا.", invalid: "أدخل طولًا بين 120 و230." },
  hi: { label: "लंबाई", stepTitle: "आपकी लंबाई कितनी है?", hint: "आपकी प्रोफ़ाइल पर दिखती है। बाद में बदला नहीं जा सकता।", invalid: "120 से 230 के बीच लंबाई लिखें।" },
  th: { label: "ส่วนสูง", stepTitle: "คุณสูงเท่าไหร่?", hint: "แสดงในโปรไฟล์ของคุณ ตั้งแล้วเปลี่ยนไม่ได้", invalid: "กรอกส่วนสูงระหว่าง 120 ถึง 230" },
  vi: { label: "Chiều cao", stepTitle: "Bạn cao bao nhiêu?", hint: "Hiển thị trên hồ sơ của bạn. Sau này không đổi được.", invalid: "Nhập chiều cao từ 120 đến 230." },
};

export const PROFILE_HEIGHT_COPY_LOCALES = Object.keys(COPY);

export function resolveProfileHeightCopy(rawLocale: string): ProfileHeightCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return COPY[locale] ?? COPY.en;
}
