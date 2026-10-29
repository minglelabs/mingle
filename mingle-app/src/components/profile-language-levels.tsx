import { ArrowLeftRight } from "lucide-react";
import { LANGUAGE_LEVEL_COUNT, type InterestLanguage } from "@/lib/interest-languages";
import { getSttLanguageDisplayName } from "@/lib/stt-languages";
import { resolveInterestLanguageCopy } from "@/i18n/interest-language-copy";

function shortCode(code: string): string {
  return code.split("-")[0]?.toUpperCase() ?? code.toUpperCase();
}

/** 1-5 filled dots, the rest empty. */
export function LanguageLevelDots({ level, className = "" }: { level: number; className?: string }) {
  return (
    <span className={`flex items-center gap-[3px] ${className}`} aria-hidden="true">
      {Array.from({ length: LANGUAGE_LEVEL_COUNT }, (_, index) => (
        <span
          key={index}
          className={`h-[5px] w-[5px] rounded-full ${index < level ? "bg-amber-500" : "bg-gray-200"}`}
        />
      ))}
    </span>
  );
}

function LanguageColumn({ code, locale, level }: { code: string; locale: string; level?: number }) {
  const name = getSttLanguageDisplayName(code, locale) ?? code;
  return (
    <span className="flex min-w-0 flex-col items-start">
      <span className="text-[13px] font-bold leading-tight text-slate-900">{shortCode(code)}</span>
      {level === undefined ? (
        <span className="mt-1 h-[5px] w-[31px] rounded-full bg-amber-500" aria-hidden="true" />
      ) : (
        <LanguageLevelDots level={level} className="mt-1" />
      )}
      <span className="mt-1 max-w-[84px] truncate text-[11px] leading-tight text-gray-400">{name}</span>
    </span>
  );
}

/**
 * The profile's language row, as on language-exchange apps: the languages the
 * user speaks (full bar) ⇄ the 관심 언어 they want to talk in (1-5 dots).
 */
export default function ProfileLanguageLevels({
  primaryLanguages,
  interestLanguages,
  locale,
  className = "",
}: {
  primaryLanguages: readonly string[];
  interestLanguages: readonly InterestLanguage[];
  locale: string;
  className?: string;
}) {
  if (primaryLanguages.length === 0 && interestLanguages.length === 0) return null;
  const copy = resolveInterestLanguageCopy(locale);
  const levelLabel = (level: number) => copy.levelLabels[level - 1] ?? "";
  const summary = [
    `${copy.primaryLabel}: ${primaryLanguages.map((code) => getSttLanguageDisplayName(code, locale) ?? code).join(", ")}`,
    interestLanguages.length
      ? `${copy.interestLabel}: ${interestLanguages.map((entry) => `${getSttLanguageDisplayName(entry.code, locale) ?? entry.code} (${levelLabel(entry.level)})`).join(", ")}`
      : "",
  ].filter(Boolean).join(". ");

  return (
    <div className={`flex flex-wrap items-start gap-x-3.5 gap-y-2 ${className}`} role="group" aria-label={summary}>
      {primaryLanguages.map((code) => <LanguageColumn key={code} code={code} locale={locale} />)}
      {interestLanguages.length ? (
        <>
          <ArrowLeftRight size={16} strokeWidth={2} className="mt-2 shrink-0 text-gray-300" aria-hidden="true" />
          {interestLanguages.map((entry) => (
            <LanguageColumn key={entry.code} code={entry.code} locale={locale} level={entry.level} />
          ))}
        </>
      ) : null}
    </div>
  );
}
