import VoiceRoomsPage from "@/components/voice-rooms/voice-rooms-page";
import { getDictionary, isSupportedLocale } from "@/i18n";
import { notFound } from "next/navigation";

type VoiceRouteProps = {
  params: Promise<{ locale: string }>;
};

/** The voice tab: the always-open lounge and the rooms with a live voice talk or game. */
export default async function VoiceRoute({ params }: VoiceRouteProps) {
  const { locale } = await params;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  return <VoiceRoomsPage dictionary={getDictionary(locale)} locale={locale} />;
}
