import { resolveDefaultInviteMessageLocale } from "@/i18n/invite-ticket-copy";
import { isPrimaryUiLocale, type PrimaryUiLocale } from "@/i18n/mingle-locales";

// The language the user last picked for invite messages (invite ticket sheet).
// Only a convenience: when storage is blocked or empty the app UI default applies.
export const INVITE_MESSAGE_LOCALE_STORAGE_KEY = "mingle:invite-message-locale";

export function readStoredInviteMessageLocale(): PrimaryUiLocale | null {
  try {
    const value = globalThis.localStorage?.getItem(INVITE_MESSAGE_LOCALE_STORAGE_KEY);
    return value && isPrimaryUiLocale(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeInviteMessageLocale(locale: PrimaryUiLocale): void {
  try {
    globalThis.localStorage?.setItem(INVITE_MESSAGE_LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage unavailable: the pick lasts for this sheet only.
  }
}

/** The user's last pick, else the UI language (English for a Korean UI). */
export function resolveInviteMessageLocale(rawUiLocale: string): PrimaryUiLocale {
  return readStoredInviteMessageLocale() ?? resolveDefaultInviteMessageLocale(rawUiLocale);
}
