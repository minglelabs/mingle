"use client";

import { PhoneOff, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DuoCallStage from "@/components/LivePhoneDemo/DuoCallStage";
import { isVoiceTalkAvailable } from "@/components/LivePhoneDemo/VoiceTalkPanel";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/i18n";
import { resolvePostCallCopy } from "@/i18n/post-call-copy";
import { buildClientApiPath } from "@/lib/api-contract";
import { POST_CALL_LISTEN_EVENT, parsePostCallView, postCallSecondsLeft, type PostCallView } from "@/lib/post-call";
import { expandPostCall, openPostCall, useActivePostCall } from "@/lib/post-call-session";
import { useNativeBannerSuppression } from "@/lib/use-native-banner-suppression";
import { useViewerLanguages } from "@/lib/use-viewer-languages";
import PostCallScreen from "./post-call-screen";
import { usePostCallSession } from "./use-post-call-session";

/** While a call rings, it is read this often (it may be cancelled). */
const RINGING_POLL_MS = 1_500;
/** With a call post up, a call may come at any moment. */
const LISTENING_POLL_MS = 4_000;
/** Otherwise only to notice a call post made on another phone. */
const IDLE_POLL_MS = 60_000;
/** Right after writing a call post, before the server lists it. */
const EAGER_MS = 90_000;

/**
 * 1:1 voice talk from a post, above every tab (owner, 2026-11-26): the
 * incoming ring, the call screen and, folded, its bubble. Nothing here moves
 * between tabs or opens a room: the call screen opens over whatever is on
 * screen. Only in the app (the call needs its voice engine).
 */
export default function PostCallHost() {
  const { status, data } = useSession();
  const user = data?.user as { id?: string; image?: string | null; name?: string | null } | undefined;
  const userId = user?.id ?? null;
  const pathname = usePathname();
  const pathLocale = pathname?.split("/")[1] ?? "";
  const locale = isSupportedLocale(pathLocale) ? pathLocale : DEFAULT_LOCALE;
  const active = useActivePostCall();
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setAvailable(isVoiceTalkAvailable()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const enabled = status === "authenticated" && Boolean(userId) && available;

  return (
    <>
      {enabled && !active ? <IncomingRing locale={locale} /> : null}
      {enabled && active ? (
        <ActiveCall
          key={active.call.id}
          call={active.call}
          minimized={active.minimized}
          locale={locale}
          viewerId={userId}
          viewerImage={user?.image ?? null}
          viewerName={user?.name ?? null}
        />
      ) : null}
    </>
  );
}

function ActiveCall({ call, minimized, locale, viewerId, viewerImage, viewerName }: {
  call: PostCallView;
  minimized: boolean;
  locale: string;
  viewerId: string | null;
  viewerImage: string | null;
  viewerName: string | null;
}) {
  const languages = useViewerLanguages(viewerId);
  const myLanguage = (languages.comfortable[0] || locale || "en").split("-")[0].toLowerCase();
  const session = usePostCallSession({ initial: call, viewerId, myLanguage, expanded: !minimized });
  // The app's ad banner draws above the page: none over the call screen.
  useNativeBannerSuppression(!minimized);
  return (
    <>
      <PostCallScreen session={session} open={!minimized} locale={locale} viewerImage={viewerImage} viewerName={viewerName} />
      {minimized ? <PostCallBubble session={session} locale={locale} /> : null}
    </>
  );
}

/** The call folded: the other person's face (rippling while they speak), who, and hang up. Tap to open. */
function PostCallBubble({ session, locale }: { session: ReturnType<typeof usePostCallSession>; locale: string }) {
  const copy = useMemo(() => resolvePostCallCopy(locale), [locale]);
  const peer = session.call.peer;
  return (
    <div
      data-qa="post-call-bubble"
      className="fixed right-3 z-[140] w-[116px] overflow-hidden rounded-[22px] bg-slate-950 text-white shadow-[0_12px_30px_rgba(15,23,42,0.4)]"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 92px)" }}
    >
      <button
        type="button"
        data-qa="post-call-bubble-open"
        aria-label={peer.name || copy.category}
        onClick={expandPostCall}
        className="flex w-full flex-col items-center px-2 pb-2 pt-3 active:bg-white/5"
      >
        <span className="relative flex h-[68px] w-[68px] items-center justify-center">
          {session.peerSpeaking ? (
            <>
              <span aria-hidden="true" className="mingle-voice-ripple absolute inset-0 rounded-full bg-emerald-400/60" />
              <span aria-hidden="true" className="mingle-voice-ripple mingle-voice-ripple-late absolute inset-0 rounded-full bg-emerald-400/40" />
            </>
          ) : null}
          <span className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-white/15 ring-2 ${session.peerSpeaking ? "ring-emerald-400" : "ring-white/25"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {peer.image ? <img src={peer.image} alt="" className="h-full w-full object-cover" /> : <UserRound size={32} aria-hidden="true" />}
          </span>
        </span>
        <span className="mt-1.5 w-full truncate text-center text-[11.5px] font-semibold text-white/90">
          {session.status === "ringing" ? `${copy.waiting} · ${session.secondsLeft}` : peer.name}
        </span>
      </button>
      <button
        type="button"
        data-qa="post-call-bubble-hang-up"
        onClick={session.hangUp}
        className="flex h-10 w-full items-center justify-center gap-1 bg-rose-500 text-[13px] font-bold text-white active:bg-rose-600"
      >
        <PhoneOff size={14} strokeWidth={2.6} aria-hidden="true" />
        {session.status === "ringing" && session.call.role === "caller" ? copy.cancel : copy.hangUp}
      </button>
    </div>
  );
}

/**
 * The incoming ring, over whatever screen the author is on: the caller's
 * face and name, 30 seconds, Answer or Decline. Answering opens the call
 * screen right there. Only an account with a call post up asks the server
 * often; everyone else asks once a minute. With the app closed, the ring is
 * a push, and opening the app shows this.
 */
function IncomingRing({ locale }: { locale: string }) {
  const copy = useMemo(() => resolvePostCallCopy(locale), [locale]);
  const [call, setCall] = useState<PostCallView | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const handledRef = useRef<string | null>(null);
  const eagerUntilRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    const schedule = (ms: number) => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => { void read(); }, ms);
    };
    const read = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") {
        schedule(IDLE_POLL_MS);
        return;
      }
      const body = await fetch(buildClientApiPath("/post-calls"), { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null) as { listening?: unknown; call?: unknown } | null;
      if (cancelled) return;
      const next = body ? parsePostCallView(body.call) : null;
      setCall(next && next.id !== handledRef.current ? next : null);
      const listening = body?.listening === true || Date.now() < eagerUntilRef.current;
      schedule(next ? RINGING_POLL_MS : listening ? LISTENING_POLL_MS : IDLE_POLL_MS);
    };
    const readNow = () => { void read(); };
    const onListen = () => {
      eagerUntilRef.current = Date.now() + EAGER_MS;
      readNow();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") readNow();
    };
    readNow();
    window.addEventListener(POST_CALL_LISTEN_EVENT, onListen);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener(POST_CALL_LISTEN_EVENT, onListen);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const callId = call?.id ?? null;
  useEffect(() => {
    if (!callId) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [callId]);

  const secondsLeft = call ? postCallSecondsLeft(call.ringEndsAt, now) : 0;
  const shown = call !== null && secondsLeft > 0;
  useNativeBannerSuppression(shown);

  const act = useCallback(async (action: "accept" | "hangup") => {
    if (!call || busy) return;
    setBusy(true);
    handledRef.current = call.id;
    const response = await fetch(buildClientApiPath(`/post-calls/${encodeURIComponent(call.id)}`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    const body = response?.ok ? await response.json().catch(() => null) as { call?: unknown } | null : null;
    setBusy(false);
    setCall(null);
    const answered = body ? parsePostCallView(body.call) : null;
    // Answered: the call screen opens right here, already connecting.
    if (action === "accept" && answered) openPostCall(answered);
  }, [busy, call]);

  if (!shown || !call) return null;
  return (
    <div className="fixed inset-0 z-[140] bg-slate-900" role="dialog" aria-modal="true" aria-label={copy.incoming} data-qa="incoming-post-call">
      <DuoCallStage
        locale={locale}
        labels={{
          waiting: copy.waiting,
          incoming: copy.incoming,
          accept: copy.accept,
          decline: copy.decline,
          cancel: copy.cancel,
          hangUp: copy.hangUp,
          connecting: copy.connecting,
          translate: copy.translate,
          readAloud: copy.readAloud,
          mic: copy.mic,
          micMuted: "",
        }}
        peer={call.peer}
        phase="ringing_in"
        secondsLeft={secondsLeft}
        overText=""
        note={null}
        peerSpeaking={false}
        peerMicOn
        micOn
        interpretOn={false}
        listenOn={false}
        earphonesConnected={false}
        busy={busy}
        onAccept={() => void act("accept")}
        onHangUp={() => void act("hangup")}
        onToggleMic={() => undefined}
        onToggleInterpret={() => undefined}
        onToggleListen={() => undefined}
      />
    </div>
  );
}
