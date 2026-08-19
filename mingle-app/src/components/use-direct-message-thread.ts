"use client";

import { buildClientApiPath } from "@/lib/api-contract";
import { useCallback, useEffect, useMemo, useState } from "react";

// A safety net, not the primary delivery path — see useConversationRealtime.
// A dropped push is invisible until this fires, so it stays short enough that
// nothing feels stuck, without polling often enough to matter for load.
const POLL_INTERVAL_MS = 20_000;

export type DirectMessageAuthor = {
  id: string;
  handle: string | null;
  name: string | null;
  image: string | null;
};

export type DirectMessage = {
  id: string;
  clientMessageId: string | null;
  originalText: string;
  sourceLanguage: string;
  translations: Record<string, string>;
  createdAt: string;
  sender: DirectMessageAuthor | null;
  isMine: boolean;
  isPending?: boolean;
  hasFailed?: boolean;
};

export function createClientMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `dm_${crypto.randomUUID().replaceAll("-", "")}`;
  }
  return `dm_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Server rows are the truth for anything already delivered, but they must not
 * wipe the optimistic rows still waiting on their POST — those exist only on
 * the client until the server echoes their clientMessageId back.
 */
export function mergeServerMessages(
  current: readonly DirectMessage[],
  serverMessages: readonly DirectMessage[],
): DirectMessage[] {
  const confirmed = new Set(
    serverMessages.map((message) => message.clientMessageId).filter(Boolean),
  );
  const stillPending = current.filter((message) => (
    (message.isPending || message.hasFailed) && !confirmed.has(message.clientMessageId)
  ));
  return [...serverMessages, ...stillPending];
}

export type DirectMessageThread = {
  messages: DirectMessage[];
  partner: DirectMessageAuthor | null;
  isLoading: boolean;
  loadError: boolean;
  isSending: boolean;
  reload: () => Promise<void>;
  /** Re-fetches without backfilling — what a realtime push or the safety-net poll asks for. */
  refreshNow: () => Promise<void>;
  send: (text: string, sourceLanguage?: string) => Promise<void>;
  retry: (message: DirectMessage) => void;
};

/**
 * Owns everything about the thread itself: loading it, keeping it fresh, and
 * sending into it. The screen renders what this returns and nothing more.
 */
export default function useDirectMessageThread(conversationId: string): DirectMessageThread {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [partner, setPartner] = useState<DirectMessageAuthor | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const messagesPath = useMemo(
    () => buildClientApiPath(`/conversations/${encodeURIComponent(conversationId)}/messages`),
    [conversationId],
  );

  // A reload triggered by the poll must never clear the first-load spinner or
  // raise a full-screen error over a thread the user is already reading.
  const loadMessages = useCallback(async (options?: {
    silent?: boolean;
    backfillTranslations?: boolean;
  }) => {
    if (!options?.silent) setIsLoading(true);
    try {
      const url = options?.backfillTranslations ? `${messagesPath}?backfill=1` : messagesPath;
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error("load_failed");
      const payload = await response.json() as {
        messages?: DirectMessage[];
        partner?: DirectMessageAuthor | null;
      };
      setPartner(payload.partner ?? null);
      setMessages((current) => mergeServerMessages(
        current,
        Array.isArray(payload.messages) ? payload.messages : [],
      ));
      setLoadError(false);
    } catch {
      if (!options?.silent) setLoadError(true);
    } finally {
      if (!options?.silent) setIsLoading(false);
    }
  }, [messagesPath]);

  useEffect(() => {
    // Opening the room is the one read guaranteed to reflect any language
    // change made while the user was away.
    void loadMessages({ backfillTranslations: true });
  }, [loadMessages]);

  const refreshNow = useCallback(async () => {
    await loadMessages({ silent: true });
  }, [loadMessages]);

  // Realtime push (useConversationRealtime) is the primary delivery path;
  // this interval only covers a dropped push, a mingle-stt outage, or realtime
  // being unconfigured in this environment.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void refreshNow();
    };
    const timer = window.setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refreshNow]);

  const postMessage = useCallback(async (
    text: string,
    clientMessageId: string,
    sourceLanguage?: string,
  ) => {
    setMessages((current) => current.map((message) => (
      message.clientMessageId === clientMessageId
        ? { ...message, isPending: true, hasFailed: false }
        : message
    )));

    try {
      const response = await fetch(messagesPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          clientMessageId,
          ...(sourceLanguage ? { sourceLanguage } : {}),
        }),
      });
      if (!response.ok) throw new Error("send_failed");
      const payload = await response.json() as { message?: DirectMessage };
      if (!payload.message) throw new Error("send_failed");

      const confirmed = payload.message;
      setMessages((current) => current.map((message) => (
        message.clientMessageId === clientMessageId
          ? { ...confirmed, isPending: false, hasFailed: false }
          : message
      )));
    } catch {
      setMessages((current) => current.map((message) => (
        message.clientMessageId === clientMessageId
          ? { ...message, isPending: false, hasFailed: true }
          : message
      )));
    }
  }, [messagesPath]);

  const send = useCallback(async (text: string, sourceLanguage?: string) => {
    const clientMessageId = createClientMessageId();
    setMessages((current) => [...current, {
      id: clientMessageId,
      clientMessageId,
      originalText: text,
      sourceLanguage: sourceLanguage ?? "",
      translations: {},
      createdAt: new Date().toISOString(),
      sender: null,
      isMine: true,
      isPending: true,
    }]);

    setIsSending(true);
    try {
      await postMessage(text, clientMessageId, sourceLanguage);
    } finally {
      setIsSending(false);
    }
  }, [postMessage]);

  const retry = useCallback((message: DirectMessage) => {
    if (!message.clientMessageId || message.isPending) return;
    void postMessage(message.originalText, message.clientMessageId, message.sourceLanguage || undefined);
  }, [postMessage]);

  // Used after the language selection changes, which is exactly when messages
  // already in the thread may be missing a translation.
  const reload = useCallback(async () => {
    await loadMessages({ silent: true, backfillTranslations: true });
  }, [loadMessages]);

  return {
    messages,
    partner,
    isLoading,
    loadError,
    isSending,
    reload,
    refreshNow,
    send,
    retry,
  };
}
