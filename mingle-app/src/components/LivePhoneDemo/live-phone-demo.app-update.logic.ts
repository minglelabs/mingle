export const NATIVE_APP_UPDATE_EVENT = "mingle:native-app-update";

export type NativeAppUpdateDetailStatus =
  | "checking"
  | "available"
  | "current"
  | "unknown";

export interface NativeAppUpdateDetail {
  status: NativeAppUpdateDetailStatus;
  clientVersion: string;
  latestVersion: string;
  updateUrl: string;
  updateAvailable: boolean;
}

export interface NativeAppTrackingContext {
  appVersion: string | null;
  apiNamespace: string | null;
  clientPlatform: "ios" | "android" | null;
}

export interface NativeAppUpdateCopy {
  sectionLabel: string;
  installedLabel: string;
  latestLabel: string;
  unknownVersionLabel: string;
  checkingMessage: string;
  availableMessage: string;
  currentMessage: string;
  unknownMessage: string;
  updateButtonLabel: string;
}

export const DEFAULT_NATIVE_APP_UPDATE_DETAIL: NativeAppUpdateDetail = {
  status: "checking",
  clientVersion: "",
  latestVersion: "",
  updateUrl: "",
  updateAvailable: false,
};

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSemver(value: string): string {
  const normalized = value.trim().replace(/^v/i, "");
  return /^\d+\.\d+\.\d+$/.test(normalized) ? normalized : "";
}

function normalizeApiNamespace(value: string): string {
  const normalized = value.trim().replace(/^\/+/, "");
  return /^(ios|android)\/v\d+\.\d+\.\d+$/.test(normalized) ? normalized : "";
}

export function readRequestedApiNamespaceFromSearch(search: string): string {
  if (!search) return "";

  const params = new URLSearchParams(search);
  return normalizeApiNamespace(
    params.get("apiNamespace")
    || params.get("apiNs")
    || "",
  );
}

export function parseNativeAppUpdateDetail(
  detail: unknown
): NativeAppUpdateDetail | null {
  if (!detail || typeof detail !== "object") return null;

  const payload = detail as Record<string, unknown>;
  const status = payload.status;
  if (
    status !== "checking" &&
    status !== "available" &&
    status !== "current" &&
    status !== "unknown"
  ) {
    return null;
  }

  return {
    status,
    clientVersion: readString(payload.clientVersion),
    latestVersion: readString(payload.latestVersion),
    updateUrl: readString(payload.updateUrl),
    updateAvailable: payload.updateAvailable === true,
  };
}

export function resolveNativeAppTrackingContext(args: {
  detail?: unknown;
  apiNamespace?: string | null;
}): NativeAppTrackingContext {
  const parsedDetail = parseNativeAppUpdateDetail(args.detail);
  const apiNamespace = normalizeApiNamespace(args.apiNamespace || "");
  const namespaceVersion = apiNamespace.match(/\/v(\d+\.\d+\.\d+)$/)?.[1] || "";
  const appVersion = normalizeSemver(parsedDetail?.clientVersion || namespaceVersion);
  const clientPlatform = apiNamespace.startsWith("ios/")
    ? "ios"
    : apiNamespace.startsWith("android/")
      ? "android"
      : null;

  return {
    appVersion: appVersion || null,
    apiNamespace: apiNamespace || null,
    clientPlatform,
  };
}

