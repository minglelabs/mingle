"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MingleHome, { type MingleHomeRef } from "@/components/mingle-home";
import SpeechLengthCard from "@/components/LivePhoneDemo/SpeechLengthCard";
import type { AppDictionary, AppLocale } from "@/i18n";
import { resolveFirstRunCopy } from "@/i18n/first-run-copy";
import { resolveSpeakTrialCopy } from "@/i18n/speak-trial-copy";
import { captureMingleClientEvent } from "@/lib/posthog-client";
import {
  SPEAK_TRIAL_SECONDS,
  markSpeakTrialDone,
  savePendingSpeechLength,
  speakTrialRingColor,
  speakTrialSecondsLeft,
} from "@/lib/speak-trial";
import { DEFAULT_SPEECH_LENGTH_LEVEL, type SpeechLengthLevel } from "@/lib/speech-length";

type Phase = "ready" | "listening" | "ending" | "asking";

// After the mic stops, the last sentence still needs its translation.
const SETTLE_MS = 1800;
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

  const handleRunningChange = useCallback((running: boolean) => {
    if (running && phaseRef.current === "ready") {
      phaseRef.current = "listening";
      setPhase("listening");
      setStartedAt(Date.now());
      setNow(Date.now());
      return;
    }
    if (!running) endListening("stopped");
  }, [endListening]);

  useEffect(() => {
    if (phase !== "listening") return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (speakTrialSecondsLeft(startedAt, current) <= 0) endListening("time_up");
    }, 100);
    return () => window.clearInterval(timer);
  }, [endListening, phase, startedAt]);

  useEffect(() => {
    if (phase !== "ending") return;
    const timer = window.setTimeout(() => setPhase("asking"), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

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
        trial={{ speechLength: DEFAULT_SPEECH_LENGTH_LEVEL, headerAccessory }}
        onSttSessionRunningChange={handleRunningChange}
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
            <div className="flex flex-col items-center gap-2">
              <p data-qa="speak-trial-hint" className="max-w-[360px] rounded-2xl bg-slate-950/85 px-4 py-2.5 text-center text-[0.92rem] font-semibold leading-snug text-white shadow-lg">
                {copy.hint}
              </p>
              {phase === "ready" ? (
                <button
                  type="button"
                  data-qa="speak-trial-have-account"
                  onClick={skip}
                  className="pointer-events-auto rounded-full bg-white/90 px-3 py-1.5 text-[0.8rem] font-semibold text-slate-600 shadow ring-1 ring-slate-900/5"
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
