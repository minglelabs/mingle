import { Mars, Venus } from "lucide-react";
import type { AppLocale } from "@/i18n";
import { formatProfileAge } from "@/i18n/profile-age-copy";
import { profileGenderLabel } from "@/i18n/profile-gender-copy";
import { normalizeProfileGender, type ProfileGender } from "@/lib/profile-gender";

const TONE_CLASS: Record<ProfileGender | "unknown", string> = {
  female: "bg-[#FF5E8E] text-white",
  male: "bg-[#3B9BFF] text-white",
  unknown: "bg-slate-200 text-slate-600",
};

/**
 * Gender + age pill next to a profile's name: pink ♀ / blue ♂ with the age,
 * so both read at a glance. Without a gender it falls back to a plain gray age pill.
 */
export default function ProfileGenderAgeBadge({
  gender,
  age,
  locale,
  className = "",
}: {
  gender?: string | null;
  age?: number | null;
  locale: AppLocale;
  className?: string;
}) {
  const normalizedGender = normalizeProfileGender(gender);
  const ageLabel = formatProfileAge(age, locale);
  const hasAge = ageLabel !== null && typeof age === "number";
  if (!normalizedGender && !hasAge) return null;

  const genderLabel = normalizedGender ? profileGenderLabel(normalizedGender, locale) : null;
  const accessibleLabel = [genderLabel, ageLabel].filter(Boolean).join(", ");
  const Icon = normalizedGender === "female" ? Venus : normalizedGender === "male" ? Mars : null;

  return (
    <span
      role="img"
      aria-label={accessibleLabel}
      title={accessibleLabel}
      data-gender={normalizedGender ?? "unknown"}
      className={`inline-flex h-[18px] shrink-0 items-center gap-0.5 rounded-full px-1.5 text-[11px] font-bold leading-none tabular-nums ${
        TONE_CLASS[normalizedGender ?? "unknown"]
      } ${className}`}
    >
      {Icon ? <Icon size={11} strokeWidth={3} aria-hidden="true" /> : null}
      {hasAge ? <span aria-hidden="true">{age}</span> : null}
    </span>
  );
}
