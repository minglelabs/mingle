import ProfileLinkInstallScreen from "@/components/profile-link-install-screen";
import { isValidProfileLinkUserId } from "@/lib/profile-link";

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

  return (
    <ProfileLinkInstallScreen
      userId={userId}
      iosAppStoreUrl={process.env.IOS_APPSTORE_URL?.trim() || DEFAULT_IOS_APP_STORE_URL}
      androidPlayStoreUrl={process.env.ANDROID_PLAYSTORE_URL?.trim() || DEFAULT_ANDROID_PLAY_STORE_URL}
    />
  );
}

export function generateMetadata({ params }: ProfileLinkPageProps) {
  return params.then(({ userId }) => ({
    title: isValidProfileLinkUserId(decodePathSegment(userId)) ? "Open profile in Mingle" : "Invalid Mingle profile link",
    description: "Open a shared Mingle profile in the Mingle app.",
  }));
}
