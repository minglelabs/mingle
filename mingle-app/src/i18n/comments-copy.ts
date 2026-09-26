import { resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from './config'

/**
 * UI copy for the comment sheet (C3). One entry per PRIMARY_UI_LOCALE (15).
 *
 * Kept out of the shared dictionary (`src/i18n/dictionaries/**`) on purpose:
 * per the W3 rules new feature strings live in a feature copy module. The
 * shape and language set mirror `profile-bio-copy.ts`.
 *
 * `{n}` / `{name}` / `{max}` placeholders are substituted by `formatCommentsCopy`.
 */
export type CommentsCopy = {
  // Sheet chrome
  title: string
  close: string
  empty: string
  loading: string
  loadError: string
  retry: string
  signedOutHint: string

  // Composer
  writeComment: string
  writeReply: string
  replyingTo: string // "{name}"
  cancelReply: string
  send: string
  sending: string
  charCount: string // "{n}/{max}"
  tooLong: string
  sendFailed: string
  rateLimited: string // "{n}"

  // Replies
  viewReplies: string // "{n}"
  hideReplies: string
  replyToUser: string // "@{name}"

  // Actions
  like: string
  unlike: string
  likeCount: string // "{n}"
  reply: string
  edit: string
  delete: string
  report: string
  save: string
  cancel: string
  more: string // "⋯" menu label
  deleteConfirm: string
  deleteConfirmYes: string
  deletedPlaceholder: string
  edited: string
  actionFailed: string

  // Translation
  seeTranslation: string
  translating: string
  seeOriginal: string
  translationFailed: string

  // Long-body clamp
  seeMore: string
  seeLess: string
}

const copy: Record<LegalDocumentLocale, CommentsCopy> = {
  ko: {
    title: '댓글', close: '닫기', empty: '아직 댓글이 없습니다. 첫 댓글을 남겨보세요.', loading: '댓글을 불러오는 중…', loadError: '댓글을 불러오지 못했습니다.', retry: '다시 시도', signedOutHint: '로그인하면 댓글을 남길 수 있습니다.',
    writeComment: '댓글 달기…', writeReply: '답글 달기…', replyingTo: '{name}에게 답글', cancelReply: '답글 취소', send: '게시', sending: '게시 중…', charCount: '{n}/{max}', tooLong: '최대 {max}자까지 쓸 수 있습니다.', sendFailed: '게시하지 못했습니다. 다시 시도해 주세요.', rateLimited: '{n}초 후 다시 시도해 주세요.',
    viewReplies: '답글 {n}개 보기', hideReplies: '답글 숨기기', replyToUser: '@{name}',
    like: '좋아요', unlike: '좋아요 취소', likeCount: '{n}', reply: '답글', edit: '수정', delete: '삭제', report: '신고', save: '저장', cancel: '취소', more: '더 보기', deleteConfirm: '이 댓글을 삭제할까요?', deleteConfirmYes: '삭제', deletedPlaceholder: '삭제된 댓글입니다.', edited: '(수정됨)', actionFailed: '처리하지 못했습니다. 다시 시도해 주세요.',
    seeTranslation: '번역 보기', translating: '번역 중…', seeOriginal: '원문 보기', translationFailed: '번역하지 못했습니다. 다시 눌러 시도해 주세요.',
    seeMore: '더 보기', seeLess: '접기',
  },
  en: {
    title: 'Comments', close: 'Close', empty: 'No comments yet. Be the first to comment.', loading: 'Loading comments…', loadError: 'Could not load comments.', retry: 'Try again', signedOutHint: 'Sign in to leave a comment.',
    writeComment: 'Add a comment…', writeReply: 'Add a reply…', replyingTo: 'Replying to {name}', cancelReply: 'Cancel reply', send: 'Post', sending: 'Posting…', charCount: '{n}/{max}', tooLong: 'Up to {max} characters.', sendFailed: 'Could not post. Please try again.', rateLimited: 'Try again in {n}s.',
    viewReplies: 'View {n} replies', hideReplies: 'Hide replies', replyToUser: '@{name}',
    like: 'Like', unlike: 'Unlike', likeCount: '{n}', reply: 'Reply', edit: 'Edit', delete: 'Delete', report: 'Report', save: 'Save', cancel: 'Cancel', more: 'More', deleteConfirm: 'Delete this comment?', deleteConfirmYes: 'Delete', deletedPlaceholder: 'This comment was deleted.', edited: '(edited)', actionFailed: 'Something went wrong. Please try again.',
    seeTranslation: 'See translation', translating: 'Translating…', seeOriginal: 'See original', translationFailed: 'Translation failed. Tap to try again.',
    seeMore: 'See more', seeLess: 'See less',
  },
  ja: {
    title: 'コメント', close: '閉じる', empty: 'まだコメントはありません。最初のコメントを書きましょう。', loading: 'コメントを読み込み中…', loadError: 'コメントを読み込めませんでした。', retry: '再試行', signedOutHint: 'ログインするとコメントできます。',
    writeComment: 'コメントを追加…', writeReply: '返信を追加…', replyingTo: '{name}さんへの返信', cancelReply: '返信をキャンセル', send: '投稿', sending: '投稿中…', charCount: '{n}/{max}', tooLong: '最大{max}文字までです。', sendFailed: '投稿できませんでした。もう一度お試しください。', rateLimited: '{n}秒後にもう一度お試しください。',
    viewReplies: '返信{n}件を表示', hideReplies: '返信を非表示', replyToUser: '@{name}',
    like: 'いいね', unlike: 'いいねを取り消す', likeCount: '{n}', reply: '返信', edit: '編集', delete: '削除', report: '報告', save: '保存', cancel: 'キャンセル', more: 'その他', deleteConfirm: 'このコメントを削除しますか？', deleteConfirmYes: '削除', deletedPlaceholder: '削除されたコメントです。', edited: '（編集済み）', actionFailed: '処理できませんでした。もう一度お試しください。',
    seeTranslation: '翻訳を見る', translating: '翻訳中…', seeOriginal: '原文を見る', translationFailed: '翻訳できませんでした。タップして再試行してください。',
    seeMore: 'もっと見る', seeLess: '折りたたむ',
  },
  'zh-CN': {
    title: '评论', close: '关闭', empty: '还没有评论，来抢沙发吧。', loading: '正在加载评论…', loadError: '无法加载评论。', retry: '重试', signedOutHint: '登录后即可发表评论。',
    writeComment: '添加评论…', writeReply: '添加回复…', replyingTo: '回复 {name}', cancelReply: '取消回复', send: '发布', sending: '发布中…', charCount: '{n}/{max}', tooLong: '最多 {max} 个字符。', sendFailed: '发布失败，请重试。', rateLimited: '{n} 秒后重试。',
    viewReplies: '查看 {n} 条回复', hideReplies: '隐藏回复', replyToUser: '@{name}',
    like: '赞', unlike: '取消赞', likeCount: '{n}', reply: '回复', edit: '编辑', delete: '删除', report: '举报', save: '保存', cancel: '取消', more: '更多', deleteConfirm: '要删除这条评论吗？', deleteConfirmYes: '删除', deletedPlaceholder: '该评论已删除。', edited: '（已编辑）', actionFailed: '操作失败，请重试。',
    seeTranslation: '查看翻译', translating: '翻译中…', seeOriginal: '查看原文', translationFailed: '翻译失败，请点击重试。',
    seeMore: '展开', seeLess: '收起',
  },
  'zh-TW': {
    title: '留言', close: '關閉', empty: '還沒有留言，快來搶頭香吧。', loading: '正在載入留言…', loadError: '無法載入留言。', retry: '重試', signedOutHint: '登入後即可留言。',
    writeComment: '新增留言…', writeReply: '新增回覆…', replyingTo: '回覆 {name}', cancelReply: '取消回覆', send: '發布', sending: '發布中…', charCount: '{n}/{max}', tooLong: '最多 {max} 個字元。', sendFailed: '發布失敗，請重試。', rateLimited: '{n} 秒後重試。',
    viewReplies: '查看 {n} 則回覆', hideReplies: '隱藏回覆', replyToUser: '@{name}',
    like: '讚', unlike: '取消讚', likeCount: '{n}', reply: '回覆', edit: '編輯', delete: '刪除', report: '檢舉', save: '儲存', cancel: '取消', more: '更多', deleteConfirm: '要刪除這則留言嗎？', deleteConfirmYes: '刪除', deletedPlaceholder: '此留言已刪除。', edited: '（已編輯）', actionFailed: '操作失敗，請重試。',
    seeTranslation: '查看翻譯', translating: '翻譯中…', seeOriginal: '查看原文', translationFailed: '翻譯失敗，請點擊重試。',
    seeMore: '展開', seeLess: '收合',
  },
  fr: {
    title: 'Commentaires', close: 'Fermer', empty: 'Aucun commentaire. Soyez le premier à commenter.', loading: 'Chargement des commentaires…', loadError: 'Impossible de charger les commentaires.', retry: 'Réessayer', signedOutHint: 'Connectez-vous pour laisser un commentaire.',
    writeComment: 'Ajouter un commentaire…', writeReply: 'Ajouter une réponse…', replyingTo: 'En réponse à {name}', cancelReply: 'Annuler la réponse', send: 'Publier', sending: 'Publication…', charCount: '{n}/{max}', tooLong: 'Jusqu’à {max} caractères.', sendFailed: 'Échec de la publication. Veuillez réessayer.', rateLimited: 'Réessayez dans {n} s.',
    viewReplies: 'Voir {n} réponses', hideReplies: 'Masquer les réponses', replyToUser: '@{name}',
    like: 'J’aime', unlike: 'Je n’aime plus', likeCount: '{n}', reply: 'Répondre', edit: 'Modifier', delete: 'Supprimer', report: 'Signaler', save: 'Enregistrer', cancel: 'Annuler', more: 'Plus', deleteConfirm: 'Supprimer ce commentaire ?', deleteConfirmYes: 'Supprimer', deletedPlaceholder: 'Ce commentaire a été supprimé.', edited: '(modifié)', actionFailed: 'Une erreur est survenue. Veuillez réessayer.',
    seeTranslation: 'Voir la traduction', translating: 'Traduction…', seeOriginal: 'Voir l’original', translationFailed: 'Échec de la traduction. Touchez pour réessayer.',
    seeMore: 'Voir plus', seeLess: 'Voir moins',
  },
  de: {
    title: 'Kommentare', close: 'Schließen', empty: 'Noch keine Kommentare. Sei der Erste, der kommentiert.', loading: 'Kommentare werden geladen…', loadError: 'Kommentare konnten nicht geladen werden.', retry: 'Erneut versuchen', signedOutHint: 'Melde dich an, um zu kommentieren.',
    writeComment: 'Kommentar hinzufügen…', writeReply: 'Antwort hinzufügen…', replyingTo: 'Antwort an {name}', cancelReply: 'Antwort abbrechen', send: 'Posten', sending: 'Wird gepostet…', charCount: '{n}/{max}', tooLong: 'Bis zu {max} Zeichen.', sendFailed: 'Konnte nicht gepostet werden. Bitte erneut versuchen.', rateLimited: 'In {n} s erneut versuchen.',
    viewReplies: '{n} Antworten ansehen', hideReplies: 'Antworten ausblenden', replyToUser: '@{name}',
    like: 'Gefällt mir', unlike: 'Gefällt mir nicht mehr', likeCount: '{n}', reply: 'Antworten', edit: 'Bearbeiten', delete: 'Löschen', report: 'Melden', save: 'Speichern', cancel: 'Abbrechen', more: 'Mehr', deleteConfirm: 'Diesen Kommentar löschen?', deleteConfirmYes: 'Löschen', deletedPlaceholder: 'Dieser Kommentar wurde gelöscht.', edited: '(bearbeitet)', actionFailed: 'Etwas ist schiefgelaufen. Bitte erneut versuchen.',
    seeTranslation: 'Übersetzung ansehen', translating: 'Wird übersetzt…', seeOriginal: 'Original ansehen', translationFailed: 'Übersetzung fehlgeschlagen. Zum Wiederholen antippen.',
    seeMore: 'Mehr anzeigen', seeLess: 'Weniger anzeigen',
  },
  es: {
    title: 'Comentarios', close: 'Cerrar', empty: 'Aún no hay comentarios. Sé el primero en comentar.', loading: 'Cargando comentarios…', loadError: 'No se pudieron cargar los comentarios.', retry: 'Reintentar', signedOutHint: 'Inicia sesión para comentar.',
    writeComment: 'Añadir un comentario…', writeReply: 'Añadir una respuesta…', replyingTo: 'Respondiendo a {name}', cancelReply: 'Cancelar respuesta', send: 'Publicar', sending: 'Publicando…', charCount: '{n}/{max}', tooLong: 'Hasta {max} caracteres.', sendFailed: 'No se pudo publicar. Inténtalo de nuevo.', rateLimited: 'Inténtalo de nuevo en {n} s.',
    viewReplies: 'Ver {n} respuestas', hideReplies: 'Ocultar respuestas', replyToUser: '@{name}',
    like: 'Me gusta', unlike: 'Ya no me gusta', likeCount: '{n}', reply: 'Responder', edit: 'Editar', delete: 'Eliminar', report: 'Denunciar', save: 'Guardar', cancel: 'Cancelar', more: 'Más', deleteConfirm: '¿Eliminar este comentario?', deleteConfirmYes: 'Eliminar', deletedPlaceholder: 'Este comentario se eliminó.', edited: '(editado)', actionFailed: 'Algo salió mal. Inténtalo de nuevo.',
    seeTranslation: 'Ver traducción', translating: 'Traduciendo…', seeOriginal: 'Ver original', translationFailed: 'No se pudo traducir. Toca para reintentar.',
    seeMore: 'Ver más', seeLess: 'Ver menos',
  },
  pt: {
    title: 'Comentários', close: 'Fechar', empty: 'Ainda não há comentários. Seja o primeiro a comentar.', loading: 'Carregando comentários…', loadError: 'Não foi possível carregar os comentários.', retry: 'Tentar novamente', signedOutHint: 'Entre para deixar um comentário.',
    writeComment: 'Adicionar um comentário…', writeReply: 'Adicionar uma resposta…', replyingTo: 'Respondendo a {name}', cancelReply: 'Cancelar resposta', send: 'Publicar', sending: 'Publicando…', charCount: '{n}/{max}', tooLong: 'Até {max} caracteres.', sendFailed: 'Não foi possível publicar. Tente novamente.', rateLimited: 'Tente novamente em {n} s.',
    viewReplies: 'Ver {n} respostas', hideReplies: 'Ocultar respostas', replyToUser: '@{name}',
    like: 'Curtir', unlike: 'Descurtir', likeCount: '{n}', reply: 'Responder', edit: 'Editar', delete: 'Excluir', report: 'Denunciar', save: 'Salvar', cancel: 'Cancelar', more: 'Mais', deleteConfirm: 'Excluir este comentário?', deleteConfirmYes: 'Excluir', deletedPlaceholder: 'Este comentário foi excluído.', edited: '(editado)', actionFailed: 'Algo deu errado. Tente novamente.',
    seeTranslation: 'Ver tradução', translating: 'Traduzindo…', seeOriginal: 'Ver original', translationFailed: 'Falha na tradução. Toque para tentar novamente.',
    seeMore: 'Ver mais', seeLess: 'Ver menos',
  },
  it: {
    title: 'Commenti', close: 'Chiudi', empty: 'Ancora nessun commento. Scrivi il primo.', loading: 'Caricamento commenti…', loadError: 'Impossibile caricare i commenti.', retry: 'Riprova', signedOutHint: 'Accedi per lasciare un commento.',
    writeComment: 'Aggiungi un commento…', writeReply: 'Aggiungi una risposta…', replyingTo: 'In risposta a {name}', cancelReply: 'Annulla risposta', send: 'Pubblica', sending: 'Pubblicazione…', charCount: '{n}/{max}', tooLong: 'Fino a {max} caratteri.', sendFailed: 'Impossibile pubblicare. Riprova.', rateLimited: 'Riprova tra {n} s.',
    viewReplies: 'Vedi {n} risposte', hideReplies: 'Nascondi risposte', replyToUser: '@{name}',
    like: 'Mi piace', unlike: 'Non mi piace più', likeCount: '{n}', reply: 'Rispondi', edit: 'Modifica', delete: 'Elimina', report: 'Segnala', save: 'Salva', cancel: 'Annulla', more: 'Altro', deleteConfirm: 'Eliminare questo commento?', deleteConfirmYes: 'Elimina', deletedPlaceholder: 'Questo commento è stato eliminato.', edited: '(modificato)', actionFailed: 'Qualcosa è andato storto. Riprova.',
    seeTranslation: 'Vedi traduzione', translating: 'Traduzione in corso…', seeOriginal: 'Vedi originale', translationFailed: 'Traduzione non riuscita. Tocca per riprovare.',
    seeMore: 'Mostra altro', seeLess: 'Mostra meno',
  },
  ru: {
    title: 'Комментарии', close: 'Закрыть', empty: 'Пока нет комментариев. Оставьте первый.', loading: 'Загрузка комментариев…', loadError: 'Не удалось загрузить комментарии.', retry: 'Повторить', signedOutHint: 'Войдите, чтобы оставить комментарий.',
    writeComment: 'Добавить комментарий…', writeReply: 'Добавить ответ…', replyingTo: 'Ответ пользователю {name}', cancelReply: 'Отменить ответ', send: 'Опубликовать', sending: 'Публикация…', charCount: '{n}/{max}', tooLong: 'До {max} символов.', sendFailed: 'Не удалось опубликовать. Повторите попытку.', rateLimited: 'Повторите через {n} с.',
    viewReplies: 'Показать {n} ответов', hideReplies: 'Скрыть ответы', replyToUser: '@{name}',
    like: 'Нравится', unlike: 'Убрать отметку', likeCount: '{n}', reply: 'Ответить', edit: 'Изменить', delete: 'Удалить', report: 'Пожаловаться', save: 'Сохранить', cancel: 'Отмена', more: 'Ещё', deleteConfirm: 'Удалить этот комментарий?', deleteConfirmYes: 'Удалить', deletedPlaceholder: 'Комментарий удалён.', edited: '(изменено)', actionFailed: 'Что-то пошло не так. Повторите попытку.',
    seeTranslation: 'Показать перевод', translating: 'Переводим…', seeOriginal: 'Показать оригинал', translationFailed: 'Не удалось перевести. Нажмите, чтобы повторить.',
    seeMore: 'Показать больше', seeLess: 'Свернуть',
  },
  ar: {
    title: 'التعليقات', close: 'إغلاق', empty: 'لا توجد تعليقات بعد. كن أول من يعلّق.', loading: 'جارٍ تحميل التعليقات…', loadError: 'تعذّر تحميل التعليقات.', retry: 'إعادة المحاولة', signedOutHint: 'سجّل الدخول لكتابة تعليق.',
    writeComment: 'أضف تعليقًا…', writeReply: 'أضف ردًا…', replyingTo: 'رد على {name}', cancelReply: 'إلغاء الرد', send: 'نشر', sending: 'جارٍ النشر…', charCount: '{n}/{max}', tooLong: 'حتى {max} حرفًا.', sendFailed: 'تعذّر النشر. حاول مرة أخرى.', rateLimited: 'أعد المحاولة بعد {n} ثانية.',
    viewReplies: 'عرض {n} رد', hideReplies: 'إخفاء الردود', replyToUser: '@{name}',
    like: 'إعجاب', unlike: 'إلغاء الإعجاب', likeCount: '{n}', reply: 'رد', edit: 'تعديل', delete: 'حذف', report: 'إبلاغ', save: 'حفظ', cancel: 'إلغاء', more: 'المزيد', deleteConfirm: 'حذف هذا التعليق؟', deleteConfirmYes: 'حذف', deletedPlaceholder: 'تم حذف هذا التعليق.', edited: '(معدّل)', actionFailed: 'حدث خطأ ما. حاول مرة أخرى.',
    seeTranslation: 'عرض الترجمة', translating: 'جارٍ الترجمة…', seeOriginal: 'عرض الأصل', translationFailed: 'تعذّرت الترجمة. اضغط للمحاولة مجددًا.',
    seeMore: 'عرض المزيد', seeLess: 'عرض أقل',
  },
  hi: {
    title: 'टिप्पणियाँ', close: 'बंद करें', empty: 'अभी तक कोई टिप्पणी नहीं। सबसे पहले टिप्पणी करें।', loading: 'टिप्पणियाँ लोड हो रही हैं…', loadError: 'टिप्पणियाँ लोड नहीं हो सकीं।', retry: 'फिर से प्रयास करें', signedOutHint: 'टिप्पणी करने के लिए साइन इन करें।',
    writeComment: 'एक टिप्पणी जोड़ें…', writeReply: 'एक उत्तर जोड़ें…', replyingTo: '{name} को उत्तर', cancelReply: 'उत्तर रद्द करें', send: 'पोस्ट करें', sending: 'पोस्ट हो रहा है…', charCount: '{n}/{max}', tooLong: 'अधिकतम {max} अक्षर।', sendFailed: 'पोस्ट नहीं हो सका। कृपया पुनः प्रयास करें।', rateLimited: '{n} सेकंड बाद पुनः प्रयास करें।',
    viewReplies: '{n} उत्तर देखें', hideReplies: 'उत्तर छिपाएँ', replyToUser: '@{name}',
    like: 'पसंद', unlike: 'नापसंद', likeCount: '{n}', reply: 'उत्तर', edit: 'संपादित करें', delete: 'हटाएँ', report: 'रिपोर्ट करें', save: 'सहेजें', cancel: 'रद्द करें', more: 'और', deleteConfirm: 'यह टिप्पणी हटाएँ?', deleteConfirmYes: 'हटाएँ', deletedPlaceholder: 'यह टिप्पणी हटा दी गई है।', edited: '(संपादित)', actionFailed: 'कुछ गलत हुआ। कृपया पुनः प्रयास करें।',
    seeTranslation: 'अनुवाद देखें', translating: 'अनुवाद हो रहा है…', seeOriginal: 'मूल देखें', translationFailed: 'अनुवाद नहीं हो सका। फिर से प्रयास करने के लिए टैप करें।',
    seeMore: 'और देखें', seeLess: 'कम देखें',
  },
  th: {
    title: 'ความคิดเห็น', close: 'ปิด', empty: 'ยังไม่มีความคิดเห็น มาเป็นคนแรกกันเถอะ', loading: 'กำลังโหลดความคิดเห็น…', loadError: 'ไม่สามารถโหลดความคิดเห็นได้', retry: 'ลองอีกครั้ง', signedOutHint: 'เข้าสู่ระบบเพื่อแสดงความคิดเห็น',
    writeComment: 'เพิ่มความคิดเห็น…', writeReply: 'เพิ่มการตอบกลับ…', replyingTo: 'กำลังตอบกลับ {name}', cancelReply: 'ยกเลิกการตอบกลับ', send: 'โพสต์', sending: 'กำลังโพสต์…', charCount: '{n}/{max}', tooLong: 'สูงสุด {max} อักขระ', sendFailed: 'โพสต์ไม่สำเร็จ โปรดลองอีกครั้ง', rateLimited: 'ลองอีกครั้งใน {n} วินาที',
    viewReplies: 'ดูการตอบกลับ {n} รายการ', hideReplies: 'ซ่อนการตอบกลับ', replyToUser: '@{name}',
    like: 'ถูกใจ', unlike: 'เลิกถูกใจ', likeCount: '{n}', reply: 'ตอบกลับ', edit: 'แก้ไข', delete: 'ลบ', report: 'รายงาน', save: 'บันทึก', cancel: 'ยกเลิก', more: 'เพิ่มเติม', deleteConfirm: 'ลบความคิดเห็นนี้ไหม?', deleteConfirmYes: 'ลบ', deletedPlaceholder: 'ความคิดเห็นนี้ถูกลบแล้ว', edited: '(แก้ไขแล้ว)', actionFailed: 'เกิดข้อผิดพลาด โปรดลองอีกครั้ง',
    seeTranslation: 'ดูคำแปล', translating: 'กำลังแปล…', seeOriginal: 'ดูต้นฉบับ', translationFailed: 'แปลไม่สำเร็จ แตะเพื่อลองอีกครั้ง',
    seeMore: 'ดูเพิ่มเติม', seeLess: 'ดูน้อยลง',
  },
  vi: {
    title: 'Bình luận', close: 'Đóng', empty: 'Chưa có bình luận. Hãy là người đầu tiên bình luận.', loading: 'Đang tải bình luận…', loadError: 'Không thể tải bình luận.', retry: 'Thử lại', signedOutHint: 'Đăng nhập để bình luận.',
    writeComment: 'Thêm bình luận…', writeReply: 'Thêm câu trả lời…', replyingTo: 'Đang trả lời {name}', cancelReply: 'Hủy trả lời', send: 'Đăng', sending: 'Đang đăng…', charCount: '{n}/{max}', tooLong: 'Tối đa {max} ký tự.', sendFailed: 'Không thể đăng. Vui lòng thử lại.', rateLimited: 'Thử lại sau {n} giây.',
    viewReplies: 'Xem {n} câu trả lời', hideReplies: 'Ẩn câu trả lời', replyToUser: '@{name}',
    like: 'Thích', unlike: 'Bỏ thích', likeCount: '{n}', reply: 'Trả lời', edit: 'Chỉnh sửa', delete: 'Xóa', report: 'Báo cáo', save: 'Lưu', cancel: 'Hủy', more: 'Thêm', deleteConfirm: 'Xóa bình luận này?', deleteConfirmYes: 'Xóa', deletedPlaceholder: 'Bình luận này đã bị xóa.', edited: '(đã chỉnh sửa)', actionFailed: 'Đã xảy ra lỗi. Vui lòng thử lại.',
    seeTranslation: 'Xem bản dịch', translating: 'Đang dịch…', seeOriginal: 'Xem bản gốc', translationFailed: 'Không thể dịch. Nhấn để thử lại.',
    seeMore: 'Xem thêm', seeLess: 'Thu gọn',
  },
}

export function commentsCopy(locale: string): CommentsCopy {
  return copy[resolveLegalDocumentLocale(resolveSupportedLocaleTag(locale) || 'en')]
}

/**
 * Substitute `{n}` / `{name}` / `{max}` placeholders in a copy string.
 * Unknown keys are left untouched.
 */
export function formatCommentsCopy(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  )
}
