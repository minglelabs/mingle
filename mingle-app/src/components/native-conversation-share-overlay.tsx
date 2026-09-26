"use client";

import { ChevronLeft, Loader2, Smartphone } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChatBubble from "@/components/LivePhoneDemo/ChatBubble";
import SlideSurface from "@/components/slide-surface";
import {
  formatConversationSpectateInvite,
  getConversationSpectateCopy,
} from "@/components/conversation-spectate-copy";
import { useConversationSpectate } from "@/components/use-conversation-spectate";
import { buildClientApiPath } from "@/lib/api-contract";
import { DEFAULT_LOCALE, resolveLegalDocumentLocale, resolveSupportedLocaleTag, type AppLocale } from "@/i18n";
import { buildProfileImageTransform } from "@/lib/profile-image-crop";
import { postNativeBannerZone } from "@/lib/native-banner-zone";
import { buildNativeAwareTabPath } from "@/lib/tab-navigation";
import { replaceWithConversationListThenPush } from "@/lib/direct-conversation-navigation";
import { consumeCurrentHistoryEntry } from "@/lib/slide-surface-history";
import {
  NATIVE_CONVERSATION_SHARE_EVENT,
  NATIVE_CONVERSATION_SHARE_WINDOW_KEY,
  parseNativeConversationShareOverlayRequest,
  type NativeConversationShareOverlayRequest,
} from "@/lib/native-conversation-share-overlay";

const NATIVE_CONVERSATION_SHARE_HISTORY_STATE_KEY = "__MINGLE_NATIVE_CONVERSATION_SHARE_OVERLAY__";

type NativeConversationShareOverlayWindow = Window & {
  [NATIVE_CONVERSATION_SHARE_WINDOW_KEY]?: unknown;
};

