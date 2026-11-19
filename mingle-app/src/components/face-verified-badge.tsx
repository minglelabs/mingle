import { ShieldCheck } from "lucide-react";
import { resolveSelfieVerifyCopy } from "@/i18n/selfie-verify-copy";

/** "Verified": this person passed the selfie check for their current photo. */
export default function FaceVerifiedBadge({ locale }: { locale: string }) {
  const label = resolveSelfieVerifyCopy(locale).badge;
  return (
    <span
      data-qa="face-verified-badge"
      title={label}
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700"
    >
      <ShieldCheck size={13} strokeWidth={2.4} aria-hidden="true" />
      {label}
    </span>
  );
}
