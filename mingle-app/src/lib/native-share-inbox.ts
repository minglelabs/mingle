/**
 * System share sheet (iOS and Android) → conversation room (web side).
 *
 * Another app shares a photo, link, or text to HashChat. The native shell
 * hands it to the page with the event below (`rn/src/nativeShareInbox.ts`,
 * `buildNativeShareInboxEventScript`). The page opens the picked conversation
 * and the room's composer takes the content: a photo opens the usual photo
 * preview with its send button, text lands in the message box. Nothing is
 * sent until the user taps send.
 *
 * In the other direction the room asks the shell to suggest a conversation in
 * the share sheet (`postNativeShareTargetDonate`).
 */

export const NATIVE_SHARE_INBOX_EVENT = "mingle:native-share-inbox";
export const NATIVE_SHARE_INBOX_WINDOW_KEY = "__MINGLE_PENDING_NATIVE_SHARE_INBOX";

const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const SHARE_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
// A photo is megabytes of base64. Searching for one character that does not
// belong is a flat scan; an anchored `^[...]+$` match over the whole string
// exceeds the regex stack limit of the app's JS engine (Hermes).
const NON_BASE64_CHARACTER = /[^A-Za-z0-9+/=]/;
const MAX_TEXT_LENGTH = 4_000;

export type NativeShareInboxPayload = {
  id: string;
  /** The conversation picked in the share sheet; null when only the app icon was tapped. */
  conversationId: string | null;
  text: string | null;
  image: { mimeType: "image/jpeg"; base64: string } | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Re-checked here because the window slot is page-writable. */
export function parseNativeShareInboxPayload(value: unknown): NativeShareInboxPayload | null {
  if (!isRecord(value)) return null;

  const id = asTrimmedString(value.id);
  if (!SHARE_ID_PATTERN.test(id)) return null;

  const rawConversationId = asTrimmedString(value.conversationId);
  const conversationId = CONVERSATION_ID_PATTERN.test(rawConversationId) ? rawConversationId : null;

  const text = asTrimmedString(value.text).slice(0, MAX_TEXT_LENGTH) || null;

  const rawImage = isRecord(value.image) ? value.image : null;
  const base64 = asTrimmedString(rawImage?.base64);
  const image = base64 && !NON_BASE64_CHARACTER.test(base64) && rawImage?.mimeType === "image/jpeg"
    ? { mimeType: "image/jpeg" as const, base64 }
    : null;

  if (!text && !image) return null;
  return { id, conversationId, text, image };
}

// ── Pending share ─────────────────────────────────────────────────────
// One share waits here until a room takes it. It lives in memory only: a
// reload drops it, which is the safe outcome for content nobody confirmed.

let pendingShare: NativeShareInboxPayload | null = null;
// A share with no picked conversation goes to the room the user opens next.
// If a room was already open when it arrived, that room must not take it:
// the share is "armed" only once the user is back on the conversation list.
let pendingShareArmed = false;
let lastReceivedShareId = "";
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function subscribePendingNativeShare(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPendingNativeShare(): NativeShareInboxPayload | null {
  return pendingShare;
}

/** True while a share with no picked conversation waits for the user to open a room. */
export function isPendingNativeShareAwaitingChoice(): boolean {
  return pendingShare !== null && pendingShare.conversationId === null;
}

/**
 * Stores a share handed over by the shell. The shell repeats the hand-over
 * until it is acknowledged, so a repeated id is reported as not new.
 */
export function receiveNativeShare(
  payload: NativeShareInboxPayload,
  options: { roomOpen: boolean },
): boolean {
  if (payload.id === lastReceivedShareId) return false;
  lastReceivedShareId = payload.id;
  pendingShare = payload;
  pendingShareArmed = payload.conversationId !== null || !options.roomOpen;
  notify();
  return true;
}

/** The user is on the conversation list: the next room they open takes the share. */
export function armPendingNativeShare(): void {
  if (!pendingShare || pendingShareArmed) return;
  pendingShareArmed = true;
  notify();
}

export function isPendingNativeShareArmed(): boolean {
  return pendingShare !== null && pendingShareArmed;
}

export function clearPendingNativeShare(): void {
  if (!pendingShare) return;
  finishPendingNativeShare(pendingShare.id);
}

/** Nothing of the share is left to hand out: tell the shell to drop its copy. */
function finishPendingNativeShare(id: string): void {
  pendingShare = null;
  postNativeShareInboxAck(id, "done");
  notify();
}

function isPendingShareFor(conversationId: string): boolean {
  if (!pendingShare || !pendingShareArmed || !conversationId) return false;
  return pendingShare.conversationId === null || pendingShare.conversationId === conversationId;
}

/** A value that changes whenever the pending share changes (for useSyncExternalStore). */
export function getPendingNativeShareVersion(): string {
  if (!pendingShare) return "";
  return [
    pendingShare.id,
    pendingShare.conversationId ?? "",
    pendingShareArmed ? "1" : "0",
    pendingShare.image ? "i" : "",
    pendingShare.text ? "t" : "",
  ].join(":");
}

/** The pending photo, if it is meant for this room. Removes it from the pending share. */
export function takePendingNativeShareImage(
  conversationId: string,
): { mimeType: "image/jpeg"; base64: string } | null {
  if (!isPendingShareFor(conversationId) || !pendingShare?.image) return null;
  const image = pendingShare.image;
  // Once a room took part of a share, the rest belongs to that room too.
  if (pendingShare.text) {
    pendingShare = { ...pendingShare, conversationId, image: null };
    notify();
  } else {
    finishPendingNativeShare(pendingShare.id);
  }
  return image;
}

/** The pending text, if it is meant for this room. Removes it from the pending share. */
export function takePendingNativeShareText(conversationId: string): string | null {
  if (!isPendingShareFor(conversationId) || !pendingShare?.text) return null;
  const text = pendingShare.text;
  if (pendingShare.image) {
    pendingShare = { ...pendingShare, conversationId, text: null };
    notify();
  } else {
    finishPendingNativeShare(pendingShare.id);
  }
  return text;
}

export function decodeNativeShareImage(
  image: { mimeType: "image/jpeg"; base64: string },
  fileName = "shared-photo.jpg",
): File {
  const binary = atob(image.base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], fileName, { type: image.mimeType });
}

// ── Messages to the native shell ──────────────────────────────────────

function postToNativeShell(message: { type: string; payload: Record<string, unknown> }): void {
  if (typeof window === "undefined") return;
  try {
    window.ReactNativeWebView?.postMessage(JSON.stringify(message));
  } catch {
    // Share-sheet integration is best effort and must not affect the room.
  }
}

/**
 * "received": the page holds the share (the shell stops repeating it).
 * "done": a room took it or the user cancelled (the shell drops its copy;
 * until then the shell hands it over again after every page load).
 */
export function postNativeShareInboxAck(id: string, stage: "received" | "done"): void {
  postToNativeShell({ type: "native_share_inbox_ack", payload: { id, stage } });
}

export type NativeShareTargetDonation = {
  conversationId: string;
  displayName: string;
  avatarUrl: string | null;
};

/**
 * What to show for a room in the share sheet: its title, or else its other
 * members' names; the first other member's photo. Null when the room has no
 * usable name (nothing to show).
 */
export function buildNativeShareTargetDonation(input: {
  conversationId: string;
  title: string;
  otherMembers: ReadonlyArray<{ name?: string | null; image?: string | null }>;
  origin: string;
}): NativeShareTargetDonation | null {
  if (!CONVERSATION_ID_PATTERN.test(input.conversationId)) return null;

  const memberNames = input.otherMembers
    .map((member) => asTrimmedString(member.name))
    .filter(Boolean);
  const displayName = (asTrimmedString(input.title) || memberNames.slice(0, 3).join(", ")).slice(0, 120);
  if (!displayName) return null;

  let avatarUrl: string | null = null;
  const rawImage = input.otherMembers.map((member) => asTrimmedString(member.image)).find(Boolean) ?? "";
  if (rawImage) {
    try {
      const resolved = new URL(rawImage, input.origin);
      if (resolved.protocol === "https:" || resolved.protocol === "http:") {
        avatarUrl = resolved.toString();
      }
    } catch {
      avatarUrl = null;
    }
  }

  return { conversationId: input.conversationId, displayName, avatarUrl };
}

/** Ask iOS to suggest this conversation in the share sheet. */
export function postNativeShareTargetDonate(donation: NativeShareTargetDonation): void {
  postToNativeShell({ type: "native_share_target_donate", payload: donation });
}

/** The user left or deleted the conversation: stop suggesting it. */
export function postNativeShareTargetRemove(conversationId: string): void {
  if (!CONVERSATION_ID_PATTERN.test(conversationId)) return;
  postToNativeShell({ type: "native_share_target_remove", payload: { conversationId } });
}

// ── "Choose a conversation" notice ────────────────────────────────────

const CHOOSE_CONVERSATION_COPY: Record<string, string> = {
  ko: "보낼 대화를 선택하세요",
  en: "Choose a conversation to send to",
  ja: "送信先のトークを選んでください",
  "zh-CN": "请选择要发送到的聊天",
  "zh-TW": "請選擇要傳送到的聊天",
  fr: "Choisissez une conversation",
  de: "Wähle einen Chat zum Senden",
  es: "Elige una conversación para enviar",
  pt: "Escolha uma conversa para enviar",
  it: "Scegli una conversazione",
  ru: "Выберите чат для отправки",
  ar: "اختر محادثة للإرسال إليها",
  hi: "भेजने के लिए कोई चैट चुनें",
  th: "เลือกแชตที่จะส่ง",
  vi: "Chọn cuộc trò chuyện để gửi",
};

const CANCEL_COPY: Record<string, string> = {
  ko: "취소",
  en: "Cancel",
  ja: "キャンセル",
  "zh-CN": "取消",
  "zh-TW": "取消",
  fr: "Annuler",
  de: "Abbrechen",
  es: "Cancelar",
  pt: "Cancelar",
  it: "Annulla",
  ru: "Отмена",
  ar: "إلغاء",
  hi: "रद्द करें",
  th: "ยกเลิก",
  vi: "Hủy",
};

export function resolveNativeShareInboxCopy(locale: string): { chooseConversation: string; cancel: string } {
  const key = CHOOSE_CONVERSATION_COPY[locale]
    ? locale
    : CHOOSE_CONVERSATION_COPY[locale.split("-")[0]]
      ? locale.split("-")[0]
      : "en";
  return { chooseConversation: CHOOSE_CONVERSATION_COPY[key], cancel: CANCEL_COPY[key] };
}
