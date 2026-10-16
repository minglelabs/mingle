"use client";

import { Coins } from "lucide-react";
import { useState } from "react";
import type { AppLocale } from "@/i18n";
import { getCoinCopy } from "@/i18n/coin-copy";
import { isCoinBillingActive, openCoinStore, useCoinWallet } from "@/lib/coin-wallet-client";

/**
 * One line above a conversation (docs/coin-iap-spec.md 9.4). With no coins it
 * stays until the user tops up; the low-balance notice shows once per room
 * visit and can be dismissed by opening the store.
 */
export default function CoinRoomBanner({ locale }: { locale: AppLocale }) {
  const { wallet } = useCoinWallet();
  const [lowDismissed, setLowDismissed] = useState(false);
  if (!isCoinBillingActive(wallet)) return null;
  const exhausted = wallet.exhausted;
  if (!exhausted && (!wallet.lowBalance || lowDismissed)) return null;

  const copy = getCoinCopy(locale);
  return (
    <button
      type="button"
      onClick={() => {
        if (!exhausted) setLowDismissed(true);
        openCoinStore();
      }}
      className={`flex min-h-11 w-full shrink-0 items-center gap-2 px-4 py-2 text-left text-[13px] font-semibold ${
        exhausted ? "bg-rose-50 text-rose-700" : "bg-orange-50 text-orange-700"
      }`}
      role="status"
    >
      <Coins size={16} strokeWidth={2.3} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">{exhausted ? copy.exhaustedBanner : copy.lowBanner}</span>
      <span className="shrink-0 underline">{copy.charge}</span>
    </button>
  );
}
