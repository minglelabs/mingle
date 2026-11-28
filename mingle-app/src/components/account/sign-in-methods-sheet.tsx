"use client";

import { Loader2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveSignInMethodsCopy } from "@/i18n/sign-in-methods-copy";
import { buildClientApiPath } from "@/lib/api-contract";

type Method =
  | { kind: "account"; id: string; provider: "apple" | "google"; detachable: boolean }
  | { kind: "email"; email: string; detachable: false }
  | { kind: "phone"; own: true; last4: string; detachable: false }
  | { kind: "phone"; own: false; id: string; last4: string; detachable: true };

const PROVIDER_LABEL = { apple: "Apple", google: "Google" } as const;

/**
 * Settings → sign-in methods: every way into this account. A method or extra
 * number that was attached later (another sign-in on this phone was folded
 * into this account) can be taken off here by the owner.
 */
export default function SignInMethodsSheet({ locale, onClose }: { locale: string; onClose: () => void }) {
  const copy = useMemo(() => resolveSignInMethodsCopy(locale), [locale]);
  const [methods, setMethods] = useState<Method[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(buildClientApiPath("/account/sign-in-methods"), { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { methods?: Method[] } | null) => {
        if (!cancelled) setMethods(Array.isArray(body?.methods) ? body.methods : []);
      })
      .catch(() => {
        if (!cancelled) setMethods([]);
      });
    return () => { cancelled = true; };
  }, []);

  // The method waiting for a yes. window.confirm shows nothing in the app's WebView, so the question is drawn here.
  const [pending, setPending] = useState<{ kind: "account" | "phone"; id: string } | null>(null);

  const remove = useCallback(async (kind: "account" | "phone", id: string) => {
    if (busyKey) return;
    setPending(null);
    setBusyKey(`${kind}:${id}`);
    setNotice(null);
    try {
      const response = await fetch(buildClientApiPath("/account/sign-in-methods"), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id }),
      });
      const body = await response.json().catch(() => ({})) as { methods?: Method[] };
      if (!response.ok || !Array.isArray(body.methods)) {
        setNotice(copy.failed);
        return;
      }
      setMethods(body.methods);
      setNotice(copy.removed);
    } catch {
      setNotice(copy.failed);
    } finally {
      setBusyKey(null);
    }
  }, [busyKey, copy.failed, copy.removed]);

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={copy.title} data-qa="sign-in-methods-sheet">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label={copy.close} onClick={onClose} />
      <div
        className="relative w-full max-w-[480px] rounded-t-3xl bg-white px-5 pt-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold text-slate-950">{copy.title}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{copy.body}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={copy.close} className="-mr-2 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 active:bg-slate-100">
            <X size={20} aria-hidden />
          </button>
        </div>

        {methods === null ? (
          <div className="flex h-24 items-center justify-center text-slate-400"><Loader2 className="animate-spin" size={22} aria-hidden /></div>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {methods.map((method) => {
              const label = method.kind === "account" ? PROVIDER_LABEL[method.provider]
                : method.kind === "email" ? method.email
                  : (method.own ? copy.phone : copy.extraPhone).replace("{last4}", method.last4);
              const target = !method.detachable ? null
                : method.kind === "account" ? { kind: "account" as const, id: method.id }
                  : method.kind === "phone" && !method.own ? { kind: "phone" as const, id: method.id }
                    : null;
              const key = target ? `${target.kind}:${target.id}` : `${method.kind}:${label}`;
              return (
                <li key={key} className="flex min-h-[52px] items-center gap-3 px-4 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-slate-900">{label}</p>
                    {target ? <p className="text-[12px] text-amber-700">{copy.addedLater}</p> : null}
                  </div>
                  {target ? (
                    <button
                      type="button"
                      disabled={busyKey !== null}
                      onClick={() => { setNotice(null); setPending(target); }}
                      className="flex h-9 shrink-0 items-center rounded-full border border-rose-200 px-3.5 text-[13px] font-semibold text-rose-600 active:bg-rose-50 disabled:opacity-50"
                    >
                      {busyKey === key ? <Loader2 className="animate-spin" size={15} aria-hidden /> : copy.remove}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {pending ? (
          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3" role="alertdialog" aria-label={copy.removeConfirm} data-qa="sign-in-method-remove-confirm">
            <p className="text-[13px] leading-relaxed text-slate-800">{copy.removeConfirm}</p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setPending(null)} className="flex h-10 flex-1 items-center justify-center rounded-full border border-slate-200 bg-white text-[13px] font-semibold text-slate-700 active:bg-slate-100">
                {copy.close}
              </button>
              <button type="button" onClick={() => void remove(pending.kind, pending.id)} className="flex h-10 flex-1 items-center justify-center rounded-full bg-rose-600 text-[13px] font-semibold text-white active:bg-rose-700">
                {copy.remove}
              </button>
            </div>
          </div>
        ) : null}
        {notice ? <p className="mt-3 text-[13px] text-slate-700" role="status">{notice}</p> : null}
      </div>
    </div>
  );
}
