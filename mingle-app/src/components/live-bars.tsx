/**
 * A voice talk is going on (owner, 2026-11-25): three small bars that rise
 * and fall in turn, like a level meter. Drawn in the text colour around it.
 * Compositor-only (see `.mingle-live-bar` in globals.css) and still when the
 * phone asks for less motion.
 */
export default function LiveBars({ size = 12, className = "" }: { size?: number; className?: string }) {
  const bar = Math.max(2, Math.round(size / 5));
  return (
    <span
      aria-hidden="true"
      data-qa="live-bars"
      className={`inline-flex shrink-0 items-end ${className}`}
      style={{ height: size, gap: Math.max(1, Math.round(bar / 2)) }}
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="mingle-live-bar block rounded-full bg-current"
          style={{ width: bar, height: size, animationDelay: `${index * 0.18}s` }}
        />
      ))}
    </span>
  );
}
