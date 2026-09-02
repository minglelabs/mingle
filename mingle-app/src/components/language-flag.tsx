import {
  canonicalizeTranslationLanguageCode,
  type TranslationLanguageCode,
} from "@/lib/translation-languages";
import { getSttLanguageFlag } from "@/lib/stt-languages";

type LanguageFlagProps = {
  language: string;
  className?: string;
};

const ENGLISH_FLAG: TranslationLanguageCode = "en";

function EnglishUsUkFlag({ className = "" }: Pick<LanguageFlagProps, "className">) {
  return (
    <span
      className={`relative inline-block h-[1em] w-[1.25em] shrink-0 overflow-hidden align-middle ${className}`}
      aria-hidden="true"
    >
      <span
        className="absolute inset-0 flex items-center justify-center"
        style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
      >
        <span className="whitespace-nowrap">🇺🇸</span>
      </span>
      <span
        className="absolute inset-0 flex items-center justify-center"
        style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
      >
        <span className="whitespace-nowrap">🇬🇧</span>
      </span>
    </span>
  );
}

export default function LanguageFlag({ language, className = "" }: LanguageFlagProps) {
  const canonicalLanguage = canonicalizeTranslationLanguageCode(language);

  if (canonicalLanguage === ENGLISH_FLAG) {
    return <EnglishUsUkFlag className={className} />;
  }

  return (
    <span className={className} aria-hidden="true">
      {getSttLanguageFlag(language)}
    </span>
  );
}
