"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  KOREA_VISIT_MONTHS_AHEAD,
  KOREA_VISIT_MONTHS_BACK,
  monthGrid,
  pickKoreaVisitDay,
  toIsoDay,
  type IsoDay,
  type KoreaVisitRange,
} from "@/lib/korea-visit";

type Props = {
  locale: string;
  value: KoreaVisitRange;
  onChange: (range: KoreaVisitRange) => void;
  disabled?: boolean;
};

/**
 * Months stacked top to bottom, one month at a time snapping to the middle;
 * the months above and below peek in, dimmed. Opens on this month.
 */
export default function KoreaVisitCalendar({ locale, value, onChange, disabled }: Props) {
  const today = useMemo(() => toIsoDay(new Date()), []);
  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: KOREA_VISIT_MONTHS_BACK + KOREA_VISIT_MONTHS_AHEAD + 1 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - KOREA_VISIT_MONTHS_BACK + index, 1);
      return { key: `${date.getFullYear()}-${date.getMonth()}`, year: date.getFullYear(), monthIndex: date.getMonth() };
    });
  }, []);
  const monthTitle = useMemo(() => new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }), [locale]);
  const weekdays = useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
    // 2023-01-01 was a Sunday.
    return Array.from({ length: 7 }, (_, index) => format.format(new Date(2023, 0, 1 + index)));
  }, [locale]);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const monthRefs = useRef<Array<HTMLElement | null>>([]);
  const [centered, setCentered] = useState(KOREA_VISIT_MONTHS_BACK);

  const centerOf = useCallback((index: number) => {
    const scroller = scrollerRef.current;
    const month = monthRefs.current[index];
    if (!scroller || !month) return 0;
    return month.offsetTop - (scroller.clientHeight - month.offsetHeight) / 2;
  }, []);

  // Open on this month before the first paint.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTop = centerOf(KOREA_VISIT_MONTHS_BACK);
  }, [centerOf]);

  const frameRef = useRef<number | null>(null);
  const handleScroll = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const middle = scroller.scrollTop + scroller.clientHeight / 2;
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      monthRefs.current.forEach((month, index) => {
        if (!month) return;
        const distance = Math.abs(month.offsetTop + month.offsetHeight / 2 - middle);
        if (distance < bestDistance) {
          best = index;
          bestDistance = distance;
        }
      });
      setCentered(best);
    });
  }, []);
  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  const { start, end } = value;
  const tap = (day: IsoDay) => {
    if (disabled) return;
    onChange(pickKoreaVisitDay(value, day));
  };

  return (
    <div
      ref={scrollerRef}
      onScroll={handleScroll}
      data-qa="korea-visit-calendar"
      className="relative h-full snap-y snap-mandatory overflow-y-auto overscroll-contain px-4"
    >
      {months.map((month, index) => {
        const weeks = monthGrid(month.year, month.monthIndex);
        const isCentered = index === centered;
        return (
          <section
            key={month.key}
            ref={(node) => { monthRefs.current[index] = node; }}
            data-qa={index === KOREA_VISIT_MONTHS_BACK ? "korea-visit-this-month" : undefined}
            className="snap-center py-3 transition-opacity duration-200"
            style={{ opacity: isCentered ? 1 : 0.38 }}
          >
            <h3 className="px-1 pb-2 text-[1.15rem] font-bold tracking-[-0.01em] text-slate-950">
              {monthTitle.format(new Date(month.year, month.monthIndex, 1))}
            </h3>
            <div className="grid grid-cols-7 pb-1 text-center text-[0.75rem] font-semibold text-slate-400">
              {weekdays.map((weekday, dayIndex) => (
                <span key={dayIndex} className={dayIndex === 0 ? "text-rose-400" : undefined}>{weekday}</span>
              ))}
            </div>
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-cols-7">
                {week.map((day, dayIndex) => {
                  if (!day) return <span key={dayIndex} className="h-11" />;
                  const isStart = day === start;
                  const isEnd = day === end;
                  const isEdge = isStart || isEnd;
                  const inRange = Boolean(start && end && day > start && day < end);
                  // The band joins the start and end circles across the row.
                  const bandLeft = Boolean(start && end && start !== end && (inRange || isEnd));
                  const bandRight = Boolean(start && end && start !== end && (inRange || isStart));
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={disabled}
                      onClick={() => tap(day)}
                      aria-pressed={isEdge || inRange}
                      data-qa={`korea-visit-day-${day}`}
                      className="relative flex h-11 items-center justify-center"
                    >
                      {bandLeft ? <span aria-hidden className="absolute inset-y-1 left-0 right-1/2 bg-amber-100" /> : null}
                      {bandRight ? <span aria-hidden className="absolute inset-y-1 left-1/2 right-0 bg-amber-100" /> : null}
                      <span
                        className={`relative flex h-9 w-9 items-center justify-center rounded-full text-[0.98rem] ${
                          isEdge
                            ? "bg-amber-500 font-bold text-white"
                            : day === today
                              ? "font-bold text-amber-600 ring-2 ring-amber-400"
                              : day < today
                                ? "text-slate-400"
                                : "text-slate-800"
                        }`}
                      >
                        {Number(day.slice(8))}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
