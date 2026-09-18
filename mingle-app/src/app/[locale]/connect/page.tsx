import ConnectPage from "@/components/connect-page";
import { getDictionary, isSupportedLocale } from "@/i18n";
import { notFound } from "next/navigation";

type ConnectRouteProps = {
  params: Promise<{ locale: string }>;
};

export default async function ConnectRoute({ params }: ConnectRouteProps) {
  const { locale } = await params;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  return <ConnectPage dictionary={getDictionary(locale)} locale={locale} />;
}
