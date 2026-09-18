"use client";

import NotificationPanel from "@/components/notification-panel";
import type { AppDictionary, AppLocale } from "@/i18n";
import { postNativeBannerZone } from "@/lib/native-banner-zone";
import { buildNativeAwareTabPath } from "@/lib/tab-navigation";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";

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

  useEffect(() => {
    postNativeBannerZone("hidden");
  }, []);

  return (
    <NotificationPanel
      open
      enabled={sessionStatus === "authenticated"}
      locale={locale}
      dictionary={dictionary}
      onClose={handleClose}
      onOpenProfile={handleOpenProfile}
    />
  );
}
