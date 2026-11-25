"use client";

import {
  getSignupBirthDayOptions,
  getSignupBirthMonthOptions,
  getSignupBirthYearOptions,
  type BirthDateParts,
} from "@/lib/birth-date";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const WHEEL_ITEM_HEIGHT_PX = 48;
const WHEEL_VIEWPORT_HEIGHT_PX = 216;
const WHEEL_SIDE_PADDING_PX = (WHEEL_VIEWPORT_HEIGHT_PX - WHEEL_ITEM_HEIGHT_PX) / 2;

type SignupBirthDatePickerProps = {
  value: BirthDateParts;
  onChange: (value: BirthDateParts) => void;
  /**
   * Called with true once the person has picked the year, the month and the
   * day themself. Until then the wheels show a grey suggestion: a quarter of
   * the accounts with a birth date had kept the preselected 2000-01-01
   * (production, 2026-11-21), and birth dates are locked once saved.
   */
  onPickedChange?: (picked: boolean) => void;
  /** Already picked earlier (an onboarding picked up where it stopped): no grey suggestion. */
  initialPicked?: boolean;
  yearLabel: string;
  monthLabel: string;
  dayLabel: string;
};

/** One scroll wheel column (snap to a value); also used for the height picker. */
export function WheelColumn({
  values,
  selectedValue,
  label,
  formatValue,
  onChange,
  onPicked,
  picked = true,
}: {
  values: readonly number[];
  selectedValue: number;
  label: string;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
  /** The person scrolled this column or tapped a value in it (a programmatic scroll does not count). */
  onPicked?: () => void;
  /** False until the person has picked: the value shows grey, as a suggestion only. */
  picked?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const userScrollingRef = useRef(false);
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedIndex = Math.max(0, values.indexOf(selectedValue));

  const scrollToSelected = useCallback((behavior: ScrollBehavior = "auto") => {
    scrollRef.current?.scrollTo({
      top: selectedIndex * WHEEL_ITEM_HEIGHT_PX,
      behavior,
    });
  }, [selectedIndex]);

  // Follows a value set from outside (first paint, another column clamping
  // the day). A value the wheel itself settled on is already under the band,
  // so it is not scrolled again: doing so mid-flick made the wheel jump.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (Math.abs(element.scrollTop - selectedIndex * WHEEL_ITEM_HEIGHT_PX) < WHEEL_ITEM_HEIGHT_PX / 2) return;
    scrollToSelected();
  }, [scrollToSelected, selectedIndex]);

  useEffect(() => () => {
    if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
  }, []);

  const syncSelectedValue = () => {
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    const nextIndex = Math.min(
      values.length - 1,
      Math.max(0, Math.round(scrollTop / WHEEL_ITEM_HEIGHT_PX)),
    );
    const nextValue = values[nextIndex];
    if (typeof nextValue === "number" && nextValue !== selectedValue) {
      onChange(nextValue);
    }
  };

  return (
    <div className="min-w-0 flex-1">
      <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <div className="relative overflow-hidden rounded-[24px] border border-[#e8e2d8] bg-[#faf8f3]">
        <div
          className="pointer-events-none absolute inset-x-2 top-1/2 z-10 h-12 -translate-y-1/2 rounded-[16px] border border-[#f3c35a]/75 bg-white/85 shadow-[0_8px_20px_rgba(15,23,42,0.06)]"
          aria-hidden="true"
        />
        <div
          ref={scrollRef}
          role="listbox"
          aria-label={label}
          onPointerDown={() => { userScrollingRef.current = true; }}
          onTouchStart={() => { userScrollingRef.current = true; }}
          onWheel={() => { userScrollingRef.current = true; }}
          onScroll={() => {
            // Settles once the flick has stopped; CSS snapping already lines the
            // row up, so nothing is scrolled here (it used to scroll back to the
            // previous value, fighting the snap: the shaking on the height wheel).
            if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
            scrollEndTimerRef.current = setTimeout(() => {
              syncSelectedValue();
              if (userScrollingRef.current) {
                userScrollingRef.current = false;
                onPicked?.();
              }
            }, 140);
          }}
          className="relative z-20 h-[216px] snap-y snap-mandatory overflow-y-auto overscroll-contain px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div aria-hidden="true" style={{ height: WHEEL_SIDE_PADDING_PX }} />
          {values.map((value) => {
            const selected = value === selectedValue;
            return (
              <button
                key={value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(value);
                  onPicked?.();
                  const index = values.indexOf(value);
                  scrollRef.current?.scrollTo({
                    top: index * WHEEL_ITEM_HEIGHT_PX,
                    behavior: "smooth",
                  });
                }}
                className={`flex h-12 w-full snap-center items-center justify-center rounded-[16px] text-[1.08rem] tabular-nums transition-[color,transform,font-size] duration-150 ${selected
                  ? picked ? "scale-[1.04] font-bold text-slate-950" : "font-semibold text-slate-400"
                  : "text-slate-400 hover:text-slate-700"}`}
              >
                {formatValue?.(value) ?? value}
              </button>
            );
          })}
          <div aria-hidden="true" style={{ height: WHEEL_SIDE_PADDING_PX }} />
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-16 bg-gradient-to-b from-[#faf8f3] to-transparent" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-16 bg-gradient-to-t from-[#faf8f3] to-transparent" aria-hidden="true" />
      </div>
    </div>
  );
}

