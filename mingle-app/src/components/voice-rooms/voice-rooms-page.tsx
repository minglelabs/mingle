"use client";

import { TAB_BANNER_TOP_BAR_HEIGHT_PX, useTabNativeBanner } from "@/lib/use-tab-native-banner";
import { Gamepad2, Headphones, Loader2, Plus, UserRound } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BottomTabBar from "@/components/bottom-tab-bar";
import OpenRooms from "@/components/search/open-rooms";
import LiveBars from "@/components/live-bars";
import type { AppDictionary, AppLocale } from "@/i18n";
import { fillVoiceRoomsCount, voiceRoomsCopy } from "@/i18n/voice-rooms-copy";
import { buildClientApiPath } from "@/lib/api-contract";
import { replaceWithConversationListThenPush } from "@/lib/direct-conversation-navigation";
import { markVoiceRoomEntry } from "@/lib/voice-room-entry";
import { parseOpenRooms, type OpenRoomCard } from "@/lib/open-room";
import { buildNativeAwareTabPath } from "@/lib/tab-navigation";

const REFRESH_MS = 20_000;
const LOUNGE_FACES = 5;

function parseLounge(body: unknown): OpenRoomCard | null {
  const lounge = (body as { lounge?: unknown } | null)?.lounge;
  return lounge ? parseOpenRooms({ rooms: [lounge] })[0] ?? null : null;
}

type VoiceRoomsPageProps = {
  dictionary: AppDictionary;
  locale: AppLocale;
};

/**
 * The voice tab (owner, 2026-11-23): while few people are online, one lounge
 * that is always open is the screen's main thing, so the tab never looks empty.
 * Open rooms with a live voice talk or game are listed under it, and only while
 * there are some. Entering joins the room (an ordinary open room) and opens it.
 */
