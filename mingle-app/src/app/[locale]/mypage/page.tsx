import MyPage from "@/components/my-page";
import { getDictionary, isSupportedLocale } from "@/i18n";
import { notFound } from "next/navigation";

type MyPagePageProps = {
  params: Promise<{ locale: string }>;
};

export default async function MyPagePage({ params }: MyPagePageProps) {
  const { locale } = await params;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  return <MyPage dictionary={getDictionary(locale)} locale={locale} />;
}
