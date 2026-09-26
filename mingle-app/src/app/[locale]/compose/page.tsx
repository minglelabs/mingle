import { isSupportedLocale } from "@/i18n";
import { notFound } from "next/navigation";
import ComposeScreen from "@/components/compose/compose-screen";
import PostingFeedRouteGuard from "@/components/feed/posting-feed-route-guard";

type ComposePageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function resolveDraftId(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export default async function ComposePage({ params, searchParams }: ComposePageProps) {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;
  if (!isSupportedLocale(locale)) notFound();

  return (
    <PostingFeedRouteGuard locale={locale}>
      <main className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
        <ComposeScreen locale={locale} initialDraftId={resolveDraftId(resolvedSearchParams.draftId)} />
      </main>
    </PostingFeedRouteGuard>
  );
}
