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
  // Posting-feature notification messages. Each carries the actor's name via
  // the surrounding renderer, so the string is the tail ("… liked your post").
  postLikeMessage: string
  commentLikeMessage: string
  commentMessage: string
  replyMessage: string
  reportResolvedMessage: string
  // Grouped-like suffix, e.g. "and 4 others". {count} = the OTHER actors
  // beyond the named one.
  andOthers: string
  // "Load more" button at the end of the list (older pages).
  loadMoreAction: string
  // The app-notification switch on My page.
  inAppToggleTitle: string
  inAppToggleDescription: string
  // Push notification title/body per event. {name} = the actor's display label.
  push: PushNotificationCopy
}

export type PushNotificationCopy = {
  followTitle: string
  followBody: string
  commentTitle: string
  commentBody: string
  replyTitle: string
  replyBody: string
}

const COPY_BY_LOCALE: Record<LegalDocumentLocale, NotificationCopy> = {
  ko: {
    buttonLabel: '알림', title: '알림', closeAction: '알림 닫기', loadingLabel: '알림을 불러오는 중', emptyLabel: '아직 알림이 없어요',
    unreadSectionLabel: '읽지 않음', readSectionLabel: '읽음', followMessage: '님이 회원님을 팔로우했습니다.', followBackAction: '맞팔로우', followingAction: '팔로잉',
    loadError: '알림을 불러오지 못했습니다.', followError: '팔로우하지 못했습니다.', retryAction: '다시 시도', justNow: '방금 전', minutesAgo: '{count}분 전', hoursAgo: '{count}시간 전',
    postLikeMessage: '님이 회원님의 게시물을 좋아합니다.', commentLikeMessage: '님이 회원님의 댓글을 좋아합니다.', commentMessage: '님이 회원님의 게시물에 댓글을 남겼습니다.', replyMessage: '님이 회원님의 댓글에 답글을 남겼습니다.', reportResolvedMessage: '신고가 처리되었습니다.', andOthers: '외 {count}명',
    loadMoreAction: '알림 더 보기', inAppToggleTitle: '앱 알림', inAppToggleDescription: '팔로우·좋아요·댓글·답글·신고 처리 알림을 앱에서 받습니다.',
    push: { followTitle: '새 팔로워', followBody: '{name}님이 회원님을 팔로우했습니다.', commentTitle: '새 댓글', commentBody: '{name}님이 회원님의 게시물에 댓글을 남겼습니다.', replyTitle: '새 답글', replyBody: '{name}님이 회원님의 댓글에 답글을 남겼습니다.' },
  },
  en: {
    buttonLabel: 'Notifications', title: 'Notifications', closeAction: 'Close notifications', loadingLabel: 'Loading notifications', emptyLabel: 'No notifications yet',
    unreadSectionLabel: 'Unread', readSectionLabel: 'Read', followMessage: 'followed you.', followBackAction: 'Follow back', followingAction: 'Following',
    loadError: 'Could not load notifications.', followError: 'Could not follow this user.', retryAction: 'Try again', justNow: 'Just now', minutesAgo: '{count}m ago', hoursAgo: '{count}h ago',
    postLikeMessage: 'liked your post.', commentLikeMessage: 'liked your comment.', commentMessage: 'commented on your post.', replyMessage: 'replied to your comment.', reportResolvedMessage: 'Your report has been handled.', andOthers: 'and {count} others',
    loadMoreAction: 'Show more notifications', inAppToggleTitle: 'App notifications', inAppToggleDescription: 'Receive follow, like, comment, reply and report-result notifications in the app.',
    push: { followTitle: 'New follower', followBody: '{name} followed you.', commentTitle: 'New comment', commentBody: '{name} commented on your post.', replyTitle: 'New reply', replyBody: '{name} replied to your comment.' },
  },
  ja: {
    buttonLabel: '通知', title: '通知', closeAction: '通知を閉じる', loadingLabel: '通知を読み込み中', emptyLabel: '通知はまだありません',
    unreadSectionLabel: '未読', readSectionLabel: '既読', followMessage: 'さんがあなたをフォローしました。', followBackAction: 'フォローを返す', followingAction: 'フォロー中',
    loadError: '通知を読み込めませんでした。', followError: 'フォローできませんでした。', retryAction: '再試行', justNow: 'たった今', minutesAgo: '{count}分前', hoursAgo: '{count}時間前',
    postLikeMessage: 'さんがあなたの投稿にいいねしました。', commentLikeMessage: 'さんがあなたのコメントにいいねしました。', commentMessage: 'さんがあなたの投稿にコメントしました。', replyMessage: 'さんがあなたのコメントに返信しました。', reportResolvedMessage: '通報が処理されました。', andOthers: '他{count}人',
    loadMoreAction: '通知をさらに表示', inAppToggleTitle: 'アプリ通知', inAppToggleDescription: 'フォロー・いいね・コメント・返信・通報の処理結果の通知をアプリで受け取ります。',
    push: { followTitle: '新しいフォロワー', followBody: '{name}さんがあなたをフォローしました。', commentTitle: '新しいコメント', commentBody: '{name}さんがあなたの投稿にコメントしました。', replyTitle: '新しい返信', replyBody: '{name}さんがあなたのコメントに返信しました。' },
  },
  'zh-CN': {
    buttonLabel: '通知', title: '通知', closeAction: '关闭通知', loadingLabel: '正在加载通知', emptyLabel: '暂无通知',
    unreadSectionLabel: '未读', readSectionLabel: '已读', followMessage: '关注了你。', followBackAction: '回关', followingAction: '已关注',
    loadError: '无法加载通知。', followError: '无法关注此用户。', retryAction: '重试', justNow: '刚刚', minutesAgo: '{count}分钟前', hoursAgo: '{count}小时前',
    postLikeMessage: '赞了你的动态。', commentLikeMessage: '赞了你的评论。', commentMessage: '评论了你的动态。', replyMessage: '回复了你的评论。', reportResolvedMessage: '举报已处理。', andOthers: '等{count}人',
    loadMoreAction: '查看更多通知', inAppToggleTitle: '应用通知', inAppToggleDescription: '在应用中接收关注、点赞、评论、回复和举报处理结果的通知。',
    push: { followTitle: '新的关注者', followBody: '{name}关注了你。', commentTitle: '新评论', commentBody: '{name}评论了你的动态。', replyTitle: '新回复', replyBody: '{name}回复了你的评论。' },
  },
  'zh-TW': {
    buttonLabel: '通知', title: '通知', closeAction: '關閉通知', loadingLabel: '正在載入通知', emptyLabel: '目前沒有通知',
    unreadSectionLabel: '未讀', readSectionLabel: '已讀', followMessage: '追蹤了你。', followBackAction: '回追', followingAction: '已追蹤',
    loadError: '無法載入通知。', followError: '無法追蹤此使用者。', retryAction: '重試', justNow: '剛剛', minutesAgo: '{count}分鐘前', hoursAgo: '{count}小時前',
    postLikeMessage: '喜歡了你的貼文。', commentLikeMessage: '喜歡了你的留言。', commentMessage: '在你的貼文留言了。', replyMessage: '回覆了你的留言。', reportResolvedMessage: '檢舉已處理。', andOthers: '等{count}人',
    loadMoreAction: '查看更多通知', inAppToggleTitle: '應用程式通知', inAppToggleDescription: '在應用程式中接收追蹤、按讚、留言、回覆和檢舉處理結果的通知。',
    push: { followTitle: '新的追蹤者', followBody: '{name}追蹤了你。', commentTitle: '新留言', commentBody: '{name}在你的貼文留言了。', replyTitle: '新回覆', replyBody: '{name}回覆了你的留言。' },
  },
  fr: {
    buttonLabel: 'Notifications', title: 'Notifications', closeAction: 'Fermer les notifications', loadingLabel: 'Chargement des notifications', emptyLabel: 'Aucune notification pour le moment',
    unreadSectionLabel: 'Non lues', readSectionLabel: 'Lues', followMessage: 'vous suit.', followBackAction: 'Suivre en retour', followingAction: 'Abonné',
    loadError: 'Impossible de charger les notifications.', followError: 'Impossible de suivre cet utilisateur.', retryAction: 'Réessayer', justNow: 'À l’instant', minutesAgo: 'Il y a {count} min', hoursAgo: 'Il y a {count} h',
    postLikeMessage: 'a aimé votre publication.', commentLikeMessage: 'a aimé votre commentaire.', commentMessage: 'a commenté votre publication.', replyMessage: 'a répondu à votre commentaire.', reportResolvedMessage: 'Votre signalement a été traité.', andOthers: 'et {count} autres',
    loadMoreAction: 'Afficher plus de notifications', inAppToggleTitle: 'Notifications de l’app', inAppToggleDescription: 'Recevez dans l’app les notifications d’abonnements, de mentions J’aime, de commentaires, de réponses et de suivi des signalements.',
    push: { followTitle: 'Nouveau follower', followBody: '{name} vous suit maintenant.', commentTitle: 'Nouveau commentaire', commentBody: '{name} a commenté votre publication.', replyTitle: 'Nouvelle réponse', replyBody: '{name} a répondu à votre commentaire.' },
  },
  de: {
    buttonLabel: 'Benachrichtigungen', title: 'Benachrichtigungen', closeAction: 'Benachrichtigungen schließen', loadingLabel: 'Benachrichtigungen werden geladen', emptyLabel: 'Noch keine Benachrichtigungen',
    unreadSectionLabel: 'Ungelesen', readSectionLabel: 'Gelesen', followMessage: 'folgt Ihnen.', followBackAction: 'Zurückfolgen', followingAction: 'Folge ich',
    loadError: 'Benachrichtigungen konnten nicht geladen werden.', followError: 'Diesem Nutzer konnte nicht gefolgt werden.', retryAction: 'Erneut versuchen', justNow: 'Gerade eben', minutesAgo: 'Vor {count} Min.', hoursAgo: 'Vor {count} Std.',
    postLikeMessage: 'gefällt dein Beitrag.', commentLikeMessage: 'gefällt dein Kommentar.', commentMessage: 'hat deinen Beitrag kommentiert.', replyMessage: 'hat auf deinen Kommentar geantwortet.', reportResolvedMessage: 'Deine Meldung wurde bearbeitet.', andOthers: 'und {count} weitere',
    loadMoreAction: 'Weitere Benachrichtigungen anzeigen', inAppToggleTitle: 'App-Benachrichtigungen', inAppToggleDescription: 'Erhalte in der App Benachrichtigungen zu Followern, Likes, Kommentaren, Antworten und Meldungsergebnissen.',
    push: { followTitle: 'Neuer Follower', followBody: '{name} folgt Ihnen jetzt.', commentTitle: 'Neuer Kommentar', commentBody: '{name} hat deinen Beitrag kommentiert.', replyTitle: 'Neue Antwort', replyBody: '{name} hat auf deinen Kommentar geantwortet.' },
  },
  es: {
    buttonLabel: 'Notificaciones', title: 'Notificaciones', closeAction: 'Cerrar notificaciones', loadingLabel: 'Cargando notificaciones', emptyLabel: 'Aún no hay notificaciones',
    unreadSectionLabel: 'No leídas', readSectionLabel: 'Leídas', followMessage: 'te ha seguido.', followBackAction: 'Seguir también', followingAction: 'Siguiendo',
    loadError: 'No se pudieron cargar las notificaciones.', followError: 'No se pudo seguir a este usuario.', retryAction: 'Intentar de nuevo', justNow: 'Ahora mismo', minutesAgo: 'Hace {count} min', hoursAgo: 'Hace {count} h',
    postLikeMessage: 'le gustó tu publicación.', commentLikeMessage: 'le gustó tu comentario.', commentMessage: 'comentó tu publicación.', replyMessage: 'respondió a tu comentario.', reportResolvedMessage: 'Tu reporte ha sido gestionado.', andOthers: 'y {count} más',
    loadMoreAction: 'Ver más notificaciones', inAppToggleTitle: 'Notificaciones de la app', inAppToggleDescription: 'Recibe en la app notificaciones de seguidores, me gusta, comentarios, respuestas y resultados de denuncias.',
    push: { followTitle: 'Nuevo seguidor', followBody: '{name} empezó a seguirte.', commentTitle: 'Nuevo comentario', commentBody: '{name} comentó tu publicación.', replyTitle: 'Nueva respuesta', replyBody: '{name} respondió a tu comentario.' },
  },
  pt: {
    buttonLabel: 'Notificações', title: 'Notificações', closeAction: 'Fechar notificações', loadingLabel: 'Carregando notificações', emptyLabel: 'Ainda não há notificações',
    unreadSectionLabel: 'Não lidas', readSectionLabel: 'Lidas', followMessage: 'seguiu você.', followBackAction: 'Seguir de volta', followingAction: 'Seguindo',
    loadError: 'Não foi possível carregar as notificações.', followError: 'Não foi possível seguir este usuário.', retryAction: 'Tentar novamente', justNow: 'Agora mesmo', minutesAgo: 'Há {count} min', hoursAgo: 'Há {count} h',
    postLikeMessage: 'curtiu sua publicação.', commentLikeMessage: 'curtiu seu comentário.', commentMessage: 'comentou na sua publicação.', replyMessage: 'respondeu ao seu comentário.', reportResolvedMessage: 'Sua denúncia foi tratada.', andOthers: 'e mais {count}',
    loadMoreAction: 'Ver mais notificações', inAppToggleTitle: 'Notificações do app', inAppToggleDescription: 'Receba no app notificações de seguidores, curtidas, comentários, respostas e resultados de denúncias.',
    push: { followTitle: 'Novo seguidor', followBody: '{name} começou a seguir você.', commentTitle: 'Novo comentário', commentBody: '{name} comentou na sua publicação.', replyTitle: 'Nova resposta', replyBody: '{name} respondeu ao seu comentário.' },
  },
  it: {
    buttonLabel: 'Notifiche', title: 'Notifiche', closeAction: 'Chiudi notifiche', loadingLabel: 'Caricamento notifiche', emptyLabel: 'Nessuna notifica ancora',
    unreadSectionLabel: 'Non lette', readSectionLabel: 'Lette', followMessage: 'ti segue.', followBackAction: 'Segui a tua volta', followingAction: 'Segui già',
    loadError: 'Impossibile caricare le notifiche.', followError: 'Impossibile seguire questo utente.', retryAction: 'Riprova', justNow: 'Proprio ora', minutesAgo: '{count} min fa', hoursAgo: '{count} ore fa',
    postLikeMessage: 'ha messo mi piace al tuo post.', commentLikeMessage: 'ha messo mi piace al tuo commento.', commentMessage: 'ha commentato il tuo post.', replyMessage: 'ha risposto al tuo commento.', reportResolvedMessage: 'La tua segnalazione è stata gestita.', andOthers: 'e altri {count}',
    loadMoreAction: 'Mostra altre notifiche', inAppToggleTitle: 'Notifiche dell’app', inAppToggleDescription: 'Ricevi nell’app le notifiche di follower, mi piace, commenti, risposte ed esiti delle segnalazioni.',
    push: { followTitle: 'Nuovo follower', followBody: '{name} ha iniziato a seguirti.', commentTitle: 'Nuovo commento', commentBody: '{name} ha commentato il tuo post.', replyTitle: 'Nuova risposta', replyBody: '{name} ha risposto al tuo commento.' },
  },
  ru: {
    buttonLabel: 'Уведомления', title: 'Уведомления', closeAction: 'Закрыть уведомления', loadingLabel: 'Загрузка уведомлений', emptyLabel: 'Уведомлений пока нет',
    unreadSectionLabel: 'Непрочитанные', readSectionLabel: 'Прочитанные', followMessage: 'подписался на вас.', followBackAction: 'Подписаться в ответ', followingAction: 'Вы подписаны',
    loadError: 'Не удалось загрузить уведомления.', followError: 'Не удалось подписаться на пользователя.', retryAction: 'Повторить', justNow: 'Только что', minutesAgo: '{count} мин назад', hoursAgo: '{count} ч назад',
    postLikeMessage: 'оценил(а) вашу публикацию.', commentLikeMessage: 'оценил(а) ваш комментарий.', commentMessage: 'прокомментировал(а) вашу публикацию.', replyMessage: 'ответил(а) на ваш комментарий.', reportResolvedMessage: 'Ваша жалоба обработана.', andOthers: 'и ещё {count}',
    loadMoreAction: 'Показать больше уведомлений', inAppToggleTitle: 'Уведомления в приложении', inAppToggleDescription: 'Получайте в приложении уведомления о подписках, лайках, комментариях, ответах и результатах жалоб.',
    push: { followTitle: 'Новый подписчик', followBody: '{name} подписался(-ась) на вас.', commentTitle: 'Новый комментарий', commentBody: '{name} прокомментировал(а) вашу публикацию.', replyTitle: 'Новый ответ', replyBody: '{name} ответил(а) на ваш комментарий.' },
  },
  ar: {
    buttonLabel: 'الإشعارات', title: 'الإشعارات', closeAction: 'إغلاق الإشعارات', loadingLabel: 'جارٍ تحميل الإشعارات', emptyLabel: 'لا توجد إشعارات بعد',
    unreadSectionLabel: 'غير مقروءة', readSectionLabel: 'مقروءة', followMessage: 'يتابعك.', followBackAction: 'متابعة متبادلة', followingAction: 'تتابعه',
    loadError: 'تعذر تحميل الإشعارات.', followError: 'تعذرت متابعة هذا المستخدم.', retryAction: 'إعادة المحاولة', justNow: 'منذ لحظات', minutesAgo: 'منذ {count} دقيقة', hoursAgo: 'منذ {count} ساعة',
    postLikeMessage: 'أعجِب بمنشورك.', commentLikeMessage: 'أعجِب بتعليقك.', commentMessage: 'علّق على منشورك.', replyMessage: 'رد على تعليقك.', reportResolvedMessage: 'تمت معالجة بلاغك.', andOthers: 'و{count} آخرين',
    loadMoreAction: 'عرض المزيد من الإشعارات', inAppToggleTitle: 'إشعارات التطبيق', inAppToggleDescription: 'تلقَّ داخل التطبيق إشعارات المتابعة والإعجابات والتعليقات والردود ونتائج البلاغات.',
    push: { followTitle: 'متابع جديد', followBody: 'بدأ {name} بمتابعتك.', commentTitle: 'تعليق جديد', commentBody: 'علّق {name} على منشورك.', replyTitle: 'رد جديد', replyBody: 'ردّ {name} على تعليقك.' },
  },
  hi: {
    buttonLabel: 'सूचनाएँ', title: 'सूचनाएँ', closeAction: 'सूचनाएँ बंद करें', loadingLabel: 'सूचनाएँ लोड हो रही हैं', emptyLabel: 'अभी कोई सूचना नहीं है',
    unreadSectionLabel: 'अपठित', readSectionLabel: 'पठित', followMessage: 'ने आपको फ़ॉलो किया।', followBackAction: 'वापस फ़ॉलो करें', followingAction: 'फ़ॉलो कर रहे हैं',
    loadError: 'सूचनाएँ लोड नहीं की जा सकीं।', followError: 'इस उपयोगकर्ता को फ़ॉलो नहीं किया जा सका।', retryAction: 'फिर से कोशिश करें', justNow: 'अभी', minutesAgo: '{count} मिनट पहले', hoursAgo: '{count} घंटे पहले',
    postLikeMessage: 'ने आपकी पोस्ट को पसंद किया।', commentLikeMessage: 'ने आपकी टिप्पणी को पसंद किया।', commentMessage: 'ने आपकी पोस्ट पर टिप्पणी की।', replyMessage: 'ने आपकी टिप्पणी का उत्तर दिया।', reportResolvedMessage: 'आपकी शिकायत का समाधान हो गया है।', andOthers: 'और {count} अन्य',
    loadMoreAction: 'और सूचनाएँ देखें', inAppToggleTitle: 'ऐप सूचनाएँ', inAppToggleDescription: 'फ़ॉलो, पसंद, टिप्पणी, उत्तर और रिपोर्ट के नतीजों की सूचनाएँ ऐप में पाएँ।',
    push: { followTitle: 'नया फ़ॉलोअर', followBody: '{name} ने आपको फ़ॉलो किया।', commentTitle: 'नई टिप्पणी', commentBody: '{name} ने आपकी पोस्ट पर टिप्पणी की।', replyTitle: 'नया उत्तर', replyBody: '{name} ने आपकी टिप्पणी का उत्तर दिया।' },
  },
  th: {
    buttonLabel: 'การแจ้งเตือน', title: 'การแจ้งเตือน', closeAction: 'ปิดการแจ้งเตือน', loadingLabel: 'กำลังโหลดการแจ้งเตือน', emptyLabel: 'ยังไม่มีการแจ้งเตือน',
    unreadSectionLabel: 'ยังไม่ได้อ่าน', readSectionLabel: 'อ่านแล้ว', followMessage: 'ติดตามคุณ', followBackAction: 'ติดตามกลับ', followingAction: 'กำลังติดตาม',
    loadError: 'โหลดการแจ้งเตือนไม่สำเร็จ', followError: 'ติดตามผู้ใช้นี้ไม่สำเร็จ', retryAction: 'ลองอีกครั้ง', justNow: 'เมื่อสักครู่นี้', minutesAgo: '{count} นาทีที่แล้ว', hoursAgo: '{count} ชั่วโมงที่แล้ว',
    postLikeMessage: 'ถูกใจโพสต์ของคุณ', commentLikeMessage: 'ถูกใจความคิดเห็นของคุณ', commentMessage: 'แสดงความคิดเห็นในโพสต์ของคุณ', replyMessage: 'ตอบกลับความคิดเห็นของคุณ', reportResolvedMessage: 'รายงานของคุณได้รับการดำเนินการแล้ว', andOthers: 'และอีก {count} คน',
    loadMoreAction: 'ดูการแจ้งเตือนเพิ่มเติม', inAppToggleTitle: 'การแจ้งเตือนในแอป', inAppToggleDescription: 'รับการแจ้งเตือนการติดตาม การถูกใจ ความคิดเห็น การตอบกลับ และผลการรายงานในแอป',
    push: { followTitle: 'ผู้ติดตามใหม่', followBody: '{name} ติดตามคุณแล้ว', commentTitle: 'ความคิดเห็นใหม่', commentBody: '{name} แสดงความคิดเห็นในโพสต์ของคุณ', replyTitle: 'การตอบกลับใหม่', replyBody: '{name} ตอบกลับความคิดเห็นของคุณ' },
  },
  vi: {
    buttonLabel: 'Thông báo', title: 'Thông báo', closeAction: 'Đóng thông báo', loadingLabel: 'Đang tải thông báo', emptyLabel: 'Chưa có thông báo',
    unreadSectionLabel: 'Chưa đọc', readSectionLabel: 'Đã đọc', followMessage: 'đã theo dõi bạn.', followBackAction: 'Theo dõi lại', followingAction: 'Đang theo dõi',
    loadError: 'Không thể tải thông báo.', followError: 'Không thể theo dõi người dùng này.', retryAction: 'Thử lại', justNow: 'Vừa xong', minutesAgo: '{count} phút trước', hoursAgo: '{count} giờ trước',
    postLikeMessage: 'đã thích bài viết của bạn.', commentLikeMessage: 'đã thích bình luận của bạn.', commentMessage: 'đã bình luận về bài viết của bạn.', replyMessage: 'đã trả lời bình luận của bạn.', reportResolvedMessage: 'Báo cáo của bạn đã được xử lý.', andOthers: 'và {count} người khác',
    loadMoreAction: 'Xem thêm thông báo', inAppToggleTitle: 'Thông báo trong ứng dụng', inAppToggleDescription: 'Nhận thông báo theo dõi, lượt thích, bình luận, câu trả lời và kết quả báo cáo trong ứng dụng.',
    push: { followTitle: 'Người theo dõi mới', followBody: '{name} đã theo dõi bạn.', commentTitle: 'Bình luận mới', commentBody: '{name} đã bình luận về bài viết của bạn.', replyTitle: 'Câu trả lời mới', replyBody: '{name} đã trả lời bình luận của bạn.' },
  },
}

export function resolveNotificationCopy(locale: AppLocale): NotificationCopy {
  const supportedLocale = resolveSupportedLocaleTag(locale) ?? DEFAULT_LOCALE
  return COPY_BY_LOCALE[resolveLegalDocumentLocale(supportedLocale)]
}

/**
 * Push title/body for a follow / comment / reply notification in the
 * recipient's language (any app language tag; unknown -> English).
 */
export function resolvePushNotificationCopy(
  language: string,
  type: 'follow' | 'comment' | 'comment_reply',
  actorLabel: string,
): { title: string; body: string } {
  // Unknown recipient language -> English (not the app's default UI locale).
  const supported = resolveSupportedLocaleTag(language.trim()) ?? 'en'
  const push = COPY_BY_LOCALE[resolveLegalDocumentLocale(supported)].push
  const fill = (template: string) => template.replace('{name}', actorLabel)
  switch (type) {
    case 'follow': return { title: push.followTitle, body: fill(push.followBody) }
    case 'comment': return { title: push.commentTitle, body: fill(push.commentBody) }
    case 'comment_reply': return { title: push.replyTitle, body: fill(push.replyBody) }
  }
}
