"use client";

import type { ReactNode } from "react";
import { usePostingFeedGuard } from "@/components/feed/use-posting-feed-guard";

type PostingFeedRouteGuardProps = {
  locale: string;
  children: ReactNode;
};

/**
 * Client wrapper that renders a posting screen only for a client whose
 * namespace serves the posting feature. An unsupported client (a pre-2.2.0
 * app that deep-linked or navigated back into `/feed`, `/compose`, `/posts/*`,
 * `/mypage/posts/*`, `/notifications`) is redirected to the conversation list
 * by the guard hook, and nothing posting-related is rendered meanwhile — so no
 * posting API call fires and no 404 chrome flashes.
 *
 * The first paint is blank for everyone (matching the server render), which
 * keeps hydration consistent; the real screen appears one tick later once the
 * client namespace is known to be supported.
 */
export default function PostingFeedRouteGuard({ locale, children }: PostingFeedRouteGuardProps) {
  const status = usePostingFeedGuard(locale);

  if (status !== "supported") {
    return <div aria-hidden className="h-full w-full bg-black" />;
  }

  return <>{children}</>;
}
