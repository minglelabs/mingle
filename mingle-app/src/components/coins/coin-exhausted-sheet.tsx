"use client";

import { Coins } from "lucide-react";
import type { AppLocale } from "@/i18n";
import { resolveLegalDocumentLocale } from "@/i18n/config";
import { fillCoinCopy, getCoinCopy } from "@/i18n/coin-copy";
import { useCoinWallet } from "@/lib/coin-wallet-client";
import { useCoinClock } from "./coin-balance-chip";

/**
 * "You're out of coins" (docs/coin-iap-spec.md 9.4): shown the moment the
 * balance hits zero, and when a paid feature is tapped with no coins.
 */
export default function CoinExhaustedSheet({
  open,
  onClose,
  onCharge,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  onCharge: () => void;
  locale: AppLocale;
}) {
  const copy = getCoinCopy(locale);
  const { wallet } = useCoinWallet();
  const now = useCoinClock(open);

  if (!open) return null;

  const remainingMs = wallet ? Math.max(0, Date.parse(wallet.nextDailyGrantAt) - now) : 0;
  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  const displayLocale = resolveLegalDocumentLocale(locale);
  const unit = (value: number, name: "hour" | "minute") =>
    new Intl.NumberFormat(displayLocale, { style: "unit", unit: name, unitDisplay: "short" }).format(value);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const remaining = hours > 0 ? (minutes > 0 ? `${unit(hours, "hour")} ${unit(minutes, "minute")}` : unit(hours, "hour")) : unit(minutes, "minute");

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={copy.exhaustedTitle}
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-3xl bg-white px-5 pt-6 text-slate-950"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <Coins size={24} strokeWidth={2.2} aria-hidden="true" />
        </div>
        <h2 className="mt-3 text-center text-[19px] font-bold">{copy.exhaustedTitle}</h2>
        <p className="mt-1.5 text-center text-[14px] leading-relaxed text-gray-600">{copy.exhaustedBody}</p>
        {wallet && remainingMs > 0 ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-center text-[13px] font-semibold text-amber-800">
            {fillCoinCopy(copy.dailyNext, { time: remaining })}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onCharge}
          className="mt-5 flex min-h-12 w-full items-center justify-center rounded-full bg-slate-900 text-[15px] font-bold text-white transition active:bg-slate-700"
        >
          {copy.charge}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-1 flex min-h-11 w-full items-center justify-center text-[14px] font-semibold text-gray-500"
        >
          {copy.close}
        </button>
      </div>
    </div>
  );
}
