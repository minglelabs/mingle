import { formatMemberNumber } from "@/i18n/member-number-copy";

/** "해시챗 1,234번째 가입자" under the name on My page and on other people's profiles. */
export default function MemberNumberLine({ memberNumber, locale }: { memberNumber?: number | null; locale: string }) {
  if (typeof memberNumber !== "number" || !Number.isFinite(memberNumber) || memberNumber <= 0) return null;
  return (
    <p data-qa="profile-member-number" className="mt-1 text-[12px] font-semibold text-amber-700">
      {formatMemberNumber(locale, memberNumber)}
    </p>
  );
}
