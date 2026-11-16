"use client";

import { motion } from "framer-motion";
import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { FirstRunCopy } from "@/i18n/first-run-copy";
import { SPEECH_LENGTH_LEVELS, type SpeechLengthLevel } from "@/lib/speech-length";

const THUMB_PX = 40;
const THUMB_SPRING = { type: "spring", stiffness: 520, damping: 38, mass: 0.7 } as const;

/** Many short bubbles: the short end. */
function ShortIcon() {
  return (
    <span aria-hidden className="flex w-6 shrink-0 flex-col items-end gap-[3px]">
      <span className="h-[5px] w-3 rounded-full bg-slate-400" />
      <span className="h-[5px] w-4 rounded-full bg-slate-400" />
      <span className="h-[5px] w-2.5 rounded-full bg-slate-400" />
    </span>
  );
}

/** One long bubble: the long end. */
function LongIcon() {
  return (
    <span aria-hidden className="flex w-6 shrink-0 flex-col items-start">
      <span className="h-[19px] w-6 rounded-[7px] bg-slate-400" />
    </span>
  );
}

/**
 * The sentence length scale as a slider: numbered stops from short to long on
 * one track, a round thumb that follows the finger, and what each end suits
 * written under it. Short and long are also drawn (many small bubbles, one
 * long one) so the direction reads without the words.
 *
 * `livePick` (the first-run card) reports each stop the finger passes so the
 * example above can follow; without it (room settings, where a pick applies at
 * once) only the stop the finger lets go on is reported. `levels` limits the
 * stops: the three-stop scale (first-run card, room settings) or all five.
 * `showNumbers` puts the level on the thumb (the five-level page only), and
 * `recommended` tags one stop.
 */
