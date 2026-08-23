"use client";

import type { AppDictionary } from "@/i18n/types";
import { MessageCircle, Search, UserCircle } from "lucide-react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { buildConversationRequestIdentityHeaders } from "@/components/conversation-list.logic";
import { getOrCreateTrackingUserId } from "@/components/LivePhoneDemo/realtime-storage";
import { buildClientApiPath, clientApiNamespace } from "@/lib/api-contract";
import {
  buildNativeAwareTabPath as buildNativeAwareTabPathInternal,
  NATIVE_TAB_ROOT_QUERY_KEY,
} from "@/lib/tab-navigation";

export const BOTTOM_TAB_BAR_HEIGHT_PX = 52;

type BottomTabBarProps = {
  activeRoute: "conversations" | "connect" | "mypage";
  dictionary: AppDictionary;
  locale: string;
  unreadConversationMessageCount?: number;
};

type NativeBridgeWindow = Window & {
  ReactNativeWebView?: {
    postMessage?: (message: string) => void;
  };
};

export function buildNativeAwareTabPath(
  pathname: string,
  searchParams: Pick<URLSearchParams, "getAll">,
  options?: {
    preserveConversation?: boolean;
    skipConversationRestore?: boolean;
    tabRoot?: boolean;
  },
): string {
  return buildNativeAwareTabPathInternal(pathname, searchParams, options);
}

function ProfileTabIcon({
  active,
  alt,
  imageUrl,
}: {
  active: boolean;
  alt: string;
  imageUrl?: string | null;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={alt}
        width={26}
        height={26}
        className="h-[26px] w-[26px] rounded-full object-cover"
        style={{
          outline: active ? "2px solid #f59e0b" : "2px solid transparent",
          outlineOffset: "1px",
        }}
      />
    );
  }

  return (
    <UserCircle
      size={28}
      strokeWidth={active ? 2.3 : 1.9}
      className={active ? "text-amber-500" : "text-gray-400"}
      aria-hidden="true"
    />
  );
}

