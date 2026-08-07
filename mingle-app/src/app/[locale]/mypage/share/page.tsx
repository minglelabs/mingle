import ProfileShareScreen from "@/components/profile-share-screen";
import { getDictionary, isSupportedLocale } from "@/i18n";
import { notFound } from "next/navigation";

type ProfileSharePageProps = {
  params: Promise<{ locale: string }>;
};

export default async function ProfileSharePage({ params }: ProfileSharePageProps) {
  const { locale } = await params;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  return <ProfileShareScreen dictionary={getDictionary(locale)} locale={locale} />;
}
