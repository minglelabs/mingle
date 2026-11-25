"use client";

/**
 * An age range as one track with two handles (owner, 2026-11-25; it was two
 * dropdowns). Two native range inputs lie on top of each other: only their
 * thumbs take the finger, so either handle can be dragged, and a keyboard or
 * a screen reader gets two ordinary sliders. The handles never cross.
 */
export function clampAgeRange(next: { min: number; max: number }, moved: "min" | "max", limits: { min: number; max: number }): { min: number; max: number } {
  const clamp = (value: number) => Math.min(limits.max, Math.max(limits.min, Math.round(value)));
  const min = clamp(next.min);
  const max = clamp(next.max);
  if (min <= max) return { min, max };
  // The moved handle stops at the other one.
  return moved === "min" ? { min: max, max } : { min, max: min };
}

const THUMB = [
  "pointer-events-none absolute inset-x-0 top-0 h-7 w-full appearance-none bg-transparent",
  "[&::-webkit-slider-runnable-track]:h-7 [&::-webkit-slider-runnable-track]:bg-transparent",
  "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:shadow-[0_2px_6px_rgba(15,23,42,0.25)]",
  "[&::-moz-range-track]:bg-transparent",
  "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-[22px] [&::-moz-range-thumb]:w-[22px] [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-amber-500",
  "focus-visible:outline-none",
].join(" ");

export default function AgeRangeSlider({
  min,
  max,
  valueMin,
  valueMax,
  label,
  onChange,
}: {
  min: number;
  max: number;
  valueMin: number;
  valueMax: number;
  /** What the two handles choose ("Age"), for screen readers. */
  label: string;
  onChange: (range: { min: number; max: number }) => void;
}) {
  const span = Math.max(1, max - min);
  const left = ((valueMin - min) / span) * 100;
  const right = ((valueMax - min) / span) * 100;
  // The top of the range means "and older".
  const shown = `${valueMin} – ${valueMax}${valueMax >= max ? "+" : ""}`;
  return (
    <div data-qa="explore-filter-age-slider">
      <div className="flex items-baseline justify-between">
        <p className="text-[13px] font-bold text-slate-500">{label}</p>
        <p className="text-[15px] font-extrabold tabular-nums text-amber-600" data-qa="explore-filter-age-value">{shown}</p>
      </div>
      <div className="relative mt-2 h-7">
        <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gray-200" />
        <span aria-hidden="true" className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-amber-500" style={{ left: `${left}%`, right: `${100 - right}%` }} />
        <input
          type="range"
          data-qa="explore-filter-age-min"
          aria-label={`${label} ${min}–${valueMax}`}
          min={min}
          max={max}
          step={1}
          value={valueMin}
          onChange={(event) => onChange(clampAgeRange({ min: Number(event.target.value), max: valueMax }, "min", { min, max }))}
          className={THUMB}
          // The lower handle is on top while both sit at the top end, so it can still be pulled back.
          style={{ zIndex: valueMin >= max - 1 ? 2 : 1 }}
        />
        <input
          type="range"
          data-qa="explore-filter-age-max"
          aria-label={`${label} ${valueMin}–${max}`}
          min={min}
          max={max}
          step={1}
          value={valueMax}
          onChange={(event) => onChange(clampAgeRange({ min: valueMin, max: Number(event.target.value) }, "max", { min, max }))}
          className={THUMB}
          style={{ zIndex: 1 }}
        />
      </div>
      <div className="mt-0.5 flex justify-between text-[11px] tabular-nums text-gray-400" aria-hidden="true">
        <span>{min}</span>
        <span>{max}+</span>
      </div>
    </div>
  );
}