type ShareOverlayState = NativeConversationShareOverlayRequest & {
  requestId: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveLocale(pathname: string): AppLocale {
  const firstSegment = pathname.split("/").filter(Boolean)[0] ?? "";
  return resolveSupportedLocaleTag(firstSegment) ?? DEFAULT_LOCALE;
}

function isConversationRoute(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  return segments[1] === "conversations" || (segments[1] === undefined && segments.length === 1);
}

function hasNativeConversationShareHistoryEntry(): boolean {
  if (typeof window === "undefined" || !isRecord(window.history.state)) return false;
  return Boolean(window.history.state[NATIVE_CONVERSATION_SHARE_HISTORY_STATE_KEY]);
}

function restoreNativeBannerZone(): void {
  if (typeof window === "undefined") return;
  postNativeBannerZone(isConversationRoute(window.location.pathname) ? "list" : "hidden");
}

// The in-app version of a conversation-share link: unlike the public
// /s/[shareToken] page (which has to sell the app to a browser visitor who
// may not have it installed), this renders as an overlay on top of whatever
// screen was already open — same pattern as NativeProfileLinkOverlay — since
// a viewer opening this deep link natively is, by definition, already using
// the app. No "Open in Mingle App" / store buttons, a real back button, and
// the app's own safe-area/back-gesture conventions instead of the marketing
// card's fixed layout.
export default function NativeConversationShareOverlay() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = resolveLocale(pathname);
  const spectateLocale = resolveLegalDocumentLocale(locale);
  const copy = useMemo(() => getConversationSpectateCopy(spectateLocale), [spectateLocale]);
  const [overlay, setOverlay] = useState<ShareOverlayState | null>(null);
  const overlayRef = useRef<ShareOverlayState | null>(null);
  const requestIdRef = useRef(0);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState(false);
  const pendingJoinNavigationRef = useRef(false);
  const joinNavigationReleaseTimerRef = useRef<number | null>(null);

  const { status, state } = useConversationSpectate(overlay?.shareToken ?? null);

  const openShare = useCallback((rawRequest: unknown) => {
    const request = parseNativeConversationShareOverlayRequest(rawRequest);
    if (!request || typeof window === "undefined") return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const nextState = {
      ...(isRecord(window.history.state) ? window.history.state : {}),
      [NATIVE_CONVERSATION_SHARE_HISTORY_STATE_KEY]: {
        shareToken: request.shareToken,
        requestId,
      },
    };

    if (hasNativeConversationShareHistoryEntry()) {
      window.history.replaceState(nextState, "", window.location.href);
    } else {
      window.history.pushState(nextState, "", window.location.href);
    }

    const nextOverlay = { ...request, requestId };
    overlayRef.current = nextOverlay;
    setOverlay(nextOverlay);
    setJoinError(false);
    postNativeBannerZone("hidden");

    const nativeWindow = window as NativeConversationShareOverlayWindow;
    delete nativeWindow[NATIVE_CONVERSATION_SHARE_WINDOW_KEY];
  }, []);

  // Mirrors NativeProfileLinkOverlay's startDirectConversationFromNativeProfile:
  // close this overlay's own history entry first (consumeCurrentHistoryEntry),
  // then replace the current list entry and push the room on top of it, so
  // the native back gesture from inside the room lands on the list, not back
  // on this now-joined overlay.
  const handleJoin = useCallback(async () => {
    const shareToken = overlay?.shareToken;
    if (!shareToken || isJoining || pendingJoinNavigationRef.current) return;

    setIsJoining(true);
    setJoinError(false);
    try {
      const response = await fetch(
        buildClientApiPath(`/conversations/shared/${encodeURIComponent(shareToken)}/join` as `/${string}`),
        { method: "POST" },
      );
      if (!response.ok) throw new Error("join_failed");
      const data = await response.json() as { conversation?: { id?: string } };
      const conversationId = data.conversation?.id;
      if (!conversationId) throw new Error("join_failed");

      pendingJoinNavigationRef.current = true;
      if (joinNavigationReleaseTimerRef.current !== null) {
        window.clearTimeout(joinNavigationReleaseTimerRef.current);
        joinNavigationReleaseTimerRef.current = null;
      }

      if (hasNativeConversationShareHistoryEntry()) {
        const consumed = await consumeCurrentHistoryEntry(hasNativeConversationShareHistoryEntry);
        if (!consumed && hasNativeConversationShareHistoryEntry()) {
          throw new Error("share_surface_close_failed");
        }
      }
      const conversationListHref = buildNativeAwareTabPath(
        `/${locale}/conversations`,
        searchParams,
        { skipConversationRestore: true, tabRoot: true },
      );
      replaceWithConversationListThenPush(router, conversationListHref, conversationId);
    } catch {
      setJoinError(true);
    } finally {
      setIsJoining(false);
      joinNavigationReleaseTimerRef.current = window.setTimeout(() => {
        pendingJoinNavigationRef.current = false;
        joinNavigationReleaseTimerRef.current = null;
      }, 600);
    }
  }, [isJoining, locale, overlay?.shareToken, router, searchParams]);

  const closeShare = useCallback(() => {
    if (typeof window !== "undefined" && hasNativeConversationShareHistoryEntry()) {
      window.history.back();
      return;
    }

    overlayRef.current = null;
    setOverlay(null);
    restoreNativeBannerZone();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleShareEvent = (event: Event) => {
      openShare((event as CustomEvent<unknown>).detail);
    };

    window.addEventListener(NATIVE_CONVERSATION_SHARE_EVENT, handleShareEvent);

    const nativeWindow = window as NativeConversationShareOverlayWindow;
    const pendingRequest = nativeWindow[NATIVE_CONVERSATION_SHARE_WINDOW_KEY];
    if (pendingRequest) {
      openShare(pendingRequest);
    }

    return () => {
      window.removeEventListener(NATIVE_CONVERSATION_SHARE_EVENT, handleShareEvent);
    };
  }, [openShare]);

  useEffect(() => {
    return () => {
      if (joinNavigationReleaseTimerRef.current !== null) {
        window.clearTimeout(joinNavigationReleaseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePopState = () => {
      if (!overlayRef.current) return;
      if (!hasNativeConversationShareHistoryEntry()) {
        overlayRef.current = null;
        setOverlay(null);
        restoreNativeBannerZone();
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // The spectate payload already carries the sharer's public profile card
  // (resolved server-side, since the payload deliberately has no account id
  // for a client to look anyone up with — see
  // lib/conversation-share-public-payload), so there is nothing to fetch here.
  const inviter = state?.inviter ?? null;

  // A share link is a fixed snapshot fetched once on open (see
  // useConversationSpectate) — utterances only ever change on that single
  // loading→ready transition, so there's no ongoing live feed that could
  // yank a reader back down; land on the newest message every time.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [state?.utterances]);

  const isOpen = Boolean(overlay);
  const roomTitle = state?.roomTitle || "";
  const inviterName = inviter?.name?.trim() || copy.userFallback;
  const isNotFound = status === "not_found";

  return (
    <SlideSurface
      open={isOpen}
      onClose={closeShare}
      ariaLabel={roomTitle || inviterName}
      nativeBackPriority={40}
      className="fixed inset-0 z-[110] flex min-h-0 w-full flex-col overflow-hidden bg-white text-slate-950"
    >
      <header
        className="grid shrink-0 grid-cols-[44px_1fr_44px] items-center border-b border-slate-100 px-4"
        style={{
          height: "calc(54px + env(safe-area-inset-top, 44px))",
          paddingTop: "env(safe-area-inset-top, 44px)",
        }}
      >
        <button
          type="button"
          onClick={closeShare}
          className="flex h-10 w-10 items-center justify-center rounded-full transition active:bg-gray-100"
          aria-label={copy.userFallback}
        >
          <ChevronLeft size={25} strokeWidth={2.1} aria-hidden="true" />
        </button>
        <h1 className="truncate text-center text-[17px] font-bold">{roomTitle}</h1>
        <div aria-hidden="true" />
      </header>

      {isNotFound ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <Smartphone className="h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="text-[15px] font-semibold text-slate-800">{copy.notFoundTitle}</p>
          <p className="text-[13px] leading-5 text-slate-500">{copy.notFoundDescription}</p>
        </div>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-4 py-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100">
              {inviter?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={inviter.image}
                  alt=""
                  width={40}
                  height={40}
                  className="h-full w-full object-cover"
                  style={{
                    transform: buildProfileImageTransform(40, {
                      scale: inviter.imageCropScale,
                      x: inviter.imageCropX,
                      y: inviter.imageCropY,
                    }),
                  }}
                />
              ) : (
                <span className="text-sm font-bold text-slate-400" aria-hidden="true">M</span>
              )}
            </div>
            <p className="min-w-0 flex-1 text-[14px] leading-5 text-slate-700">
              {roomTitle ? formatConversationSpectateInvite(copy, inviterName, roomTitle) : inviterName}
            </p>
          </div>

          <div
            ref={messagesContainerRef}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4"
            style={{ touchAction: "pan-y" }}
          >
            {status === "loading" ? (
              <div className="flex h-full items-center justify-center text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
              </div>
            ) : (
              state?.utterances.map((utterance) => (
                <ChatBubble
                  key={utterance.id}
                  utterance={utterance}
                  uiLocale={spectateLocale}
                  preferredDisplayLanguage={spectateLocale}
                />
              ))
            )}
          </div>

          <div
            className="shrink-0 border-t border-slate-100 px-4 py-3"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
          >
            {joinError ? (
              <p className="mb-2 text-center text-[12px] text-rose-500">{copy.joinRoomError}</p>
            ) : null}
            <button
              type="button"
              onClick={handleJoin}
              disabled={status === "loading" || isJoining}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#F3C35A] px-5 py-3.5 text-[15px] font-semibold text-[#2D2A1E] shadow-[0_10px_24px_rgba(243,195,90,0.28)] transition active:scale-[0.99] disabled:opacity-60"
            >
              {isJoining ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {copy.joinRoom}
            </button>
          </div>
        </>
      )}
    </SlideSurface>
  );
}
