type ProfileLanguageFlagStackProps = {
  flags: readonly string[];
  size: number;
};

export default function ProfileLanguageFlagStack({
  flags,
  size,
}: ProfileLanguageFlagStackProps) {
  const visibleFlags = flags.filter((flag) => flag.trim().length > 0);
  if (visibleFlags.length === 0) return null;

  const badgeSize = Math.max(24, Math.round(size * 0.32));
  const overlap = Math.round(badgeSize * 0.4);

  return (
    <span
      className="absolute bottom-[-2px] left-[-2px] z-10 flex items-center"
      aria-hidden="true"
    >
      {visibleFlags.map((flag, index) => (
        <span
          key={`${flag}-${index}`}
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
          {flag}
        </span>
      ))}
    </span>
  );
}
