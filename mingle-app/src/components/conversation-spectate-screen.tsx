"use client";

import { Play, Smartphone } from "lucide-react";
import { useEffect, useRef, type MouseEvent } from "react";
import ChatBubble from "@/components/LivePhoneDemo/ChatBubble";
import {
  buildConversationShareAppUrl,
  CONVERSATION_SHARE_APP_SCHEME,
  isValidConversationShareToken,
} from "@/lib/conversation-share-link";
import { buildProfileImageTransform } from "@/lib/profile-image-crop";
import {
  formatConversationSpectateInvite,
  getConversationSpectateCopy,
  type ConversationSpectateLocale,
} from "@/components/conversation-spectate-copy";
import { useConversationSpectate, type ConversationSpectateState } from "@/components/use-conversation-spectate";

export type ConversationSpectateInviter = {
  name: string | null;
  image: string | null;
  imageCropScale: number | null;
  imageCropX: number | null;
  imageCropY: number | null;
};

type ConversationSpectateScreenProps = {
  shareToken: string;
  iosAppStoreUrl: string;
  androidPlayStoreUrl: string;
  locale: ConversationSpectateLocale;
  initialRoomTitle: string;
  inviter: ConversationSpectateInviter | null;
  initialState: ConversationSpectateState | null;
  // True the moment the server already knows (from its own hydration fetch)
  // that this token doesn't resolve to a shared conversation — lets the
  // "no longer shared" card render on the very first paint instead of
  // flashing the normal chat card while the client re-confirms the same
  // thing over the network. See page.tsx.
  initialNotFound: boolean;
  // Detected from the request's User-Agent header, server-side — see
  // page.tsx. Passing this down instead of re-detecting from
  // navigator.userAgent after mount means the correct store button(s)
  // render from the very first paint instead of both showing briefly and
  // then narrowing to one.
  initialIsAndroid: boolean;
  initialIsIos: boolean;
};

function AppleLogo() {
  return (
    <svg aria-hidden="true" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M15.464 3.784c.8-.96 1.336-2.296 1.188-3.624-1.152.048-2.544.768-3.376 1.728-.736.848-1.384 2.2-1.208 3.496 1.288.1 2.6-.648 3.396-1.6ZM20.88 17.028c-.036-.016-3.1-1.188-3.132-4.716-.028-2.948 2.408-4.356 2.52-4.42-1.392-2.036-3.564-2.264-4.328-2.296-1.8-.144-3.512 1.072-4.428 1.072-.948 0-2.415-1.078-3.96-1.047-2.04.032-3.92 1.176-4.968 3.008-2.136 3.704-.544 9.136 1.512 12.128 1 1.464 2.168 3.104 3.72 3.048 1.48-.064 2.04-.968 3.832-.968 1.768 0 2.272.968 3.84.936 1.6-.032 2.608-1.464 3.576-2.936 1.128-1.648 1.592-3.248 1.616-3.328-.036-.016-.764-.292-1.8-.481Z" />
    </svg>
  );
}