const COPY_BY_LOCALE: Record<string, NativeAppUpdateCopy> = {
  ko: {
    sectionLabel: "앱 업데이트",
    installedLabel: "현재 버전",
    latestLabel: "최신 버전",
    unknownVersionLabel: "확인 불가",
    checkingMessage: "업데이트를 확인하고 있습니다.",
    availableMessage: "설치 가능한 업데이트가 있습니다.",
    currentMessage: "최신 버전을 사용 중입니다.",
    unknownMessage: "업데이트 상태를 확인할 수 없습니다.",
    updateButtonLabel: "업데이트",
  },
  en: {
    sectionLabel: "App Update",
    installedLabel: "Installed",
    latestLabel: "Latest",
    unknownVersionLabel: "Unknown",
    checkingMessage: "Checking for updates.",
    availableMessage: "An update is available.",
    currentMessage: "You are on the latest version.",
    unknownMessage: "Update status is unavailable.",
    updateButtonLabel: "Update",
  },
  ja: {
    sectionLabel: "アプリ更新",
    installedLabel: "現在のバージョン",
    latestLabel: "最新バージョン",
    unknownVersionLabel: "不明",
    checkingMessage: "アップデートを確認しています。",
    availableMessage: "利用可能なアップデートがあります。",
    currentMessage: "最新バージョンを利用中です。",
    unknownMessage: "アップデート状況を確認できません。",
    updateButtonLabel: "アップデート",
  },
  "zh-CN": {
    sectionLabel: "应用更新",
    installedLabel: "当前版本",
    latestLabel: "最新版本",
    unknownVersionLabel: "未知",
    checkingMessage: "正在检查更新。",
    availableMessage: "有可用更新。",
    currentMessage: "您正在使用最新版本。",
    unknownMessage: "无法确认更新状态。",
    updateButtonLabel: "更新",
  },
  "zh-TW": {
    sectionLabel: "App 更新",
    installedLabel: "目前版本",
    latestLabel: "最新版本",
    unknownVersionLabel: "未知",
    checkingMessage: "正在檢查更新。",
    availableMessage: "有可用更新。",
    currentMessage: "您正在使用最新版本。",
    unknownMessage: "無法確認更新狀態。",
    updateButtonLabel: "更新",
  },
  fr: {
    sectionLabel: "Mise à jour de l'app",
    installedLabel: "Version installée",
    latestLabel: "Dernière version",
    unknownVersionLabel: "Inconnue",
    checkingMessage: "Vérification des mises à jour.",
    availableMessage: "Une mise à jour est disponible.",
    currentMessage: "Vous utilisez la dernière version.",
    unknownMessage: "Le statut de mise à jour est indisponible.",
    updateButtonLabel: "Mettre à jour",
  },
  de: {
    sectionLabel: "App-Update",
    installedLabel: "Installiert",
    latestLabel: "Neueste Version",
    unknownVersionLabel: "Unbekannt",
    checkingMessage: "Suche nach Updates.",
    availableMessage: "Ein Update ist verfügbar.",
    currentMessage: "Sie verwenden die neueste Version.",
    unknownMessage: "Der Update-Status ist nicht verfügbar.",
    updateButtonLabel: "Aktualisieren",
  },
  es: {
    sectionLabel: "Actualización de la app",
    installedLabel: "Versión instalada",
    latestLabel: "Última versión",
    unknownVersionLabel: "Desconocida",
    checkingMessage: "Buscando actualizaciones.",
    availableMessage: "Hay una actualización disponible.",
    currentMessage: "Ya usa la última versión.",
    unknownMessage: "No se puede comprobar el estado de actualización.",
    updateButtonLabel: "Actualizar",
  },
  pt: {
    sectionLabel: "Atualização do app",
    installedLabel: "Versão instalada",
    latestLabel: "Versão mais recente",
    unknownVersionLabel: "Desconhecida",
    checkingMessage: "Verificando atualizações.",
    availableMessage: "Há uma atualização disponível.",
    currentMessage: "Você está na versão mais recente.",
    unknownMessage: "O status da atualização está indisponível.",
    updateButtonLabel: "Atualizar",
  },
  it: {
    sectionLabel: "Aggiornamento dell'app",
    installedLabel: "Versione installata",
    latestLabel: "Ultima versione",
    unknownVersionLabel: "Sconosciuta",
    checkingMessage: "Controllo aggiornamenti in corso.",
    availableMessage: "E disponibile un aggiornamento.",
    currentMessage: "Stai usando l ultima versione.",
    unknownMessage: "Lo stato dell'aggiornamento non e disponibile.",
    updateButtonLabel: "Aggiorna",
  },
  ru: {
    sectionLabel: "Обновление приложения",
    installedLabel: "Текущая версия",
    latestLabel: "Последняя версия",
    unknownVersionLabel: "Неизвестно",
    checkingMessage: "Проверяем обновления.",
    availableMessage: "Доступно обновление.",
    currentMessage: "У вас установлена последняя версия.",
    unknownMessage: "Статус обновления недоступен.",
    updateButtonLabel: "Обновить",
  },
  ar: {
    sectionLabel: "تحديث التطبيق",
    installedLabel: "الإصدار الحالي",
    latestLabel: "أحدث إصدار",
    unknownVersionLabel: "غير معروف",
    checkingMessage: "جار فحص التحديثات.",
    availableMessage: "يوجد تحديث متاح.",
    currentMessage: "أنت تستخدم أحدث إصدار.",
    unknownMessage: "تعذر التحقق من حالة التحديث.",
    updateButtonLabel: "تحديث",
  },
  hi: {
    sectionLabel: "ऐप अपडेट",
    installedLabel: "वर्तमान संस्करण",
    latestLabel: "नवीनतम संस्करण",
    unknownVersionLabel: "अज्ञात",
    checkingMessage: "अपडेट की जांच हो रही है.",
    availableMessage: "एक अपडेट उपलब्ध है.",
    currentMessage: "आप नवीनतम संस्करण पर हैं.",
    unknownMessage: "अपडेट स्थिति उपलब्ध नहीं है.",
    updateButtonLabel: "अपडेट करें",
  },
  th: {
    sectionLabel: "อัปเดตแอป",
    installedLabel: "เวอร์ชันปัจจุบัน",
    latestLabel: "เวอร์ชันล่าสุด",
    unknownVersionLabel: "ไม่ทราบ",
    checkingMessage: "กำลังตรวจสอบอัปเดต",
    availableMessage: "มีอัปเดตให้ติดตั้ง",
    currentMessage: "คุณใช้เวอร์ชันล่าสุดอยู่แล้ว",
    unknownMessage: "ไม่สามารถตรวจสอบสถานะอัปเดตได้",
    updateButtonLabel: "อัปเดต",
  },
  vi: {
    sectionLabel: "Cập nhật ứng dụng",
    installedLabel: "Phiên bản hiện tại",
    latestLabel: "Phiên bản mới nhất",
    unknownVersionLabel: "Không rõ",
    checkingMessage: "Đang kiểm tra cập nhật.",
    availableMessage: "Đã có bản cập nhật mới.",
    currentMessage: "Bạn đang ở phiên bản mới nhất.",
    unknownMessage: "Không thể kiểm tra trạng thái cập nhật.",
    updateButtonLabel: "Cập nhật",
  },
};

export function resolveNativeAppUpdateCopy(
  uiLocale: string
): NativeAppUpdateCopy {
  const normalized = (uiLocale || "").trim().replace(/_/g, "-").toLowerCase();
  if (!normalized) return COPY_BY_LOCALE.en;

  if (normalized.startsWith("zh-")) {
    if (
      normalized.includes("-tw") ||
      normalized.includes("-hant") ||
      normalized.includes("-hk") ||
      normalized.includes("-mo")
    ) {
      return COPY_BY_LOCALE["zh-TW"];
    }
    return COPY_BY_LOCALE["zh-CN"];
  }

  const directMatch = Object.entries(COPY_BY_LOCALE).find(
    ([localeKey]) => localeKey.toLowerCase() === normalized
  );
  if (directMatch) return directMatch[1];

  const base = normalized.split("-")[0] || "";
  return COPY_BY_LOCALE[base] || COPY_BY_LOCALE.en;
}
