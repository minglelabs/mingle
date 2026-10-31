"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { runAfterStartup } from "@/lib/after-startup";
import {
  NATIVE_CONVERSATION_SHARE_EVENT,
  NATIVE_CONVERSATION_SHARE_WINDOW_KEY,
} from "@/lib/native-conversation-share-overlay";
import {
  NATIVE_PROFILE_LINK_EVENT,
  NATIVE_PROFILE_LINK_WINDOW_KEY,
} from "@/lib/native-profile-link-overlay";

// Both overlays open only on a native deep link, and their screens (a public
// profile with the app dictionary; a shared conversation with chat bubbles)
// are among the largest modules in the root layout. They load after the first
// screen instead of before it.
const NativeProfileLinkOverlay = dynamic(() => import("@/components/native-profile-link-overlay"), { ssr: false });
const NativeConversationShareOverlay = dynamic(
  () => import("@/components/native-conversation-share-overlay"),
  { ssr: false },
);

/**
 * Mounts an overlay after startup, or at once when its native request is
 * already waiting or arrives. The native shell stores every request on the
 * window before dispatching its event, and the overlay reads that slot when it
 * mounts, so a request that arrives before the overlay is loaded still opens.
 */
function useDeferredOverlayMount(eventName: string, windowKey: string): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (mounted) return;
    const mount = () => setMounted(true);
    if ((window as unknown as Record<string, unknown>)[windowKey]) {
      // Deferred out of the effect body (react-hooks/set-state-in-effect).
      queueMicrotask(mount);
      return;
    }
    window.addEventListener(eventName, mount);
    const cancelStartup = runAfterStartup(mount);
    return () => {
      window.removeEventListener(eventName, mount);
      cancelStartup();
    };
  }, [eventName, mounted, windowKey]);

  return mounted;
}

export function DeferredNativeProfileLinkOverlay() {
  const mounted = useDeferredOverlayMount(NATIVE_PROFILE_LINK_EVENT, NATIVE_PROFILE_LINK_WINDOW_KEY);
  return mounted ? <NativeProfileLinkOverlay /> : null;
}

export function DeferredNativeConversationShareOverlay() {
  const mounted = useDeferredOverlayMount(NATIVE_CONVERSATION_SHARE_EVENT, NATIVE_CONVERSATION_SHARE_WINDOW_KEY);
  return mounted ? <NativeConversationShareOverlay /> : null;
}
