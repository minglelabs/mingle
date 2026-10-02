"use client";

import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DEFAULT_LOCALE, type AppLocale } from "@/i18n";
import { resolveSupportedLocaleTag } from "@/i18n/config";
import {
  restoreCoinPurchases,
  resumeWebCheckoutIfReturned,
  startCoinPurchaseListener,
} from "@/lib/coin-purchase-client";
import {
  getCoinWalletState,
  isCoinBillingActive,
  refreshCoinWallet,
  subscribeCoinUi,
} from "@/lib/coin-wallet-client";
import CoinExhaustedSheet from "./coin-exhausted-sheet";
import CoinStorePanel from "./coin-store-panel";

const WALLET_POLL_MS = 60_000;

/**
 * Mounted once in the root layout. Owns the store panel and the "out of coins"
 * sheet (opened from anywhere through coin UI events), keeps the wallet fresh,
 * and recovers purchases that were paid but not yet granted.
 */
export default function CoinHost() {
  const { status } = useSession();
  const pathname = usePathname() || "";
  const locale: AppLocale = resolveSupportedLocaleTag(pathname.split("/").filter(Boolean)[0] ?? "") ?? DEFAULT_LOCALE;
  const [storeOpen, setStoreOpen] = useState(false);
  const [exhaustedOpen, setExhaustedOpen] = useState(false);
  const signedIn = status === "authenticated";

  useEffect(() => {
    if (!signedIn) return;
    const stopPurchases = startCoinPurchaseListener();
    void refreshCoinWallet({ force: true }).then(() => {
      // Finish any purchase that was paid before the app was closed.
      if (isCoinBillingActive(getCoinWalletState().wallet)) restoreCoinPurchases();
    });
    void resumeWebCheckoutIfReturned();
    const refresh = () => {
      if (!document.hidden) void refreshCoinWallet();
    };
    // Speech recognition is charged by mingle-stt, not by a response this page sees.
    const timer = window.setInterval(refresh, WALLET_POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      stopPurchases();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [signedIn]);

  useEffect(() => subscribeCoinUi((event) => {
    if (event.type === "open_store") {
      setExhaustedOpen(false);
      setStoreOpen(true);
    } else if (!storeOpen) {
      setExhaustedOpen(true);
    }
  }), [storeOpen]);

  if (!signedIn) return null;

  return (
    <>
      <CoinExhaustedSheet
        open={exhaustedOpen}
        onClose={() => setExhaustedOpen(false)}
        onCharge={() => {
          setExhaustedOpen(false);
          setStoreOpen(true);
        }}
        locale={locale}
      />
      <CoinStorePanel open={storeOpen} onClose={() => setStoreOpen(false)} locale={locale} />
    </>
  );
}
