"use client";

import { X } from "lucide-react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import HashSeedIcon from "@/components/coins/hash-seed-icon";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/i18n";
import { fillDmOpenCoins, resolveDmOpenCoinsCopy } from "@/i18n/dm-open-coins-copy";
import { buildClientApiPath } from "@/lib/api-contract";
import { openCoinStore, refreshCoinWallet } from "@/lib/coin-wallet-client";
import { registerDmOpenCoinsHandler, type DmOpenAnswer } from "@/lib/dm-open-coins";
import { captureMingleClientEvent } from "@/lib/posthog-client";
import { useNativeBannerSuppression } from "@/lib/use-native-banner-suppression";

type PendingRequest = { answer: DmOpenAnswer; resolve: (ok: boolean) => void };

const ATTENDANCE_DAY_KEY = "mingle_attendance_day_v1";

function kstDay(now: number): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Hash for new rooms and for showing up (owner, 2026-11-26): the question
 * before a man opens a new room with a woman (@/lib/dm-open-coins), and,
 * once a day when the app opens, the attendance pay and the Hash of rooms
 * that went unanswered (POST /coins/attendance), each told in a toast.
 */
export default function DmOpenCoinsGate() {
  const pathname = usePathname();
  const pathLocale = pathname?.split("/")[1] ?? "";
  const locale = isSupportedLocale(pathLocale) ? pathLocale : DEFAULT_LOCALE;
  const copy = useMemo(() => resolveDmOpenCoinsCopy(locale), [locale]);

  const [request, setRequest] = useState<PendingRequest | null>(null);
  const requestRef = useRef<PendingRequest | null>(null);
  useNativeBannerSuppression(request !== null);

  useEffect(() => registerDmOpenCoinsHandler((answer) => new Promise<boolean>((resolve) => {
    if (requestRef.current) {
      resolve(false);
      return;
    }
    const next = { answer, resolve };
    requestRef.current = next;
    setRequest(next);
    captureMingleClientEvent("mingle_dm_open_coins", { step: "shown", kind: answer.kind, coins: answer.coins });
  })), []);

  const finish = useCallback((ok: boolean) => {
    const current = requestRef.current;
    requestRef.current = null;
    current?.resolve(ok);
    setRequest(null);
    if (current) captureMingleClientEvent("mingle_dm_open_coins", { step: ok ? "accepted" : "closed", kind: current.answer.kind });
    if (ok) void refreshCoinWallet({ force: true });
  }, []);

  // ---- once a day: attendance, and Hash back from unanswered rooms ----
  const { status } = useSession();
  useEffect(() => {
    if (status !== "authenticated") return;
    const today = kstDay(Date.now());
    try {
      if (window.localStorage.getItem(ATTENDANCE_DAY_KEY) === today) return;
    } catch {
      // No storage: ask anyway; the server pays once a day.
    }
    let cancelled = false;
    void fetch(buildClientApiPath("/coins/attendance"), { method: "POST" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { attendance?: { status?: string; day?: number; coins?: number; bonus?: number }; refunded?: { refundedCoins?: number } } | null) => {
        if (cancelled || !body) return;
        try {
          window.localStorage.setItem(ATTENDANCE_DAY_KEY, today);
        } catch {
          // Asked again next time; nothing is paid twice.
        }
        const attendance = body.attendance;
        let changed = false;
        if (attendance?.status === "granted" && typeof attendance.day === "number" && typeof attendance.coins === "number") {
          toast(fillDmOpenCoins(copy.attendance, { day: attendance.day, coins: attendance.coins }));
          if (typeof attendance.bonus === "number" && attendance.bonus > 0) {
            toast(fillDmOpenCoins(copy.attendanceBonus, { bonus: attendance.bonus }));
          }
          changed = true;
        }
        const refundedCoins = body.refunded?.refundedCoins ?? 0;
        if (refundedCoins > 0) {
          toast(fillDmOpenCoins(copy.refunded, { coins: refundedCoins }));
          changed = true;
        }
        if (changed) void refreshCoinWallet({ force: true });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [copy, status]);

  if (!request) return null;
  const { answer } = request;
  const short = answer.kind === "short";
  return (
    <div
      data-qa="dm-open-coins-gate"
      data-kind={answer.kind}
      role="dialog"
      aria-modal="true"
      aria-label={short ? copy.shortTitle : copy.title}
      className="keyboard-safe fixed inset-0 z-[230] flex items-end justify-center bg-black/45"
      onClick={(event) => {
        if (event.target === event.currentTarget) finish(false);
      }}
    >
      <div
        className="relative w-full max-w-[480px] rounded-t-[28px] bg-white px-5 pt-6 shadow-2xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
      >
        <button
          type="button"
          aria-label={copy.cancel}
          onClick={() => finish(false)}
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-gray-500 active:bg-gray-100"
        >
          <X size={20} strokeWidth={2.2} />
        </button>
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50">
          <HashSeedIcon size={28} />
        </span>
        <h2 className="mt-4 text-[1.2rem] font-bold text-gray-950">{short ? copy.shortTitle : copy.title}</h2>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-gray-600">
          {fillDmOpenCoins(short ? copy.shortBody : copy.body, { coins: answer.coins, hours: answer.refundHours, balance: answer.balance })}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            data-qa={short ? "dm-open-coins-buy" : "dm-open-coins-confirm"}
            onClick={() => {
              if (short) {
                finish(false);
                openCoinStore();
              } else {
                finish(true);
              }
            }}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#F97316] text-[1rem] font-semibold text-white active:bg-orange-600"
          >
            {!short ? <HashSeedIcon size={18} /> : null}
            {short ? copy.buy : fillDmOpenCoins(copy.confirm, { coins: answer.coins })}
          </button>
          <button
            type="button"
            data-qa="dm-open-coins-cancel"
            onClick={() => finish(false)}
            className="h-12 w-full rounded-2xl text-[0.95rem] font-medium text-gray-500 active:bg-gray-50"
          >
            {copy.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
