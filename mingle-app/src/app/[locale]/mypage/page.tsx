import MyPage from "@/components/my-page";
import { getDictionary, isSupportedLocale } from "@/i18n";
import { getAuthOptions } from "@/lib/auth-options";
import { isNativeTabRootSearch } from "@/lib/tab-navigation";
import { getUserProfile } from "@/server/user-profile";
import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

type MyPagePageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readSearchParamValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const rawValue = searchParams[key];
  if (typeof rawValue === "string") return rawValue;
  if (Array.isArray(rawValue)) return rawValue[0] ?? "";
  return "";
}

export default async function MyPagePage({ params, searchParams }: MyPagePageProps) {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  // The native tab bar prefetches this route and reuses the payload for later
  // tab switches, so it must not carry a profile snapshot that would go stale
  // (or wait on the database). MyPage renders from its own profile cache and
  // refreshes from the API after mount.
  const isNativeTabRoot = isNativeTabRootSearch(
    (key) => readSearchParamValue(resolvedSearchParams, key),
  );
  let initialProfile = null;
  if (!isNativeTabRoot) {
    const session = await getServerSession(getAuthOptions());
    const userId = typeof session?.user?.id === "string" ? session.user.id.trim() : "";
    if (userId) {
      try {
        initialProfile = await getUserProfile(userId);
      } catch {
        // Keep the session-backed name and let the client refresh retry the profile request.
      }
    }
  }

  return (
    <MyPage
      dictionary={getDictionary(locale)}
      initialProfile={initialProfile}
      locale={locale}
    />
  );
}
