import type { AppLocale } from "@/i18n";
import { formatProfileAge } from "@/i18n/profile-age-copy";

export default function ProfileAge({
  age,
  locale,
  className,
}: {
  age?: number | null;
  locale: AppLocale;
  className?: string;
}) {
  const label = formatProfileAge(age, locale);
  return label ? <p className={className}>{label}</p> : null;
}
