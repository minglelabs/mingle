"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MingleHome, { type MingleHomeRef } from "@/components/mingle-home";
import SpeechLengthCard from "@/components/LivePhoneDemo/SpeechLengthCard";
import type { AppDictionary, AppLocale } from "@/i18n";
import { resolveFirstRunCopy } from "@/i18n/first-run-copy";
import { resolveSpeakTrialCopy } from "@/i18n/speak-trial-copy";
import { pickSpeakTrialPhrase } from "@/i18n/speak-trial-phrases";
import { captureMingleClientEvent } from "@/lib/posthog-client";
import {
  SPEAK_TRIAL_SECONDS,
  markSpeakTrialDone,
  savePendingSpeechLength,
  speakTrialRingColor,
  speakTrialSecondsLeft,
} from "@/lib/speak-trial";
import { DEFAULT_SPEECH_LENGTH_LEVEL, type SpeechLengthLevel } from "@/lib/speech-length";
import { useNativeBannerSuppression } from "@/lib/use-native-banner-suppression";

type Phase = "ready" | "listening" | "ending" | "asking";

// After the mic stops, the last sentence still needs its translation.
const SETTLE_MS = 1800;
// A try in which nothing was heard starts over, this many times, before the
// length question comes anyway.
const MAX_SILENT_TRIES = 2;
const RING_SIZE = 36;
const RING_STROKE = 3.5;

/**
 * The countdown in the room header: the seconds left in the middle of a ring
 * that empties as time runs out, green turning amber and then red.
 */
function CountdownRing({ secondsLeft, active, label }: { secondsLeft: number; active: boolean; label: string }) {
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = secondsLeft / SPEAK_TRIAL_SECONDS;
  const color = active ? speakTrialRingColor(fraction) : "#cbd5e1";
  const shown = Math.ceil(secondsLeft);
  return (
    <span
      role="timer"
      aria-label={label.replace("{seconds}", String(shown))}
      data-qa="speak-trial-countdown"
      data-seconds={shown}
      className="relative mr-1 inline-flex shrink-0 items-center justify-center"
      style={{ width: RING_SIZE, height: RING_SIZE }}
    >
      <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90" aria-hidden>
        <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={RING_STROKE} />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      <span
        aria-hidden
        className="absolute inset-0 flex items-center justify-center text-[0.9rem] font-extrabold tabular-nums"
        style={{ color: active ? color : "#64748b" }}
      >
        {shown}
      </span>
    </span>
  );
}

/**
 * Before sign-in, a new device speaks for SPEAK_TRIAL_SECONDS in a room with
 * no menu and no back button (only the countdown in the header). When time
 * is up (or the user stops), it asks how it was and lets them pick the
 * sentence length, the recommended one already chosen; then `onDone` moves
 * on to sign-in. The pick is kept for the account (@/lib/speak-trial).
 */
