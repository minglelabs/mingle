import InviteFriendsScreen from "@/components/invite-friends-screen";
import { getDictionary, isSupportedLocale, type AppLocale } from "@/i18n";
import { notFound } from "next/navigation";

type AddConversationMembersPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ conversation?: string }>;
};

export default async function AddConversationMembersPage({
  params,
  searchParams,
}: AddConversationMembersPageProps) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const { conversation } = await searchParams;
  const conversationId = conversation?.trim();
  if (!conversationId) notFound();

  return (
    <InviteFriendsScreen
      dictionary={getDictionary(locale)}
      locale={locale as AppLocale}
      conversationId={conversationId}
    />
  );
}
