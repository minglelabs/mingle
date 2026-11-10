import FlagEmoji from "@/components/flag-emoji";
import { countryFlagEmoji, normalizeNationalityCountry } from "@/lib/nationality";

type ProfileNationalityBadgeProps = {
  /** ISO 3166-1 alpha-2 (`resolveNationalityCountry`); nothing renders without one. */
  country: string | null | undefined;
  size: number;
  /** Overrides the badge size (default: a third of the avatar, at least 24px). */
  badgeSize?: number;
};

/** The 국적 flag on the bottom-left of a profile photo. The spoken languages show under the name. */
export default function ProfileNationalityBadge({
  country,
  size,
  badgeSize: badgeSizeOverride,
}: ProfileNationalityBadgeProps) {
  const code = normalizeNationalityCountry(country);
  if (!code) return null;

  const badgeSize = badgeSizeOverride ?? Math.max(24, Math.round(size * 0.32));

  return (
    <span className="absolute bottom-[-2px] left-[-2px] z-10 flex items-center" aria-hidden="true">
      <span
        className="relative flex shrink-0 items-center justify-center rounded-full border-2 border-white bg-white shadow-sm"
        style={{
          height: badgeSize,
          width: badgeSize,
          fontSize: badgeSize * 0.62,
          lineHeight: 1,
        }}
      >
        <FlagEmoji emoji={countryFlagEmoji(code)} className="leading-none" />
      </span>
    </span>
  );
}
