import PublicUserProfileScreen from "@/components/public-user-profile-screen";
import { getDictionary, isSupportedLocale, type AppLocale } from "@/i18n";
import { notFound } from "next/navigation";

type PublicUserProfilePageProps = {
  params: Promise<{
    locale: string;
    userId: string;
  }>;
};

export default async function PublicUserProfilePage({ params }: PublicUserProfilePageProps) {
  const { locale, userId } = await params;
  if (!isSupportedLocale(locale)) notFound();

  return (
    <PublicUserProfileScreen
      dictionary={getDictionary(locale)}
      locale={locale as AppLocale}
      userId={decodeURIComponent(userId)}
    />
  );
}
