import NotificationScreen from "@/components/notification-screen";
import PostingFeedRouteGuard from "@/components/feed/posting-feed-route-guard";
import { getDictionary, isSupportedLocale, type AppLocale } from "@/i18n";
import { notFound } from "next/navigation";

type NotificationsPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function NotificationsPage({ params }: NotificationsPageProps) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  return (
    <PostingFeedRouteGuard locale={locale}>
      <NotificationScreen
        dictionary={getDictionary(locale)}
        locale={locale as AppLocale}
      />
    </PostingFeedRouteGuard>
  );
}
