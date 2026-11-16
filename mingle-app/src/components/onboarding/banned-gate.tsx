"use client";

import { Ban } from "lucide-react";
import { signOut } from "next-auth/react";
import { useMemo } from "react";
import { resolveBannedGateCopy } from "@/i18n/banned-gate-copy";
import { useNativeBannerSuppression } from "@/lib/use-native-banner-suppression";

/**
 * Shown over the app when the server answers /account/access with "banned":
 * the account, or the device it is on, was permanently banned. The only way
 * out is signing out; signing in again is refused.
 */
export default function BannedGate({ locale }: { locale: string }) {
  const copy = useMemo(() => resolveBannedGateCopy(locale), [locale]);
  // The native banner draws above the WebView and would cover the gate.
  useNativeBannerSuppression(true);

  return (
    <div
      data-qa="banned-gate"
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
      className="absolute inset-0 z-[210] flex flex-col overflow-y-auto bg-slate-950 px-6"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 72px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
    >
      <div className="flex flex-1 flex-col items-center text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10 text-rose-400">
          <Ban size={30} strokeWidth={2.2} aria-hidden />
        </span>
        <h1 className="mt-6 text-[1.5rem] font-extrabold leading-tight text-white">{copy.title}</h1>
        <p className="mt-3 max-w-[340px] text-[0.95rem] leading-relaxed text-white/75">{copy.body}</p>
      </div>
      <button
        type="button"
        onClick={() => void signOut()}
        className="mx-auto mt-6 flex h-14 w-full max-w-[360px] items-center justify-center rounded-2xl bg-white text-[1rem] font-extrabold text-slate-950 transition active:scale-[0.985]"
      >
        {copy.signOut}
      </button>
    </div>
  );
}
