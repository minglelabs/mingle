"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import HashSeedIcon from "@/components/coins/hash-seed-icon";
import type { AppLocale } from "@/i18n";
import { resolveLegalDocumentLocale } from "@/i18n/config";
import { fillCoinCopy, getCoinCopy } from "@/i18n/coin-copy";
import { buildClientApiPath } from "@/lib/api-contract";
import { openCoinStore, refreshCoinWallet } from "@/lib/coin-wallet-client";

type GiftInfo = { giftableCoins: number; feePercent: number };

type CoinGiftSheetProps = {
  open: boolean;
  onClose: () => void;
  recipientId: string;
  recipientName: string;
  locale: AppLocale;
};

/**
 * Gift Hash to the user whose profile is open. Only purchased Hash can be
 * gifted; the fee comes out of the amount, so the sheet shows what arrives.
 */
export default function CoinGiftSheet(props: CoinGiftSheetProps) {
  // Mounted per opening, so every opening starts from an empty form.
  return props.open ? <CoinGiftSheetBody {...props} /> : null;
}

function CoinGiftSheetBody({ onClose, recipientId, recipientName, locale }: CoinGiftSheetProps) {
  const copy = getCoinCopy(locale);
  const displayLocale = resolveLegalDocumentLocale(locale);
  const [info, setInfo] = useState<GiftInfo | null>(null);
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "failed">("idle");
  const [sentCoins, setSentCoins] = useState<number | null>(null);
  // One key per attempt at one amount, so a retry after a lost response never sends twice.
  const idempotencyKey = useRef("");
  const giftPath = buildClientApiPath(`/users/${encodeURIComponent(recipientId)}/gift`);

  useEffect(() => {
    let cancelled = false;
    void fetch(giftPath, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() as Promise<GiftInfo> : null))
      .then((data) => {
        if (!cancelled) setInfo(data ?? { giftableCoins: 0, feePercent: 10 });
      })
      .catch(() => {
        if (!cancelled) setInfo({ giftableCoins: 0, feePercent: 10 });
      });
    return () => {
      cancelled = true;
    };
  }, [giftPath]);

  if (typeof document === "undefined") return null;

  const format = (value: number) => new Intl.NumberFormat(displayLocale, { maximumFractionDigits: 2 }).format(value);
  const coins = Number.parseInt(amount, 10) || 0;
  const notEnough = info !== null && coins > info.giftableCoins;
  const canSend = info !== null && coins >= 1 && !notEnough && status !== "sending";
  // Tenths of a coin are exact: the fee is a whole percentage of whole coins.
  const received = info ? (coins * (100 - info.feePercent)) / 100 : 0;

  const send = async () => {
    if (!canSend) return;
    setStatus("sending");
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    try {
      const response = await fetch(giftPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coins, idempotencyKey: idempotencyKey.current }),
      });
      const data = await response.json().catch(() => ({})) as { giftableCoins?: number; sentCoins?: number };
      if (!response.ok) {
        // A definite answer: the next attempt is a new gift.
        idempotencyKey.current = "";
        if (typeof data.giftableCoins === "number") setInfo((current) => current && { ...current, giftableCoins: data.giftableCoins! });
        setStatus("failed");
        return;
      }
      setSentCoins(data.sentCoins ?? coins);
      setStatus("idle");
      void refreshCoinWallet({ force: true });
    } catch {
      // The response was lost: keep the key so a retry cannot send twice.
      setStatus("failed");
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={fillCoinCopy(copy.giftTitle, { name: recipientName })}
      onClick={status === "sending" ? undefined : onClose}
    >
      <div
        className="w-full rounded-t-3xl bg-white px-5 pt-6 text-slate-950"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <HashSeedIcon size={26} />
        </div>
        {sentCoins !== null ? (
          <>
            <h2 className="mt-3 text-center text-[17px] font-bold leading-snug" role="status">
              {fillCoinCopy(copy.giftSuccess, { name: recipientName, coins: format(sentCoins) })}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 flex min-h-12 w-full items-center justify-center rounded-full bg-slate-900 text-[15px] font-bold text-white transition active:bg-slate-700"
            >
              {copy.close}
            </button>
          </>
        ) : (
          <>
            <h2 className="mt-3 text-center text-[19px] font-bold">{fillCoinCopy(copy.giftTitle, { name: recipientName })}</h2>
            <p className="mt-1.5 text-center text-[13px] leading-relaxed text-gray-600">{copy.giftRule}</p>
            <p className="mt-1 text-center text-[12px] leading-relaxed text-gray-500">{copy.giftRefundNotice}</p>

            <label className="mt-4 block">
              <span className="flex items-baseline justify-between text-[13px] font-semibold text-gray-600">
                {copy.giftAmountLabel}
                <span className="tabular-nums text-gray-500">
                  {info ? fillCoinCopy(copy.giftAvailable, { coins: format(info.giftableCoins) }) : "…"}
                </span>
              </span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                value={amount}
                placeholder="0"
                onChange={(event) => {
                  setAmount(event.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 12));
                  idempotencyKey.current = "";
                  if (status === "failed") setStatus("idle");
                }}
                className="mt-1.5 h-12 w-full rounded-xl border border-gray-200 px-4 text-[18px] font-bold tabular-nums outline-none focus:border-amber-400"
              />
            </label>

            <p
              className={`mt-2 min-h-[20px] text-[13px] font-semibold ${notEnough || status === "failed" ? "text-red-500" : "text-amber-700"}`}
              role={notEnough || status === "failed" ? "alert" : undefined}
            >
              {notEnough
                ? copy.giftNotEnough
                : status === "failed"
                  ? copy.giftFailed
                  : info && coins >= 1
                    ? fillCoinCopy(copy.giftFeeNotice, { fee: info.feePercent, coins: format(received) })
                    : ""}
            </p>

            <button
              type="button"
              onClick={() => void send()}
              disabled={!canSend}
              className="mt-3 flex min-h-12 w-full items-center justify-center rounded-full bg-slate-900 text-[15px] font-bold text-white transition active:bg-slate-700 disabled:opacity-40"
            >
              {status === "sending" ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : copy.gift}
            </button>
            {notEnough || info?.giftableCoins === 0 ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  openCoinStore();
                }}
                className="mt-1 flex min-h-11 w-full items-center justify-center text-[14px] font-semibold text-amber-700"
              >
                {copy.charge}
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                disabled={status === "sending"}
                className="mt-1 flex min-h-11 w-full items-center justify-center text-[14px] font-semibold text-gray-500"
              >
                {copy.close}
              </button>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