export default function SpeakTrial({
  dictionary,
  locale,
  appleOAuthEnabled,
  googleOAuthEnabled,
  onDone,
}: {
  dictionary: AppDictionary;
  locale: AppLocale;
  appleOAuthEnabled: boolean;
  googleOAuthEnabled: boolean;
  onDone: () => void;
}) {
  const roomRef = useRef<MingleHomeRef | null>(null);
  const copy = useMemo(() => resolveSpeakTrialCopy(locale), [locale]);
  const firstRunCopy = useMemo(() => resolveFirstRunCopy(locale), [locale]);
  const cardCopy = useMemo(() => ({
    ...firstRunCopy,
    lengthTitle: copy.howTitle,
    lengthHint: copy.howHint,
    lengthApply: copy.continue,
  }), [copy, firstRunCopy]);
  const [phase, setPhase] = useState<Phase>("ready");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Moved together with `phase` in the callbacks below, so they read it without re-binding.
  const phaseRef = useRef<Phase>("ready");
  // Finished messages in the room, and how many tries heard nothing.
  const messageCountRef = useRef(0);
  const [silentTries, setSilentTries] = useState(0);
  // A line to read aloud, picked once per trial in the person's own language.
  const [phrase] = useState(() => pickSpeakTrialPhrase(locale));
  // The hint card covers the top of the chat: the first bubble starts below it.
  const hintVisible = phase === "ready" || phase === "listening";
  const hintCardRef = useRef<HTMLDivElement | null>(null);
  const [hintCardHeight, setHintCardHeight] = useState(0);
  useEffect(() => {
    const node = hintCardRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHintCardHeight(Math.ceil(node.getBoundingClientRect().height)));
    observer.observe(node);
    return () => observer.disconnect();
  }, [hintVisible]);
  // No ads in the first minute: the native banner would also cover the card.
  useNativeBannerSuppression(true);

  useEffect(() => {
    captureMingleClientEvent("mingle_first_run_step", { step: "speak_trial_shown" });
  }, []);

  const endListening = useCallback((reason: "time_up" | "stopped") => {
    if (phaseRef.current !== "listening") return;
    phaseRef.current = "ending";
    setPhase("ending");
    captureMingleClientEvent("mingle_first_run_step", { step: "speak_trial_ended", reason });
    if (reason === "time_up") void roomRef.current?.stopRecording();
  }, []);

  // The mic permission and the connection take a few seconds: the ten seconds
  // start only once the room is really listening (Stop turns red), or at the
  // first words if those come first.
  const startedAtRef = useRef<number | null>(null);
  const startCountdown = useCallback(() => {
    if (phaseRef.current !== "listening" || startedAtRef.current !== null) return;
    const current = Date.now();
    startedAtRef.current = current;
    setStartedAt(current);
    setNow(current);
  }, []);

  const handleRunningChange = useCallback((running: boolean) => {
    if (running && phaseRef.current === "ready") {
      phaseRef.current = "listening";
      startedAtRef.current = null;
      setPhase("listening");
      setStartedAt(null);
      return;
    }
    if (!running) endListening("stopped");
  }, [endListening]);

  const handleListeningChange = useCallback((listening: boolean) => {
    if (listening) startCountdown();
  }, [startCountdown]);

  useEffect(() => {
    if (phase !== "listening" || startedAt === null) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (speakTrialSecondsLeft(startedAt, current) <= 0) endListening("time_up");
    }, 100);
    return () => window.clearInterval(timer);
  }, [endListening, phase, startedAt]);

  useEffect(() => {
    if (phase !== "ending") return;
    const timer = window.setTimeout(() => {
      if (messageCountRef.current === 0 && silentTries + 1 < MAX_SILENT_TRIES) {
        captureMingleClientEvent("mingle_first_run_step", { step: "speak_trial_nothing_heard" });
        setSilentTries((count) => count + 1);
        startedAtRef.current = null;
        setStartedAt(null);
        phaseRef.current = "ready";
        setPhase("ready");
        return;
      }
      setPhase("asking");
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [phase, silentTries]);

  const finish = useCallback((level: SpeechLengthLevel, source: "apply" | "close") => {
    savePendingSpeechLength(level);
    markSpeakTrialDone();
    captureMingleClientEvent("mingle_first_run_step", { step: "speak_trial_length", level, source });
    onDone();
  }, [onDone]);

  // An existing account on a new device goes straight to sign-in.
  const skip = useCallback(() => {
    markSpeakTrialDone();
    captureMingleClientEvent("mingle_first_run_step", { step: "speak_trial_skipped" });
    onDone();
  }, [onDone]);

  const secondsLeft = phase === "ready" ? SPEAK_TRIAL_SECONDS : speakTrialSecondsLeft(startedAt, now);
  const headerAccessory = (
    <CountdownRing secondsLeft={secondsLeft} active={phase === "listening"} label={copy.secondsLeft} />
  );

  return (
    <div data-qa="speak-trial" className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      <MingleHome
        ref={roomRef}
        dictionary={dictionary}
        appleOAuthEnabled={appleOAuthEnabled}
        googleOAuthEnabled={googleOAuthEnabled}
        locale={locale}
        storageNamespace="speak-trial"
        sessionKeyOverride="speak-trial"
        trial={{
          speechLength: DEFAULT_SPEECH_LENGTH_LEVEL,
          headerAccessory,
          topInsetPx: phase === "ready" || phase === "listening" ? hintCardHeight + 24 : undefined,
          highlightStart: phase === "ready",
        }}
        onSttSessionRunningChange={handleRunningChange}
        onSttListeningChange={handleListeningChange}
        onConversationStatsChange={(stats) => {
          messageCountRef.current = stats.messageCount;
          if (stats.messageCount > 0) startCountdown();
        }}
      />

      <AnimatePresence>
        {phase === "ready" || phase === "listening" ? (
          <motion.div
            key="hint"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-x-0 z-30 flex justify-center px-4"
            style={{ top: "calc(54px + env(safe-area-inset-top, 0px) + 12px)" }}
          >
            <div ref={hintCardRef} className="w-full max-w-[380px] rounded-[1.4rem] bg-slate-950/90 px-5 pb-3.5 pt-4 text-center text-white shadow-[0_14px_32px_rgba(15,23,42,0.28)]">
              <p data-qa="speak-trial-hint" className="text-[1.05rem] font-bold leading-snug">
                {silentTries > 0 ? copy.retryHint : copy.hint}
              </p>
              <p data-qa="speak-trial-phrase" className="mt-2.5 rounded-2xl bg-white px-4 py-3 text-[1.3rem] font-extrabold leading-snug text-slate-950">
                “{phrase}”
              </p>
              {phase === "ready" ? (
                <button
                  type="button"
                  data-qa="speak-trial-have-account"
                  onClick={skip}
                  className="pointer-events-auto mt-2.5 rounded-full px-3 py-1.5 text-[0.85rem] font-semibold text-white/75 underline-offset-4 active:text-white"
                >
                  {copy.haveAccount}
                </button>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {phase === "asking" ? (
        <div
          className="absolute inset-x-0 bottom-0 z-50 flex items-end justify-center bg-slate-950/25 px-3"
          style={{
            top: "calc(54px + env(safe-area-inset-top, 0px))",
            paddingTop: 12,
            paddingBottom: "max(calc(env(safe-area-inset-bottom, 0px) + 12px), 16px)",
          }}
        >
          <SpeechLengthCard
            copy={cardCopy}
            selected={DEFAULT_SPEECH_LENGTH_LEVEL}
            onApply={(level) => finish(level, "apply")}
            onClose={() => finish(DEFAULT_SPEECH_LENGTH_LEVEL, "close")}
          />
        </div>
      ) : null}
    </div>
  );
}
