import VoiceRoomsPage from "@/components/voice-rooms/voice-rooms-page";
import HomeFeedLayer from "@/components/home/home-feed-layer";
import { FirstRunHomeGuard } from "@/components/feed/posting-feed-route-guard";
import { getDictionary, isSupportedLocale } from "@/i18n";
import { notFound } from "next/navigation";

type VoiceRouteProps = {
  params: Promise<{ locale: string }>;
};

/**
 * The voice tab, which is home (owner, 2026-11-24): the always-open lounge and
 * the rooms with a live voice talk or game. As home it also carries the first
 * run (a device that owes the speak trial goes to it first), the phone, invite
 * and ban gates, and a new account's "say something" card.
 */
export default async function VoiceRoute({ params }: VoiceRouteProps) {
  const { locale } = await params;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  return (
    <FirstRunHomeGuard locale={locale} placeholderClassName="bg-white">
      <div className="relative h-full min-h-0 w-full">
        <VoiceRoomsPage dictionary={getDictionary(locale)} locale={locale} />
        <HomeFeedLayer locale={locale} />
      </div>
    </FirstRunHomeGuard>
  );
}
