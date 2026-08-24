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
}

const BUBBLE_DISPLAY_COPY_BY_LOCALE = {
  ko: {
    displayModeLabel: '말풍선 표시 방식',
    expandedModeLabel: '번역문 펼쳐보기',
    collapsedModeLabel: '하나의 말풍선으로 표시',
    expandBubbleLabel: '펼치기',
    collapseBubbleLabel: '접기',
  },
  en: {
    displayModeLabel: 'Bubble display',
    expandedModeLabel: 'Separate bubbles',
    collapsedModeLabel: 'Combined bubble',
    expandBubbleLabel: 'Expand',
    collapseBubbleLabel: 'Collapse',
  },
  ja: {
    displayModeLabel: '吹き出し表示',
    expandedModeLabel: '発話ごとに表示',
    collapsedModeLabel: '1つの吹き出しにまとめる',
    expandBubbleLabel: '開く',
    collapseBubbleLabel: '閉じる',
  },
  'zh-CN': {
    displayModeLabel: '气泡显示方式',
    expandedModeLabel: '按发言分别显示',
    collapsedModeLabel: '合并为一个气泡',
    expandBubbleLabel: '展开',
    collapseBubbleLabel: '收起',
  },
  'zh-TW': {
    displayModeLabel: '對話泡泡顯示方式',
    expandedModeLabel: '按發言分別顯示',
    collapsedModeLabel: '合併為一個泡泡',
    expandBubbleLabel: '展開',
    collapseBubbleLabel: '收起',
  },
  fr: {
    displayModeLabel: 'Affichage des bulles',
    expandedModeLabel: 'Bulles séparées',
    collapsedModeLabel: 'Bulle combinée',
    expandBubbleLabel: 'Développer',
    collapseBubbleLabel: 'Réduire',
  },
  de: {
    displayModeLabel: 'Blasenanzeige',
    expandedModeLabel: 'Getrennte Blasen',
    collapsedModeLabel: 'Zusammengefasste Blase',
    expandBubbleLabel: 'Aufklappen',
    collapseBubbleLabel: 'Zuklappen',
  },
  es: {
    displayModeLabel: 'Vista de burbujas',
    expandedModeLabel: 'Burbujas separadas',
    collapsedModeLabel: 'Una burbuja combinada',
    expandBubbleLabel: 'Expandir',
    collapseBubbleLabel: 'Contraer',
  },
  pt: {
    displayModeLabel: 'Exibição dos balões',
    expandedModeLabel: 'Balões separados',
    collapsedModeLabel: 'Balão combinado',
    expandBubbleLabel: 'Expandir',
    collapseBubbleLabel: 'Recolher',
  },
  it: {
    displayModeLabel: 'Visualizzazione dei fumetti',
    expandedModeLabel: 'Fumetti separati',
    collapsedModeLabel: 'Fumetto combinato',
    expandBubbleLabel: 'Espandi',
    collapseBubbleLabel: 'Comprimi',
  },
  ru: {
    displayModeLabel: 'Вид сообщений',
    expandedModeLabel: 'Отдельные сообщения',
    collapsedModeLabel: 'Одно объединённое сообщение',
    expandBubbleLabel: 'Развернуть',
    collapseBubbleLabel: 'Свернуть',
  },
  ar: {
    displayModeLabel: 'عرض الفقاعات',
    expandedModeLabel: 'فقاعات منفصلة',
    collapsedModeLabel: 'فقاعة موحدة',
    expandBubbleLabel: 'توسيع',
    collapseBubbleLabel: 'طي',
  },
  hi: {
    displayModeLabel: 'बबल प्रदर्शन',
    expandedModeLabel: 'अलग-अलग बबल',
    collapsedModeLabel: 'एक संयुक्त बबल',
    expandBubbleLabel: 'खोलें',
    collapseBubbleLabel: 'बंद करें',
  },
  th: {
    displayModeLabel: 'การแสดงบับเบิล',
    expandedModeLabel: 'แสดงแยกบับเบิล',
    collapsedModeLabel: 'รวมเป็นบับเบิลเดียว',
    expandBubbleLabel: 'ขยาย',
    collapseBubbleLabel: 'ย่อ',
  },
  vi: {
    displayModeLabel: 'Hiển thị bong bóng',
    expandedModeLabel: 'Bong bóng riêng',
    collapsedModeLabel: 'Một bong bóng gộp',
    expandBubbleLabel: 'Mở rộng',
    collapseBubbleLabel: 'Thu gọn',
  },
} satisfies Record<LegalDocumentLocale, LivePhoneDemoBubbleDisplayCopy>

export function resolveLivePhoneDemoBubbleDisplayCopy(
  uiLocale: string,
): LivePhoneDemoBubbleDisplayCopy {
  const supportedLocale = resolveSupportedLocaleTag(uiLocale) ?? DEFAULT_LOCALE
  const resolvedLocale = resolveLegalDocumentLocale(supportedLocale)
  return BUBBLE_DISPLAY_COPY_BY_LOCALE[resolvedLocale] ?? BUBBLE_DISPLAY_COPY_BY_LOCALE.en
}
