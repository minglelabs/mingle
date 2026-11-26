import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/**
 * The small mark on an open chat's row in the chat list (owner, 2026-11-26):
 * open chats and private chats are in one list, and this tells them apart.
 */
const LABELS: Record<PrimaryUiLocale, string> = {
  ko: "오픈챗",
  en: "Open",
  ja: "オープン",
  "zh-CN": "公开",
  "zh-TW": "公開",
  fr: "Ouvert",
  de: "Offen",
  es: "Abierto",
  pt: "Aberto",
  it: "Aperta",
  ru: "Открытый",
  ar: "مفتوحة",
  hi: "ओपन",
  th: "เปิด",
  vi: "Mở",
};

export function resolveOpenChatLabel(rawLocale: string): string {
  return LABELS[resolvePrimaryUiLocaleTag(rawLocale) ?? "en"] ?? LABELS.en;
}
