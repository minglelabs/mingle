"use client";

import {
  getSignupBirthDayOptions,
  getSignupBirthMonthOptions,
  getSignupBirthYearOptions,
  type BirthDateParts,
} from "@/lib/birth-date";
import { useCallback, useEffect, useMemo, useRef } from "react";

const WHEEL_ITEM_HEIGHT_PX = 48;
const WHEEL_VIEWPORT_HEIGHT_PX = 216;
const WHEEL_SIDE_PADDING_PX = (WHEEL_VIEWPORT_HEIGHT_PX - WHEEL_ITEM_HEIGHT_PX) / 2;

type SignupBirthDatePickerProps = {
  value: BirthDateParts;
  onChange: (value: BirthDateParts) => void;
  yearLabel: string;
  monthLabel: string;
  dayLabel: string;
};

function WheelColumn({
  values,
  selectedValue,
  label,
  formatValue,
  onChange,
}: {
  values: readonly number[];
  selectedValue: number;
  label: string;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedIndex = Math.max(0, values.indexOf(selectedValue));

  const scrollToSelected = useCallback((behavior: ScrollBehavior = "auto") => {
    scrollRef.current?.scrollTo({
      top: selectedIndex * WHEEL_ITEM_HEIGHT_PX,
      behavior,
    });
  }, [selectedIndex]);

  useEffect(() => {
    scrollToSelected();
  }, [scrollToSelected]);

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
          onScroll={() => {
            if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
            scrollEndTimerRef.current = setTimeout(() => {
              syncSelectedValue();
              scrollToSelected("smooth");
            }, 90);
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
                  const index = values.indexOf(value);
                  scrollRef.current?.scrollTo({
                    top: index * WHEEL_ITEM_HEIGHT_PX,
                    behavior: "smooth",
                  });
                }}
                className={`flex h-12 w-full snap-center items-center justify-center rounded-[16px] text-[1.08rem] tabular-nums transition-[color,transform,font-size] duration-150 ${selected
                  ? "scale-[1.04] font-bold text-slate-950"
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
}: SignupBirthDatePickerProps) {
  const years = useMemo(() => getSignupBirthYearOptions(), []);
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
      />
      <WheelColumn
        values={months}
        selectedValue={value.month}
        label={monthLabel}
        formatValue={(month) => String(month).padStart(2, "0")}
        onChange={updateMonth}
      />
      <WheelColumn
        values={days}
        selectedValue={value.day}
        label={dayLabel}
        formatValue={(day) => String(day).padStart(2, "0")}
        onChange={(day) => onChange({ ...value, day })}
      />
    </div>
  );
}
