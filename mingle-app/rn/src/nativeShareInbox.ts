/**
 * System share sheet → WebView.
 *
 * iOS: the share extension (ios/MingleShare) stores what another app shared
 * and opens the app with `mingle://share-inbox`.
 * Android: MainActivity receives the ACTION_SEND intent.
 *
 * On both, the shell reads the shared content through NativeShareTargetModule
 * (start, foreground) and hands it to the page with the event below; the page
 * shows it in the conversation's composer and acknowledges.
 *
 * The same module reports conversations to the system (iOS: donated
 * interactions, Android: sharing shortcuts), which is what makes them appear
 * as direct targets in the share sheet.
 */

const SHARE_INBOX_SCHEME = "mingle:";
const SHARE_INBOX_HOST = "share-inbox";

/** A conversation id is an opaque token; keep it conservative (see pushNavigation.ts). */
const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const SHARE_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_TEXT_LENGTH = 4_000;
const MAX_DISPLAY_NAME_LENGTH = 120;
const MAX_AVATAR_URL_LENGTH = 2_048;

export const NATIVE_SHARE_INBOX_EVENT = "mingle:native-share-inbox";
export const NATIVE_SHARE_INBOX_WINDOW_KEY = "__MINGLE_PENDING_NATIVE_SHARE_INBOX";

export type NativeShareInboxPayload = {
  id: string;
  /** The conversation picked in the share sheet; null when only the app icon was tapped. */
  conversationId: string | null;
  text: string | null;
  image: { mimeType: "image/jpeg"; base64: string } | null;
};

export type NativeShareTargetDonation = {
  conversationId: string;
  displayName: string;
  avatarUrl: string | null;
};

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** True for the URL the share extension opens the app with. */
export function isNativeShareInboxLink(rawValue: unknown): boolean {
  const value = asTrimmedString(rawValue);
  if (!value.startsWith(SHARE_INBOX_SCHEME)) return false;
  // RN's URL polyfill cannot read the host of a custom scheme; parse it by hand.
  const authority = value
    .slice(SHARE_INBOX_SCHEME.length)
    .replace(/^\/\//, "")
    .split(/[/?#]/, 1)[0];
  return authority === SHARE_INBOX_HOST;
}

/** Validates what NativeShareTargetModule.consumePendingShare returned. */
export function normalizeNativeShareInboxPayload(value: unknown): NativeShareInboxPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  const id = asTrimmedString(raw.id);
  if (!SHARE_ID_PATTERN.test(id)) return null;

  const rawConversationId = asTrimmedString(raw.conversationId);
  const conversationId = CONVERSATION_ID_PATTERN.test(rawConversationId) ? rawConversationId : null;

  const text = asTrimmedString(raw.text).slice(0, MAX_TEXT_LENGTH) || null;

  const base64 = asTrimmedString(raw.imageBase64);
  const image = base64 && BASE64_PATTERN.test(base64) && raw.imageMimeType === "image/jpeg"
    ? { mimeType: "image/jpeg" as const, base64 }
    : null;

  if (!text && !image) return null;
  return { id, conversationId, text, image };
}

/** Injected-JS snippet that hands the shared content to the page. */
export function buildNativeShareInboxEventScript(payload: NativeShareInboxPayload): string {
  const serialized = JSON.stringify(payload);
  return `(function () { var detail = ${serialized}; window[${JSON.stringify(
    NATIVE_SHARE_INBOX_WINDOW_KEY,
  )}] = detail; window.dispatchEvent(new CustomEvent(${JSON.stringify(
    NATIVE_SHARE_INBOX_EVENT,
  )}, { detail: detail })); })(); true;`;
}

/** Validates the page's request to suggest a conversation in the share sheet. */
export function normalizeNativeShareTargetDonation(value: unknown): NativeShareTargetDonation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  const conversationId = asTrimmedString(raw.conversationId);
  if (!CONVERSATION_ID_PATTERN.test(conversationId)) return null;

  const displayName = asTrimmedString(raw.displayName).slice(0, MAX_DISPLAY_NAME_LENGTH);
  if (!displayName) return null;

  const rawAvatarUrl = asTrimmedString(raw.avatarUrl);
  const avatarUrl = rawAvatarUrl.length <= MAX_AVATAR_URL_LENGTH && /^https?:\/\//i.test(rawAvatarUrl)
    ? rawAvatarUrl
    : null;

  return { conversationId, displayName, avatarUrl };
}

/** The conversation id of a "stop suggesting this conversation" request, or null. */
export function normalizeNativeShareTargetConversationId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const conversationId = asTrimmedString((value as Record<string, unknown>).conversationId);
  return CONVERSATION_ID_PATTERN.test(conversationId) ? conversationId : null;
}
