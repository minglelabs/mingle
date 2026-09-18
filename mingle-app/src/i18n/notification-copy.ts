import {
  DEFAULT_LOCALE,
  resolveLegalDocumentLocale,
  resolveSupportedLocaleTag,
  type AppLocale,
  type LegalDocumentLocale,
} from '@/i18n/config'

export type NotificationCopy = {
  buttonLabel: string
  title: string
  closeAction: string
  loadingLabel: string
  emptyLabel: string
  unreadSectionLabel: string
  readSectionLabel: string
  followMessage: string
  followBackAction: string
  followingAction: string
  loadError: string
  followError: string
  retryAction: string
  justNow: string
  minutesAgo: string
  hoursAgo: string
}

const COPY_BY_LOCALE: Record<LegalDocumentLocale, NotificationCopy> = {
  ko: {
    buttonLabel: '알림', title: '알림', closeAction: '알림 닫기', loadingLabel: '알림을 불러오는 중', emptyLabel: '아직 알림이 없어요',
    unreadSectionLabel: '읽지 않음', readSectionLabel: '읽음', followMessage: '님이 회원님을 팔로우했습니다.', followBackAction: '맞팔로우', followingAction: '팔로잉',
    loadError: '알림을 불러오지 못했습니다.', followError: '팔로우하지 못했습니다.', retryAction: '다시 시도', justNow: '방금 전', minutesAgo: '{count}분 전', hoursAgo: '{count}시간 전',
  },
  en: {
    buttonLabel: 'Notifications', title: 'Notifications', closeAction: 'Close notifications', loadingLabel: 'Loading notifications', emptyLabel: 'No notifications yet',
    unreadSectionLabel: 'Unread', readSectionLabel: 'Read', followMessage: 'followed you.', followBackAction: 'Follow back', followingAction: 'Following',
    loadError: 'Could not load notifications.', followError: 'Could not follow this user.', retryAction: 'Try again', justNow: 'Just now', minutesAgo: '{count}m ago', hoursAgo: '{count}h ago',
  },
  ja: {
    buttonLabel: '通知', title: '通知', closeAction: '通知を閉じる', loadingLabel: '通知を読み込み中', emptyLabel: '通知はまだありません',
    unreadSectionLabel: '未読', readSectionLabel: '既読', followMessage: 'さんがあなたをフォローしました。', followBackAction: 'フォローを返す', followingAction: 'フォロー中',
    loadError: '通知を読み込めませんでした。', followError: 'フォローできませんでした。', retryAction: '再試行', justNow: 'たった今', minutesAgo: '{count}分前', hoursAgo: '{count}時間前',
  },
  'zh-CN': {
    buttonLabel: '通知', title: '通知', closeAction: '关闭通知', loadingLabel: '正在加载通知', emptyLabel: '暂无通知',
    unreadSectionLabel: '未读', readSectionLabel: '已读', followMessage: '关注了你。', followBackAction: '回关', followingAction: '已关注',
    loadError: '无法加载通知。', followError: '无法关注此用户。', retryAction: '重试', justNow: '刚刚', minutesAgo: '{count}分钟前', hoursAgo: '{count}小时前',
  },
  'zh-TW': {
    buttonLabel: '通知', title: '通知', closeAction: '關閉通知', loadingLabel: '正在載入通知', emptyLabel: '目前沒有通知',
    unreadSectionLabel: '未讀', readSectionLabel: '已讀', followMessage: '追蹤了你。', followBackAction: '回追', followingAction: '已追蹤',
    loadError: '無法載入通知。', followError: '無法追蹤此使用者。', retryAction: '重試', justNow: '剛剛', minutesAgo: '{count}分鐘前', hoursAgo: '{count}小時前',
  },
  fr: {
    buttonLabel: 'Notifications', title: 'Notifications', closeAction: 'Fermer les notifications', loadingLabel: 'Chargement des notifications', emptyLabel: 'Aucune notification pour le moment',
    unreadSectionLabel: 'Non lues', readSectionLabel: 'Lues', followMessage: 'vous suit.', followBackAction: 'Suivre en retour', followingAction: 'Abonné',
    loadError: 'Impossible de charger les notifications.', followError: 'Impossible de suivre cet utilisateur.', retryAction: 'Réessayer', justNow: 'À l’instant', minutesAgo: 'Il y a {count} min', hoursAgo: 'Il y a {count} h',
  },
  de: {
    buttonLabel: 'Benachrichtigungen', title: 'Benachrichtigungen', closeAction: 'Benachrichtigungen schließen', loadingLabel: 'Benachrichtigungen werden geladen', emptyLabel: 'Noch keine Benachrichtigungen',
    unreadSectionLabel: 'Ungelesen', readSectionLabel: 'Gelesen', followMessage: 'folgt Ihnen.', followBackAction: 'Zurückfolgen', followingAction: 'Folge ich',
    loadError: 'Benachrichtigungen konnten nicht geladen werden.', followError: 'Diesem Nutzer konnte nicht gefolgt werden.', retryAction: 'Erneut versuchen', justNow: 'Gerade eben', minutesAgo: 'Vor {count} Min.', hoursAgo: 'Vor {count} Std.',
  },
  es: {
    buttonLabel: 'Notificaciones', title: 'Notificaciones', closeAction: 'Cerrar notificaciones', loadingLabel: 'Cargando notificaciones', emptyLabel: 'Aún no hay notificaciones',
    unreadSectionLabel: 'No leídas', readSectionLabel: 'Leídas', followMessage: 'te ha seguido.', followBackAction: 'Seguir también', followingAction: 'Siguiendo',
    loadError: 'No se pudieron cargar las notificaciones.', followError: 'No se pudo seguir a este usuario.', retryAction: 'Intentar de nuevo', justNow: 'Ahora mismo', minutesAgo: 'Hace {count} min', hoursAgo: 'Hace {count} h',
  },
  pt: {
    buttonLabel: 'Notificações', title: 'Notificações', closeAction: 'Fechar notificações', loadingLabel: 'Carregando notificações', emptyLabel: 'Ainda não há notificações',
    unreadSectionLabel: 'Não lidas', readSectionLabel: 'Lidas', followMessage: 'seguiu você.', followBackAction: 'Seguir de volta', followingAction: 'Seguindo',
    loadError: 'Não foi possível carregar as notificações.', followError: 'Não foi possível seguir este usuário.', retryAction: 'Tentar novamente', justNow: 'Agora mesmo', minutesAgo: 'Há {count} min', hoursAgo: 'Há {count} h',
  },
  it: {
    buttonLabel: 'Notifiche', title: 'Notifiche', closeAction: 'Chiudi notifiche', loadingLabel: 'Caricamento notifiche', emptyLabel: 'Nessuna notifica ancora',
    unreadSectionLabel: 'Non lette', readSectionLabel: 'Lette', followMessage: 'ti segue.', followBackAction: 'Segui a tua volta', followingAction: 'Segui già',
    loadError: 'Impossibile caricare le notifiche.', followError: 'Impossibile seguire questo utente.', retryAction: 'Riprova', justNow: 'Proprio ora', minutesAgo: '{count} min fa', hoursAgo: '{count} ore fa',
  },
  ru: {
    buttonLabel: 'Уведомления', title: 'Уведомления', closeAction: 'Закрыть уведомления', loadingLabel: 'Загрузка уведомлений', emptyLabel: 'Уведомлений пока нет',
    unreadSectionLabel: 'Непрочитанные', readSectionLabel: 'Прочитанные', followMessage: 'подписался на вас.', followBackAction: 'Подписаться в ответ', followingAction: 'Вы подписаны',
    loadError: 'Не удалось загрузить уведомления.', followError: 'Не удалось подписаться на пользователя.', retryAction: 'Повторить', justNow: 'Только что', minutesAgo: '{count} мин назад', hoursAgo: '{count} ч назад',
  },
  ar: {
    buttonLabel: 'الإشعارات', title: 'الإشعارات', closeAction: 'إغلاق الإشعارات', loadingLabel: 'جارٍ تحميل الإشعارات', emptyLabel: 'لا توجد إشعارات بعد',
    unreadSectionLabel: 'غير مقروءة', readSectionLabel: 'مقروءة', followMessage: 'يتابعك.', followBackAction: 'متابعة متبادلة', followingAction: 'تتابعه',
    loadError: 'تعذر تحميل الإشعارات.', followError: 'تعذرت متابعة هذا المستخدم.', retryAction: 'إعادة المحاولة', justNow: 'منذ لحظات', minutesAgo: 'منذ {count} دقيقة', hoursAgo: 'منذ {count} ساعة',
  },
  hi: {
    buttonLabel: 'सूचनाएँ', title: 'सूचनाएँ', closeAction: 'सूचनाएँ बंद करें', loadingLabel: 'सूचनाएँ लोड हो रही हैं', emptyLabel: 'अभी कोई सूचना नहीं है',
    unreadSectionLabel: 'अपठित', readSectionLabel: 'पठित', followMessage: 'ने आपको फ़ॉलो किया।', followBackAction: 'वापस फ़ॉलो करें', followingAction: 'फ़ॉलो कर रहे हैं',
    loadError: 'सूचनाएँ लोड नहीं की जा सकीं।', followError: 'इस उपयोगकर्ता को फ़ॉलो नहीं किया जा सका।', retryAction: 'फिर से कोशिश करें', justNow: 'अभी', minutesAgo: '{count} मिनट पहले', hoursAgo: '{count} घंटे पहले',
  },
  th: {
    buttonLabel: 'การแจ้งเตือน', title: 'การแจ้งเตือน', closeAction: 'ปิดการแจ้งเตือน', loadingLabel: 'กำลังโหลดการแจ้งเตือน', emptyLabel: 'ยังไม่มีการแจ้งเตือน',
    unreadSectionLabel: 'ยังไม่ได้อ่าน', readSectionLabel: 'อ่านแล้ว', followMessage: 'ติดตามคุณ', followBackAction: 'ติดตามกลับ', followingAction: 'กำลังติดตาม',
    loadError: 'โหลดการแจ้งเตือนไม่สำเร็จ', followError: 'ติดตามผู้ใช้นี้ไม่สำเร็จ', retryAction: 'ลองอีกครั้ง', justNow: 'เมื่อสักครู่นี้', minutesAgo: '{count} นาทีที่แล้ว', hoursAgo: '{count} ชั่วโมงที่แล้ว',
  },
  vi: {
    buttonLabel: 'Thông báo', title: 'Thông báo', closeAction: 'Đóng thông báo', loadingLabel: 'Đang tải thông báo', emptyLabel: 'Chưa có thông báo',
    unreadSectionLabel: 'Chưa đọc', readSectionLabel: 'Đã đọc', followMessage: 'đã theo dõi bạn.', followBackAction: 'Theo dõi lại', followingAction: 'Đang theo dõi',
    loadError: 'Không thể tải thông báo.', followError: 'Không thể theo dõi người dùng này.', retryAction: 'Thử lại', justNow: 'Vừa xong', minutesAgo: '{count} phút trước', hoursAgo: '{count} giờ trước',
  },
}

export function resolveNotificationCopy(locale: AppLocale): NotificationCopy {
  const supportedLocale = resolveSupportedLocaleTag(locale) ?? DEFAULT_LOCALE
  return COPY_BY_LOCALE[resolveLegalDocumentLocale(supportedLocale)]
}
