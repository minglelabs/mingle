"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import SpeechLengthScale from "@/components/LivePhoneDemo/SpeechLengthScale";
import type { FirstRunCopy } from "@/i18n/first-run-copy";
import { groupSpeechLengthPreview, type SpeechLengthLevel } from "@/lib/speech-length";

// One colour per example sentence. A bubble holding several sentences runs
// from its first sentence's colour to its last, so a merge is visible.
const PIECE_COLORS = ["#FFD166", "#8FD3FF", "#9BE8B4", "#FFB3C1", "#C9B8FF", "#FFC08A"] as const;

const DROP_SPRING = { type: "spring", stiffness: 420, damping: 24, mass: 0.8 } as const;

// Splitting off: the bubble drips down out of the one above. Absorbed: it
// slides up into the one above, its words gone first so only the drop shows.
const BUBBLE_VARIANTS = {
  split: { y: -30, scale: 0.55 },
  rest: { y: 0, scale: 1 },
  absorbed: { y: -34, scale: 0.4, transition: { duration: 0.24, ease: [0.4, 0, 1, 1] as const } },
};
const TEXT_VARIANTS = {
  split: { opacity: 0 },
  rest: { opacity: 1, transition: { duration: 0.18, delay: 0.08 } },
  absorbed: { opacity: 0, transition: { duration: 0.06 } },
};

/**
 * Shown once in a new user's first room, after a couple of finished bubbles:
 * how long a sentence should be kept together. Picking a number only changes
 * the example above the scale, where the coloured bubbles run together or drip
 * apart like water drops as that level would; "Apply" is what changes the
 * setting (and, if the room is listening, restarts it). The current level
 * starts selected, so the card can also just be closed.
 *
 * The drops: an SVG "goo" filter (blur, then a hard alpha threshold) joins
 * shapes that come close, and the original is drawn back on top so the text
 * stays sharp. A bubble that is absorbed slides into the one above it; a
 * bubble that splits off drops out of it.
 */
export default function SpeechLengthCard({
  copy,
  selected,
  disabled = false,
  onApply,
  onClose,
}: {
  copy: FirstRunCopy;
  selected: SpeechLengthLevel;
  disabled?: boolean;
  onApply: (level: SpeechLengthLevel) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<SpeechLengthLevel>(selected);
  const gooId = `speech-length-goo-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const bubbles = useMemo(() => {
    const groups = groupSpeechLengthPreview(picked, copy.lengthPreview);
    return groups.map((bubble, index) => {
      const first = Number(bubble.key.slice(1));
      const next = groups[index + 1];
      const last = next ? Number(next.key.slice(1)) - 1 : PIECE_COLORS.length - 1;
      const from = PIECE_COLORS[first] ?? PIECE_COLORS[0];
      const to = PIECE_COLORS[last] ?? from;
      return { ...bubble, background: from === to ? from : `linear-gradient(100deg, ${from} 0%, ${to} 100%)` };
    });
  }, [copy.lengthPreview, picked]);

  return (
    <motion.div
      role="dialog"
      aria-label={copy.lengthTitle}
      data-qa="speech-length-card"
      initial={{ opacity: 0, y: 28, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.8 }}
      className="pointer-events-auto w-full max-w-[420px] overflow-hidden rounded-[1.75rem] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.28)] ring-1 ring-slate-900/5"
    >
      <svg aria-hidden width="0" height="0" className="absolute">
        <defs>
          <filter id={gooId} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="goo" />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      <div className="relative h-[252px] overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Only the bubbles sit inside the filter: it works on their outline. */}
      <div
        aria-hidden
        data-qa="speech-length-preview"
        data-bubbles={bubbles.length}
        className="absolute inset-0 flex flex-col items-end justify-center gap-2 px-4"
        style={{ filter: `url(#${gooId})` }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {bubbles.map((bubble) => (
            <motion.div
              key={bubble.key}
              layout
              variants={BUBBLE_VARIANTS}
              initial="split"
              animate="rest"
              exit="absorbed"
              transition={{ ...DROP_SPRING, layout: DROP_SPRING }}
              style={{ background: bubble.background, borderRadius: 20, originX: 1, originY: 0 }}
              className="max-w-[88%] px-3.5 py-1.5 text-[0.84rem] font-semibold leading-snug text-slate-900"
            >
              <motion.span layout="position" variants={TEXT_VARIANTS} transition={DROP_SPRING} className="block">
                {bubble.text}
              </motion.span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      </div>

      <div className="px-5 pb-5 pt-4">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-[1.08rem] font-extrabold leading-snug tracking-[-0.01em] text-slate-950">{copy.lengthTitle}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.lengthClose}
            className="-mr-2 -mt-1.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition active:scale-95"
          >
            <X size={17} strokeWidth={2.6} aria-hidden />
          </button>
        </div>
        <p className="mt-1 text-[0.8rem] leading-relaxed text-slate-500">{copy.lengthHint}</p>
        <div className="mt-4">
          <SpeechLengthScale copy={copy} selected={picked} disabled={disabled} dragToPick onSelect={setPicked} />
        </div>
        <button
          type="button"
          data-qa="speech-length-apply"
          disabled={disabled}
          onClick={() => onApply(picked)}
          className="mt-4 flex h-[52px] w-full items-center justify-center rounded-full bg-amber-400 text-[1rem] font-extrabold text-slate-950 shadow-[0_8px_20px_rgba(245,158,11,0.35)] transition active:scale-[0.985] disabled:opacity-50"
        >
          {copy.lengthApply}
        </button>
      </div>
    </motion.div>
  );
}
