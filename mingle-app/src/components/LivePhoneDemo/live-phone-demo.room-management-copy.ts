import {
  DEFAULT_LOCALE,
  resolveLegalDocumentLocale,
  resolveSupportedLocaleTag,
  type LegalDocumentLocale,
} from '@/i18n/config'

export type LivePhoneDemoRoomManagementCopy = {
  menuItemLabel: string
  pageTitle: string
  backButtonLabel: string
}

const ROOM_MANAGEMENT_COPY_BY_LOCALE = {
  ko: {
    menuItemLabel: '대화방 관리',
    pageTitle: '대화방 관리',
    backButtonLabel: '뒤로가기',
  },
  en: {
    menuItemLabel: 'Conversation management',
    pageTitle: 'Conversation management',
    backButtonLabel: 'Go back',
  },
  ja: {
    menuItemLabel: '会話ルーム管理',
    pageTitle: '会話ルーム管理',
    backButtonLabel: '戻る',
  },
  'zh-CN': {
    menuItemLabel: '会话房间管理',
    pageTitle: '会话房间管理',
    backButtonLabel: '返回',
  },
  'zh-TW': {
    menuItemLabel: '對話房間管理',
    pageTitle: '對話房間管理',
    backButtonLabel: '返回',
  },
  fr: {
    menuItemLabel: 'Gestion de la conversation',
    pageTitle: 'Gestion de la conversation',
    backButtonLabel: 'Retour',
  },
  de: {
    menuItemLabel: 'Verwaltung des Gesprächs',
    pageTitle: 'Verwaltung des Gesprächs',
    backButtonLabel: 'Zurück',
  },
  es: {
    menuItemLabel: 'Gestion de la conversacion',
    pageTitle: 'Gestion de la conversacion',
    backButtonLabel: 'Volver',
  },
  pt: {
    menuItemLabel: 'Gerenciamento da conversa',
    pageTitle: 'Gerenciamento da conversa',
    backButtonLabel: 'Voltar',
  },
  it: {
    menuItemLabel: 'Gestione della conversazione',
    pageTitle: 'Gestione della conversazione',
    backButtonLabel: 'Indietro',
  },
  ru: {
    menuItemLabel: 'Управление разговором',
    pageTitle: 'Управление разговором',
    backButtonLabel: 'Назад',
  },
  ar: {
    menuItemLabel: 'إدارة المحادثة',
    pageTitle: 'إدارة المحادثة',
    backButtonLabel: 'رجوع',
  },
  hi: {
    menuItemLabel: 'बातचीत प्रबंधन',
    pageTitle: 'बातचीत प्रबंधन',
    backButtonLabel: 'वापस',
  },
  th: {
    menuItemLabel: 'จัดการห้องสนทนา',
    pageTitle: 'จัดการห้องสนทนา',
    backButtonLabel: 'ย้อนกลับ',
  },
  vi: {
    menuItemLabel: 'Quan ly cuoc tro chuyen',
    pageTitle: 'Quan ly cuoc tro chuyen',
    backButtonLabel: 'Quay lai',
  },
} satisfies Record<LegalDocumentLocale, LivePhoneDemoRoomManagementCopy>

export function resolveLivePhoneDemoRoomManagementCopy(
  uiLocale: string,
): LivePhoneDemoRoomManagementCopy {
  const supportedLocale = resolveSupportedLocaleTag(uiLocale) ?? DEFAULT_LOCALE
  const resolvedLocale = resolveLegalDocumentLocale(supportedLocale)

  return ROOM_MANAGEMENT_COPY_BY_LOCALE[resolvedLocale] ?? ROOM_MANAGEMENT_COPY_BY_LOCALE.en
}
