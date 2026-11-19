import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/** Copy for the screen a permanently banned account sees (see @/server/identity/ban). */
export type BannedGateCopy = { title: string; body: string; signOut: string };

const COPY: Record<PrimaryUiLocale, BannedGateCopy> = {
  ko: { title: "이용이 영구 제한된 계정이에요", body: "커뮤니티 규칙을 어겨 이 계정으로는 HashChat을 더 이상 이용할 수 없어요.", signOut: "로그아웃" },
  en: { title: "This account is permanently banned", body: "It broke the community rules, so HashChat can no longer be used with this account.", signOut: "Sign out" },
  ja: { title: "このアカウントは永久に利用停止されました", body: "コミュニティのルールに違反したため、このアカウントではHashChatを利用できません。", signOut: "ログアウト" },
  "zh-CN": { title: "此账号已被永久封禁", body: "因违反社区规则，无法再使用此账号登录 HashChat。", signOut: "退出登录" },
  "zh-TW": { title: "此帳號已被永久停權", body: "因違反社群規則，無法再使用此帳號登入 HashChat。", signOut: "登出" },
  fr: { title: "Ce compte est banni définitivement", body: "Il a enfreint les règles de la communauté : HashChat n’est plus utilisable avec ce compte.", signOut: "Se déconnecter" },
  de: { title: "Dieses Konto ist dauerhaft gesperrt", body: "Es hat gegen die Community-Regeln verstoßen. HashChat kann mit diesem Konto nicht mehr genutzt werden.", signOut: "Abmelden" },
  es: { title: "Esta cuenta está expulsada de forma permanente", body: "Incumplió las normas de la comunidad, así que ya no se puede usar HashChat con esta cuenta.", signOut: "Cerrar sesión" },
  pt: { title: "Esta conta foi banida permanentemente", body: "Ela violou as regras da comunidade, então não é mais possível usar o HashChat com esta conta.", signOut: "Sair" },
  it: { title: "Questo account è bandito in modo permanente", body: "Ha violato le regole della community: non è più possibile usare HashChat con questo account.", signOut: "Esci" },
  ru: { title: "Этот аккаунт заблокирован навсегда", body: "Он нарушил правила сообщества, поэтому пользоваться HashChat с этим аккаунтом больше нельзя.", signOut: "Выйти" },
  ar: { title: "هذا الحساب محظور نهائيًا", body: "خالف قواعد المجتمع، لذلك لم يعد من الممكن استخدام HashChat بهذا الحساب.", signOut: "تسجيل الخروج" },
  hi: { title: "यह अकाउंट हमेशा के लिए बैन है", body: "इसने कम्युनिटी के नियम तोड़े, इसलिए इस अकाउंट से HashChat अब इस्तेमाल नहीं किया जा सकता।", signOut: "साइन आउट" },
  th: { title: "บัญชีนี้ถูกแบนถาวร", body: "บัญชีนี้ทำผิดกฎของชุมชน จึงใช้ HashChat ด้วยบัญชีนี้ไม่ได้อีก", signOut: "ออกจากระบบ" },
  vi: { title: "Tài khoản này đã bị cấm vĩnh viễn", body: "Tài khoản đã vi phạm quy tắc cộng đồng nên không thể dùng HashChat bằng tài khoản này nữa.", signOut: "Đăng xuất" },
};

export function resolveBannedGateCopy(rawLocale: string): BannedGateCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return COPY[locale] ?? COPY.en;
}
