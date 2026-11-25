"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DuoCallStage from "@/components/LivePhoneDemo/DuoCallStage";
import { isVoiceTalkAvailable } from "@/components/LivePhoneDemo/VoiceTalkPanel";
import { openPostCallScreen } from "@/components/feed/post-call-button";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/i18n";
import { resolvePostCallCopy } from "@/i18n/post-call-copy";
import { buildClientApiPath } from "@/lib/api-contract";
import { POST_CALL_LISTEN_EVENT, parsePostCallView, postCallSecondsLeft, type PostCallView } from "@/lib/post-call";
import { useNativeBannerSuppression } from "@/lib/use-native-banner-suppression";

/** While a call rings, it is read this often (it may be cancelled). */
const RINGING_POLL_MS = 1_500;
/** With a call post up, a call may come at any moment. */
const LISTENING_POLL_MS = 4_000;
/** Otherwise only to notice a call post made on another phone. */
const IDLE_POLL_MS = 60_000;
/** Right after writing a call post, before the server lists it. */
const EAGER_MS = 90_000;

/**
 * The incoming 1:1 voice talk, over whatever screen the author is on (owner,
 * 2026-11-25; src/server/post-calls.ts): the caller's face and name, 30
 * seconds, Answer or Decline. Answering opens the call screen.
 *
 * Only an account with a call post up asks the server often; everyone else
 * asks once a minute. Only in the app (the call needs its voice engine), and
 * only while the app is on screen: with the app closed, the ring is a push.
 */
export default function IncomingPostCallGate() {
  const { status, data } = useSession();
  const userId = (data?.user as { id?: string } | undefined)?.id ?? null;
  const pathname = usePathname();
  const router = useRouter();
  const pathLocale = pathname?.split("/")[1] ?? "";
  const locale = isSupportedLocale(pathLocale) ? pathLocale : DEFAULT_LOCALE;
  const copy = useMemo(() => resolvePostCallCopy(locale), [locale]);
  const [call, setCall] = useState<PostCallView | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // A call answered or declined here is not drawn again while the server catches up.
  const handledRef = useRef<string | null>(null);
  const eagerUntilRef = useRef(0);

  useEffect(() => {
    if (status !== "authenticated" || !userId || !isVoiceTalkAvailable()) return;
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
  }, [status, userId]);

  // The ring's countdown.
  const callId = call?.id ?? null;
  useEffect(() => {
    if (!callId) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [callId]);

  const secondsLeft = call ? postCallSecondsLeft(call.ringEndsAt, now) : 0;
  const shown = call !== null && secondsLeft > 0;
  // The app's ad banner draws above the page: none over the incoming call.
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
    setBusy(false);
    setCall(null);
    if (action === "accept" && response?.ok) openPostCallScreen(router, locale, call.conversationId);
  }, [busy, call, locale, router]);

  if (!shown || !call) return null;
  return (
    <div className="fixed inset-0 z-[140]" role="dialog" aria-modal="true" aria-label={copy.incoming} data-qa="incoming-post-call">
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
