import MyPage from "@/components/my-page";
import { getAuthOptions } from "@/lib/auth-options";
import { getDictionary, isSupportedLocale } from "@/i18n";
import { getUserPreferredLocale } from "@/lib/user-preferred-locale";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

type MyPageRouteProps = {
  params: Promise<{
    locale: string;
  }>;
};

export default async function MyPageRoute({ params }: MyPageRouteProps) {
  const { locale } = await params;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  const session = await getServerSession(getAuthOptions());
  if (session?.user) {
    const preferredLocale = await getUserPreferredLocale(session.user.id);
    if (preferredLocale && preferredLocale !== locale) {
      redirect(`/${preferredLocale}/mypage`);
    }
  }

  return (
    <MyPage
      dictionary={getDictionary(locale)}
      locale={locale}
    />
  );
}
