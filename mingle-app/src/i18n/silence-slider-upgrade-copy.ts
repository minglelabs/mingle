import {
  DEFAULT_LOCALE,
  resolveLegalDocumentLocale,
  resolveSupportedLocaleTag,
  type AppLocale,
  type LegalDocumentLocale,
} from "@/i18n/config";

export type SilenceSliderUpgradeCopy = {
  message: string;
  buttonLabel: string;
};

const SILENCE_SLIDER_UPGRADE_COPY = {
  ko: {
    message: "무음 지속 시간 슬라이더는 다음 업데이트에서 사용할 수 있습니다.",
    buttonLabel: "업데이트 안내 보기",
  },
  en: {
    message: "The silence duration slider will be available in the next update.",
    buttonLabel: "Show update notice",
  },
  ja: {
    message: "無音時間スライダーは次回のアップデートで利用できるようになります。",
    buttonLabel: "更新のお知らせを表示",
  },
  "zh-CN": {
    message: "静音时长滑块将在下次更新中提供。",
    buttonLabel: "显示更新通知",
  },
  "zh-TW": {
    message: "靜音時長滑桿將在下次更新中提供。",
    buttonLabel: "顯示更新通知",
  },
  fr: {
    message: "Le curseur de durée de silence sera disponible dans la prochaine mise à jour.",
    buttonLabel: "Afficher l’avis de mise à jour",
  },
  de: {
    message: "Der Schieberegler für die Stille-Dauer wird im nächsten Update verfügbar sein.",
    buttonLabel: "Update-Hinweis anzeigen",
  },
  es: {
    message: "El control deslizante de duración del silencio estará disponible en la próxima actualización.",
    buttonLabel: "Mostrar aviso de actualización",
  },
  pt: {
    message: "O controle deslizante de duração do silêncio estará disponível na próxima atualização.",
    buttonLabel: "Mostrar aviso de atualização",
  },
  it: {
    message: "Il cursore della durata del silenzio sarà disponibile nel prossimo aggiornamento.",
    buttonLabel: "Mostra avviso di aggiornamento",
  },
  ru: {
    message: "Ползунок длительности тишины будет доступен в следующем обновлении.",
    buttonLabel: "Показать уведомление об обновлении",
  },
  ar: {
    message: "سيكون شريط تمرير مدة الصمت متاحًا في التحديث التالي.",
    buttonLabel: "إظهار إشعار التحديث",
  },
  hi: {
    message: "मौन अवधि का स्लाइडर अगले अपडेट में उपलब्ध होगा।",
    buttonLabel: "अपडेट की सूचना दिखाएँ",
  },
  th: {
    message: "แถบเลื่อนระยะเวลาความเงียบจะพร้อมใช้งานในการอัปเดตครั้งถัดไป",
    buttonLabel: "แสดงการแจ้งเตือนการอัปเดต",
  },
  vi: {
    message: "Thanh trượt thời lượng im lặng sẽ có trong bản cập nhật tiếp theo.",
    buttonLabel: "Hiển thị thông báo cập nhật",
  },
} satisfies Record<LegalDocumentLocale, SilenceSliderUpgradeCopy>;

export function getSilenceSliderUpgradeCopy(
  locale: AppLocale | string,
): SilenceSliderUpgradeCopy {
  const supportedLocale = typeof locale === "string"
    ? (resolveSupportedLocaleTag(locale) ?? DEFAULT_LOCALE)
    : locale;
  const resolvedLocale = resolveLegalDocumentLocale(supportedLocale);
  return SILENCE_SLIDER_UPGRADE_COPY[resolvedLocale] ?? SILENCE_SLIDER_UPGRADE_COPY.en;
}
