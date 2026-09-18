import LanguageFlag from "@/components/language-flag";

type ProfileLanguageFlagStackProps = {
  languages: readonly string[];
  size: number;
};

export default function ProfileLanguageFlagStack({
  languages,
  size,
}: ProfileLanguageFlagStackProps) {
  const visibleLanguages = languages.filter((language) => language.trim().length > 0);
  if (visibleLanguages.length === 0) return null;

  const badgeSize = Math.max(24, Math.round(size * 0.32));
  const overlap = Math.round(badgeSize * 0.4);

  return (
    <span
      className="absolute bottom-[-2px] left-[-2px] z-10 flex items-center"
      aria-hidden="true"
    >
      {visibleLanguages.map((language, index) => (
        <span
          key={`${language}-${index}`}
          className="relative flex shrink-0 items-center justify-center rounded-full border-2 border-white bg-white shadow-sm"
          style={{
            height: badgeSize,
            width: badgeSize,
            marginLeft: index === 0 ? 0 : -overlap,
            fontSize: badgeSize * 0.62,
            lineHeight: 1,
            zIndex: index + 1,
          }}
        >
          <LanguageFlag language={language} className="leading-none" />
        </span>
      ))}
    </span>
  );
}