export default function SpeechLengthScale({
  copy,
  selected,
  disabled = false,
  livePick = false,
  levels = SPEECH_LENGTH_LEVELS,
  showNumbers = true,
  recommended,
  onSelect,
}: {
  copy: FirstRunCopy;
  selected: SpeechLengthLevel;
  disabled?: boolean;
  livePick?: boolean;
  levels?: readonly SpeechLengthLevel[];
  showNumbers?: boolean;
  recommended?: SpeechLengthLevel;
  onSelect: (level: SpeechLengthLevel) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [isRtl, setIsRtl] = useState(false);
  // While a finger is down: where it is along the track (0-1) and the stop under it.
  const [drag, setDrag] = useState<{ ratio: number; level: SpeechLengthLevel } | null>(null);
  const lastStops = levels.length - 1;
  const selectedIndex = Math.max(0, levels.indexOf(selected));
  const shownLevel = drag?.level ?? levels[selectedIndex];
  const shownRatio = drag?.ratio ?? (lastStops > 0 ? selectedIndex / lastStops : 0);

  useLayoutEffect(() => {
    if (trackRef.current) setIsRtl(getComputedStyle(trackRef.current).direction === "rtl");
  }, []);

  const readFinger = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return null;
    const rect = track.getBoundingClientRect();
    const usable = rect.width - THUMB_PX;
    if (usable <= 0) return null;
    const raw = Math.min(1, Math.max(0, (clientX - rect.left - THUMB_PX / 2) / usable));
    const ratio = isRtl ? 1 - raw : raw;
    const level = levels[Math.round(ratio * lastStops)] ?? levels[0];
    return { ratio, level };
  }, [isRtl, lastStops, levels]);

  const follow = (event: PointerEvent<HTMLDivElement>) => {
    const next = readFinger(event.clientX);
    if (!next) return;
    setDrag(next);
    if (livePick && next.level !== shownLevel) onSelect(next.level);
  };

  const release = () => {
    if (!drag) return;
    if (!livePick && drag.level !== selected) onSelect(drag.level);
    setDrag(null);
  };

  const step = (event: KeyboardEvent<HTMLDivElement>) => {
    const forward = isRtl ? "ArrowLeft" : "ArrowRight";
    const back = isRtl ? "ArrowRight" : "ArrowLeft";
    let index = selectedIndex;
    if (event.key === forward || event.key === "ArrowUp") index += 1;
    else if (event.key === back || event.key === "ArrowDown") index -= 1;
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = lastStops;
    else return;
    event.preventDefault();
    const level = levels[Math.min(lastStops, Math.max(0, index))];
    if (level !== selected) onSelect(level);
  };

  const position = (ratio: number) => `calc(${(isRtl ? 1 - ratio : ratio) * 100}% - ${(isRtl ? 1 - ratio : ratio) * THUMB_PX}px)`;

  return (
    <div data-qa="speech-length-scale" className={`${disabled ? "opacity-50" : ""} ${recommended && levels.includes(recommended) ? "pt-6" : ""}`}>
      <div className="flex items-center gap-2.5">
        <ShortIcon />
        <div
          ref={trackRef}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={copy.lengthMenuLabel}
          aria-valuemin={levels[0]}
          aria-valuemax={levels[lastStops]}
          aria-valuenow={shownLevel}
          aria-disabled={disabled}
          data-qa="speech-length-track"
          data-level={shownLevel}
          className="relative h-11 min-w-0 flex-1 touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          onKeyDown={disabled ? undefined : step}
          onPointerDown={(event) => {
            if (disabled) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            follow(event);
          }}
          onPointerMove={(event) => { if (drag && !disabled) follow(event); }}
          onPointerUp={release}
          onPointerCancel={release}
        >
          {/* The rail, filled up to the thumb. */}
          <span aria-hidden className="absolute inset-x-[20px] top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-200" />
          <motion.span
            aria-hidden
            className="absolute top-[19px] h-1.5 rounded-full bg-amber-400"
            style={isRtl ? { right: 20 } : { left: 20 }}
            animate={{ width: `calc(${shownRatio * 100}% - ${shownRatio * THUMB_PX}px)` }}
            transition={drag ? { duration: 0 } : THUMB_SPRING}
          />
          {recommended && levels.includes(recommended) && (
            <span
              aria-hidden
              data-qa="speech-length-recommended"
              className="pointer-events-none absolute -top-6 flex w-10 justify-center"
              style={{ left: position(lastStops > 0 ? levels.indexOf(recommended) / lastStops : 0) }}
            >
              <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[0.68rem] font-extrabold leading-4 ${shownLevel === recommended ? "bg-amber-400 text-slate-950" : "bg-amber-100 text-amber-800"}`}>
                {copy.lengthRecommended}
              </span>
            </span>
          )}
          {levels.map((level, index) => {
            const ratio = lastStops > 0 ? index / lastStops : 0;
            const passed = index <= Math.round(shownRatio * lastStops);
            return (
              <span
                key={level}
                aria-hidden
                data-qa={`speech-length-${level}`}
                className="absolute top-[2px] flex h-10 w-10 items-center justify-center"
                style={{ left: position(ratio) }}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${passed ? "bg-amber-500" : "bg-slate-300"}`} />
              </span>
            );
          })}
          <motion.span
            aria-hidden
            data-qa="speech-length-thumb"
            className="absolute top-[2px] flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-[1rem] font-extrabold text-white shadow-[0_6px_16px_rgba(15,23,42,0.32)]"
            animate={{ left: position(shownRatio), scale: drag ? 1.12 : 1 }}
            transition={drag ? { left: { duration: 0 }, scale: THUMB_SPRING } : THUMB_SPRING}
          >
            {showNumbers ? shownLevel : <span className="h-3 w-3 rounded-full bg-amber-400" />}
          </motion.span>
        </div>
        <LongIcon />
      </div>
      <div className="mt-2 flex items-start justify-between gap-3 text-[0.74rem] leading-snug text-slate-500">
        <span className="min-w-0">
          <span className="block font-bold text-slate-800">{isRtl ? "→" : "←"} {copy.lengthShort}</span>
          {copy.lengthShortHint}
        </span>
        <span className="min-w-0 text-right">
          <span className="block font-bold text-slate-800">{copy.lengthLong} {isRtl ? "←" : "→"}</span>
          {copy.lengthLongHint}
        </span>
      </div>
    </div>
  );
}
