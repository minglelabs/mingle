"use client";

import { BadgeCheck } from "lucide-react";
import { accountBadgeCopy } from "@/i18n/account-badge-copy";
import type { AccountBadgeKind } from "@/lib/account-badge";

export type AccountBadgeTone = "light" | "dark";

export type AccountBadgeProps = {
  /**
   * Always `resolveAccountBadge(user)` (`@/lib/account-badge`), never a flag
   * read by hand. Nothing renders for `null`.
   */
  kind: AccountBadgeKind | null | undefined;
  /** UI locale; any language tag (unknown → English). */
  locale: string;
  /**
   * `light` = on a dark surface or photo (white badge), `dark` = on a light
   * surface. Pass the post's `postForegroundTone(...)` on feed cards; lists on
   * a normal page surface use `dark`.
   */
  tone?: AccountBadgeTone;
  className?: string;
};

const CHIP_CLASS =
  "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none";

/**
 * The account badge next to another user's name. Shows the "Official" chip
 * for the Mingle team's own account.
 */
export default function AccountBadge({ kind, locale, tone = "dark", className }: AccountBadgeProps) {
  if (kind === "official") return <OfficialBadge locale={locale} tone={tone} className={className} />;
  return null;
}

function OfficialBadge({ locale, tone, className }: { locale: string; tone: AccountBadgeTone; className?: string }) {
  const copy = accountBadgeCopy(locale);
  const toneClass =
    tone === "light"
      ? "bg-white/20 text-white ring-1 ring-white/40"
      : "bg-sky-50 text-sky-700 ring-1 ring-sky-200";
  return (
    <span
      data-account-badge="official"
      className={`${CHIP_CLASS} ${toneClass} ${className ?? ""}`}
      title={copy.officialDescription}
    >
      <BadgeCheck size={11} strokeWidth={2.4} aria-hidden="true" />
      <span aria-hidden="true">{copy.official}</span>
      <span className="sr-only">{copy.officialDescription}</span>
    </span>
  );
}
