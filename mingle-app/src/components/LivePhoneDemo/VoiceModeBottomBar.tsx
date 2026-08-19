"use client";

import { Keyboard, Loader2, Mic } from "lucide-react";
import {
  formatLivePhoneDemoMessageCount,
  formatLivePhoneDemoUsageDuration,
} from "./live-phone-demo.usage-format";

// Mirrors the interpreter room's own "default-bottom-bar" (LivePhoneDemo.tsx)
// pixel-for-pixel — same sizes, labels, and layout — so a DM room's voice
// input looks and behaves identically to the room the feature was copied
// from, not a lookalike built to taste.
const VOICE_MODE_STT_BUTTON_WIDTH_PX = 136;
const VOICE_MODE_STT_BUTTON_HEIGHT_PX = 45;
const VOICE_MODE_STT_ICON_SIZE_PX = 20;
const VOICE_MODE_STT_STOP_SIZE_PX = 14;
const VOICE_MODE_SIDE_BUTTON_SIZE_PX = 34;
const VOICE_MODE_STT_BUTTON_RADIUS_PX = 20;
const VOICE_MODE_START_LABEL = "Start";
const VOICE_MODE_STOP_LABEL = "Stop";

export default function VoiceModeBottomBar({
  isRecording,
  isBusy = false,
  elapsedSeconds,
  messageCount,
  onMicClick,
  onToggleKeyboard,
  keyboardLabel,
}: {
  isRecording: boolean;
  isBusy?: boolean;
  elapsedSeconds: number;
  messageCount: number;
  onMicClick: () => void;
  onToggleKeyboard: () => void;
  keyboardLabel: string;
}) {
  return (
    <div className="grid items-end" style={{ gridTemplateColumns: "1fr auto 1fr" }}>
      <div className="self-end justify-self-start pl-2">
        <div className="flex h-[33px] flex-col items-start justify-end gap-0">
          <span className="text-sm leading-4 tabular-nums text-gray-400">
            {formatLivePhoneDemoUsageDuration(elapsedSeconds)}
          </span>
          <span className="text-sm leading-4 tabular-nums text-gray-400">
            {formatLivePhoneDemoMessageCount(messageCount)}
          </span>
        </div>
      </div>

      <div className="flex self-end justify-center">
        <button
          type="button"
          onClick={onMicClick}
          disabled={isBusy}
          aria-label={isRecording ? VOICE_MODE_STOP_LABEL : VOICE_MODE_START_LABEL}
          className="relative flex items-center justify-center px-[18px] transition-all duration-200 active:scale-95 disabled:opacity-50"
          style={{
            width: `${VOICE_MODE_STT_BUTTON_WIDTH_PX}px`,
            height: `${VOICE_MODE_STT_BUTTON_HEIGHT_PX}px`,
            borderRadius: `${VOICE_MODE_STT_BUTTON_RADIUS_PX}px`,
          }}
        >
          {isRecording && (
            <span
              className="absolute inset-0 bg-red-500 opacity-20 animate-ping"
              style={{ borderRadius: `${VOICE_MODE_STT_BUTTON_RADIUS_PX}px` }}
            />
          )}

          <span
            className={`relative flex h-full w-full items-center justify-center gap-3 px-[18px] shadow-lg ${
              isRecording
                ? "bg-red-500"
                : isBusy
                  ? "bg-gray-300"
                  : "bg-gradient-to-br from-amber-400 to-orange-500"
            }`}
            style={{ borderRadius: `${VOICE_MODE_STT_BUTTON_RADIUS_PX}px` }}
          >
            {isBusy ? (
              <Loader2 size={VOICE_MODE_STT_ICON_SIZE_PX} className="shrink-0 animate-spin text-white" />
            ) : isRecording ? (
              <span
                aria-hidden
                className="shrink-0 rounded-[4px] bg-white"
                style={{
                  width: `${VOICE_MODE_STT_STOP_SIZE_PX}px`,
                  height: `${VOICE_MODE_STT_STOP_SIZE_PX}px`,
                }}
              />
            ) : (
              <Mic size={VOICE_MODE_STT_ICON_SIZE_PX} className="shrink-0 text-white" />
            )}
            <span className="text-[0.98rem] font-semibold tracking-[0.01em] text-white">
              {isRecording ? VOICE_MODE_STOP_LABEL : VOICE_MODE_START_LABEL}
            </span>
          </span>
        </button>
      </div>

      <div className="self-end justify-self-end">
        <button
          type="button"
          onClick={onToggleKeyboard}
          aria-label={keyboardLabel}
          className="inline-flex items-center justify-center text-gray-500 transition-all duration-200 hover:text-gray-700 active:scale-95"
          style={{
            width: `${VOICE_MODE_SIDE_BUTTON_SIZE_PX}px`,
            height: `${VOICE_MODE_SIDE_BUTTON_SIZE_PX}px`,
          }}
        >
          <Keyboard size={18} strokeWidth={2.15} />
        </button>
      </div>
    </div>
  );
}
