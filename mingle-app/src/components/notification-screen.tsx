"use client";

import NotificationPanel from "@/components/notification-panel";
import type { AppDictionary, AppLocale } from "@/i18n";
import { feedHref } from "@/lib/feed-routes";
import { useNativeBannerSuppression } from "@/lib/use-native-banner-suppression";
import { buildNativeAwareTabHref, buildNativeAwareTabPath } from "@/lib/tab-navigation";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

type NotificationScreenProps = {
  dictionary: AppDictionary;
  locale: AppLocale;
};

export default function NotificationScreen({ dictionary, locale }: NotificationScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status: sessionStatus } = useSession();

  const conversationsHref = buildNativeAwareTabPath(`/${locale}/conversations`, searchParams, {
    skipConversationRestore: true,
    tabRoot: true,
  });

  const handleClose = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.replace(conversationsHref);
  }, [conversationsHref, router]);

  const handleOpenProfile = useCallback((userId: string) => {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) return;

    const profileHref = buildNativeAwareTabPath(
      `/${locale}/users/${encodeURIComponent(normalizedUserId)}`,
      searchParams,
    );
    router.push(profileHref);
  }, [locale, router, searchParams]);

  const handleOpenPost = useCallback((postId: string, commentId: string | null) => {
    const normalizedPostId = postId.trim();
    if (!normalizedPostId) return;

    // feedHref opens the feed at this post; with a commentId the feed opens the
    // comment sheet on that comment and expands its collapsed replies.
    // The feed is the home tab root: replace, so the home tab never gets a
    // "back" into this screen or an older feed.
    const postHref = buildNativeAwareTabHref(
      feedHref(locale, { postId: normalizedPostId, commentId: commentId?.trim() || null }),
      searchParams,
      { tabRoot: true },
    );
    router.replace(postHref);
  }, [locale, router, searchParams]);

  useNativeBannerSuppression();

  return (
    <NotificationPanel
      open
      transitionMode="instant"
      enabled={sessionStatus === "authenticated"}
      locale={locale}
      dictionary={dictionary}
      onClose={handleClose}
      onOpenProfile={handleOpenProfile}
      onOpenPost={handleOpenPost}
    />
  );
}
