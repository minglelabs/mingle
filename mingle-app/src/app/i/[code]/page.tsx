import { headers } from "next/headers";
import InviteTicketLandingScreen from "@/components/contacts/invite-ticket-landing-screen";
import { resolveInviteLandingLocale } from "@/i18n/invite-ticket-copy";
import { buildPlayStoreInviteUrl, normalizeReferralCode } from "@/lib/referral-code";
import { getInviteTicketInviter, resolveInviteJoinRewardCoins } from "@/server/referral";
import { shareLinkPreview } from "@/lib/share-og";

const DEFAULT_IOS_APP_STORE_URL = "https://apps.apple.com/app/id6759795134";
const DEFAULT_ANDROID_PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.minglelabs.mingle.rn";

type InviteTicketPageProps = {
  params: Promise<{ code: string }>;
};

// The public page behind an invite ticket link: who sent it, and a way into
// the app that carries the invite along (Play install referrer on Android,
// the code itself on iOS).
export default async function InviteTicketPage({ params }: InviteTicketPageProps) {
  const { code: rawCode } = await params;
  const requestHeaders = await headers();
  const userAgent = requestHeaders.get("user-agent") || "";
  let ticket: Awaited<ReturnType<typeof getInviteTicketInviter>> = null;
  try {
    ticket = await getInviteTicketInviter(rawCode);
  } catch {
    // Shown as an unusable ticket; the person can still reach the stores.
  }
  const code = ticket?.code ?? normalizeReferralCode(rawCode) ?? "";
  const playStoreUrl = process.env.ANDROID_PLAYSTORE_URL?.trim() || DEFAULT_ANDROID_PLAY_STORE_URL;

  return (
    <InviteTicketLandingScreen
      code={ticket ? code : ""}
      locale={resolveInviteLandingLocale(requestHeaders.get("accept-language"))}
      inviter={ticket ? {
        name: ticket.inviter.name,
        image: ticket.inviter.image,
        imageCropScale: ticket.inviter.imageCropScale,
        imageCropX: ticket.inviter.imageCropX,
        imageCropY: ticket.inviter.imageCropY,
      } : null}
      rewardCoins={resolveInviteJoinRewardCoins()}
      isAndroid={/android/i.test(userAgent)}
      isIos={/iphone|ipad|ipod/i.test(userAgent)}
      iosAppStoreUrl={process.env.IOS_APPSTORE_URL?.trim() || DEFAULT_IOS_APP_STORE_URL}
      androidPlayStoreUrl={ticket ? buildPlayStoreInviteUrl(playStoreUrl, code) : playStoreUrl}
    />
  );
}

export async function generateMetadata({ params }: InviteTicketPageProps) {
  let name: string | null = null;
  try {
    name = (await getInviteTicketInviter((await params).code))?.inviter.name?.trim() || null;
  } catch {
    // The preview falls back to the generic text.
  }
  const title = name ? `${name} invited you to HashChat` : "HashChat invite ticket";
  const description = name
    ? `Talk with ${name}, each in your own language. HashChat (formerly Mingle) interprets as you talk.`
    : "You're invited to talk on HashChat, each in your own language.";
  return { title, description, robots: { index: false }, ...shareLinkPreview(title, description) };
}
