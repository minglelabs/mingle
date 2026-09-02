import MyPage from "@/components/my-page";
import { getDictionary, isSupportedLocale } from "@/i18n";
import { getAuthOptions } from "@/lib/auth-options";
import { getUserProfile } from "@/server/user-profile";
import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

type MyPagePageProps = {
  params: Promise<{ locale: string }>;
};

export default async function MyPagePage({ params }: MyPagePageProps) {
  const { locale } = await params;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  const session = await getServerSession(getAuthOptions());
  const userId = typeof session?.user?.id === "string" ? session.user.id.trim() : "";
  let initialProfile = null;
  if (userId) {
    try {
      initialProfile = await getUserProfile(userId);
    } catch {
      // Keep the session-backed name and let the client refresh retry the profile request.
    }
  }

  return (
    <MyPage
      dictionary={getDictionary(locale)}
      initialProfile={initialProfile}
      locale={locale}
    />
  );
}
