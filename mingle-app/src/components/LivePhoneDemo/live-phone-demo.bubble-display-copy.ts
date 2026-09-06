import {
  DEFAULT_LOCALE,
  resolveLegalDocumentLocale,
  resolveSupportedLocaleTag,
  type LegalDocumentLocale,
} from '@/i18n/config'

export type LivePhoneDemoBubbleDisplayCopy = {
  displayModeLabel: string
  expandedModeLabel: string
  collapsedModeLabel: string
  expandBubbleLabel: string
  collapseBubbleLabel: string
  translationPendingLabel: string
}

const BUBBLE_DISPLAY_COPY_BY_LOCALE = {
  ko: {
    displayModeLabel: '말풍선 표시 방식',
    expandedModeLabel: '번역문 펼쳐보기',
    collapsedModeLabel: '하나의 말풍선으로 표시',
    expandBubbleLabel: '펼치기',
    collapseBubbleLabel: '접기',
    translationPendingLabel: '번역 대기 중 · 원문 표시',
  },
  en: {
    displayModeLabel: 'Bubble display',
    expandedModeLabel: 'Separate bubbles',
    collapsedModeLabel: 'Combined bubble',
    expandBubbleLabel: 'Expand',
    collapseBubbleLabel: 'Collapse',
    translationPendingLabel: 'Translation pending · showing original',
  },
  ja: {
    displayModeLabel: '吹き出し表示',
    expandedModeLabel: '発話ごとに表示',
    collapsedModeLabel: '1つの吹き出しにまとめる',
    expandBubbleLabel: '開く',
    collapseBubbleLabel: '閉じる',
    translationPendingLabel: '翻訳待ち · 原文を表示',
  },
  'zh-CN': {
    displayModeLabel: '气泡显示方式',
    expandedModeLabel: '按发言分别显示',
    collapsedModeLabel: '合并为一个气泡',
    expandBubbleLabel: '展开',
    collapseBubbleLabel: '收起',
    translationPendingLabel: '等待翻译 · 显示原文',
  },
  'zh-TW': {
    displayModeLabel: '對話泡泡顯示方式',
    expandedModeLabel: '按發言分別顯示',
    collapsedModeLabel: '合併為一個泡泡',
    expandBubbleLabel: '展開',
    collapseBubbleLabel: '收起',
    translationPendingLabel: '等待翻譯 · 顯示原文',
  },
  fr: {
    displayModeLabel: 'Affichage des bulles',
    expandedModeLabel: 'Bulles séparées',
    collapsedModeLabel: 'Bulle combinée',
    expandBubbleLabel: 'Développer',
    collapseBubbleLabel: 'Réduire',
    translationPendingLabel: 'Traduction en attente · texte original',
  },
  de: {
    displayModeLabel: 'Blasenanzeige',
    expandedModeLabel: 'Getrennte Blasen',
    collapsedModeLabel: 'Zusammengefasste Blase',
    expandBubbleLabel: 'Aufklappen',
    collapseBubbleLabel: 'Zuklappen',
    translationPendingLabel: 'Übersetzung ausstehend · Originaltext',
  },
  es: {
    displayModeLabel: 'Vista de burbujas',
    expandedModeLabel: 'Burbujas separadas',
    collapsedModeLabel: 'Una burbuja combinada',
    expandBubbleLabel: 'Expandir',
    collapseBubbleLabel: 'Contraer',
    translationPendingLabel: 'Traducción pendiente · texto original',
  },
  pt: {
    displayModeLabel: 'Exibição dos balões',
    expandedModeLabel: 'Balões separados',
    collapsedModeLabel: 'Balão combinado',
    expandBubbleLabel: 'Expandir',
    collapseBubbleLabel: 'Recolher',
    translationPendingLabel: 'Tradução pendente · texto original',
  },
  it: {
    displayModeLabel: 'Visualizzazione dei fumetti',
    expandedModeLabel: 'Fumetti separati',
    collapsedModeLabel: 'Fumetto combinato',
    expandBubbleLabel: 'Espandi',
    collapseBubbleLabel: 'Comprimi',
    translationPendingLabel: 'Traduzione in attesa · testo originale',
  },
  ru: {
    displayModeLabel: 'Вид сообщений',
    expandedModeLabel: 'Отдельные сообщения',
    collapsedModeLabel: 'Одно объединённое сообщение',
    expandBubbleLabel: 'Развернуть',
    collapseBubbleLabel: 'Свернуть',
    translationPendingLabel: 'Ожидание перевода · исходный текст',
  },
  ar: {
    displayModeLabel: 'عرض الفقاعات',
    expandedModeLabel: 'فقاعات منفصلة',
    collapsedModeLabel: 'فقاعة موحدة',
    expandBubbleLabel: 'توسيع',
    collapseBubbleLabel: 'طي',
    translationPendingLabel: 'الترجمة قيد الانتظار · عرض النص الأصلي',
  },
  hi: {
    displayModeLabel: 'बबल प्रदर्शन',
    expandedModeLabel: 'अलग-अलग बबल',
    collapsedModeLabel: 'एक संयुक्त बबल',
    expandBubbleLabel: 'खोलें',
    collapseBubbleLabel: 'बंद करें',
    translationPendingLabel: 'अनुवाद लंबित · मूल पाठ',
  },
  th: {
    displayModeLabel: 'การแสดงบับเบิล',
    expandedModeLabel: 'แสดงแยกบับเบิล',
    collapsedModeLabel: 'รวมเป็นบับเบิลเดียว',
    expandBubbleLabel: 'ขยาย',
    collapseBubbleLabel: 'ย่อ',
    translationPendingLabel: 'รอการแปล · แสดงต้นฉบับ',
  },
  vi: {
    displayModeLabel: 'Hiển thị bong bóng',
    expandedModeLabel: 'Bong bóng riêng',
    collapsedModeLabel: 'Một bong bóng gộp',
    expandBubbleLabel: 'Mở rộng',
    collapseBubbleLabel: 'Thu gọn',
    translationPendingLabel: 'Đang chờ dịch · hiển thị bản gốc',
  },
} satisfies Record<LegalDocumentLocale, LivePhoneDemoBubbleDisplayCopy>

export function resolveLivePhoneDemoBubbleDisplayCopy(
  uiLocale: string,
): LivePhoneDemoBubbleDisplayCopy {
  const supportedLocale = resolveSupportedLocaleTag(uiLocale) ?? DEFAULT_LOCALE
  const resolvedLocale = resolveLegalDocumentLocale(supportedLocale)
  return BUBBLE_DISPLAY_COPY_BY_LOCALE[resolvedLocale] ?? BUBBLE_DISPLAY_COPY_BY_LOCALE.en
}
