"use client";

import { Loader2, Ticket } from "lucide-react";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveInviteGateCopy } from "@/i18n/invite-gate-copy";
import { buildClientApiPath } from "@/lib/api-contract";
import { captureMingleClientEvent } from "@/lib/posthog-client";
import { useNativeBannerSuppression } from "@/lib/use-native-banner-suppression";

type Access = { allowed: boolean; reason: string };

/** Asks the server whether the signed-in account may use the app (null until known). */
export function useAppAccess(enabled: boolean): { access: Access | null; setAccess: (next: Access) => void } {
  const [access, setAccess] = useState<Access | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetch(buildClientApiPath("/account/access"), { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: Access | null) => {
        // Any failure opens the app: the gate must never lock someone out by mistake.
        if (!cancelled) setAccess(body && typeof body.allowed === "boolean" ? body : { allowed: true, reason: "unknown" });
      })
      .catch(() => {
        if (!cancelled) setAccess({ allowed: true, reason: "unknown" });
      });
    return () => { cancelled = true; };
  }, [enabled]);
  return { access: enabled ? access : null, setAccess };
}

/**
 * Shown over the app after sign-in when the account needs an invite
 * (INVITE_GATE on the server): enter a friend's invite code, or sign out.
 * Accepting the code pays both sides the usual invite reward.
 */
export default function InviteGate({ locale, onAllowed }: { locale: string; onAllowed: (access: Access) => void }) {
  const copy = useMemo(() => resolveInviteGateCopy(locale), [locale]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        body: JSON.stringify({ code: trimmed }),
      });
      const body = await response.json().catch(() => ({})) as Partial<Access> & { error?: string };
      if (response.ok && body.allowed) {
        captureMingleClientEvent("mingle_first_run_step", { step: "invite_gate_passed" });
        onAllowed({ allowed: true, reason: body.reason ?? "invited" });
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
  }, [busy, code, copy, onAllowed]);

  return (
    <div
      data-qa="invite-gate"
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
      className="absolute inset-0 z-[210] flex flex-col bg-gradient-to-b from-[#FBBC32] to-[#F97316] px-6"
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
      </div>
      <button
        type="button"
        onClick={() => void signOut()}
        className="mx-auto text-[0.9rem] font-semibold text-slate-900/70 underline underline-offset-4"
      >
        {copy.signOut}
      </button>
    </div>
  );
}
