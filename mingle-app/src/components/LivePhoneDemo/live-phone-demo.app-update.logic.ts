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
    sectionLabel: "Mise a jour de l'app",
    installedLabel: "Version installee",
    latestLabel: "Derniere version",
    unknownVersionLabel: "Inconnue",
    checkingMessage: "Verification des mises a jour.",
    availableMessage: "Une mise a jour est disponible.",
    currentMessage: "Vous utilisez la derniere version.",
    unknownMessage: "Le statut de mise a jour est indisponible.",
    updateButtonLabel: "Mettre a jour",
  },
  de: {
    sectionLabel: "App-Update",
    installedLabel: "Installiert",
    latestLabel: "Neueste Version",
    unknownVersionLabel: "Unbekannt",
    checkingMessage: "Suche nach Updates.",
    availableMessage: "Ein Update ist verfugbar.",
    currentMessage: "Sie verwenden die neueste Version.",
    unknownMessage: "Der Update-Status ist nicht verfugbar.",
    updateButtonLabel: "Aktualisieren",
  },
  es: {
    sectionLabel: "Actualizacion de la app",
    installedLabel: "Version instalada",
    latestLabel: "Ultima version",
    unknownVersionLabel: "Desconocida",
    checkingMessage: "Buscando actualizaciones.",
    availableMessage: "Hay una actualizacion disponible.",
    currentMessage: "Ya usa la ultima version.",
    unknownMessage: "No se puede comprobar el estado de actualizacion.",
    updateButtonLabel: "Actualizar",
  },
  pt: {
    sectionLabel: "Atualizacao do app",
    installedLabel: "Versao instalada",
    latestLabel: "Versao mais recente",
    unknownVersionLabel: "Desconhecida",
    checkingMessage: "Verificando atualizacoes.",
    availableMessage: "Ha uma atualizacao disponivel.",
    currentMessage: "Voce esta na versao mais recente.",
    unknownMessage: "O status da atualizacao esta indisponivel.",
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
    sectionLabel: "Obnovlenie prilozheniya",
    installedLabel: "Tekushchaya versiya",
    latestLabel: "Poslednyaya versiya",
    unknownVersionLabel: "Neizvestno",
    checkingMessage: "Proveryaem obnovleniya.",
    availableMessage: "Dostupno obnovlenie.",
    currentMessage: "U vas ustanovlena poslednyaya versiya.",
    unknownMessage: "Status obnovleniya nedostupen.",
    updateButtonLabel: "Obnovit",
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
    sectionLabel: "Cap nhat ung dung",
    installedLabel: "Phien ban hien tai",
    latestLabel: "Phien ban moi nhat",
    unknownVersionLabel: "Khong ro",
    checkingMessage: "Dang kiem tra cap nhat.",
    availableMessage: "Da co ban cap nhat moi.",
    currentMessage: "Ban dang o phien ban moi nhat.",
    unknownMessage: "Khong the kiem tra trang thai cap nhat.",
    updateButtonLabel: "Cap nhat",
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
