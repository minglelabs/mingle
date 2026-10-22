import { resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from './config'

type ConversationSortCopy = { menuLabel: string; title: string; recent: string; unreadFirst: string }
const copy: Record<LegalDocumentLocale, ConversationSortCopy> = {
  ko: { menuLabel: '대화목록 설정', title: '정렬', recent: '최근 대화순', unreadFirst: '안 읽은 대화 먼저' },
  en: { menuLabel: 'Chat list settings', title: 'Sort', recent: 'Most recent', unreadFirst: 'Unread first' },
  ja: { menuLabel: 'チャットリスト設定', title: '並べ替え', recent: '新しい順', unreadFirst: '未読を先に表示' },
  'zh-CN': { menuLabel: '聊天列表设置', title: '排序', recent: '最近会话', unreadFirst: '未读优先' },
  'zh-TW': { menuLabel: '聊天列表設定', title: '排序', recent: '最近對話', unreadFirst: '未讀優先' },
  fr: { menuLabel: 'Paramètres de la liste', title: 'Trier', recent: 'Plus récentes', unreadFirst: 'Non lues en premier' },
  de: { menuLabel: 'Chatlisten-Einstellungen', title: 'Sortieren', recent: 'Neueste zuerst', unreadFirst: 'Ungelesene zuerst' },
  es: { menuLabel: 'Ajustes de la lista', title: 'Ordenar', recent: 'Más recientes', unreadFirst: 'No leídos primero' },
  pt: { menuLabel: 'Configurações da lista', title: 'Ordenar', recent: 'Mais recentes', unreadFirst: 'Não lidas primeiro' },
  it: { menuLabel: 'Impostazioni elenco chat', title: 'Ordina', recent: 'Più recenti', unreadFirst: 'Non letti prima' },
  ru: { menuLabel: 'Настройки списка чатов', title: 'Сортировка', recent: 'Сначала новые', unreadFirst: 'Сначала непрочитанные' },
  ar: { menuLabel: 'إعدادات قائمة الدردشات', title: 'الترتيب', recent: 'الأحدث', unreadFirst: 'غير المقروءة أولًا' },
  hi: { menuLabel: 'चैट सूची सेटिंग्स', title: 'क्रम', recent: 'सबसे हाल की', unreadFirst: 'अपठित पहले' },
  th: { menuLabel: 'ตั้งค่ารายการแชท', title: 'เรียงลำดับ', recent: 'ล่าสุด', unreadFirst: 'ยังไม่อ่านก่อน' },
  vi: { menuLabel: 'Cài đặt danh sách chat', title: 'Sắp xếp', recent: 'Gần đây nhất', unreadFirst: 'Chưa đọc trước' },
}
export function conversationSortCopy(locale: string): ConversationSortCopy {
  return copy[resolveLegalDocumentLocale(resolveSupportedLocaleTag(locale) || 'en')]
}
