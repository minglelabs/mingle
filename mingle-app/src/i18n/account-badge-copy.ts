import { resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from './config'

/**
 * Copy for the two account badges, 15 primary UI languages (same pattern as
 * `report-copy.ts`):
 * - `official`: the Mingle team's own account (@mingle_team), so content it
 *   posts is clearly marked (spec item 84).
 * - `operator`: an account run by Mingle staff (admin operator accounts). It
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
    officialDescription: 'Mingle 공식 계정',
    operator: '운영 계정',
    operatorDescription: 'Mingle 팀이 운영하는 계정',
    operatorSheetTitle: '운영 계정',
    operatorSheetBody: '이 계정은 개인이 아니라 Mingle 팀이 운영합니다. 게시물과 답장은 Mingle 팀원이 작성합니다.',
    chatDisclosure: '이 대화에는 Mingle 팀이 운영하는 계정이 있습니다. 메시지는 Mingle 팀원이 읽고 답장합니다.',
    pushLabel: '운영 계정',
  },
  en: {
    official: 'Official',
    officialDescription: 'Mingle team account',
    operator: 'Run by Mingle',
    operatorDescription: 'This account is run by the Mingle team.',
    operatorSheetTitle: 'Run by Mingle',
    operatorSheetBody: 'This account is not a private individual. It is run by the Mingle team, and Mingle staff write its posts and replies.',
    chatDisclosure: 'A Mingle-run account is in this chat. Mingle staff read and reply to its messages.',
    pushLabel: 'Run by Mingle',
  },
  ja: {
    official: '公式',
    officialDescription: 'Mingle公式アカウント',
    operator: 'Mingle運営',
    operatorDescription: 'このアカウントはMingleチームが運営しています。',
    operatorSheetTitle: 'Mingle運営',
    operatorSheetBody: 'このアカウントは個人ではなく、Mingleチームが運営しています。投稿と返信はMingleのスタッフが書いています。',
    chatDisclosure: 'この会話にはMingleチームが運営するアカウントがいます。メッセージはMingleのスタッフが読んで返信します。',
    pushLabel: 'Mingle運営',
  },
  'zh-CN': {
    official: '官方',
    officialDescription: 'Mingle 官方账号',
    operator: 'Mingle 运营',
    operatorDescription: '此账号由 Mingle 团队运营。',
    operatorSheetTitle: 'Mingle 运营',
    operatorSheetBody: '此账号不属于个人，而是由 Mingle 团队运营。动态和回复由 Mingle 工作人员撰写。',
    chatDisclosure: '此对话中有由 Mingle 团队运营的账号，消息由 Mingle 工作人员阅读并回复。',
    pushLabel: 'Mingle 运营',
  },
  'zh-TW': {
    official: '官方',
    officialDescription: 'Mingle 官方帳號',
    operator: 'Mingle 營運',
    operatorDescription: '此帳號由 Mingle 團隊營運。',
    operatorSheetTitle: 'Mingle 營運',
    operatorSheetBody: '此帳號並非個人，而是由 Mingle 團隊營運。貼文和回覆由 Mingle 工作人員撰寫。',
    chatDisclosure: '這段對話中有由 Mingle 團隊營運的帳號，訊息由 Mingle 工作人員閱讀並回覆。',
    pushLabel: 'Mingle 營運',
  },
  fr: {
    official: 'Officiel',
    officialDescription: 'Compte de l’équipe Mingle',
    operator: 'Géré par Mingle',
    operatorDescription: 'Ce compte est géré par l’équipe Mingle.',
    operatorSheetTitle: 'Géré par Mingle',
    operatorSheetBody: 'Ce compte n’est pas celui d’un particulier : il est géré par l’équipe Mingle, dont les membres rédigent ses publications et ses réponses.',
    chatDisclosure: 'Un compte géré par Mingle participe à cette discussion. L’équipe Mingle lit ses messages et y répond.',
    pushLabel: 'Géré par Mingle',
  },
  de: {
    official: 'Offiziell',
    officialDescription: 'Konto des Mingle-Teams',
    operator: 'Von Mingle betrieben',
    operatorDescription: 'Dieses Konto wird vom Mingle-Team betrieben.',
    operatorSheetTitle: 'Von Mingle betrieben',
    operatorSheetBody: 'Hinter diesem Konto steht keine Privatperson. Es wird vom Mingle-Team betrieben, und Mitarbeitende von Mingle schreiben seine Beiträge und Antworten.',
    chatDisclosure: 'In diesem Chat ist ein von Mingle betriebenes Konto. Mitarbeitende von Mingle lesen und beantworten seine Nachrichten.',
    pushLabel: 'Von Mingle betrieben',
  },
  es: {
    official: 'Oficial',
    officialDescription: 'Cuenta del equipo de Mingle',
    operator: 'Gestionada por Mingle',
    operatorDescription: 'El equipo de Mingle gestiona esta cuenta.',
    operatorSheetTitle: 'Gestionada por Mingle',
    operatorSheetBody: 'Esta cuenta no es de un particular: la gestiona el equipo de Mingle, y sus publicaciones y respuestas las escribe el personal de Mingle.',
    chatDisclosure: 'En este chat hay una cuenta gestionada por Mingle. El personal de Mingle lee y responde sus mensajes.',
    pushLabel: 'Gestionada por Mingle',
  },
  pt: {
    official: 'Oficial',
    officialDescription: 'Conta da equipe Mingle',
    operator: 'Gerenciada pelo Mingle',
    operatorDescription: 'Esta conta é gerenciada pela equipe Mingle.',
    operatorSheetTitle: 'Gerenciada pelo Mingle',
    operatorSheetBody: 'Esta conta não é de uma pessoa: ela é gerenciada pela equipe Mingle, e as publicações e respostas são escritas por membros da equipe.',
    chatDisclosure: 'Esta conversa tem uma conta gerenciada pelo Mingle. A equipe Mingle lê e responde às mensagens dela.',
    pushLabel: 'Gerenciada pelo Mingle',
  },
  it: {
    official: 'Ufficiale',
    officialDescription: 'Account del team Mingle',
    operator: 'Gestito da Mingle',
    operatorDescription: 'Questo account è gestito dal team Mingle.',
    operatorSheetTitle: 'Gestito da Mingle',
    operatorSheetBody: 'Questo account non appartiene a un privato: è gestito dal team Mingle, e i suoi post e le sue risposte sono scritti dallo staff di Mingle.',
    chatDisclosure: 'In questa chat c’è un account gestito da Mingle. Lo staff di Mingle legge i suoi messaggi e risponde.',
    pushLabel: 'Gestito da Mingle',
  },
  ru: {
    official: 'Официально',
    officialDescription: 'Аккаунт команды Mingle',
    operator: 'Ведёт Mingle',
    operatorDescription: 'Этот аккаунт ведёт команда Mingle.',
    operatorSheetTitle: 'Ведёт Mingle',
    operatorSheetBody: 'Этот аккаунт ведёт не частное лицо, а команда Mingle. Публикации и ответы пишут сотрудники Mingle.',
    chatDisclosure: 'В этом чате есть аккаунт, который ведёт команда Mingle. Сотрудники Mingle читают его сообщения и отвечают на них.',
    pushLabel: 'Ведёт Mingle',
  },
  ar: {
    official: 'رسمي',
    officialDescription: 'حساب فريق Mingle',
    operator: 'بإدارة Mingle',
    operatorDescription: 'يدير فريق Mingle هذا الحساب.',
    operatorSheetTitle: 'بإدارة Mingle',
    operatorSheetBody: 'لا يدير هذا الحساب شخص عادي، بل يديره فريق Mingle، ويكتب موظفو Mingle منشوراته وردوده.',
    chatDisclosure: 'في هذه المحادثة حساب يديره فريق Mingle. يقرأ موظفو Mingle رسائله ويردّون عليها.',
    pushLabel: 'بإدارة Mingle',
  },
  hi: {
    official: 'आधिकारिक',
    officialDescription: 'Mingle टीम खाता',
    operator: 'Mingle द्वारा संचालित',
    operatorDescription: 'यह खाता Mingle टीम चलाती है।',
    operatorSheetTitle: 'Mingle द्वारा संचालित',
    operatorSheetBody: 'यह खाता किसी व्यक्ति का नहीं है, इसे Mingle टीम चलाती है। इसकी पोस्ट और जवाब Mingle के कर्मचारी लिखते हैं।',
    chatDisclosure: 'इस चैट में Mingle टीम द्वारा चलाया जाने वाला एक खाता है। इसके संदेश Mingle के कर्मचारी पढ़ते हैं और उनका जवाब देते हैं।',
    pushLabel: 'Mingle द्वारा संचालित',
  },
  th: {
    official: 'ทางการ',
    officialDescription: 'บัญชีทีม Mingle',
    operator: 'ดูแลโดย Mingle',
    operatorDescription: 'บัญชีนี้ดูแลโดยทีม Mingle',
    operatorSheetTitle: 'ดูแลโดย Mingle',
    operatorSheetBody: 'บัญชีนี้ไม่ใช่ของบุคคลทั่วไป แต่ดูแลโดยทีม Mingle ทีมงาน Mingle เป็นผู้เขียนโพสต์และการตอบกลับ',
    chatDisclosure: 'แชทนี้มีบัญชีที่ดูแลโดยทีม Mingle ทีมงาน Mingle จะอ่านและตอบกลับข้อความ',
    pushLabel: 'ดูแลโดย Mingle',
  },
  vi: {
    official: 'Chính thức',
    officialDescription: 'Tài khoản đội ngũ Mingle',
    operator: 'Do Mingle vận hành',
    operatorDescription: 'Tài khoản này do đội ngũ Mingle vận hành.',
    operatorSheetTitle: 'Do Mingle vận hành',
    operatorSheetBody: 'Tài khoản này không phải của cá nhân mà do đội ngũ Mingle vận hành. Bài viết và câu trả lời do nhân viên Mingle viết.',
    chatDisclosure: 'Cuộc trò chuyện này có một tài khoản do đội ngũ Mingle vận hành. Nhân viên Mingle đọc và trả lời tin nhắn của tài khoản này.',
    pushLabel: 'Do Mingle vận hành',
  },
}

export function accountBadgeCopy(locale: string): AccountBadgeCopy {
  return copy[resolveLegalDocumentLocale(resolveSupportedLocaleTag(locale) || 'en')]
}
