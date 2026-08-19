"use client";

import { buildClientApiPath } from "@/lib/api-contract";
import { getWsUrl } from "@/components/LivePhoneDemo/use-realtime-stt";
import { useEffect, useRef } from "react";

const RECONNECT_DELAY_MS = 3000;

/**
 * Opens a push channel to mingle-stt for one conversation and calls
 * `onMessage` whenever something new lands in it. This is purely a latency
 * win over the DM thread's own polling — every failure mode here (token mint
 * fails, socket never connects, connects then drops and stays down) just
 * means the poll keeps doing what it already did before this existed.
 */
export default function useConversationRealtime(args: {
  conversationId: string;
  onMessage: () => void;
}): void {
  const { conversationId, onMessage } = args;
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const tokenPath = buildClientApiPath(
    `/conversations/${encodeURIComponent(conversationId)}/realtime-token`,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let stopped = false;

    const connect = async () => {
      if (stopped) return;
      try {
        const response = await fetch(tokenPath, { method: "POST" });
        if (!response.ok) return;
        const payload = await response.json() as { token?: string | null };
        if (!payload.token || stopped) return;

        const url = new URL(getWsUrl());
        url.pathname = "/conversation-events";
        url.search = new URLSearchParams({ token: payload.token }).toString();

        socket = new WebSocket(url.toString());
        socket.onmessage = (event) => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(event.data as string);
          } catch {
            return;
          }
          if (
            typeof parsed === "object" && parsed !== null
            && (parsed as Record<string, unknown>).type === "message"
          ) {
            onMessageRef.current();
          }
        };
        socket.onclose = scheduleReconnect;
        socket.onerror = () => socket?.close();
      } catch {
        scheduleReconnect();
      }
    };

    function scheduleReconnect() {
      if (stopped || reconnectTimer !== null) return;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, RECONNECT_DELAY_MS);
    }

    void connect();

    return () => {
      stopped = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [tokenPath]);
}
