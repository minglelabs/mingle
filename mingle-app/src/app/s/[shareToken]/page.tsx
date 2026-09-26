import { headers } from "next/headers";
import ConversationSpectateScreen from "@/components/conversation-spectate-screen";
import type { ConversationSpectateInviter } from "@/components/conversation-spectate-screen";
import { resolveConversationSpectateLocale } from "@/components/conversation-spectate-copy";
import { isValidConversationShareToken } from "@/lib/conversation-share-link";
import { getConversationHydrationStateForShare } from "@/lib/app-conversations";
import { toPublicSpectateUtterances } from "@/lib/conversation-share-public-payload";
import { getUserProfile } from "@/server/user-profile";
import type { ConversationSpectateState } from "@/components/use-conversation-spectate";

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
  // Detected here instead of from navigator.userAgent after mount: this is
  // the same device's request either way, so there's nothing a client-only
  // check would learn that the header doesn't already say — and computing
  // it here means the correct store button(s) render on the very first
  // paint instead of both showing briefly before narrowing to one.
  const userAgent = requestHeaders.get("user-agent") || "";
  const initialIsAndroid = /android/i.test(userAgent);
  const initialIsIos = /iphone|ipad|ipod/i.test(userAgent);

  let roomTitle = "";
  let inviter: ConversationSpectateInviter | null = null;
  // Handed down to useConversationSpectate as a head start: this page
  // already ran the exact same hydration fetch to build the invite banner
  // above, so reusing it here saves the client a second, redundant round
  // trip that was otherwise blocking the message list behind an extra
  // fetch after first paint. Left null on any failure/invalid-token path so
  // the client hook falls back to its own fetch (which is what surfaces the
  // "no longer shared" state).
  let initialState: ConversationSpectateState | null = null;
  // True only when this SSR fetch definitively resolved to "not shared"
  // (valid token shape, query ran clean, nothing came back) — not on a
  // transient fetch failure, where we'd rather let the client's own fetch
  // decide. Lets the "no longer shared" card render on the first paint
  // instead of flashing the normal chat card while the client re-confirms
  // the same negative result over the network.
  let initialNotFound = false;

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
        // Same serializer the public API route uses, so this server render
        // can't hand the client a field the API would have withheld — in
        // particular no account ids (see conversation-share-public-payload).
        initialState = {
          roomTitle: state.conversation.title,
          inviter,
          utterances: toPublicSpectateUtterances(state.utterances).map((utterance) => ({
            id: utterance.id,
            originalText: utterance.originalText,
            originalLang: utterance.originalLang,
            targetLanguages: utterance.targetLanguages,
            translations: utterance.translations,
            translationFinalized: utterance.translationFinalized,
            createdAtMs: utterance.createdAtMs,
            speaker: utterance.speaker ?? undefined,
            speakerAvatarSeed: utterance.speakerAvatarSeed ?? undefined,
            speakerAvatarIndex: utterance.speakerAvatarIndex ?? undefined,
            speakerName: utterance.speakerName,
            // The opaque alias takes ChatBubble's speaker-key slot — see the
            // same mapping in useConversationSpectate.
            speakerUserId: utterance.speakerAlias,
            speakerImage: utterance.speakerImage,
          })),
        };
      } else {
        initialNotFound = true;
      }
    } catch {
      // Keep the page available (as its "no longer shared" state) when this
      // best-effort SSR preview fetch fails — useConversationSpectate's own
      // client-side fetch is the source of truth either way.
    }
  } else {
    initialNotFound = true;
  }

  return (
    <ConversationSpectateScreen
      shareToken={shareToken}
      locale={locale}
      initialRoomTitle={roomTitle}
      inviter={inviter}
      initialState={initialState}
      initialNotFound={initialNotFound}
      initialIsAndroid={initialIsAndroid}
      initialIsIos={initialIsIos}
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
