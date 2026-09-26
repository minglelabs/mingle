"use client";

import { accountBadgeCopy } from "@/i18n/account-badge-copy";
import { BadgeCheck } from "lucide-react";

type OfficialBadgeProps = {
  locale: string;
  /**
   * `light` = on a dark surface or photo (white badge), `dark` = on a light
   * surface. Pass the post's `postForegroundTone(...)` on feed cards; lists on
   * a normal page surface use `dark`.
   */
  tone?: "light" | "dark";
  className?: string;
};

/**
 * Small "Official" badge next to an operator account's name (spec item 84).
 * Single component for the feed card, comments and profiles, so the marking
 * reads the same everywhere. Render it only when `author.isOfficial` is true.
 */
export default function OfficialBadge({ locale, tone = "dark", className }: OfficialBadgeProps) {
  const copy = accountBadgeCopy(locale);
  const toneClass =
    tone === "light"
      ? "bg-white/20 text-white ring-1 ring-white/40"
      : "bg-sky-50 text-sky-700 ring-1 ring-sky-200";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${toneClass} ${className ?? ""}`}
      title={copy.officialDescription}
    >
      <BadgeCheck size={11} strokeWidth={2.4} aria-hidden="true" />
      <span aria-hidden="true">{copy.official}</span>
      <span className="sr-only">{copy.officialDescription}</span>
    </span>
  );
}
