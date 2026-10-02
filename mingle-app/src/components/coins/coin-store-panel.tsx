"use client";

import { ChevronLeft, Coins, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import SlideSurface from "@/components/slide-surface";
import type { AppLocale } from "@/i18n";
import { resolveLegalDocumentLocale } from "@/i18n/config";
import { fillCoinCopy, getCoinCopy } from "@/i18n/coin-copy";
import {
  clearCoinPurchaseResult,
  loadCoinProducts,
  restoreCoinPurchases,
  startCoinPurchase,
  useCoinStore,
} from "@/lib/coin-purchase-client";
import { refreshCoinWallet, useCoinWallet } from "@/lib/coin-wallet-client";
import { formatCoinCount, useAnimatedCoinCount, useCoinClock } from "./coin-balance-chip";
import CoinUsageSection from "./coin-usage-section";

const DAY_MS = 24 * 60 * 60 * 1000;

function formatRemaining(ms: number, locale: string): string {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const unit = (value: number, name: "hour" | "minute") =>
    new Intl.NumberFormat(locale, { style: "unit", unit: name, unitDisplay: "short" }).format(value);
  if (hours > 0) return minutes > 0 ? `${unit(hours, "hour")} ${unit(minutes, "minute")}` : unit(hours, "hour");
  return unit(minutes, "minute");
}

/** The coin store (docs/coin-iap-spec.md 9.2): balance, daily free refill, products, usage. */
export default function CoinStorePanel({
  open,
  onClose,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  locale: AppLocale;
}) {
  const copy = getCoinCopy(locale);
  const displayLocale = resolveLegalDocumentLocale(locale);
  const { wallet } = useCoinWallet();
  const store = useCoinStore();
  const balance = useAnimatedCoinCount(wallet?.balance ?? 0);
  const [view, setView] = useState<"store" | "usage">("store");
  const now = useCoinClock(open);
  // Leaving always returns to the store view, so the next open starts there.
  const close = () => {
    setView("store");
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    void refreshCoinWallet({ force: true });
    void loadCoinProducts();
  }, [open]);

  // The refill became due while the store is open: fetch it.
  const nextGrantAt = wallet ? Date.parse(wallet.nextDailyGrantAt) : 0;
  useEffect(() => {
    if (open && nextGrantAt && nextGrantAt <= now) void refreshCoinWallet({ force: true });
  }, [nextGrantAt, now, open]);

  useEffect(() => {
    const result = store.lastResult;
    if (!result) return;
    if (result.kind === "success") {
      toast.success(fillCoinCopy(copy.purchaseSuccess, { coins: formatCoinCount(result.coins, locale) }));
      if (typeof navigator !== "undefined") navigator.vibrate?.(20);
    } else {
      toast.error(copy.purchaseFailed);
    }
    clearCoinPurchaseResult();
  }, [copy.purchaseFailed, copy.purchaseSuccess, locale, store.lastResult]);

  const remainingMs = Math.max(0, nextGrantAt - now);
  const refillProgress = Math.min(100, Math.max(0, Math.round(((DAY_MS - remainingMs) / DAY_MS) * 100)));
  const bestValueId = store.products.find((product) => product.badge === "best_value")?.productId;

  return (
    <SlideSurface
      open={open}
      onClose={close}
      ariaLabel={copy.storeTitle}
      nativeBackPriority={60}
      className="fixed inset-0 z-[120] flex min-h-0 w-full flex-col bg-white text-slate-950"
      style={{ touchAction: "pan-y" }}
    >
      <header
        className="grid shrink-0 grid-cols-[44px_1fr_44px] items-center border-b border-gray-100 px-4"
        style={{ height: "calc(54px + env(safe-area-inset-top, 44px))", paddingTop: "env(safe-area-inset-top, 44px)" }}
      >
        <button
          type="button"
          onClick={view === "usage" ? () => setView("store") : close}
          className="flex h-11 w-11 items-center justify-center rounded-full transition active:bg-gray-100"
          aria-label={copy.close}
        >
          <ChevronLeft size={24} strokeWidth={2} />
        </button>
        <h2 className="truncate text-center text-[17px] font-bold">{view === "usage" ? copy.usedCoins : copy.storeTitle}</h2>
        <span />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-10 pt-5">
        {view === "usage" ? <CoinUsageSection locale={locale} /> : (
          <div className="space-y-5">
            <section className="text-center" aria-live="polite">
              <p className="text-[12px] font-semibold text-gray-500">{copy.balanceLabel}</p>
              <p className="mt-1 flex items-center justify-center gap-2 text-[40px] font-bold leading-none tabular-nums">
                <Coins size={30} strokeWidth={2.2} className="text-amber-500" aria-hidden="true" />
                {formatCoinCount(balance, locale)}
              </p>
              {wallet ? (
                <p className="mt-2 text-[13px] text-gray-500">
                  {fillCoinCopy(copy.freePaid, {
                    free: formatCoinCount(wallet.freeBalance, locale),
                    paid: formatCoinCount(wallet.paidBalance, locale),
                  })}
                </p>
              ) : null}
            </section>

            {wallet ? (
              <section className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3.5">
                <p className="text-[14px] font-semibold text-amber-900">
                  {wallet.dailyFreeFull
                    ? copy.dailyFull
                    : fillCoinCopy(copy.dailyTitle, { cap: formatCoinCount(wallet.dailyFreeCap, locale) })}
                </p>
                {!wallet.dailyFreeFull ? (
                  <>
                    <p className="mt-0.5 text-[12px] text-amber-800">
                      {fillCoinCopy(copy.dailyNext, { time: formatRemaining(remainingMs, displayLocale) })}
                    </p>
                    <div
                      className="mt-2 h-1.5 overflow-hidden rounded-full bg-amber-200"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={refillProgress}
                    >
                      <div className="h-full rounded-full bg-amber-500 transition-[width]" style={{ width: `${refillProgress}%` }} />
                    </div>
                  </>
                ) : null}
              </section>
            ) : null}

            <section>
              {store.status === "loading" || store.status === "idle" ? (
                <div className="flex justify-center py-8 text-gray-400"><Loader2 size={24} className="animate-spin" aria-hidden="true" /></div>
              ) : store.status === "unavailable" ? (
                <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-[13px] text-gray-600">{copy.updateRequired}</p>
              ) : store.status === "error" ? (
                <div className="rounded-xl bg-gray-50 px-4 py-5 text-center">
                  <p className="text-[13px] text-gray-600" role="alert">{copy.productsLoadError}</p>
                  <button
                    type="button"
                    onClick={() => void loadCoinProducts()}
                    className="mt-3 inline-flex min-h-11 items-center rounded-full border border-gray-300 px-5 text-[13px] font-semibold"
                  >
                    {copy.retry}
                  </button>
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {store.products.map((product) => {
                    const purchasing = store.purchasingProductId === product.productId;
                    const pending = store.pendingProductIds.includes(product.productId);
                    const bonusPercent = product.coins > 0 ? Math.round((product.bonusCoins / product.coins) * 100) : 0;
                    const minutes = store.sttCoinsPerMinute > 0 ? Math.floor(product.totalCoins / store.sttCoinsPerMinute) : 0;
                    const recommended = product.productId === bestValueId;
                    return (
                      <li
                        key={product.productId}
                        className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 ${recommended ? "border-amber-300 bg-amber-50/60" : "border-gray-200 bg-white"}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 text-[17px] font-bold tabular-nums">
                            <Coins size={17} strokeWidth={2.3} className="text-amber-500" aria-hidden="true" />
                            {formatCoinCount(product.totalCoins, locale)}
                            {bonusPercent > 0 ? (
                              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700">+{bonusPercent}%</span>
                            ) : null}
                            {recommended ? (
                              <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[11px] font-bold text-white">{copy.recommended}</span>
                            ) : null}
                          </p>
                          <p className="mt-0.5 text-[12px] text-gray-500">
                            {pending
                              ? copy.purchasePending
                              : minutes > 0
                                ? fillCoinCopy(copy.minutesHint, { minutes: formatCoinCount(minutes, locale) })
                                : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={Boolean(store.purchasingProductId) || pending}
                          onClick={() => startCoinPurchase(product.productId)}
                          aria-label={`${formatCoinCount(product.totalCoins, locale)} ${copy.coin} ${product.displayPrice ?? ""}`}
                          className="flex min-h-11 min-w-[92px] shrink-0 items-center justify-center rounded-full bg-slate-900 px-4 text-[14px] font-bold text-white transition active:bg-slate-700 disabled:opacity-50"
                        >
                          {purchasing ? <Loader2 size={17} className="animate-spin" aria-label={copy.purchasing} /> : product.displayPrice}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="space-y-1 border-t border-gray-100 pt-3">
              <button
                type="button"
                onClick={() => setView("usage")}
                className="flex min-h-11 w-full items-center justify-between text-left text-[14px] font-semibold text-slate-800"
              >
                {copy.viewUsage}
                <ChevronLeft size={18} className="rotate-180 text-gray-400" aria-hidden="true" />
              </button>
              {store.status === "ready" ? (
                <button
                  type="button"
                  onClick={restoreCoinPurchases}
                  className="flex min-h-11 w-full items-center text-left text-[14px] font-semibold text-slate-800"
                >
                  {copy.restore}
                </button>
              ) : null}
              <p className="pt-1 text-[12px] leading-relaxed text-gray-500">{copy.terms}</p>
            </section>
          </div>
        )}
      </div>
    </SlideSurface>
  );
}
