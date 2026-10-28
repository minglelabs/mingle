import { resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from './config'

/**
 * Copy for the two account badges, 15 primary UI languages (same pattern as
 * `report-copy.ts`):
 * - `official`: the HashChat team's own account (@mingle_team), so content it
 *   posts is clearly marked (spec item 84).
 * - `operator`: an account run by HashChat staff (admin operator accounts). It
 *   must be labeled wherever its name is shown, and a chat room with one shows
 *   `chatDisclosure`. Pick the kind with `resolveAccountBadge` in
 *   `@/lib/account-badge`.
 * The official wording must never say "operated/운영/運営": that is the
 * operator label.
 */
export type AccountBadgeCopy = {
  official: string
  /** Screen-reader description read after the name. */
  officialDescription: string
  /** Badge label next to an operator account's name. */
  operator: string
  /** Screen-reader description read after an operator account's name. */
  operatorDescription: string
  /** Title of the sheet opened by tapping the operator badge. */
  operatorSheetTitle: string
  /** Body of that sheet. */
  operatorSheetBody: string
  /** Notice shown in a chat room that has an operator account as a member. */
  chatDisclosure: string
  /** Plain-text suffix for text-only surfaces (OS push): "Name (label)". */
  pushLabel: string
}

const copy: Record<LegalDocumentLocale, AccountBadgeCopy> = {
  ko: {
    official: '공식',
    officialDescription: 'HashChat 공식 계정',
    operator: '운영 계정',
    operatorDescription: 'HashChat 팀이 운영하는 계정',
    operatorSheetTitle: '운영 계정',
    operatorSheetBody: '이 계정은 개인이 아니라 HashChat 팀이 운영합니다. 게시물과 답장은 HashChat 팀원이 작성합니다.',
    chatDisclosure: '이 대화에는 HashChat 팀이 운영하는 계정이 있습니다. 메시지는 HashChat 팀원이 읽고 답장합니다.',
    pushLabel: '운영 계정',
  },
  en: {
    official: 'Official',
    officialDescription: 'HashChat team account',
    operator: 'Run by HashChat',
    operatorDescription: 'This account is run by the HashChat team.',
    operatorSheetTitle: 'Run by HashChat',
    operatorSheetBody: 'This account is not a private individual. It is run by the HashChat team, and HashChat staff write its posts and replies.',
    chatDisclosure: 'A HashChat-run account is in this chat. HashChat staff read and reply to its messages.',
    pushLabel: 'Run by HashChat',
  },
  ja: {
    official: '公式',
    officialDescription: 'HashChat公式アカウント',
    operator: 'HashChat運営',
    operatorDescription: 'このアカウントはHashChatチームが運営しています。',
    operatorSheetTitle: 'HashChat運営',
    operatorSheetBody: 'このアカウントは個人ではなく、HashChatチームが運営しています。投稿と返信はHashChatのスタッフが書いています。',
    chatDisclosure: 'この会話にはHashChatチームが運営するアカウントがいます。メッセージはHashChatのスタッフが読んで返信します。',
    pushLabel: 'HashChat運営',
  },
  'zh-CN': {
    official: '官方',
    officialDescription: 'HashChat 官方账号',
    operator: 'HashChat 运营',
    operatorDescription: '此账号由 HashChat 团队运营。',
    operatorSheetTitle: 'HashChat 运营',
    operatorSheetBody: '此账号不属于个人，而是由 HashChat 团队运营。动态和回复由 HashChat 工作人员撰写。',
    chatDisclosure: '此对话中有由 HashChat 团队运营的账号，消息由 HashChat 工作人员阅读并回复。',
    pushLabel: 'HashChat 运营',
  },
  'zh-TW': {
    official: '官方',
    officialDescription: 'HashChat 官方帳號',
    operator: 'HashChat 營運',
    operatorDescription: '此帳號由 HashChat 團隊營運。',
    operatorSheetTitle: 'HashChat 營運',
    operatorSheetBody: '此帳號並非個人，而是由 HashChat 團隊營運。貼文和回覆由 HashChat 工作人員撰寫。',
    chatDisclosure: '這段對話中有由 HashChat 團隊營運的帳號，訊息由 HashChat 工作人員閱讀並回覆。',
    pushLabel: 'HashChat 營運',
  },
  fr: {
    official: 'Officiel',
    officialDescription: 'Compte de l’équipe HashChat',
    operator: 'Géré par HashChat',
    operatorDescription: 'Ce compte est géré par l’équipe HashChat.',
    operatorSheetTitle: 'Géré par HashChat',
    operatorSheetBody: 'Ce compte n’est pas celui d’un particulier : il est géré par l’équipe HashChat, dont les membres rédigent ses publications et ses réponses.',
    chatDisclosure: 'Un compte géré par HashChat participe à cette discussion. L’équipe HashChat lit ses messages et y répond.',
    pushLabel: 'Géré par HashChat',
  },
  de: {
    official: 'Offiziell',
    officialDescription: 'Konto des HashChat-Teams',
    operator: 'Von HashChat betrieben',
    operatorDescription: 'Dieses Konto wird vom HashChat-Team betrieben.',
    operatorSheetTitle: 'Von HashChat betrieben',
    operatorSheetBody: 'Hinter diesem Konto steht keine Privatperson. Es wird vom HashChat-Team betrieben, und Mitarbeitende von HashChat schreiben seine Beiträge und Antworten.',
    chatDisclosure: 'In diesem Chat ist ein von HashChat betriebenes Konto. Mitarbeitende von HashChat lesen und beantworten seine Nachrichten.',
    pushLabel: 'Von HashChat betrieben',
  },
  es: {
    official: 'Oficial',
    officialDescription: 'Cuenta del equipo de HashChat',
    operator: 'Gestionada por HashChat',
    operatorDescription: 'El equipo de HashChat gestiona esta cuenta.',
    operatorSheetTitle: 'Gestionada por HashChat',
    operatorSheetBody: 'Esta cuenta no es de un particular: la gestiona el equipo de HashChat, y sus publicaciones y respuestas las escribe el personal de HashChat.',
    chatDisclosure: 'En este chat hay una cuenta gestionada por HashChat. El personal de HashChat lee y responde sus mensajes.',
    pushLabel: 'Gestionada por HashChat',
  },
  pt: {
    official: 'Oficial',
    officialDescription: 'Conta da equipe HashChat',
    operator: 'Gerenciada pelo HashChat',
    operatorDescription: 'Esta conta é gerenciada pela equipe HashChat.',
    operatorSheetTitle: 'Gerenciada pelo HashChat',
    operatorSheetBody: 'Esta conta não é de uma pessoa: ela é gerenciada pela equipe HashChat, e as publicações e respostas são escritas por membros da equipe.',
    chatDisclosure: 'Esta conversa tem uma conta gerenciada pelo HashChat. A equipe HashChat lê e responde às mensagens dela.',
    pushLabel: 'Gerenciada pelo HashChat',
  },
  it: {
    official: 'Ufficiale',
    officialDescription: 'Account del team HashChat',
    operator: 'Gestito da HashChat',
    operatorDescription: 'Questo account è gestito dal team HashChat.',
    operatorSheetTitle: 'Gestito da HashChat',
    operatorSheetBody: 'Questo account non appartiene a un privato: è gestito dal team HashChat, e i suoi post e le sue risposte sono scritti dallo staff di HashChat.',
    chatDisclosure: 'In questa chat c’è un account gestito da HashChat. Lo staff di HashChat legge i suoi messaggi e risponde.',
    pushLabel: 'Gestito da HashChat',
  },
  ru: {
    official: 'Официально',
    officialDescription: 'Аккаунт команды HashChat',
    operator: 'Ведёт HashChat',
    operatorDescription: 'Этот аккаунт ведёт команда HashChat.',
    operatorSheetTitle: 'Ведёт HashChat',
    operatorSheetBody: 'Этот аккаунт ведёт не частное лицо, а команда HashChat. Публикации и ответы пишут сотрудники HashChat.',
    chatDisclosure: 'В этом чате есть аккаунт, который ведёт команда HashChat. Сотрудники HashChat читают его сообщения и отвечают на них.',
    pushLabel: 'Ведёт HashChat',
  },
  ar: {
    official: 'رسمي',
    officialDescription: 'حساب فريق HashChat',
    operator: 'بإدارة HashChat',
    operatorDescription: 'يدير فريق HashChat هذا الحساب.',
    operatorSheetTitle: 'بإدارة HashChat',
    operatorSheetBody: 'لا يدير هذا الحساب شخص عادي، بل يديره فريق HashChat، ويكتب موظفو HashChat منشوراته وردوده.',
    chatDisclosure: 'في هذه المحادثة حساب يديره فريق HashChat. يقرأ موظفو HashChat رسائله ويردّون عليها.',
    pushLabel: 'بإدارة HashChat',
  },
  hi: {
    official: 'आधिकारिक',
    officialDescription: 'HashChat टीम खाता',
    operator: 'HashChat द्वारा संचालित',
    operatorDescription: 'यह खाता HashChat टीम चलाती है।',
    operatorSheetTitle: 'HashChat द्वारा संचालित',
    operatorSheetBody: 'यह खाता किसी व्यक्ति का नहीं है, इसे HashChat टीम चलाती है। इसकी पोस्ट और जवाब HashChat के कर्मचारी लिखते हैं।',
    chatDisclosure: 'इस चैट में HashChat टीम द्वारा चलाया जाने वाला एक खाता है। इसके संदेश HashChat के कर्मचारी पढ़ते हैं और उनका जवाब देते हैं।',
    pushLabel: 'HashChat द्वारा संचालित',
  },
  th: {
    official: 'ทางการ',
    officialDescription: 'บัญชีทีม HashChat',
    operator: 'ดูแลโดย HashChat',
    operatorDescription: 'บัญชีนี้ดูแลโดยทีม HashChat',
    operatorSheetTitle: 'ดูแลโดย HashChat',
    operatorSheetBody: 'บัญชีนี้ไม่ใช่ของบุคคลทั่วไป แต่ดูแลโดยทีม HashChat ทีมงาน HashChat เป็นผู้เขียนโพสต์และการตอบกลับ',
    chatDisclosure: 'แชทนี้มีบัญชีที่ดูแลโดยทีม HashChat ทีมงาน HashChat จะอ่านและตอบกลับข้อความ',
    pushLabel: 'ดูแลโดย HashChat',
  },
  vi: {
    official: 'Chính thức',
    officialDescription: 'Tài khoản đội ngũ HashChat',
    operator: 'Do HashChat vận hành',
    operatorDescription: 'Tài khoản này do đội ngũ HashChat vận hành.',
    operatorSheetTitle: 'Do HashChat vận hành',
    operatorSheetBody: 'Tài khoản này không phải của cá nhân mà do đội ngũ HashChat vận hành. Bài viết và câu trả lời do nhân viên HashChat viết.',
    chatDisclosure: 'Cuộc trò chuyện này có một tài khoản do đội ngũ HashChat vận hành. Nhân viên HashChat đọc và trả lời tin nhắn của tài khoản này.',
    pushLabel: 'Do HashChat vận hành',
  },
}

export function accountBadgeCopy(locale: string): AccountBadgeCopy {
  return copy[resolveLegalDocumentLocale(resolveSupportedLocaleTag(locale) || 'en')]
}
