import HomePage from "@/components/home/home-page";
import { getDictionary, isSupportedLocale } from "@/i18n";
import { notFound } from "next/navigation";

type HomeRouteProps = {
  params: Promise<{ locale: string }>;
};

/** The home tab: people cards (docs/home-explore-rooms-plan.md). */
export default async function HomeRoute({ params }: HomeRouteProps) {
  const { locale } = await params;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  return <HomePage dictionary={getDictionary(locale)} locale={locale} />;
}
