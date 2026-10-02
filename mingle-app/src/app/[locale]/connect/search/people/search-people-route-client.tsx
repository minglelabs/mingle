"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { AppLocale } from "@/i18n";
import SearchPeopleScreen from "@/components/search/search-people-screen";

/**
 * Standalone route host for the full people-search list. As a directly-visited
 * page (deep link / hard reload), selecting a person routes to the existing
 * profile page; when the list is opened as a sliding surface from the connect
 * tab, that in-app host supplies its own `onOpenPerson` instead.
 */
export default function SearchPeopleRouteClient({ locale, query }: { locale: AppLocale; query: string }) {
  const router = useRouter();
  const openPerson = useCallback((userId: string) => {
    router.push(`/${locale}/users/${encodeURIComponent(userId)}`);
  }, [locale, router]);
  const goBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.replace(`/${locale}/connect`);
  }, [locale, router]);

  return (
    <main className="flex h-full min-h-0 w-full flex-col bg-white text-slate-900">
      <SearchPeopleScreen locale={locale} query={query} onOpenPerson={openPerson} onBack={goBack} />
    </main>
  );
}
