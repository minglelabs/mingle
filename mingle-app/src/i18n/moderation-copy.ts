import { resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from './config'

/**
 * Copy shown when an operator restricted the viewer's account and a write API
 * answered 403 `account_restricted` (see `@/lib/account-restriction`). One
 * sentence, used by every posting write path so the notice reads the same
 * everywhere. 15 primary UI languages, same pattern as `report-copy.ts`.
 */
export type ModerationCopy = {
  accountRestricted: string
}

const copy: Record<LegalDocumentLocale, ModerationCopy> = {
  ko: { accountRestricted: '운영 정책에 따라 계정이 제한되어 지금은 글·댓글·좋아요를 남길 수 없어요.' },
  en: { accountRestricted: 'Your account is restricted under our community rules, so you can’t post, comment or like right now.' },
  ja: { accountRestricted: 'コミュニティ規約によりアカウントが制限されているため、現在は投稿・コメント・いいねができません。' },
  'zh-CN': { accountRestricted: '根据社区规则，你的账号已被限制，目前无法发帖、评论或点赞。' },
  'zh-TW': { accountRestricted: '依據社群規範，你的帳號已被限制，目前無法發文、留言或按讚。' },
  fr: { accountRestricted: 'Votre compte est restreint selon nos règles de communauté : impossible de publier, commenter ou aimer pour le moment.' },
  de: { accountRestricted: 'Dein Konto ist gemäß unseren Community-Regeln eingeschränkt. Du kannst derzeit nichts posten, kommentieren oder liken.' },
  es: { accountRestricted: 'Tu cuenta está restringida según las normas de la comunidad, así que por ahora no puedes publicar, comentar ni dar me gusta.' },
  pt: { accountRestricted: 'Sua conta está restrita pelas regras da comunidade, então no momento você não pode publicar, comentar nem curtir.' },
  it: { accountRestricted: 'Il tuo account è limitato in base alle regole della community: al momento non puoi pubblicare, commentare o mettere mi piace.' },
  ru: { accountRestricted: 'Ваш аккаунт ограничен по правилам сообщества, поэтому сейчас вы не можете публиковать, комментировать и ставить лайки.' },
  ar: { accountRestricted: 'تم تقييد حسابك وفقًا لقواعد المجتمع، لذا لا يمكنك النشر أو التعليق أو الإعجاب حاليًا.' },
  hi: { accountRestricted: 'कम्युनिटी नियमों के तहत आपका खाता सीमित है, इसलिए अभी आप पोस्ट, कमेंट या लाइक नहीं कर सकते।' },
  th: { accountRestricted: 'บัญชีของคุณถูกจำกัดตามกฎของชุมชน ตอนนี้จึงไม่สามารถโพสต์ แสดงความคิดเห็น หรือกดถูกใจได้' },
  vi: { accountRestricted: 'Tài khoản của bạn bị hạn chế theo quy tắc cộng đồng nên hiện không thể đăng bài, bình luận hoặc thích.' },
}

export function moderationCopy(locale: string): ModerationCopy {
  return copy[resolveLegalDocumentLocale(resolveSupportedLocaleTag(locale) || 'en')]
}
