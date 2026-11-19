"use client";

import { toast } from "sonner";
import { getCoinDetailCopy, type CoinUsageFeatureKey } from "@/i18n/coin-detail-copy";
import { DEFAULT_LOCALE, resolveSupportedLocaleTag } from "@/i18n";
import { getCoinWalletState, isCoinBillingActive, type CoinWallet } from "@/lib/coin-wallet-client";

// One short toast whenever a paid switch goes on or off: what it is and how
// fast it uses Hash (or that it stopped). Shown only while Hash are charged.

/** The switches that use Hash while they are on. */
export type CoinRateFeature = Extract<CoinUsageFeatureKey, "speech" | "read_aloud" | "voice_caption" | "voice_listen">;

/** Whole Hash a minute for a switch at the live rates; 0 when the rate is unknown. */
export function coinRatePerMinute(feature: CoinRateFeature, rates: CoinWallet["rates"]): number {
  const perMinute = feature === "speech" || feature === "voice_caption"
    ? rates?.sttCoinsPerMinute
    : rates?.ttsCoinsPerAudioMinute;
  return typeof perMinute === "number" && perMinute > 0 ? Math.ceil(perMinute) : 0;
}

export function buildCoinRateToast(input: {
  feature: CoinRateFeature;
  on: boolean;
  rates: CoinWallet["rates"];
  locale: string | null | undefined;
}): string | null {
  const copy = getCoinDetailCopy(resolveSupportedLocaleTag(input.locale ?? "") ?? DEFAULT_LOCALE);
  const feature = copy.features[input.feature];
  if (!input.on) return copy.rateOff.replace("{feature}", feature);
  const coins = coinRatePerMinute(input.feature, input.rates);
  return coins > 0 ? copy.rateOn.replace("{feature}", feature).replace("{coins}", String(coins)) : null;
}

export function showCoinRateToast(feature: CoinRateFeature, on: boolean, locale: string | null | undefined): void {
  const wallet = getCoinWalletState().wallet;
  if (!isCoinBillingActive(wallet)) return;
  const message = buildCoinRateToast({ feature, on, rates: wallet.rates, locale });
  // One toast per switch: a quick on-off replaces the first instead of stacking.
  if (message) toast(message, { id: `coin-rate:${feature}`, duration: 2600 });
}
