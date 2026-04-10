import {
  DEFAULT_MINGLE_LOCALE,
  resolvePrimaryUiLocale,
  resolveAppSupportedLocaleTag,
  type AppSupportedLocale,
  type PrimaryUiLocale,
} from "./mingle-locales";

export type MingleVersionPolicyCopy = {
  checkingTitle: string;
  checkingMessage: string;
  forceTitle: string;
  forceMessage: string;
  recommendTitle: string;
  recommendMessage: string;
  updateButtonLabel: string;
  laterButtonLabel: string;
  updateNowA11y: string;
  webViewLoadFailedTitle: string;
  unknownVersionLabel: string;
};

const VERSION_POLICY_FALLBACK_COPY_BY_LOCALE: Record<PrimaryUiLocale, MingleVersionPolicyCopy> = {
  ko: {
    checkingTitle: "버전 확인 중",
    checkingMessage: "최신 업데이트 정책을 확인하고 있습니다.",
    forceTitle: "업데이트 필요",
    forceMessage: "현재 버전은 더 이상 지원되지 않습니다. 최신 버전으로 업데이트해 주세요.",
    recommendTitle: "업데이트 권장",
    recommendMessage: "새 버전 업데이트를 권장합니다.",
    updateButtonLabel: "업데이트",
    laterButtonLabel: "나중에",
    updateNowA11y: "지금 업데이트",
    webViewLoadFailedTitle: "WebView 로드 실패",
    unknownVersionLabel: "알 수 없음",
  },
  en: {
    checkingTitle: "Checking version",
    checkingMessage: "Checking the latest update policy.",
    forceTitle: "Update Required",
    forceMessage: "This version is no longer supported. Please update to the latest version.",
    recommendTitle: "Update Recommended",
    recommendMessage: "A new version is available. We recommend updating for a better experience.",
    updateButtonLabel: "Update",
    laterButtonLabel: "Later",
    updateNowA11y: "Update now",
    webViewLoadFailedTitle: "WebView Load Failed",
    unknownVersionLabel: "unknown",
  },
  ja: {
    checkingTitle: "バージョン確認中",
    checkingMessage: "最新のアップデートポリシーを確認しています。",
    forceTitle: "アップデートが必要です",
    forceMessage: "このバージョンはサポートされていません。最新バージョンにアップデートしてください。",
    recommendTitle: "アップデート推奨",
    recommendMessage: "新しいバージョンが利用可能です。アップデートをおすすめします。",
    updateButtonLabel: "アップデート",
    laterButtonLabel: "あとで",
    updateNowA11y: "今すぐアップデート",
    webViewLoadFailedTitle: "WebView の読み込みに失敗しました",
    unknownVersionLabel: "不明",
  },
  "zh-CN": {
    checkingTitle: "正在检查版本",
    checkingMessage: "正在检查最新更新策略。",
    forceTitle: "更新必需",
    forceMessage: "当前版本已不再受支持。请更新到最新版本。",
    recommendTitle: "建议更新",
    recommendMessage: "新版本已发布，建议更新以获得更稳定的体验。",
    updateButtonLabel: "更新",
    laterButtonLabel: "稍后",
    updateNowA11y: "立即更新",
    webViewLoadFailedTitle: "WebView 加载失败",
    unknownVersionLabel: "未知",
  },
  "zh-TW": {
    checkingTitle: "正在檢查版本",
    checkingMessage: "正在檢查最新更新政策。",
    forceTitle: "必須更新",
    forceMessage: "目前版本已不再支援。請更新至最新版本。",
    recommendTitle: "建議更新",
    recommendMessage: "新版本已推出，建議更新以獲得更穩定的體驗。",
    updateButtonLabel: "更新",
    laterButtonLabel: "稍後",
    updateNowA11y: "立即更新",
    webViewLoadFailedTitle: "WebView 載入失敗",
    unknownVersionLabel: "未知",
  },
  fr: {
    checkingTitle: "Vérification de la version",
    checkingMessage: "Vérification de la politique de mise à jour la plus récente.",
    forceTitle: "Mise à jour requise",
    forceMessage: "Cette version n'est plus prise en charge. Veuillez mettre à jour vers la dernière version.",
    recommendTitle: "Mise à jour recommandée",
    recommendMessage: "Une nouvelle version est disponible. Nous recommandons la mise à jour.",
    updateButtonLabel: "Mettre à jour",
    laterButtonLabel: "Plus tard",
    updateNowA11y: "Mettre à jour maintenant",
    webViewLoadFailedTitle: "Échec du chargement de WebView",
    unknownVersionLabel: "inconnu",
  },
  de: {
    checkingTitle: "Version wird überprüft",
    checkingMessage: "Die neuesten Update-Richtlinien werden geprüft.",
    forceTitle: "Update erforderlich",
    forceMessage: "Diese Version wird nicht mehr unterstützt. Bitte aktualisieren Sie auf die neueste Version.",
    recommendTitle: "Update empfohlen",
    recommendMessage: "Eine neue Version ist verfügbar. Wir empfehlen ein Update.",
    updateButtonLabel: "Aktualisieren",
    laterButtonLabel: "Später",
    updateNowA11y: "Jetzt aktualisieren",
    webViewLoadFailedTitle: "WebView-Laden fehlgeschlagen",
    unknownVersionLabel: "unbekannt",
  },
  es: {
    checkingTitle: "Comprobando versión",
    checkingMessage: "Estamos comprobando la política de actualización más reciente.",
    forceTitle: "Actualización obligatoria",
    forceMessage: "Esta versión ya no es compatible. Actualiza a la última versión.",
    recommendTitle: "Actualización recomendada",
    recommendMessage: "Hay una nueva versión disponible. Recomendamos actualizar.",
    updateButtonLabel: "Actualizar",
    laterButtonLabel: "Más tarde",
    updateNowA11y: "Actualizar ahora",
    webViewLoadFailedTitle: "Error al cargar WebView",
    unknownVersionLabel: "desconocida",
  },
  pt: {
    checkingTitle: "Verificando versão",
    checkingMessage: "Estamos verificando a política de atualização mais recente.",
    forceTitle: "Atualização obrigatória",
    forceMessage: "Esta versão não é mais compatível. Atualize para a versão mais recente.",
    recommendTitle: "Atualização recomendada",
    recommendMessage: "Há uma nova versão disponível. Recomendamos atualizar.",
    updateButtonLabel: "Atualizar",
    laterButtonLabel: "Mais tarde",
    updateNowA11y: "Atualizar agora",
    webViewLoadFailedTitle: "Falha ao carregar o WebView",
    unknownVersionLabel: "desconhecida",
  },
  it: {
    checkingTitle: "Verifica versione in corso",
    checkingMessage: "Stiamo verificando la policy di aggiornamento più recente.",
    forceTitle: "Aggiornamento obbligatorio",
    forceMessage: "Questa versione non è più supportata. Aggiorna all'ultima versione.",
    recommendTitle: "Aggiornamento consigliato",
    recommendMessage: "È disponibile una nuova versione. Ti consigliamo di aggiornare.",
    updateButtonLabel: "Aggiorna",
    laterButtonLabel: "Più tardi",
    updateNowA11y: "Aggiorna ora",
    webViewLoadFailedTitle: "Caricamento WebView non riuscito",
    unknownVersionLabel: "sconosciuta",
  },
  ru: {
    checkingTitle: "Проверка версии",
    checkingMessage: "Проверяем актуальную политику обновлений.",
    forceTitle: "Требуется обновление",
    forceMessage: "Эта версия больше не поддерживается. Обновите приложение до последней версии.",
    recommendTitle: "Рекомендуется обновление",
    recommendMessage: "Доступна новая версия. Рекомендуем обновить приложение.",
    updateButtonLabel: "Обновить",
    laterButtonLabel: "Позже",
    updateNowA11y: "Обновить сейчас",
    webViewLoadFailedTitle: "Не удалось загрузить WebView",
    unknownVersionLabel: "неизвестно",
  },
  ar: {
    checkingTitle: "جارٍ التحقق من الإصدار",
    checkingMessage: "جارٍ التحقق من سياسة التحديث الأحدث.",
    forceTitle: "التحديث مطلوب",
    forceMessage: "هذا الإصدار لم يعد مدعومًا. يرجى التحديث إلى أحدث إصدار.",
    recommendTitle: "يوصى بالتحديث",
    recommendMessage: "يتوفر إصدار جديد. نوصي بالتحديث.",
    updateButtonLabel: "تحديث",
    laterButtonLabel: "لاحقًا",
    updateNowA11y: "حدّث الآن",
    webViewLoadFailedTitle: "فشل تحميل WebView",
    unknownVersionLabel: "غير معروف",
  },
  hi: {
    checkingTitle: "संस्करण जाँचा जा रहा है",
    checkingMessage: "नवीनतम अपडेट नीति की जाँच की जा रही है।",
    forceTitle: "अपडेट आवश्यक",
    forceMessage: "यह संस्करण अब समर्थित नहीं है। कृपया नवीनतम संस्करण में अपडेट करें।",
    recommendTitle: "अपडेट की अनुशंसा",
    recommendMessage: "नया संस्करण उपलब्ध है। अपडेट करने की सलाह दी जाती है।",
    updateButtonLabel: "अपडेट करें",
    laterButtonLabel: "बाद में",
    updateNowA11y: "अभी अपडेट करें",
    webViewLoadFailedTitle: "WebView लोड विफल",
    unknownVersionLabel: "अज्ञात",
  },
  th: {
    checkingTitle: "กำลังตรวจสอบเวอร์ชัน",
    checkingMessage: "กำลังตรวจสอบนโยบายอัปเดตล่าสุด",
    forceTitle: "จำเป็นต้องอัปเดต",
    forceMessage: "เวอร์ชันนี้ไม่รองรับแล้ว กรุณาอัปเดตเป็นเวอร์ชันล่าสุด",
    recommendTitle: "แนะนำให้อัปเดต",
    recommendMessage: "มีเวอร์ชันใหม่พร้อมใช้งาน แนะนำให้อัปเดต",
    updateButtonLabel: "อัปเดต",
    laterButtonLabel: "ภายหลัง",
    updateNowA11y: "อัปเดตตอนนี้",
    webViewLoadFailedTitle: "โหลด WebView ไม่สำเร็จ",
    unknownVersionLabel: "ไม่ทราบ",
  },
  vi: {
    checkingTitle: "Đang kiểm tra phiên bản",
    checkingMessage: "Đang kiểm tra chính sách cập nhật mới nhất.",
    forceTitle: "Cần cập nhật",
    forceMessage: "Phiên bản này không còn được hỗ trợ. Vui lòng cập nhật lên phiên bản mới nhất.",
    recommendTitle: "Khuyến nghị cập nhật",
    recommendMessage: "Đã có phiên bản mới. Chúng tôi khuyên bạn nên cập nhật.",
    updateButtonLabel: "Cập nhật",
    laterButtonLabel: "Để sau",
    updateNowA11y: "Cập nhật ngay",
    webViewLoadFailedTitle: "Tải WebView thất bại",
    unknownVersionLabel: "không rõ",
  },
};

export function resolveMingleVersionPolicyLocale(rawLocale: string): PrimaryUiLocale {
  const supportedLocale = resolveAppSupportedLocaleTag(rawLocale) ?? DEFAULT_MINGLE_LOCALE;
  return resolvePrimaryUiLocale(supportedLocale);
}

export function getMingleVersionPolicyFallbackCopy(
  locale: AppSupportedLocale | string,
): MingleVersionPolicyCopy {
  const resolvedLocale = typeof locale === "string"
    ? resolveMingleVersionPolicyLocale(locale)
    : resolvePrimaryUiLocale(locale);

  return VERSION_POLICY_FALLBACK_COPY_BY_LOCALE[resolvedLocale];
}
