import { DEFAULT_LOCALE } from "@/i18n";
import { getAuthOptions } from "@/lib/auth-options";
import { getUserPreferredLocale } from "@/lib/user-preferred-locale";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function buildPathWithSearchParams(
  pathname: string,
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const nextSearchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        nextSearchParams.append(key, entry);
      }
      continue;
    }
    if (typeof value === "string") {
      nextSearchParams.set(key, value);
    }
  }
  const nextSearch = nextSearchParams.toString();
  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
}

export default async function Page({ searchParams }: PageProps) {
  const query = await searchParams;
  const session = await getServerSession(getAuthOptions());
  const preferredLocale = session?.user
    ? await getUserPreferredLocale(session.user.id)
    : null;
  redirect(
    buildPathWithSearchParams(
      `/${preferredLocale ?? DEFAULT_LOCALE}/conversations`,
      query,
    ),
  );
}
