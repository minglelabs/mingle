"use client";

import { Coins } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AppLocale } from "@/i18n";
import { resolveLegalDocumentLocale } from "@/i18n/config";
import { getCoinCopy } from "@/i18n/coin-copy";
import { isCoinBillingActive, openCoinStore, useCoinWallet } from "@/lib/coin-wallet-client";

const COUNT_ANIMATION_MS = 500;

/** Eases the shown number toward the real balance so a spend reads as a countdown, not a jump. */
export function useAnimatedCoinCount(target: number): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    const from = shownRef.current;
    if (from === target) return;
    const reduceMotion = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Reduced motion: a zero-length animation, i.e. the first frame lands on the target.
    const duration = reduceMotion ? 0 : COUNT_ANIMATION_MS;
    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = duration === 0 ? 1 : Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const value = Math.round(from + (target - from) * eased);
      shownRef.current = value;
      setShown(value);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return shown;
}

/** Current time, refreshed every 30 s while active (countdowns to the next free refill). */
export function useCoinClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const update = () => setNow(Date.now());
    const first = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [active]);
  return now;
}

export function formatCoinCount(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(resolveLegalDocumentLocale(locale)).format(Math.max(0, Math.floor(value)));
}

/**
 * Always-visible balance and the entry point to the store (spec 9.1). Renders
 * nothing until billing is enforced and the wallet is loaded.
 */
export default function CoinBalanceChip({
  locale,
  size = "regular",
  className = "",
}: {
  locale: AppLocale;
  size?: "regular" | "compact";
  className?: string;
}) {
  const { wallet } = useCoinWallet();
  const active = isCoinBillingActive(wallet);
  const balance = useAnimatedCoinCount(active ? wallet.balance : 0);
  if (!active) return null;

  const copy = getCoinCopy(locale);
  const low = wallet.lowBalance;
  const compact = size === "compact";
  return (
    <button
      type="button"
      onClick={openCoinStore}
      // The visible pill is small; min-h/min-w keep the touch target at 44pt.
      className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center ${className}`}
      aria-label={`${copy.balanceLabel} ${formatCoinCount(wallet.balance, locale)}`}
    >
      <span
        className={`flex items-center gap-1 rounded-full border font-bold tabular-nums transition-colors ${
          compact ? "px-2 py-0.5 text-[12px]" : "px-2.5 py-1 text-[13px]"
        } ${low ? "border-orange-200 bg-orange-50 text-orange-600" : "border-amber-200 bg-amber-50 text-amber-700"}`}
      >
        <Coins size={compact ? 13 : 15} strokeWidth={2.4} aria-hidden="true" />
        {formatCoinCount(balance, locale)}
      </span>
    </button>
  );
}
