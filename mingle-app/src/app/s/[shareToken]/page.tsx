import { headers } from "next/headers";
import ConversationSpectateScreen from "@/components/conversation-spectate-screen";
import type { ConversationSpectateInviter } from "@/components/conversation-spectate-screen";
import { resolveConversationSpectateLocale } from "@/components/conversation-spectate-copy";
import { isValidConversationShareToken } from "@/lib/conversation-share-link";
import { getConversationHydrationStateForShare } from "@/lib/app-conversations";
import { getUserProfile } from "@/server/user-profile";

const DEFAULT_IOS_APP_STORE_URL = "https://apps.apple.com/app/id6759795134";
const DEFAULT_ANDROID_PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.minglelabs.mingle.rn";

type ConversationSpectatePageProps = {
  params: Promise<{ shareToken: string }>;
};

function decodePathSegment(rawValue: string): string {
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

export default async function ConversationSpectatePage({ params }: ConversationSpectatePageProps) {
  const { shareToken: rawShareToken } = await params;
  const shareToken = decodePathSegment(rawShareToken);
  const requestHeaders = await headers();
  const locale = resolveConversationSpectateLocale(requestHeaders.get("accept-language"));

  let roomTitle = "";
  let inviter: ConversationSpectateInviter | null = null;

  if (isValidConversationShareToken(shareToken)) {
    try {
      const state = await getConversationHydrationStateForShare({ shareToken });
      if (state) {
        roomTitle = state.conversation.title;
        if (state.sharedByUserId) {
          const inviterProfile = await getUserProfile(state.sharedByUserId);
          if (inviterProfile) {
            inviter = {
              name: inviterProfile.name,
              image: inviterProfile.image,
              imageCropScale: inviterProfile.imageCropScale,
              imageCropX: inviterProfile.imageCropX,
              imageCropY: inviterProfile.imageCropY,
            };
          }
        }
      }
    } catch {
      // Keep the page available (as its "no longer shared" state) when this
      // best-effort SSR preview fetch fails — useConversationSpectate's own
      // client-side fetch is the source of truth either way.
    }
  }

  return (
    <ConversationSpectateScreen
      shareToken={shareToken}
      locale={locale}
      initialRoomTitle={roomTitle}
      inviter={inviter}
      iosAppStoreUrl={process.env.IOS_APPSTORE_URL?.trim() || DEFAULT_IOS_APP_STORE_URL}
      androidPlayStoreUrl={process.env.ANDROID_PLAYSTORE_URL?.trim() || DEFAULT_ANDROID_PLAY_STORE_URL}
    />
  );
}

export async function generateMetadata({ params }: ConversationSpectatePageProps) {
  const { shareToken } = await params;
  return {
    title: isValidConversationShareToken(decodePathSegment(shareToken))
      ? "Open shared conversation in Mingle"
      : "Invalid Mingle conversation link",
    description: "View a shared Mingle conversation in the Mingle app.",
  };
}
