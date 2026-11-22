"use client";

// Reads a feed post aloud in the language the reader picked with the flags.
// One clip at a time across the whole feed: starting a post stops the last.
//
// In the app the clip goes to the shell (`native_tts_play`), which plays it on
// the loudspeaker, or on the earphones while they are connected. Elsewhere an
// <audio> element plays it through the device's media output.

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { buildClientApiPath } from "@/lib/api-contract";
import { applyCoinBalanceFromHeaders, notifyCoinsExhausted } from "@/lib/coin-wallet-client";
import { readCachedNativeShellCapabilities, shouldPlayTtsViaNativeShell } from "@/lib/native-device-audio";
import { getOrCreateTrackingUserId } from "@/components/LivePhoneDemo/realtime-storage";

const NATIVE_TTS_EVENT = "mingle:native-tts";
const PLAYBACK_ID_PREFIX = "feed-read-";

export type ReadAloudStatus = "idle" | "loading" | "playing";

export type ReadAloudState = {
  /** `${postId}:${language}` of the clip in flight; null when nothing plays. */
  key: string | null;
  status: ReadAloudStatus;
};

type NativeBridgeWindow = Window & {
  ReactNativeWebView?: { postMessage: (message: string) => void };
};

const IDLE: ReadAloudState = { key: null, status: "idle" };
let state: ReadAloudState = IDLE;
const listeners = new Set<() => void>();
let sequence = 0;
let abort: AbortController | null = null;
let audio: HTMLAudioElement | null = null;
let audioUrl: string | null = null;
let nativePlaybackId: string | null = null;
let nativeListenerAttached = false;

function setState(next: ReadAloudState) {
  state = next;
  for (const listener of listeners) listener();
}

function bridge(): NativeBridgeWindow["ReactNativeWebView"] | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as NativeBridgeWindow).ReactNativeWebView;
  return typeof candidate?.postMessage === "function" ? candidate : null;
}

function playsNatively(): boolean {
  if (typeof navigator === "undefined") return false;
  return shouldPlayTtsViaNativeShell({
    isNativeApp: bridge() !== null,
    isIOS: /iPhone|iPad|iPod/i.test(navigator.userAgent),
    capabilities: readCachedNativeShellCapabilities(),
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.byteLength; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function releaseAudio() {
  if (audio) {
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  if (audioUrl) {
    URL.revokeObjectURL(audioUrl);
    audioUrl = null;
  }
}

function attachNativeListener() {
  if (nativeListenerAttached || typeof window === "undefined") return;
  nativeListenerAttached = true;
  window.addEventListener(NATIVE_TTS_EVENT, (event) => {
    const detail = (event as CustomEvent<unknown>).detail as { type?: unknown; playbackId?: unknown } | null;
    if (!detail || typeof detail.playbackId !== "string" || detail.playbackId !== nativePlaybackId) return;
    if (detail.type === "tts_started") {
      if (state.status === "loading") setState({ ...state, status: "playing" });
      return;
    }
    if (detail.type === "tts_ended" || detail.type === "tts_error" || detail.type === "tts_stopped") {
      nativePlaybackId = null;
      setState(IDLE);
    }
  });
}

export function stopReadAloud() {
  sequence += 1;
  abort?.abort();
  abort = null;
  releaseAudio();
  if (nativePlaybackId) {
    nativePlaybackId = null;
    try {
      bridge()?.postMessage(JSON.stringify({ type: "native_tts_stop", payload: { reason: "feed_read_aloud_stop" } }));
    } catch {
      // The shell is gone; nothing is playing there either.
    }
  }
  if (state !== IDLE) setState(IDLE);
}

// "coins": out of coins, and the coin sheet already told the reader.
async function synthesize(text: string, language: string, signal: AbortSignal): Promise<Blob | "coins" | null> {
  const res = await fetch(buildClientApiPath("/tts/inworld"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mingle-user-id": getOrCreateTrackingUserId(),
    },
    body: JSON.stringify({ text, language }),
    signal,
  });
  if (res.status === 402) {
    notifyCoinsExhausted({ userInitiated: true });
    return "coins";
  }
  if (!res.ok) return null;
  applyCoinBalanceFromHeaders(res.headers);
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength === 0) return null;
  return new Blob([buffer], { type: res.headers.get("content-type") || "audio/mpeg" });
}

/** Starts reading `text` aloud; resolves false when no audio could be played. */
export async function startReadAloud(key: string, text: string, language: string): Promise<boolean> {
  stopReadAloud();
  const trimmed = text.trim();
  if (!trimmed || !language) return false;
  const mySequence = sequence;
  const controller = new AbortController();
  abort = controller;
  setState({ key, status: "loading" });
  const isCurrent = () => mySequence === sequence;

  try {
    const blob = await synthesize(trimmed, language, controller.signal);
    if (!isCurrent()) return true;
    if (!blob || blob === "coins") {
      setState(IDLE);
      return blob === "coins";
    }

    if (playsNatively()) {
      attachNativeListener();
      const playbackId = `${PLAYBACK_ID_PREFIX}${Date.now()}-${mySequence}`;
      const audioBase64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
      if (!isCurrent()) return true;
      nativePlaybackId = playbackId;
      bridge()!.postMessage(JSON.stringify({
        type: "native_tts_play",
        payload: { playbackId, utteranceId: playbackId, audioBase64, contentType: blob.type },
      }));
      return true;
    }

    if (!audio) {
      audio = new Audio();
      audio.preload = "auto";
      (audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    }
    const player = audio;
    audioUrl = URL.createObjectURL(blob);
    player.src = audioUrl;
    const finish = () => {
      if (!isCurrent()) return;
      releaseAudio();
      setState(IDLE);
    };
    player.onended = finish;
    player.onerror = finish;
    await player.play();
    if (isCurrent()) setState({ key, status: "playing" });
    return true;
  } catch {
    if (!isCurrent()) return true;
    releaseAudio();
    setState(IDLE);
    return false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;
const getServerSnapshot = () => IDLE;

/**
 * The read-aloud state for one post. `status` is that post's own: another
 * post playing reads as idle here.
 */
export function usePostReadAloud(postId: string, active: boolean) {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const mine = current.key !== null && current.key.startsWith(`${postId}:`);
  const status: ReadAloudStatus = mine ? current.status : "idle";

  // Swiping to another post stops this one.
  useEffect(() => {
    if (!active && mine) stopReadAloud();
  }, [active, mine]);
  useEffect(
    () => () => {
      if (state.key?.startsWith(`${postId}:`)) stopReadAloud();
    },
    [postId],
  );

  const toggle = useCallback(
    (text: string, language: string) => {
      if (mine) {
        stopReadAloud();
        return Promise.resolve(true);
      }
      return startReadAloud(`${postId}:${language}`, text, language);
    },
    [mine, postId],
  );

  return { status, playingLanguage: mine ? current.key!.slice(postId.length + 1) : null, toggle };
}
