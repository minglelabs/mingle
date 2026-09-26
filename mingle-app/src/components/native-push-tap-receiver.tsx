"use client";

import { clientApiNamespace, namespaceSupportsPostingFeed } from "@/lib/api-contract";
import { replaceWithConversationListThenPush } from "@/lib/direct-conversation-navigation";
import {
  createNativePushTapHandler,
  NATIVE_PUSH_TAP_EVENT,
  NATIVE_PUSH_TAP_WINDOW_KEY,
} from "@/lib/native-push-tap";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

type NativePushTapWindow = Window & {
  [NATIVE_PUSH_TAP_WINDOW_KEY]?: unknown;
};

/**
 * Receives the native push-tap event (`rn/App.tsx` → `buildNativePushTapEventScript`)
 * and routes to the tapped notification's destination. A tap that arrived
 * before this component mounted is picked up from the window slot.
 */
export default function NativePushTapReceiver() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nativeWindow = window as NativePushTapWindow;

    const handleRequest = createNativePushTapHandler({
      readCurrentSearch: () => window.location.search,
      supportsPostingFeed: () => namespaceSupportsPostingFeed(clientApiNamespace),
      clearPendingRequest: () => {
        delete nativeWindow[NATIVE_PUSH_TAP_WINDOW_KEY];
      },
      pushRoute: (href) => router.push(href),
      openConversation: (conversationListHref, conversationId) => {
        replaceWithConversationListThenPush(router, conversationListHref, conversationId);
      },
    });

    const handleEvent = (event: Event) => {
      handleRequest((event as CustomEvent<unknown>).detail);
    };

    window.addEventListener(NATIVE_PUSH_TAP_EVENT, handleEvent);
    const pendingRequest = nativeWindow[NATIVE_PUSH_TAP_WINDOW_KEY];
    if (pendingRequest) {
      handleRequest(pendingRequest);
    }

    return () => {
      window.removeEventListener(NATIVE_PUSH_TAP_EVENT, handleEvent);
    };
  }, [router]);

  return null;
}
