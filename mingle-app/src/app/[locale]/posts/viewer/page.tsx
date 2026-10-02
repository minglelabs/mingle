import { getServerSession } from "next-auth";
import { getDictionary, isSupportedLocale, type AppLocale } from "@/i18n";
import BottomTabBar from "@/components/bottom-tab-bar";
import { getAuthOptions } from "@/lib/auth-options";
import FeedViewerClient from "@/components/feed/feed-viewer-client";
import PostingFeedRouteGuard from "@/components/feed/posting-feed-route-guard";
import { notFound } from "next/navigation";

type ViewerPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function takeFirst(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

/**
 * Full-screen vertical viewer scoped to one author's posts or one search's
 * results (`postViewerHref` builds `kind=author|search`, `postId`, plus
 * `authorId` / `q`). Same card + gestures as the feed; it starts on `postId`
 * and back navigation returns to where the viewer came from.
 */
export default async function PostsViewerPage({ params, searchParams }: ViewerPageProps) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const query = await searchParams;
  const kind = takeFirst(query.kind);
  const postId = takeFirst(query.postId);
  const authorId = takeFirst(query.authorId);
  const q = takeFirst(query.q);

  if (!postId) notFound();
  if (kind === "author" && !authorId) notFound();
  if (kind === "search" && !q) notFound();
  if (kind !== "author" && kind !== "search") notFound();

  // The tab the viewer was opened from stays highlighted: search results →
  // search, the viewer's own posts → My page, anyone else's → the feed.
  const session = kind === "author" ? await getServerSession(getAuthOptions()) : null;
  const activeRoute =
    kind === "search" ? "connect" : session?.user?.id === authorId ? "mypage" : "feed";

  return (
    <PostingFeedRouteGuard locale={locale}>
      <FeedViewerClient
        locale={locale}
        source={kind === "author" ? { kind: "author", authorId } : { kind: "search", query: q }}
        startPostId={postId}
        tabBar={
          <BottomTabBar
            activeRoute={activeRoute}
            dictionary={getDictionary(locale as AppLocale)}
            locale={locale}
            variant="glass"
          />
        }
      />
    </PostingFeedRouteGuard>
  );
}
