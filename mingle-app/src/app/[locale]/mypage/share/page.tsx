import ProfileShareScreen from "@/components/profile-share-screen";
import { getDictionary, isSupportedLocale } from "@/i18n";
import { notFound } from "next/navigation";

type ProfileSharePageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProfileSharePage({ params, searchParams }: ProfileSharePageProps) {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  return (
    <ProfileShareScreen
      dictionary={getDictionary(locale)}
      locale={locale}
      initialHandle={typeof resolvedSearchParams.profileHandle === "string" ? resolvedSearchParams.profileHandle : ""}
      initialUserId={typeof resolvedSearchParams.profileUserId === "string" ? resolvedSearchParams.profileUserId : ""}
    />
  );
}
