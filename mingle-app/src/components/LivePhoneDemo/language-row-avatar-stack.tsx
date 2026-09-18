import { UserRound } from "lucide-react";
import { buildProfileImageTransform } from "@/lib/profile-image-crop";
import type { ConversationMemberProfile } from "@/components/conversation-member-profile-cache";

export type LanguageRowAttributionMember = ConversationMemberProfile;

type LanguageRowAvatarStackProps = {
  memberIds: readonly string[];
  membersById: ReadonlyMap<string, LanguageRowAttributionMember>;
  maxVisible?: number;
};

const DEFAULT_MAX_VISIBLE = 4;
const AVATAR_SIZE_PX = 22;

// Same corner-overlap stacking math as ProfileLanguageFlagStack, but inline
// next to a language row instead of corner-anchored on a single avatar photo
// — a different enough anchoring geometry that it isn't a variant of that
// component, just the same visual idea applied to a row layout.
export default function LanguageRowAvatarStack({
  memberIds,
  membersById,
  maxVisible = DEFAULT_MAX_VISIBLE,
}: LanguageRowAvatarStackProps) {
  if (memberIds.length === 0) return null;

  const overlap = Math.round(AVATAR_SIZE_PX * 0.4);
  const visibleIds = memberIds.slice(0, maxVisible);
  const overflowCount = memberIds.length - visibleIds.length;

  return (
    <span className="flex shrink-0 items-center" aria-hidden="true">
      {visibleIds.map((memberId, index) => {
        const member = membersById.get(memberId);
        return (
          <span
            key={memberId}
            className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-gray-100 shadow-sm"
            style={{
              height: AVATAR_SIZE_PX,
              width: AVATAR_SIZE_PX,
              marginLeft: index === 0 ? 0 : -overlap,
              zIndex: index + 1,
            }}
            title={member?.name?.trim() || undefined}
          >
            {member?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={member.image}
                alt=""
                width={AVATAR_SIZE_PX}
                height={AVATAR_SIZE_PX}
                className="h-full w-full object-cover"
                style={{
                  transform: buildProfileImageTransform(AVATAR_SIZE_PX, {
                    scale: member.imageCropScale,
                    x: member.imageCropX,
                    y: member.imageCropY,
                  }),
                }}
              />
            ) : (
              <UserRound size={12} className="text-gray-400" />
            )}
          </span>
        );
      })}
      {overflowCount > 0 ? (
        <span
          className="relative flex shrink-0 items-center justify-center rounded-full border-2 border-white bg-gray-200 text-[0.6rem] font-semibold text-gray-600 shadow-sm"
          style={{
            height: AVATAR_SIZE_PX,
            width: AVATAR_SIZE_PX,
            marginLeft: -overlap,
            zIndex: visibleIds.length + 1,
          }}
        >
          +{overflowCount}
        </span>
      ) : null}
    </span>
  );
}
