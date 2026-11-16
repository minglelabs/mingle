import { headers } from "next/headers";
import ProfileLinkInstallScreen from "@/components/profile-link-install-screen";
import type { ProfileLinkInstallProfile } from "@/components/profile-link-install-screen";
import { resolveProfileLinkInstallLocale } from "@/components/profile-link-install-copy";
import { isValidProfileLinkUserId } from "@/lib/profile-link";
import { getUserProfile } from "@/server/user-profile";
import { identityBadgeFlags } from "@/server/identity/user-identity-select";
import { shareLinkPreview } from "@/lib/share-og";

const DEFAULT_IOS_APP_STORE_URL = "https://apps.apple.com/app/id6759795134";
const DEFAULT_ANDROID_PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.minglelabs.mingle.rn";

type ProfileLinkPageProps = {
  params: Promise<{ userId: string }>;
};

function decodePathSegment(rawValue: string): string {
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

export default async function ProfileLinkPage({ params }: ProfileLinkPageProps) {
  const { userId: rawUserId } = await params;
  const userId = decodePathSegment(rawUserId);
  const requestHeaders = await headers();
  const locale = resolveProfileLinkInstallLocale(requestHeaders.get("accept-language"));
  let profile: ProfileLinkInstallProfile | null = null;

  if (isValidProfileLinkUserId(userId)) {
    try {
      const userProfile = await getUserProfile(userId);
      if (userProfile) {
        profile = {
          name: userProfile.name,
          handle: userProfile.handle,
          image: userProfile.image,
          imageCropScale: userProfile.imageCropScale,
          imageCropX: userProfile.imageCropX,
          imageCropY: userProfile.imageCropY,
          age: userProfile.age,
          gender: userProfile.gender ?? null,
          // The preview shows the name to anyone with the link: keep the badge.
          ...identityBadgeFlags(userProfile),
        };
      }
    } catch {
      // Keep the install page available when the profile preview is unavailable.
    }
  }

  return (
    <ProfileLinkInstallScreen
      userId={userId}
      locale={locale}
      profile={profile}
      iosAppStoreUrl={process.env.IOS_APPSTORE_URL?.trim() || DEFAULT_IOS_APP_STORE_URL}
      androidPlayStoreUrl={process.env.ANDROID_PLAYSTORE_URL?.trim() || DEFAULT_ANDROID_PLAY_STORE_URL}
    />
  );
}

export async function generateMetadata({ params }: ProfileLinkPageProps) {
  const userId = decodePathSegment((await params).userId);
  if (!isValidProfileLinkUserId(userId)) {
    return { title: "Invalid HashChat profile link", description: "This HashChat profile link is not valid." };
  }
  let name: string | null = null;
  try {
    name = (await getUserProfile(userId))?.name?.trim() || null;
  } catch {
    // The preview falls back to the generic text.
  }
  const title = name ? `${name} on HashChat` : "Open profile in HashChat";
  const description = name
    ? `Talk with ${name} on HashChat, each in your own language. HashChat (formerly Mingle) interprets as you talk.`
    : "Open a shared HashChat profile. HashChat (formerly Mingle) interprets as you talk.";
  return { title, description, ...shareLinkPreview(title, description) };
}