export default function ConversationSpectateScreen({
  shareToken,
  iosAppStoreUrl,
  androidPlayStoreUrl,
  locale,
  initialRoomTitle,
  inviter,
  initialState,
  initialNotFound,
  initialIsAndroid,
  initialIsIos,
}: ConversationSpectateScreenProps) {
  const copy = getConversationSpectateCopy(locale);
  const isValidToken = isValidConversationShareToken(shareToken);
  const { status, state } = useConversationSpectate(
    isValidToken ? shareToken : null,
    initialState,
    initialNotFound,
  );
  const appUrl = isValidToken ? buildConversationShareAppUrl(shareToken) : null;
  // isAndroid/isIos come straight from the server's own User-Agent-header
  // detection (see page.tsx) and never change after that: the request that
  // rendered this page and the client hydrating it are the same device, so
  // there's nothing to "correct" after mount the way a client-only
  // navigator.userAgent read would need to.
  const isAndroid = initialIsAndroid;
  const isIos = initialIsIos;
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  // Chat-app-standard behavior: land on the newest message, not the
  // oldest of the fetched batch. Stays pinned to the bottom as live
  // updates land, but only while the viewer hasn't scrolled up to read
  // earlier messages — a live update should never yank them back down
  // mid-read.
  const isPinnedToBottomRef = useRef(true);
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      isPinnedToBottomRef.current = distanceFromBottom < 80;
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || !isPinnedToBottomRef.current) return;
    container.scrollTop = container.scrollHeight;
  }, [state?.utterances]);
  const launchNonceRef = useRef(0);

  const roomTitle = state?.roomTitle || initialRoomTitle;
  const inviterName = inviter?.name?.trim() || copy.userFallback;
  const isNotFound = !isValidToken || status === "not_found";

  // One click, straight to the launch attempt — same shape as the App
  // Store/Play Store links right below it, no extra custom confirm step in
  // between (the app itself still asks to confirm once it opens). Has to be
  // a real <a> click, not a window.location.href assignment from a plain
  // button — mobile browsers are far more willing to honor a custom URL
  // scheme from an anchor's own click activation than from a script-driven
  // redirect. Same reliability trick as profile-link-install-screen.tsx's
  // handleOpenInApp: update the anchor's href right before its default
  // navigation runs.
  const handleOpenInApp = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!appUrl) {
      event.preventDefault();
      return;
    }

    launchNonceRef.current += 1;
    const launchNonce = String(Date.now()) + "-" + String(launchNonceRef.current);
    const launchUrl = buildConversationShareAppUrl(shareToken, launchNonce, CONVERSATION_SHARE_APP_SCHEME) ?? appUrl;
    event.currentTarget.href = launchUrl;
  };

  if (isNotFound) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f3ee] px-6 py-12 text-slate-950">
        <section className="w-full max-w-md rounded-[2rem] bg-white p-8 text-center shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-500">
            <Smartphone className="h-8 w-8" aria-hidden="true" />
          </div>
          <h1 className="mt-6 text-2xl font-bold tracking-tight">{copy.notFoundTitle}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">{copy.notFoundDescription}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="flex h-[100svh] flex-col items-center overflow-hidden bg-[linear-gradient(145deg,#1295e8_0%,#3569ed_52%,#7338f2_100%)] px-5 py-10 text-slate-950">
      <div className="mx-auto flex w-full max-w-[18rem] shrink-0 items-center justify-center gap-3.5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/40 bg-white/90 shadow-sm">
          {inviter?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={inviter.image}
              alt=""
              width={48}
              height={48}
              className="h-full w-full object-cover"
              style={{
                transform: buildProfileImageTransform(48, {
                  scale: inviter.imageCropScale,
                  x: inviter.imageCropX,
                  y: inviter.imageCropY,
                }),
              }}
            />
          ) : (
            <span className="text-lg font-bold text-slate-400" aria-hidden="true">M</span>
          )}
        </div>
        <p className="min-w-0 text-left text-base font-semibold text-white drop-shadow-sm">
          {roomTitle ? formatConversationSpectateInvite(copy, inviterName, roomTitle) : inviterName}
        </p>
      </div>

      <section className="mt-6 flex w-full max-w-md min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem] bg-white/95 shadow-[0_24px_70px_rgba(22,50,140,0.28)] backdrop-blur">
        <div
          ref={messagesContainerRef}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-6"
          style={{ touchAction: "pan-y" }}
        >
          {status === "loading" ? (
            <div className="flex h-full items-center justify-center text-slate-400">
              <Smartphone className="h-6 w-6 animate-pulse" aria-hidden="true" />
            </div>
          ) : (
            state?.utterances.map((utterance) => (
              <ChatBubble
                key={utterance.id}
                utterance={utterance}
                uiLocale={locale}
                preferredDisplayLanguage={locale}
              />
            ))
          )}
        </div>

        <div className="shrink-0 border-t border-slate-100 px-5 py-4">
          <a
            href={appUrl ?? "#"}
            onClick={handleOpenInApp}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#F3C35A] px-5 py-4 text-base font-semibold text-[#2D2A1E] shadow-[0_10px_24px_rgba(243,195,90,0.28)] transition hover:bg-[#EAB54A] active:scale-[0.99]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mingle-icon.png" alt="" className="h-5 w-5 rounded-[5px]" aria-hidden="true" />
            {copy.openInApp}
          </a>

          <div className="mt-3 grid gap-3">
            {iosAppStoreUrl && (!isAndroid || isIos) ? (
              <a
                href={iosAppStoreUrl}
                className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-5 py-3.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
                rel="noreferrer"
              >
                <AppleLogo />
                {copy.appStore}
              </a>
            ) : null}
            {androidPlayStoreUrl && (!isIos || isAndroid) ? (
              <a
                href={androidPlayStoreUrl}
                className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-5 py-3.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
                rel="noreferrer"
              >
                <Play className="h-5 w-5 fill-current" aria-hidden="true" />
                {copy.playStore}
              </a>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
