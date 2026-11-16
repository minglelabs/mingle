"use client";

import { clientApiNamespace, namespaceSupportsPostingFeed } from "@/lib/api-contract";
import { replaceWithConversationListThenPush } from "@/lib/direct-conversation-navigation";
import { resolveNativePushTapNavigation } from "@/lib/native-push-tap";
import {
  armPendingNativeShare,
  clearPendingNativeShare,
  getPendingNativeShareVersion,
  isPendingNativeShareArmed,
  isPendingNativeShareAwaitingChoice,
  NATIVE_SHARE_INBOX_EVENT,
  NATIVE_SHARE_INBOX_WINDOW_KEY,
  parseNativeShareInboxPayload,
  postNativeShareInboxAck,
  receiveNativeShare,
  resolveNativeShareInboxCopy,
  subscribePendingNativeShare,
} from "@/lib/native-share-inbox";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

type NativeShareInboxWindow = Window & {
  [NATIVE_SHARE_INBOX_WINDOW_KEY]?: unknown;
};

const CONVERSATION_QUERY_KEY = "conversation";

function readOpenConversationId(): string {
  return (new URLSearchParams(window.location.search).get(CONVERSATION_QUERY_KEY) ?? "").trim();
}

function readLocale(): string {
  return window.location.pathname.split("/").filter(Boolean)[0] ?? "";
}

/**
 * Receives content shared to HashChat from another app (system share sheet; see
 * `lib/native-share-inbox.ts`) and opens the conversation it is meant for.
 * The room's composer then takes it. When no conversation was picked in the
 * share sheet, the conversation list opens with a notice and the next room
 * the user opens takes the content.
 */
export default function NativeShareInboxReceiver() {
  const router = useRouter();
  const version = useSyncExternalStore(
    subscribePendingNativeShare,
    getPendingNativeShareVersion,
    () => "",
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nativeWindow = window as NativeShareInboxWindow;

    const handlePayload = (rawPayload: unknown) => {
      delete nativeWindow[NATIVE_SHARE_INBOX_WINDOW_KEY];
      const payload = parseNativeShareInboxPayload(rawPayload);
      if (!payload) return;
      // Acknowledge repeats too: the shell stops resending only on an ack.
      postNativeShareInboxAck(payload.id);

      const openConversationId = readOpenConversationId();
      if (!receiveNativeShare(payload, { roomOpen: openConversationId !== "" })) return;
      if (payload.conversationId && payload.conversationId === openConversationId) return;

      const locale = readLocale();
      const targetPath = payload.conversationId
        ? `/${locale}/conversations?${CONVERSATION_QUERY_KEY}=${encodeURIComponent(payload.conversationId)}`
        : `/${locale}/conversations`;
      const navigation = resolveNativePushTapNavigation(targetPath, {
        currentSearchParams: new URLSearchParams(window.location.search),
        supportsPostingFeed: namespaceSupportsPostingFeed(clientApiNamespace),
      });
      if (!navigation) {
        clearPendingNativeShare();
        return;
      }
      if (navigation.kind === "conversation") {
        replaceWithConversationListThenPush(router, navigation.conversationListHref, navigation.conversationId);
      } else if (navigation.kind === "route") {
        router.push(navigation.href);
      }
    };

    const handleEvent = (event: Event) => {
      handlePayload((event as CustomEvent<unknown>).detail);
    };

    window.addEventListener(NATIVE_SHARE_INBOX_EVENT, handleEvent);
    const pendingPayload = nativeWindow[NATIVE_SHARE_INBOX_WINDOW_KEY];
    if (pendingPayload) {
      handlePayload(pendingPayload);
    }

    return () => {
      window.removeEventListener(NATIVE_SHARE_INBOX_EVENT, handleEvent);
    };
  }, [router]);

  // A share with no picked conversation that arrived while a room was open:
  // wait until that room is closed before letting a room take it.
  useEffect(() => {
    if (!version || isPendingNativeShareArmed()) return;
    const timer = window.setInterval(() => {
      if (readOpenConversationId() === "") armPendingNativeShare();
    }, 200);
    return () => window.clearInterval(timer);
  }, [version]);

  if (!version || !isPendingNativeShareAwaitingChoice()) return null;

  const copy = resolveNativeShareInboxCopy(typeof window === "undefined" ? "en" : readLocale());
  return (
    <div
      role="status"
      data-qa="native-share-inbox-notice"
      className="pointer-events-none fixed inset-x-0 z-[9000] flex justify-center px-4"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
    >
      <div className="pointer-events-auto flex max-w-full items-center gap-1 rounded-full bg-gray-900/95 py-1.5 pl-4 pr-1.5 text-[14px] font-medium text-white shadow-lg">
        <span className="min-w-0 truncate">{copy.chooseConversation}</span>
        <button
          type="button"
          aria-label={copy.cancel}
          onClick={() => clearPendingNativeShare()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/80 active:bg-white/15"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
