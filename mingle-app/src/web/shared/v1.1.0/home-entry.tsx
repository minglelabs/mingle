import { buildPathWithSearchParams } from "@/lib/build-path-with-search-params";
import { feedHref } from "@/lib/feed-routes";
import { conversationsHref, requestNamespaceSupportsPostingFeed } from "@/lib/posting-feed-guard";
import { redirect } from "next/navigation";

type V110HomeEntryProps = {
  locale: string;
  searchParams: Record<string, string | string[] | undefined>;
};

export default function V110HomeEntry({ locale, searchParams }: V110HomeEntryProps): never {
  // Posting feed (W3): the feed is the app's first screen. Search params are
  // preserved so a push/deep-link that lands on "/" carries its target query
  // through to the feed (postId/commentId); message-push and invite links open
  // their own concrete routes directly and never reach this landing.
  //
  // Rollout gate (W4): the web UI is shared by every installed app version, but
  // the posting routes exist only from the v2.2.0 namespace on. A pre-2.2.0 app
  // (e.g. 2.0.x) must keep its previous first screen — the conversation list —
  // or it would land on a feed that 404s. We must decide on the server, so we
  // read the namespace the app shell put on the request rather than the
  // module-load client flag; a plain web visit has no namespace ('' → supported)
  // and is unaffected. If it cannot be determined it reads as '' (supported),
  // which is the shared-web default, so only a namespace that is explicitly a
  // pre-2.2.0 app is sent to the conversation list.
  if (!requestNamespaceSupportsPostingFeed(searchParams)) {
    redirect(buildPathWithSearchParams(conversationsHref(locale), searchParams));
  }

  redirect(buildPathWithSearchParams(feedHref(locale), searchParams));
}
