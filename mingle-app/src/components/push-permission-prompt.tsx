"use client";

import { Bell } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/i18n";
import { resolvePushPromptCopy } from "@/i18n/push-prompt-copy";
import { postNativePushRegister } from "@/lib/native-push";
import { captureMingleClientEvent } from "@/lib/posthog-client";
import { PUSH_PROMPT_CLOSED_EVENT, PUSH_PROMPT_DUE_EVENT, isPushPromptHeld, releasePushPrompt } from "@/lib/push-prompt";
import { useNativeBannerSuppression } from "@/lib/use-native-banner-suppression";

/**
 * Says why before the system asks: "Want to know when a friend replies?",
 * shown once after a new device's first conversation (see @/lib/push-prompt).
 * "Turn on notifications" lets the system prompt come up; "Not now" leaves the
 * hold to run out, and the app asks at a later launch.
 */
export default function PushPermissionPrompt() {
  const pathname = usePathname();
  const { status } = useSession();
  const pathLocale = pathname?.split("/")[1] ?? "";
  const locale = isSupportedLocale(pathLocale) ? pathLocale : DEFAULT_LOCALE;
  const copy = useMemo(() => resolvePushPromptCopy(locale), [locale]);
  const [open, setOpen] = useState(false);
  useNativeBannerSuppression(open);

  useEffect(() => {
    if (status !== "authenticated") return;
    const handleDue = () => {
      if (!isPushPromptHeld()) return;
      setOpen(true);
      captureMingleClientEvent("mingle_push_prompt", { step: "shown" });
    };
    window.addEventListener(PUSH_PROMPT_DUE_EVENT, handleDue);
    return () => window.removeEventListener(PUSH_PROMPT_DUE_EVENT, handleDue);
  }, [status]);

  const close = useCallback((allowed: boolean) => {
    setOpen(false);
    captureMingleClientEvent("mingle_push_prompt", { step: allowed ? "allowed" : "later" });
    if (allowed) {
      releasePushPrompt();
      // The system prompt comes up now, on a tap that asked for it.
      postNativePushRegister();
    }
    window.dispatchEvent(new CustomEvent(PUSH_PROMPT_CLOSED_EVENT, { detail: { allowed } }));
  }, []);

  if (!open) return null;

  return (
    <div
      data-qa="push-permission-prompt"
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
      className="fixed inset-0 z-[235] flex items-end justify-center bg-black/45"
      onClick={() => close(false)}
    >
      <div
        className="w-full max-w-[480px] rounded-t-[28px] bg-white px-5 pt-6 shadow-2xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-[#F97316]">
          <Bell size={26} strokeWidth={2.2} aria-hidden />
        </span>
        <h2 className="mt-4 text-[1.25rem] font-extrabold leading-snug text-gray-950">{copy.title}</h2>
        <p className="mt-2 text-[0.92rem] leading-relaxed text-gray-600">{copy.body}</p>
        <button
          type="button"
          data-qa="push-permission-prompt-allow"
          onClick={() => close(true)}
          className="mt-5 flex h-14 w-full items-center justify-center rounded-2xl bg-[#FBBC32] text-[1rem] font-extrabold text-slate-950 active:scale-[0.985]"
        >
          {copy.allow}
        </button>
        <button
          type="button"
          data-qa="push-permission-prompt-later"
          onClick={() => close(false)}
          className="mt-2 flex h-12 w-full items-center justify-center rounded-2xl text-[0.95rem] font-bold text-gray-500 active:bg-gray-100"
        >
          {copy.later}
        </button>
      </div>
    </div>
  );
}
