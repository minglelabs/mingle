import { Check } from "lucide-react";

/**
 * A finished follow state ("팔로잉" / "맞팔"), shown as a check plus plain text
 * rather than a pill so it doesn't read as a button that still needs a tap.
 */
export default function FollowStatusIndicator({
  label,
  mutual = false,
}: {
  label: string;
  mutual?: boolean;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold ${
        mutual ? "text-emerald-600" : "text-gray-500"
      }`}
      data-testid="follow-status-indicator"
    >
      <Check size={14} strokeWidth={2.5} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