export default function SignupBirthDatePicker({
  value,
  onChange,
  yearLabel,
  monthLabel,
  dayLabel,
  onPickedChange,
  initialPicked = false,
}: SignupBirthDatePickerProps) {
  const years = useMemo(() => getSignupBirthYearOptions(), []);
  // Without onPickedChange the wheels behave as before (always "picked").
  const [pickedColumns, setPickedColumns] = useState(() => {
    const picked = !onPickedChange || initialPicked;
    return { year: picked, month: picked, day: picked };
  });
  // Moving any one wheel is enough (owner, 2026-11-25): all three then show as picked.
  const markPicked = (column: "year" | "month" | "day") => {
    if (pickedColumns[column]) return;
    setPickedColumns({ year: true, month: true, day: true });
    onPickedChange?.(true);
  };
  const months = useMemo(() => getSignupBirthMonthOptions(value.year), [value.year]);
  const days = useMemo(() => getSignupBirthDayOptions(value.year, value.month), [value.month, value.year]);

  const updateYear = (year: number) => {
    const nextMonths = getSignupBirthMonthOptions(year);
    const month = nextMonths.includes(value.month) ? value.month : nextMonths[nextMonths.length - 1] ?? 1;
    const nextDays = getSignupBirthDayOptions(year, month);
    const day = nextDays.includes(value.day) ? value.day : nextDays[nextDays.length - 1] ?? 1;
    onChange({ year, month, day });
  };

  const updateMonth = (month: number) => {
    const nextDays = getSignupBirthDayOptions(value.year, month);
    const day = nextDays.includes(value.day) ? value.day : nextDays[nextDays.length - 1] ?? 1;
    onChange({ ...value, month, day });
  };

  return (
    <div className="grid grid-cols-3 gap-2.5" aria-label={`${yearLabel}, ${monthLabel}, ${dayLabel}`}>
      <WheelColumn
        values={years}
        selectedValue={value.year}
        label={yearLabel}
        formatValue={(year) => `${year}`}
        onChange={updateYear}
        onPicked={() => markPicked("year")}
        picked={pickedColumns.year}
      />
      <WheelColumn
        values={months}
        selectedValue={value.month}
        label={monthLabel}
        formatValue={(month) => String(month).padStart(2, "0")}
        onChange={updateMonth}
        onPicked={() => markPicked("month")}
        picked={pickedColumns.month}
      />
      <WheelColumn
        values={days}
        selectedValue={value.day}
        label={dayLabel}
        formatValue={(day) => String(day).padStart(2, "0")}
        onChange={(day) => onChange({ ...value, day })}
        onPicked={() => markPicked("day")}
        picked={pickedColumns.day}
      />
    </div>
  );
}
