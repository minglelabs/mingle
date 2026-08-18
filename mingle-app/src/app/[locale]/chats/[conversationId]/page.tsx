import DirectMessageScreen from "@/components/direct-message-screen";
import { getDictionary, isSupportedLocale, type AppLocale } from "@/i18n";
import { notFound } from "next/navigation";

type DirectMessagePageProps = {
  params: Promise<{
    locale: string;
    conversationId: string;
  }>;
};

export default async function DirectMessagePage({ params }: DirectMessagePageProps) {
  const { locale, conversationId } = await params;
  if (!isSupportedLocale(locale)) notFound();

  return (
    <DirectMessageScreen
      dictionary={getDictionary(locale)}
      locale={locale as AppLocale}
      conversationId={decodeURIComponent(conversationId)}
    />
  );
}
