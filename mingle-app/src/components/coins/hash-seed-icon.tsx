/**
 * The in-app currency ("해씨" / Hash) as a sunflower seed, the mascot hamster's
 * snack. Fixed seed colors so it reads as a seed on any chip background.
 */
export default function HashSeedIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <g transform="rotate(-18 12 12)">
        <path
          d="M12 1.8C16.6 5.9 18.2 10.9 17.7 15.4C17.2 19.6 14.9 22.2 12 22.2C9.1 22.2 6.8 19.6 6.3 15.4C5.8 10.9 7.4 5.9 12 1.8Z"
          fill="#3b3631"
          stroke="#26221f"
          strokeWidth="0.8"
        />
        <path d="M12 4.6C12.5 10 12.5 15.6 12 20.6" fill="none" stroke="#f4ead6" strokeWidth="1.25" strokeLinecap="round" />
        <path d="M9.5 8.4C8.9 12.2 9.1 16.4 9.9 19.6" fill="none" stroke="#f4ead6" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M14.5 8.4C15.1 12.2 14.9 16.4 14.1 19.6" fill="none" stroke="#f4ead6" strokeWidth="1.1" strokeLinecap="round" />
      </g>
    </svg>
  );
}
