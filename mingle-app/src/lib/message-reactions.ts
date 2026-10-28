import { DEFAULT_LOCALE, resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from '@/i18n/config'

export const MESSAGE_REACTIONS = [
  { kind: 'like', emoji: '👍' },
  { kind: 'heart', emoji: '❤️' },
  { kind: 'check', emoji: '✅' },
  { kind: 'sad', emoji: '😢' },
  { kind: 'laugh', emoji: '😂' },
] as const
export type MessageReactionKind = typeof MESSAGE_REACTIONS[number]['kind']
export type MessageReactionSummary = { kind: MessageReactionKind; count: number; mine: boolean }
export type MessageReactionParticipant = {
  id: string; name: string | null; handle: string; mine: boolean
  // Account badge flags (only when true); the list shows names, so they carry the label.
  isOfficial?: true; isOperator?: true
}
export type MessageReactionParticipantsPage = { participants: MessageReactionParticipant[]; nextCursor: string | null }
export const MESSAGE_REACTIONS_REFRESH_EVENT = 'mingle:message-reactions-refresh'
export function isMessageReactionKind(value: unknown): value is MessageReactionKind {
  return MESSAGE_REACTIONS.some(reaction => reaction.kind === value)
}
export function summarizeMessageReactions(
  rows: readonly { kind: string; userId: string }[], viewerId: string,
): MessageReactionSummary[] {
  return MESSAGE_REACTIONS.flatMap(({ kind }) => {
    const matching = rows.filter(row => row.kind === kind)
    return matching.length ? [{ kind, count: matching.length, mine: matching.some(row => row.userId === viewerId) }] : []
  })
}
export type MessageReactionCopy = Record<'label' | 'participants' | 'close' | 'loading' | 'loadError' | 'retry' | 'more' | 'empty' | 'me' | 'hint' | 'error' | 'like' | 'heart' | 'check' | 'sad' | 'laugh', string>

const MESSAGE_REACTION_COPY_BY_LOCALE = {
  ko: { label: "리액션", participants: "반응한 사람", close: "닫기", loading: "불러오는 중…", loadError: "목록을 불러오지 못했습니다.", retry: "다시 시도", more: "더 보기", empty: "아직 반응한 사람이 없습니다.", me: "나", hint: "길게 눌러 반응한 사람 보기", error: "리액션을 저장하지 못했습니다. 다시 시도해 주세요.", like: "좋아요", heart: "하트", check: "확인", sad: "슬퍼요", laugh: "웃음" },
  en: { label: "Reactions", participants: "Reacted by", close: "Close", loading: "Loading…", loadError: "Could not load the list.", retry: "Try again", more: "Load more", empty: "No reactions yet.", me: "You", hint: "Hold to see who reacted", error: "Could not save your reaction. Please try again.", like: "Like", heart: "Heart", check: "Check", sad: "Sad", laugh: "Laugh" },
  ja: { label: "リアクション", participants: "リアクションした人", close: "閉じる", loading: "読み込み中…", loadError: "一覧を読み込めませんでした。", retry: "再試行", more: "もっと見る", empty: "まだリアクションはありません。", me: "自分", hint: "長押しでリアクションした人を表示", error: "リアクションを保存できませんでした。もう一度お試しください。", like: "いいね", heart: "ハート", check: "確認", sad: "悲しい", laugh: "笑い" },
  'zh-CN': { label: "回应", participants: "回应的人", close: "关闭", loading: "加载中…", loadError: "无法加载列表。", retry: "重试", more: "加载更多", empty: "还没有人回应。", me: "我", hint: "长按查看回应的人", error: "无法保存回应，请重试。", like: "赞", heart: "爱心", check: "确认", sad: "难过", laugh: "大笑" },
  'zh-TW': { label: "回應", participants: "回應的人", close: "關閉", loading: "載入中…", loadError: "無法載入列表。", retry: "重試", more: "載入更多", empty: "還沒有人回應。", me: "我", hint: "長按查看回應的人", error: "無法儲存回應，請再試一次。", like: "讚", heart: "愛心", check: "確認", sad: "難過", laugh: "大笑" },
  fr: { label: "Réactions", participants: "Réactions de", close: "Fermer", loading: "Chargement…", loadError: "Impossible de charger la liste.", retry: "Réessayer", more: "Voir plus", empty: "Aucune réaction pour le moment.", me: "Vous", hint: "Appuyez longuement pour voir qui a réagi", error: "Impossible d’enregistrer votre réaction. Veuillez réessayer.", like: "J’aime", heart: "Cœur", check: "Vu", sad: "Triste", laugh: "Rire" },
  de: { label: "Reaktionen", participants: "Reagiert von", close: "Schließen", loading: "Wird geladen…", loadError: "Liste konnte nicht geladen werden.", retry: "Erneut versuchen", more: "Mehr laden", empty: "Noch keine Reaktionen.", me: "Du", hint: "Gedrückt halten, um zu sehen, wer reagiert hat", error: "Reaktion konnte nicht gespeichert werden. Bitte versuche es erneut.", like: "Gefällt mir", heart: "Herz", check: "Haken", sad: "Traurig", laugh: "Lachen" },
  es: { label: "Reacciones", participants: "Reaccionaron", close: "Cerrar", loading: "Cargando…", loadError: "No se pudo cargar la lista.", retry: "Reintentar", more: "Ver más", empty: "Aún no hay reacciones.", me: "Tú", hint: "Mantén pulsado para ver quién reaccionó", error: "No se pudo guardar tu reacción. Inténtalo de nuevo.", like: "Me gusta", heart: "Corazón", check: "Visto", sad: "Triste", laugh: "Risa" },
  pt: { label: "Reações", participants: "Reagiram", close: "Fechar", loading: "Carregando…", loadError: "Não foi possível carregar a lista.", retry: "Tentar novamente", more: "Ver mais", empty: "Ainda não há reações.", me: "Você", hint: "Toque e segure para ver quem reagiu", error: "Não foi possível salvar sua reação. Tente novamente.", like: "Curtir", heart: "Coração", check: "Visto", sad: "Triste", laugh: "Risada" },
  it: { label: "Reazioni", participants: "Hanno reagito", close: "Chiudi", loading: "Caricamento…", loadError: "Impossibile caricare l’elenco.", retry: "Riprova", more: "Mostra altro", empty: "Ancora nessuna reazione.", me: "Tu", hint: "Tieni premuto per vedere chi ha reagito", error: "Impossibile salvare la reazione. Riprova.", like: "Mi piace", heart: "Cuore", check: "Visto", sad: "Triste", laugh: "Risata" },
  ru: { label: "Реакции", participants: "Отреагировали", close: "Закрыть", loading: "Загрузка…", loadError: "Не удалось загрузить список.", retry: "Повторить", more: "Показать ещё", empty: "Пока нет реакций.", me: "Вы", hint: "Удерживайте, чтобы увидеть, кто отреагировал", error: "Не удалось сохранить реакцию. Попробуйте ещё раз.", like: "Нравится", heart: "Сердце", check: "Галочка", sad: "Грустно", laugh: "Смех" },
  ar: { label: "التفاعلات", participants: "تفاعل بواسطة", close: "إغلاق", loading: "جارٍ التحميل…", loadError: "تعذر تحميل القائمة.", retry: "إعادة المحاولة", more: "عرض المزيد", empty: "لا توجد تفاعلات بعد.", me: "أنت", hint: "اضغط مطولًا لمعرفة من تفاعل", error: "تعذر حفظ تفاعلك. يُرجى المحاولة مرة أخرى.", like: "إعجاب", heart: "قلب", check: "تم", sad: "حزين", laugh: "ضحك" },
  hi: { label: "प्रतिक्रियाएँ", participants: "प्रतिक्रिया देने वाले", close: "बंद करें", loading: "लोड हो रहा है…", loadError: "सूची लोड नहीं हो सकी।", retry: "फिर से कोशिश करें", more: "और देखें", empty: "अभी तक कोई प्रतिक्रिया नहीं।", me: "आप", hint: "किसने प्रतिक्रिया दी, देखने के लिए दबाकर रखें", error: "आपकी प्रतिक्रिया सेव नहीं हो सकी। कृपया फिर से कोशिश करें।", like: "पसंद", heart: "दिल", check: "ठीक", sad: "दुखी", laugh: "हँसी" },
  th: { label: "รีแอคชัน", participants: "คนที่รีแอคชัน", close: "ปิด", loading: "กำลังโหลด…", loadError: "โหลดรายการไม่ได้", retry: "ลองอีกครั้ง", more: "ดูเพิ่มเติม", empty: "ยังไม่มีรีแอคชัน", me: "คุณ", hint: "กดค้างเพื่อดูว่าใครรีแอคชัน", error: "บันทึกรีแอคชันไม่ได้ โปรดลองอีกครั้ง", like: "ถูกใจ", heart: "หัวใจ", check: "รับทราบ", sad: "เศร้า", laugh: "หัวเราะ" },
  vi: { label: "Bày tỏ cảm xúc", participants: "Người đã bày tỏ", close: "Đóng", loading: "Đang tải…", loadError: "Không thể tải danh sách.", retry: "Thử lại", more: "Xem thêm", empty: "Chưa có ai bày tỏ cảm xúc.", me: "Bạn", hint: "Nhấn giữ để xem ai đã bày tỏ cảm xúc", error: "Không thể lưu cảm xúc của bạn. Vui lòng thử lại.", like: "Thích", heart: "Tim", check: "Đã xem", sad: "Buồn", laugh: "Cười" },
} satisfies Record<LegalDocumentLocale, MessageReactionCopy>

export function messageReactionCopy(locale: string): MessageReactionCopy {
  const supportedLocale = resolveSupportedLocaleTag(locale) ?? DEFAULT_LOCALE
  return MESSAGE_REACTION_COPY_BY_LOCALE[resolveLegalDocumentLocale(supportedLocale)] ?? MESSAGE_REACTION_COPY_BY_LOCALE.en
}
