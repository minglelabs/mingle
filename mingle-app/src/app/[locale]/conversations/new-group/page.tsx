import InviteFriendsScreen from "@/components/invite-friends-screen";
import { getDictionary, isSupportedLocale, type AppLocale } from "@/i18n";
import { notFound } from "next/navigation";

type NewGroupConversationPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function NewGroupConversationPage({ params }: NewGroupConversationPageProps) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  return (
    <InviteFriendsScreen
      dictionary={getDictionary(locale)}
      locale={locale as AppLocale}
    />
  );
}
