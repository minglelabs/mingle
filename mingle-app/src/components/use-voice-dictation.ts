"use client";

import { getWsUrl } from "@/components/LivePhoneDemo/use-realtime-stt";
import {
  claimNativeSttOwner,
  isNativeSttOwner,
  releaseNativeSttOwner,
} from "@/lib/native-stt-owner";
import {
  composeDictationDraft,
  parseDictationTranscript,
} from "@/lib/voice-dictation.logic";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

const NATIVE_STT_EVENT = "mingle:native-stt";
const NATIVE_STT_QUERY_KEY = "nativeStt";

export type VoiceDictationState = {
  isSupported: boolean;
  isRecording: boolean;
  /** Detected language of the most recent finalized turn, canonicalized. */
  language: string;
  error: string | null;
  /** `currentDraft` is kept and dictated words are appended after it. */
  start: (currentDraft: string) => void;
  /** Ends the turn, keeping whatever has been transcribed so far. */
  stop: () => void;
  /**
   * Ends the turn and stops feeding the composer. Safe to call when idle — use
   * it whenever the draft stops belonging to the recognizer (sent, or typed
   * over), so a late transcript cannot write into it afterwards.
   */
  cancel: () => void;
};

function isNativeBridgeAvailable(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.ReactNativeWebView?.postMessage !== "function") return false;
  try {
    const value = (new URLSearchParams(window.location.search || "")
      .get(NATIVE_STT_QUERY_KEY) || "").trim().toLowerCase();
    return value !== "0" && value !== "false" && value !== "off";
  } catch {
    return true;
  }
}

/** Bridge availability is fixed for the lifetime of the page. */
function subscribeToNothing(): () => void {
  return () => {};
}

function postNativeCommand(command: object): boolean {
  const bridge = typeof window !== "undefined" ? window.ReactNativeWebView : undefined;
  if (typeof bridge?.postMessage !== "function") return false;
  bridge.postMessage(JSON.stringify(command));
  return true;
}

/**
 * Speaking into a message composer. The mic runs through the same native
 * bridge and relay the interpreter room uses, but only the transcript matters
 * here — what gets sent is text, which the server then translates like any
 * typed message.
 *
 * `onDraftChange` is called with the full composed draft on every partial, so
 * the user watches their words land and can still edit before sending.
 */
export default function useVoiceDictation(args: {
  conversationId: string;
  onDraftChange: (draft: string) => void;
}): VoiceDictationState {
  const { conversationId, onDraftChange } = args;

  const [isRecording, setIsRecording] = useState(false);
  const [language, setLanguage] = useState("");
  const [error, setError] = useState<string | null>(null);

  // The draft text as it stood when recording began; dictation appends to it
  // rather than replacing whatever the user had already typed.
  const baseTextRef = useRef("");
  const finalizedTurnsRef = useRef<string[]>([]);
  const partialTurnRef = useRef("");

  const ownerKey = `dm-dictation-${useId()}`;

  // The bridge only exists inside the native shell, so this differs between
  // the server render and the client — read it as external state rather than
  // guessing during render and tripping hydration.
  const isSupported = useSyncExternalStore(
    subscribeToNothing,
    isNativeBridgeAvailable,
    () => false,
  );

  const emitDraft = useCallback(() => {
    onDraftChange(composeDictationDraft({
      baseText: baseTextRef.current,
      finalizedTurns: finalizedTurnsRef.current,
      partialTurn: partialTurnRef.current,
    }));
  }, [onDraftChange]);

  const stop = useCallback(() => {
    // Cleared unconditionally: if ownership was lost (another screen claimed
    // the mic, or the bridge died), the button must not stay stuck on "stop".
    setIsRecording(false);
    if (!isNativeSttOwner(ownerKey)) return;
    postNativeCommand({
      type: "native_stt_stop",
      payload: { pendingText: partialTurnRef.current, pendingLanguage: language || "unknown" },
    });
  }, [language, ownerKey]);

  const cancel = useCallback(() => {
    // Dropping ownership is what actually stops the composer being written to:
    // the bridge listener ignores every event once this key is no longer the
    // owner, including a final transcript still in flight.
    const wasOwner = isNativeSttOwner(ownerKey);
    releaseNativeSttOwner(ownerKey);
    setIsRecording(false);
    baseTextRef.current = "";
    finalizedTurnsRef.current = [];
    partialTurnRef.current = "";
    if (wasOwner) {
      postNativeCommand({
        type: "native_stt_stop",
        payload: { pendingText: "", pendingLanguage: "unknown" },
      });
    }
  }, [ownerKey]);

  const start = useCallback((currentDraft: string) => {
    if (!isNativeBridgeAvailable()) {
      setError("unsupported");
      return;
    }

    baseTextRef.current = currentDraft;
    finalizedTurnsRef.current = [];
    partialTurnRef.current = "";
    setError(null);

    claimNativeSttOwner(ownerKey);
    const posted = postNativeCommand({
      type: "native_stt_start",
      payload: {
        conversationId,
        wsUrl: getWsUrl(),
        sttModel: "soniox",
        aecEnabled: false,
      },
    });

    if (!posted) {
      releaseNativeSttOwner(ownerKey);
      setError("bridge_unavailable");
      return;
    }
    setIsRecording(true);
  }, [conversationId, ownerKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleBridgeEvent = (event: Event) => {
      // The bridge broadcasts to every listener; only the current mic owner
      // may act on it, or an open interpreter room would steal the transcript.
      if (!isNativeSttOwner(ownerKey)) return;

      const detail = (event as CustomEvent).detail as Record<string, unknown> | undefined;
      if (!detail || typeof detail.type !== "string") return;

      if (detail.type === "error") {
        setError(typeof detail.message === "string" ? detail.message : "stt_error");
        setIsRecording(false);
        releaseNativeSttOwner(ownerKey);
        return;
      }

      if (detail.type === "close") {
        setIsRecording(false);
        releaseNativeSttOwner(ownerKey);
        return;
      }

      if (detail.type !== "message" || typeof detail.raw !== "string") return;

      const transcript = parseDictationTranscript(detail.raw);
      if (!transcript) return;

      if (transcript.language) setLanguage(transcript.language);

      if (transcript.isFinal) {
        finalizedTurnsRef.current = [...finalizedTurnsRef.current, transcript.text];
        partialTurnRef.current = "";
      } else {
        partialTurnRef.current = transcript.text;
      }
      emitDraft();
    };

    window.addEventListener(NATIVE_STT_EVENT, handleBridgeEvent);
    return () => window.removeEventListener(NATIVE_STT_EVENT, handleBridgeEvent);
  }, [emitDraft, ownerKey]);

  useEffect(() => () => {
    if (!isNativeSttOwner(ownerKey)) return;
    postNativeCommand({ type: "native_stt_stop", payload: { pendingText: "", pendingLanguage: "unknown" } });
    releaseNativeSttOwner(ownerKey);
  }, [ownerKey]);

  return {
    isSupported,
    isRecording,
    language,
    error,
    start,
    stop,
    cancel,
  };
}
