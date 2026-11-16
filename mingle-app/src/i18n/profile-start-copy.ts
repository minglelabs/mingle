import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/**
 * Copy for the card on top of the home tab that asks a new account for a
 * photo and a name (docs/home-explore-rooms-plan.md: after sign-in and the
 * phone check comes the profile, then home).
 */
export type ProfileStartCopy = {
  title: string;
  body: string;
  addPhoto: string;
  changePhoto: string;
  namePlaceholder: string;
  save: string;
  later: string;
  failed: string;
};

const COPY: Record<PrimaryUiLocale, ProfileStartCopy> = {
  ko: { title: "프로필을 완성해 주세요", body: "사진과 이름이 있으면 더 많은 사람이 먼저 말을 걸어요.", addPhoto: "사진 추가", changePhoto: "사진 바꾸기", namePlaceholder: "이름", save: "저장", later: "나중에", failed: "저장하지 못했어요. 다시 시도해 주세요." },
  en: { title: "Finish your profile", body: "With a photo and a name, more people will say hi first.", addPhoto: "Add photo", changePhoto: "Change photo", namePlaceholder: "Name", save: "Save", later: "Later", failed: "Couldn't save. Please try again." },
  ja: { title: "プロフィールを完成させましょう", body: "写真と名前があると、話しかけてもらいやすくなります。", addPhoto: "写真を追加", changePhoto: "写真を変更", namePlaceholder: "名前", save: "保存", later: "あとで", failed: "保存できませんでした。もう一度お試しください。" },
  "zh-CN": { title: "完善你的个人资料", body: "有照片和名字，会有更多人主动和你聊天。", addPhoto: "添加照片", changePhoto: "更换照片", namePlaceholder: "名字", save: "保存", later: "以后再说", failed: "保存失败，请重试。" },
  "zh-TW": { title: "完成你的個人檔案", body: "有照片和名字，會有更多人主動找你聊天。", addPhoto: "新增照片", changePhoto: "更換照片", namePlaceholder: "名字", save: "儲存", later: "稍後", failed: "儲存失敗，請再試一次。" },
  fr: { title: "Complétez votre profil", body: "Avec une photo et un nom, plus de personnes viendront vous parler.", addPhoto: "Ajouter une photo", changePhoto: "Changer la photo", namePlaceholder: "Nom", save: "Enregistrer", later: "Plus tard", failed: "Échec de l’enregistrement. Réessayez." },
  de: { title: "Vervollständige dein Profil", body: "Mit Foto und Namen schreiben dir mehr Leute zuerst.", addPhoto: "Foto hinzufügen", changePhoto: "Foto ändern", namePlaceholder: "Vorname", save: "Speichern", later: "Später", failed: "Speichern fehlgeschlagen. Bitte versuche es erneut." },
  es: { title: "Completa tu perfil", body: "Con una foto y un nombre, más gente te hablará primero.", addPhoto: "Añadir foto", changePhoto: "Cambiar foto", namePlaceholder: "Nombre", save: "Guardar", later: "Más tarde", failed: "No se pudo guardar. Inténtalo de nuevo." },
  pt: { title: "Complete seu perfil", body: "Com foto e nome, mais pessoas vão falar com você primeiro.", addPhoto: "Adicionar foto", changePhoto: "Trocar foto", namePlaceholder: "Nome", save: "Salvar", later: "Depois", failed: "Não foi possível salvar. Tente novamente." },
  it: { title: "Completa il tuo profilo", body: "Con una foto e un nome, più persone ti scriveranno per prime.", addPhoto: "Aggiungi foto", changePhoto: "Cambia foto", namePlaceholder: "Nome", save: "Salva", later: "Più tardi", failed: "Salvataggio non riuscito. Riprova." },
  ru: { title: "Заполните профиль", body: "С фото и именем вам будут чаще писать первыми.", addPhoto: "Добавить фото", changePhoto: "Сменить фото", namePlaceholder: "Имя", save: "Сохранить", later: "Позже", failed: "Не удалось сохранить. Попробуйте ещё раз." },
  ar: { title: "أكمل ملفك الشخصي", body: "مع صورة واسم، سيبادر عدد أكبر من الناس بالحديث معك.", addPhoto: "إضافة صورة", changePhoto: "تغيير الصورة", namePlaceholder: "الاسم", save: "حفظ", later: "لاحقًا", failed: "تعذّر الحفظ. حاول مرة أخرى." },
  hi: { title: "अपनी प्रोफ़ाइल पूरी करें", body: "फ़ोटो और नाम होने पर ज़्यादा लोग पहले आपसे बात करेंगे।", addPhoto: "फ़ोटो जोड़ें", changePhoto: "फ़ोटो बदलें", namePlaceholder: "नाम", save: "सेव करें", later: "बाद में", failed: "सेव नहीं हो सका। फिर से कोशिश करें।" },
  th: { title: "ทำโปรไฟล์ให้ครบ", body: "มีรูปและชื่อ จะมีคนทักคุณก่อนมากขึ้น", addPhoto: "เพิ่มรูป", changePhoto: "เปลี่ยนรูป", namePlaceholder: "ชื่อ", save: "บันทึก", later: "ไว้ทีหลัง", failed: "บันทึกไม่สำเร็จ ลองอีกครั้ง" },
  vi: { title: "Hoàn thiện hồ sơ của bạn", body: "Có ảnh và tên, sẽ có nhiều người chủ động trò chuyện với bạn hơn.", addPhoto: "Thêm ảnh", changePhoto: "Đổi ảnh", namePlaceholder: "Tên", save: "Lưu", later: "Để sau", failed: "Không lưu được. Hãy thử lại." },
};

export const PROFILE_START_COPY_LOCALES = Object.keys(COPY);

export function resolveProfileStartCopy(rawLocale: string): ProfileStartCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return COPY[locale] ?? COPY.en;
}

/** The name every new account starts with; a profile still carrying it has no name of its own. */
export const DEFAULT_ACCOUNT_NAMES: readonly string[] = ["HashChat User", "Mingle User", "user"];

/** Whether the profile still lacks a photo or a name of its own. */
export function needsProfileStart(profile: { name?: unknown; image?: unknown } | null): boolean {
  if (!profile) return false;
  const name = typeof profile.name === "string" ? profile.name.trim() : "";
  const image = typeof profile.image === "string" ? profile.image.trim() : "";
  return !image || !name || DEFAULT_ACCOUNT_NAMES.includes(name);
}