export default function VoiceRoomsPage({ dictionary, locale }: VoiceRoomsPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status: sessionStatus } = useSession();
  const copy = useMemo(() => voiceRoomsCopy(locale), [locale]);
  const [lounge, setLounge] = useState<OpenRoomCard | null>(null);
  const [failed, setFailed] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState(false);
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const response = await fetch(buildClientApiPath("/conversations/voice-lounge"), { cache: "no-store" });
      if (!response.ok) throw new Error("voice_lounge_failed");
      const next = parseLounge(await response.json());
      if (!aliveRef.current) return;
      setLounge(next);
      setFailed(next === null);
    } catch {
      if (aliveRef.current) setFailed(true);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    if (sessionStatus !== "authenticated") return;
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => {
      aliveRef.current = false;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load, sessionStatus]);

  useEffect(() => {
    if (!joinError) return;
    const timer = window.setTimeout(() => setJoinError(false), 3500);
    return () => window.clearTimeout(timer);
  }, [joinError]);

  const openRoom = useCallback((conversationId: string) => {
    // A voice room is always in a voice talk: the room joins its call as it opens.
    markVoiceRoomEntry(conversationId);
    const listHref = buildNativeAwareTabPath(`/${locale}/conversations`, searchParams, { skipConversationRestore: true, tabRoot: true });
    void replaceWithConversationListThenPush(router, listHref, conversationId);
  }, [locale, router, searchParams]);

  const enterLounge = useCallback(async () => {
    if (!lounge || joining) return;
    if (lounge.isMember) {
      openRoom(lounge.id);
      return;
    }
    setJoining(true);
    try {
      const response = await fetch(buildClientApiPath(`/conversations/${encodeURIComponent(lounge.id)}/public-join`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("lounge_join_failed");
      openRoom(lounge.id);
    } catch {
      if (aliveRef.current) setJoinError(true);
    } finally {
      if (aliveRef.current) setJoining(false);
    }
  }, [joining, lounge, openRoom]);

  const excludeIds = useMemo(() => (lounge ? [lounge.id] : []), [lounge]);
  const bannerHeightPx = useTabNativeBanner(sessionStatus === "authenticated");
  const [createSignal, setCreateSignal] = useState(0);

  return (
    <main className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-white" data-qa="voice-tab">
      {/* The top bar is exactly as tall as the app expects, so its ad banner sits right under it. */}
      <header className="relative z-10 shrink-0 bg-white shadow-[inset_0_-1px_0_#e5e7eb]" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="flex items-center px-4" style={{ height: TAB_BANNER_TOP_BAR_HEIGHT_PX }}>
          <h1 className="min-w-0 flex-1 truncate text-[22px] font-extrabold tracking-[-0.02em] text-slate-950">{copy.title}</h1>
          {/* Make a voice room: an icon in the top bar, like the feed's write button (owner, 2026-11-25). */}
          {sessionStatus === "authenticated" ? (
            <button
              type="button"
              data-qa="voice-room-create"
              onClick={() => setCreateSignal((value) => value + 1)}
              aria-label={copy.createRoom}
              title={copy.createRoom}
              className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-950 transition active:bg-black/5"
            >
              <Plus size={24} strokeWidth={2.2} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </header>
      {/* The ad banner (drawn by the app) is pinned here; the lounge card and the rooms scroll below it. */}
      <div
        data-qa="tab-banner-slot"
        aria-hidden="true"
        className={`shrink-0 bg-white ${bannerHeightPx > 0 ? "border-b border-gray-200" : ""}`}
        style={{ height: bannerHeightPx }}
      />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {sessionStatus === "unauthenticated" ? (
          <div className="flex flex-col items-center px-6 pt-20 text-center">
            <p className="text-[15px] leading-relaxed text-slate-700">{copy.signInPrompt}</p>
            <button
              type="button"
              onClick={() => router.replace(`/${locale}/conversations`)}
              className="mt-5 flex h-12 items-center justify-center rounded-2xl bg-slate-950 px-8 text-[15px] font-bold text-white transition active:scale-[0.985]"
            >
              {copy.signIn}
            </button>
          </div>
        ) : (
          <>
            <section className="px-4 pb-5 pt-4" aria-label={copy.loungeName}>
              <LoungeCard
                lounge={lounge}
                failed={failed && !lounge}
                joining={joining}
                copy={copy}
                onEnter={() => void enterLounge()}
                onRetry={() => {
                  setFailed(false);
                  void load();
                }}
              />
              {joinError ? <p className="pt-2 text-[13px] text-red-500" role="alert">{copy.joinFailed}</p> : null}
            </section>
            {sessionStatus === "authenticated" ? (
              // The voice rooms people made (the lounge is the card above), and the button to make one.
              <OpenRooms
                locale={locale}
                excludeIds={excludeIds}
                voiceRooms={{ createTitle: copy.createRoomTitle, heading: copy.roomsHeading, createSignal }}
                onOpenRoom={openRoom}
              />
            ) : null}
          </>
        )}
      </div>
      <BottomTabBar activeRoute="voice" dictionary={dictionary} locale={locale} />
    </main>
  );
}

function LoungeCard({
  lounge,
  failed,
  joining,
  copy,
  onEnter,
  onRetry,
}: {
  lounge: OpenRoomCard | null;
  failed: boolean;
  joining: boolean;
  copy: ReturnType<typeof voiceRoomsCopy>;
  onEnter: () => void;
  onRetry: () => void;
}) {
  const faces = lounge?.members.slice(0, LOUNGE_FACES) ?? [];
  const inCall = lounge?.voiceCallParticipantCount ?? 0;
  return (
    <div
      data-qa="voice-lounge-card"
      className="overflow-hidden rounded-[1.6rem] px-5 pb-5 pt-5 text-slate-950 shadow-[0_16px_36px_rgba(245,158,11,0.22)]"
      style={{ backgroundImage: "linear-gradient(150deg, #FBBC32 0%, #F97316 100%)" }}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/35">
          <Headphones size={21} strokeWidth={2.4} aria-hidden="true" />
        </span>
        <h2 className="text-[1.35rem] font-extrabold tracking-[-0.02em]">{copy.loungeName}</h2>
        {lounge && lounge.hashRushActive ? (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-[12px] font-bold">
            <Gamepad2 size={13} aria-hidden="true" />
            {copy.statusGame}
          </span>
        ) : inCall > 0 ? (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-[12px] font-bold text-emerald-700" data-qa="voice-lounge-in-call">
            {/* A talk is on: small level bars instead of a dot (owner, 2026-11-25). */}
            <LiveBars size={12} className="text-emerald-500" />
            {fillVoiceRoomsCount(copy.inCall, inCall)}
          </span>
        ) : null}
      </div>
      <p className="mt-2.5 text-[14.5px] font-medium leading-snug text-slate-900/85">{copy.loungeDescription}</p>
      <div className="mt-4 flex min-h-[34px] items-center gap-2">
        {faces.length > 0 ? (
          <span className={`relative flex -space-x-2 ${inCall > 0 ? "mingle-live-glow rounded-full" : ""}`}>
            {faces.map((person) => (
              <span
                key={person.userId}
                className={`flex h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-full bg-white/70 ring-2 ${inCall > 0 ? "ring-white" : "ring-[#F9A825]"}`}
                aria-hidden="true"
              >
                {person.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={person.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <UserRound size={18} className="text-slate-500" />
                )}
              </span>
            ))}
          </span>
        ) : null}
        <span className="text-[13.5px] font-semibold text-slate-900/80">
          {lounge
            ? lounge.memberCount > 0 ? fillVoiceRoomsCount(copy.peopleHere, lounge.memberCount) : copy.nobodyYet
            : null}
        </span>
      </div>
      {failed ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 flex h-12 w-full items-center justify-center rounded-full bg-white/85 text-[15px] font-bold text-slate-800 active:bg-white"
        >
          {copy.loadError} · {copy.retry}
        </button>
      ) : (
        <button
          type="button"
          data-qa="voice-lounge-enter"
          onClick={onEnter}
          disabled={!lounge || joining}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-slate-950 text-[16px] font-bold text-white transition active:scale-[0.99] disabled:opacity-70"
        >
          {!lounge || joining ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : null}
          {copy.enter}
        </button>
      )}
    </div>
  );
}
