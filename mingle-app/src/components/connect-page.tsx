"use client";

import BottomTabBar, { buildNativeAwareTabPath } from "@/components/bottom-tab-bar";
import PublicUserProfileScreen from "@/components/public-user-profile-screen";
import type { ConversationChannelSummary } from "@/lib/app-conversations";
import type { AppDictionary, AppLocale } from "@/i18n";
import { observeConnectViewport } from "@/lib/connect-viewport";
import {
  consumeSlideSurfaceHistoryForScope,
  pushSlideSurfaceHistory,
  readSlideSurfaceHistory,
  readSlideSurfaceHistoryForScope,
  replaceSlideSurfaceHistory,
} from "@/lib/slide-surface-history";
import {
  DIRECT_CONVERSATION_NAVIGATION_GUARD_MS,
  replaceWithConversationListThenPush,
} from "@/lib/direct-conversation-navigation";
import UnifiedSearch from "@/components/search/unified-search";
import { postViewerHref, searchPeopleHref } from "@/lib/feed-routes";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";

type ConnectPageProps = {
  dictionary: AppDictionary;
  locale: AppLocale;
};

const CONNECT_SURFACE_SCOPE = "connect";
const CONNECT_PROFILE_SURFACE_ID = "profile";

export default function ConnectPage({ dictionary, locale }: ConnectPageProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pageRef = useRef<HTMLElement | null>(null);
  const pendingDirectConversationNavigationRef = useRef(false);
  const directConversationNavigationReleaseTimerRef = useRef<number | null>(null);
  const authenticatedUserId = typeof session?.user?.id === "string"
    ? session.user.id.trim()
    : "";
  const [connectSurfaceHistory, setConnectSurfaceHistory] = useState(() => (
    typeof window === "undefined" ? [] : readSlideSurfaceHistoryForScope(CONNECT_SURFACE_SCOPE)
  ));
  const connectProfileSurface = [...connectSurfaceHistory]
    .reverse()
    .find((entry) => entry.id === CONNECT_PROFILE_SURFACE_ID);

  useEffect(() => {
    if (!pageRef.current) return;
    return observeConnectViewport(pageRef.current);
  }, []);

  useEffect(() => {
    const syncConnectSurfaceHistory = () => {
      const nextHistory = readSlideSurfaceHistoryForScope(CONNECT_SURFACE_SCOPE);
      if (pendingDirectConversationNavigationRef.current) {
        const filteredHistory = nextHistory.filter((entry) => entry.id !== CONNECT_PROFILE_SURFACE_ID);
        if (filteredHistory.length !== nextHistory.length) {
          setConnectSurfaceHistory(filteredHistory);
          return;
        }
      }
      setConnectSurfaceHistory(nextHistory);
    };

    window.addEventListener("popstate", syncConnectSurfaceHistory);
    return () => window.removeEventListener("popstate", syncConnectSurfaceHistory);
  }, []);

  const openConnectProfile = useCallback((userId: string) => {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) return;

    pushSlideSurfaceHistory({
      scope: CONNECT_SURFACE_SCOPE,
      id: CONNECT_PROFILE_SURFACE_ID,
      value: normalizedUserId,
    });
    setConnectSurfaceHistory(readSlideSurfaceHistoryForScope(CONNECT_SURFACE_SCOPE));
  }, []);

  const closeConnectProfile = useCallback((userId: string) => {
    const currentEntries = readSlideSurfaceHistoryForScope(CONNECT_SURFACE_SCOPE);
    const currentEntry = currentEntries[currentEntries.length - 1];
    if (
      currentEntry?.id === CONNECT_PROFILE_SURFACE_ID
      && currentEntry.value === userId
    ) {
      window.history.back();
      return;
    }

    setConnectSurfaceHistory((current) => {
      const entryIndex = [...current].reverse().findIndex((entry) => (
        entry.id === CONNECT_PROFILE_SURFACE_ID && entry.value === userId
      ));
      if (entryIndex < 0) return current;
      const actualIndex = current.length - 1 - entryIndex;
      return current.filter((_entry, index) => index !== actualIndex);
    });
  }, []);

  const startDirectConversationFromConnectProfile = useCallback(async (
    conversation: ConversationChannelSummary,
  ) => {
    if (!conversation.id || pendingDirectConversationNavigationRef.current) return;

    pendingDirectConversationNavigationRef.current = true;
    if (directConversationNavigationReleaseTimerRef.current !== null) {
      window.clearTimeout(directConversationNavigationReleaseTimerRef.current);
      directConversationNavigationReleaseTimerRef.current = null;
    }

    try {
      await consumeSlideSurfaceHistoryForScope(CONNECT_SURFACE_SCOPE);
      if (typeof window !== "undefined") {
        replaceSlideSurfaceHistory(readSlideSurfaceHistory(window.history.state).filter((entry) => (
          entry.scope !== CONNECT_SURFACE_SCOPE
        )));
      }
      setConnectSurfaceHistory([]);

      const conversationListHref = buildNativeAwareTabPath(
        `/${locale}/conversations`,
        searchParams,
        { skipConversationRestore: true, tabRoot: true },
      );
      await replaceWithConversationListThenPush(router, conversationListHref, conversation.id);
    } finally {
      directConversationNavigationReleaseTimerRef.current = window.setTimeout(() => {
        pendingDirectConversationNavigationRef.current = false;
        directConversationNavigationReleaseTimerRef.current = null;
      }, DIRECT_CONVERSATION_NAVIGATION_GUARD_MS);
    }
  }, [locale, router, searchParams]);

  return (
    <>
      <main ref={pageRef} className="connect-page relative flex h-full min-h-0 w-full flex-col overflow-clip bg-white text-slate-900">
        <div className="min-h-0 flex-1">
          <UnifiedSearch
            locale={locale}
            canUseRecentSearches={Boolean(authenticatedUserId)}
            onOpenPerson={(userId) => openConnectProfile(userId)}
            onOpenSearchPost={(searchQuery, postId) =>
              router.push(postViewerHref(locale, { kind: "search", query: searchQuery }, postId))}
            onSeeAllPeople={(searchQuery) => router.push(searchPeopleHref(locale, searchQuery))}
          />
        </div>

        <div className="connect-bottom-tabs shrink-0">
          <BottomTabBar activeRoute="connect" dictionary={dictionary} locale={locale} />
        </div>
      </main>
      <PublicUserProfileScreen
        dictionary={dictionary}
        locale={locale}
        userId={connectProfileSurface?.value ?? ""}
        open={Boolean(connectProfileSurface?.value)}
        onStartDirectConversation={startDirectConversationFromConnectProfile}
        onClose={() => {
          if (!connectProfileSurface?.value) return;
          closeConnectProfile(connectProfileSurface.value);
        }}
      />
    </>
  );
}