export default function BottomTabBar({
  activeRoute,
  dictionary,
  locale,
  unreadConversationMessageCount,
}: BottomTabBarProps) {
  const { data: session } = useSession();
  const [loadedUnreadConversationMessageCount, setLoadedUnreadConversationMessageCount] = useState(0);
  const pathname = usePathname() || "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const isNativeTabRoot = searchParams.get(NATIVE_TAB_ROOT_QUERY_KEY) === "1";

  const conversationsPath = `/${locale}/conversations`;
  const connectPath = `/${locale}/connect`;
  const mypagePath = `/${locale}/mypage`;
  const conversationsHref = buildNativeAwareTabPath(conversationsPath, searchParams, {
    // Returning from another top-level tab is an intentional request for the
    // list. A live STT room must not be restored as a side effect of mounting
    // the list.
    skipConversationRestore: activeRoute !== "conversations",
    tabRoot: true,
  });
  const connectHref = buildNativeAwareTabPath(connectPath, searchParams, { tabRoot: true });
  const mypageHref = buildNativeAwareTabPath(mypagePath, searchParams, { tabRoot: true });
  const isConversationsActive = activeRoute === "conversations"
    || pathname === conversationsPath
    || pathname.startsWith(`${conversationsPath}/`);
  const isConnectActive = activeRoute === "connect"
    || pathname === connectPath
    || pathname.startsWith(`${connectPath}/`);
  const isMypageActive = activeRoute === "mypage"
    || pathname === mypagePath
    || pathname.startsWith(`${mypagePath}/`);
  const visibleUnreadConversationMessageCount = Math.max(
    0,
    Math.floor(unreadConversationMessageCount ?? loadedUnreadConversationMessageCount),
  );
  const unreadConversationMessageLabel = dictionary.conversations?.notificationsUnreadSectionLabel
    || "Unread messages";

  useEffect(() => {
    if (unreadConversationMessageCount !== undefined) return;

    let cancelled = false;
    const loadUnreadConversationMessageCount = async () => {
      try {
        const response = await fetch(buildClientApiPath("/conversations?view=native-list"), {
          cache: "no-store",
          headers: buildConversationRequestIdentityHeaders({
            fallbackExternalUserId: getOrCreateTrackingUserId(),
            clientApiNamespace,
          }),
        });
        if (!response.ok) throw new Error("conversation_unread_count_load_failed");
        const payload = await response.json() as {
          conversations?: Array<{ unreadMessageCount?: unknown }>;
        };
        const nextCount = Array.isArray(payload.conversations)
          ? payload.conversations.reduce((total, conversation) => {
              const count = typeof conversation.unreadMessageCount === "number"
                ? conversation.unreadMessageCount
                : 0;
              return total + (Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0);
            }, 0)
          : 0;
        if (!cancelled) setLoadedUnreadConversationMessageCount(nextCount);
      } catch {
        if (!cancelled) setLoadedUnreadConversationMessageCount(0);
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void loadUnreadConversationMessageCount();
      }
    };

    void loadUnreadConversationMessageCount();
    const pollTimer = window.setInterval(loadUnreadConversationMessageCount, 20_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [unreadConversationMessageCount]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const bridgeWindow = window as NativeBridgeWindow;
    if (typeof bridgeWindow.ReactNativeWebView?.postMessage !== "function") return;

    try {
      bridgeWindow.ReactNativeWebView.postMessage(JSON.stringify({
        type: "native_navigation_state",
        payload: {
          canGoBack: !isNativeTabRoot && window.history.length > 1,
          url: window.location.href,
        },
      }));
    } catch {
      // Leave native navigation unchanged when bridge serialization fails.
    }
  }, [isNativeTabRoot, pathname, searchParamsKey]);

  useEffect(() => {
    if (isMypageActive) return;
    void router.prefetch(mypageHref);
  }, [isMypageActive, mypageHref, router]);

  return (
    <nav
      aria-label={dictionary.titles.my}
      className="flex w-full shrink-0 items-stretch border-t border-gray-100 bg-white"
      style={{
        height: `calc(${BOTTOM_TAB_BAR_HEIGHT_PX}px + env(safe-area-inset-bottom, 0px))`,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <button
        type="button"
        onClick={() => {
          if (isConversationsActive) return;
          router.replace(conversationsHref);
        }}
        className="flex flex-1 items-center justify-center transition active:opacity-60"
        aria-label={visibleUnreadConversationMessageCount > 0
          ? `${dictionary.titles.chats}, ${visibleUnreadConversationMessageCount} ${unreadConversationMessageLabel}`
          : dictionary.titles.chats}
        aria-current={isConversationsActive ? "page" : undefined}
      >
        <span className="relative inline-flex">
          <MessageCircle
            size={26}
            fill={isConversationsActive ? "#f59e0b" : "none"}
            stroke={isConversationsActive ? "#f59e0b" : "#9ca3af"}
            strokeWidth={1.9}
            aria-hidden="true"
          />
          {visibleUnreadConversationMessageCount > 0 ? (
            <span
              className="absolute -right-3 -top-2 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white"
              aria-hidden="true"
            >
              {visibleUnreadConversationMessageCount > 99 ? "99+" : visibleUnreadConversationMessageCount}
            </span>
          ) : null}
        </span>
      </button>
      <button
        type="button"
        onClick={() => {
          if (isConnectActive) return;
          router.replace(connectHref);
        }}
        className="flex flex-1 items-center justify-center transition active:opacity-60"
        aria-label={dictionary.titles.connect}
        aria-current={isConnectActive ? "page" : undefined}
      >
        <Search
          size={26}
          stroke={isConnectActive ? "#f59e0b" : "#9ca3af"}
          strokeWidth={isConnectActive ? 2.3 : 1.9}
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        onClick={() => {
          if (isMypageActive) return;
          router.replace(mypageHref);
        }}
        className="flex flex-1 items-center justify-center transition active:opacity-60"
        aria-label={dictionary.titles.my}
        aria-current={isMypageActive ? "page" : undefined}
      >
        <ProfileTabIcon
          active={isMypageActive}
          alt={dictionary.profile.shareProfile}
          imageUrl={session?.user?.image}
        />
      </button>
    </nav>
  );
}
