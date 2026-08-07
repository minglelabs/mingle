"use client";

import type { AppDictionary } from "@/i18n/types";
import { MessageCircle, UserCircle } from "lucide-react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import {
  buildNativeAwareTabPath as buildNativeAwareTabPathInternal,
  NATIVE_TAB_ROOT_QUERY_KEY,
} from "@/lib/tab-navigation";

export const BOTTOM_TAB_BAR_HEIGHT_PX = 52;

type BottomTabBarProps = {
  activeRoute: "conversations" | "mypage";
  dictionary: AppDictionary;
  locale: string;
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
}: BottomTabBarProps) {
  const { data: session } = useSession();
  const pathname = usePathname() || "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const isNativeTabRoot = searchParams.get(NATIVE_TAB_ROOT_QUERY_KEY) === "1";

  const conversationsPath = `/${locale}/conversations`;
  const mypagePath = `/${locale}/mypage`;
  const conversationsHref = buildNativeAwareTabPath(conversationsPath, searchParams, {
    // Returning from My Page is an intentional request for the list. A live
    // STT room must not be restored as a side effect of mounting the list.
    skipConversationRestore: activeRoute === "mypage",
    tabRoot: true,
  });
  const mypageHref = buildNativeAwareTabPath(mypagePath, searchParams, { tabRoot: true });
  const isConversationsActive = activeRoute === "conversations"
    || pathname === conversationsPath
    || pathname.startsWith(`${conversationsPath}/`);
  const isMypageActive = activeRoute === "mypage"
    || pathname === mypagePath
    || pathname.startsWith(`${mypagePath}/`);

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
        aria-label={dictionary.titles.chats}
        aria-current={isConversationsActive ? "page" : undefined}
      >
        <MessageCircle
          size={26}
          fill={isConversationsActive ? "#f59e0b" : "none"}
          stroke={isConversationsActive ? "#f59e0b" : "#9ca3af"}
          strokeWidth={1.9}
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
