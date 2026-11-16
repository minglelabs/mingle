"use client";

import { Clock3, Loader2, Ticket } from "lucide-react";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveInviteGateCopy } from "@/i18n/invite-gate-copy";
import { buildClientApiPath } from "@/lib/api-contract";
import { captureMingleClientEvent } from "@/lib/posthog-client";
import { useNativeBannerSuppression } from "@/lib/use-native-banner-suppression";

type Access = { allowed: boolean; reason: string };

/** Asks the server whether the signed-in account may use the app (null until known). */
export function useAppAccess(enabled: boolean, locale: string): { access: Access | null; setAccess: (next: Access) => void } {
  const [access, setAccess] = useState<Access | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetch(`${buildClientApiPath("/account/access")}?locale=${encodeURIComponent(locale)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: Access | null) => {
        // Any failure opens the app: the gate must never lock someone out by mistake.
        if (!cancelled) setAccess(body && typeof body.allowed === "boolean" ? body : { allowed: true, reason: "unknown" });
      })
      .catch(() => {
        if (!cancelled) setAccess({ allowed: true, reason: "unknown" });
      });
    return () => { cancelled = true; };
  }, [enabled, locale]);
  return { access: enabled ? access : null, setAccess };
}

/**
 * Shown over the app after sign-in when the account needs an invite
 * (INVITE_GATE on the server, for the app languages in INVITE_GATE_LOCALES):
 * enter a friend's invite code, or wait: the account is already on the
 * waitlist (the server puts it there) until an admin lets it in.
 * Accepting the code pays both sides the usual invite reward.
 */
export default function InviteGate({ locale, onAccess }: { locale: string; onAccess: (access: Access) => void }) {
  const copy = useMemo(() => resolveInviteGateCopy(locale), [locale]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waitlistBusy, setWaitlistBusy] = useState(false);
  // The native banner draws above the WebView and would cover the gate.
  useNativeBannerSuppression(true);

  useEffect(() => {
    captureMingleClientEvent("mingle_first_run_step", { step: "invite_gate_shown" });
  }, []);

  const submit = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(buildClientApiPath("/account/access"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed, locale }),
      });
      const body = await response.json().catch(() => ({})) as Partial<Access> & { error?: string };
      if (response.ok && body.allowed) {
        captureMingleClientEvent("mingle_first_run_step", { step: "invite_gate_passed" });
        onAccess({ allowed: true, reason: body.reason ?? "invited" });
        return;
      }
      setError(body.error === "not_found" || body.error === "invalid_code" ? copy.errorNotFound
        : body.error === "own_code" ? copy.errorOwn
          : copy.errorGeneric);
    } catch {
      setError(copy.errorGeneric);
    } finally {
      setBusy(false);
    }
  }, [busy, code, copy, locale, onAccess]);

  const checkTurn = useCallback(async () => {
    if (waitlistBusy) return;
    setWaitlistBusy(true);
    try {
      const response = await fetch(`${buildClientApiPath("/account/access")}?locale=${encodeURIComponent(locale)}`, { cache: "no-store" });
      const body = response.ok ? await response.json() as Partial<Access> : null;
      if (body && typeof body.allowed === "boolean") onAccess({ allowed: body.allowed, reason: body.reason ?? "unknown" });
    } catch {
      // Stays on the waitlist card; the next tap tries again.
    } finally {
      setWaitlistBusy(false);
    }
  }, [locale, onAccess, waitlistBusy]);

  return (
    <div
      data-qa="invite-gate"
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
      className="absolute inset-0 z-[210] flex flex-col overflow-y-auto bg-gradient-to-b from-[#FBBC32] to-[#F97316] px-6"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 72px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
    >
      <div className="flex flex-1 flex-col items-center text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/90 text-[#F97316] shadow-lg">
          <Ticket size={30} strokeWidth={2.2} aria-hidden />
        </span>
        <h1 className="mt-6 text-[1.5rem] font-extrabold leading-tight text-slate-950">{copy.title}</h1>
        <p className="mt-3 max-w-[340px] text-[0.95rem] leading-relaxed text-slate-900/80">{copy.body}</p>
        <form
          className="mt-8 w-full max-w-[360px]"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder={copy.placeholder}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={32}
            data-qa="invite-gate-code"
            className="h-14 w-full rounded-2xl border-0 bg-white px-4 text-center text-[1.15rem] font-bold tracking-[0.12em] text-slate-950 shadow-sm outline-none placeholder:font-semibold placeholder:tracking-normal placeholder:text-slate-400 focus:ring-2 focus:ring-slate-950/20"
          />
          {error ? <p role="alert" className="mt-2 text-[0.85rem] font-semibold text-red-800">{error}</p> : null}
          <button
            type="submit"
            disabled={busy || !code.trim()}
            className="mt-3 flex h-14 w-full items-center justify-center rounded-2xl bg-slate-950 text-[1rem] font-extrabold text-white transition active:scale-[0.985] disabled:opacity-50"
          >
            {busy ? <Loader2 size={20} className="animate-spin" aria-hidden /> : copy.submit}
          </button>
        </form>

        <div className="mt-8 w-full max-w-[360px]" data-qa="invite-gate-waitlist">
          <div className="rounded-2xl bg-white/85 px-5 py-4 text-left shadow-sm">
            <p className="flex items-center gap-2 text-[1rem] font-extrabold text-slate-950">
              <Clock3 size={18} strokeWidth={2.4} aria-hidden />
              {copy.waitlistedTitle}
            </p>
            <p className="mt-1.5 text-[0.88rem] leading-relaxed text-slate-700">{copy.waitlistedBody}</p>
            <button
              type="button"
              onClick={() => void checkTurn()}
              disabled={waitlistBusy}
              className="mt-3 flex h-11 w-full items-center justify-center rounded-xl bg-slate-950/5 text-[0.92rem] font-bold text-slate-900 transition active:bg-slate-950/10 disabled:opacity-60"
            >
              {waitlistBusy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : copy.waitlistCheck}
            </button>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void signOut()}
        className="mx-auto mt-6 text-[0.9rem] font-semibold text-slate-900/70 underline underline-offset-4"
      >
        {copy.signOut}
      </button>
    </div>
  );
}
