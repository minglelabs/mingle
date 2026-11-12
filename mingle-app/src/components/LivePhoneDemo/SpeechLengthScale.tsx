"use client";

import { motion } from "framer-motion";
import { useCallback, useId, useRef } from "react";
import type { FirstRunCopy } from "@/i18n/first-run-copy";
import { SPEECH_LENGTH_LEVELS, type SpeechLengthLevel } from "@/lib/speech-length";

/**
 * The sentence length scale: six numbered steps from short to long on one
 * track, with what each end suits written under it. The thumb slides to the
 * tapped number; on the first-run card a finger dragged along the track picks
 * as it goes. Used by the first-run card and by the room settings.
 */
export default function SpeechLengthScale({
  copy,
  selected,
  disabled = false,
  dragToPick = false,
  onSelect,
}: {
  copy: FirstRunCopy;
  selected: SpeechLengthLevel;
  disabled?: boolean;
  /** Pick while a finger slides along the track. Off where a pick applies at once (room settings). */
  dragToPick?: boolean;
  onSelect: (level: SpeechLengthLevel) => void;
}) {
  const thumbId = useId();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const levelAt = useCallback((clientX: number): SpeechLengthLevel | null => {
    const track = trackRef.current;
    if (!track) return null;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const ratio = (clientX - rect.left) / rect.width;
    const flipped = getComputedStyle(track).direction === "rtl" ? 1 - ratio : ratio;
    const index = Math.min(SPEECH_LENGTH_LEVELS.length - 1, Math.max(0, Math.floor(flipped * SPEECH_LENGTH_LEVELS.length)));
    return SPEECH_LENGTH_LEVELS[index];
  }, []);

  const pickAt = useCallback((clientX: number) => {
    const level = levelAt(clientX);
    if (level !== null && level !== selected) onSelect(level);
  }, [levelAt, onSelect, selected]);

  return (
    <div data-qa="speech-length-scale">
      <div
        ref={trackRef}
        role="radiogroup"
        aria-label={copy.lengthMenuLabel}
        className={`relative grid touch-none select-none grid-cols-6 rounded-full bg-slate-100 p-1 ${disabled ? "opacity-50" : ""}`}
        onPointerDown={(event) => {
          if (disabled || !dragToPick) return;
          draggingRef.current = true;
          pickAt(event.clientX);
        }}
        onPointerMove={(event) => {
          if (draggingRef.current && !disabled) pickAt(event.clientX);
        }}
        onPointerUp={() => { draggingRef.current = false; }}
        onPointerCancel={() => { draggingRef.current = false; }}
        onPointerLeave={() => { draggingRef.current = false; }}
      >
        {SPEECH_LENGTH_LEVELS.map((level) => {
          const isSelected = selected === level;
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              data-qa={`speech-length-${level}`}
              onClick={() => onSelect(level)}
              className="relative flex h-11 items-center justify-center rounded-full text-[1rem] font-bold outline-none disabled:cursor-not-allowed"
            >
              {isSelected ? (
                <motion.span
                  layoutId={thumbId}
                  aria-hidden
                  transition={{ type: "spring", stiffness: 560, damping: 36, mass: 0.7 }}
                  className="absolute inset-0 rounded-full bg-slate-950 shadow-[0_6px_16px_rgba(15,23,42,0.28)]"
                />
              ) : null}
              <span className={`relative transition-colors duration-150 ${isSelected ? "text-white" : "text-slate-500"}`}>
                {level}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-start justify-between gap-3 px-1 text-[0.74rem] leading-snug text-slate-500">
        <span className="min-w-0">
          <span className="block font-semibold text-slate-800">{copy.lengthShort}</span>
          {copy.lengthShortHint}
        </span>
        <span className="min-w-0 text-right">
          <span className="block font-semibold text-slate-800">{copy.lengthLong}</span>
          {copy.lengthLongHint}
        </span>
      </div>
    </div>
  );
}
