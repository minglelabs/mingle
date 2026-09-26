import { buildPathWithSearchParams } from "@/lib/build-path-with-search-params";
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
  redirect(buildPathWithSearchParams(`/${locale}/feed`, searchParams));
}
