"use client";

import type { AppDictionary } from "@/i18n/types";
import { MessageCircle, UserCircle } from "lucide-react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

type BottomTabBarProps = {
  activeRoute?: "conversations" | "mypage" | null;
  dictionary: AppDictionary;
  locale: string;
};

type NativeBridgeWindow = Window & {
  ReactNativeWebView?: {
    postMessage?: (message: string) => void;
  };
};

const PRESERVED_NATIVE_QUERY_KEYS = [
  "apiNamespace",
  "nativeAuth",
  "nativeBannerPosition",
  "nativeBottomInsetPx",
  "nativeConversationBannerPosition",
  "nativeConversationBottomInsetPx",
  "nativeListTopInsetPx",
  "nativePlatform",
  "nativeStt",
  "nativeTopInsetPx",
  "nativeUi",
  "sttDebug",
  "ttsDebug",
] as const;

function buildNativeAwareTabPath(
  pathname: string,
  searchParams: Pick<URLSearchParams, "getAll">,
): string {
  const nextSearchParams = new URLSearchParams();

  for (const key of PRESERVED_NATIVE_QUERY_KEYS) {
    for (const value of searchParams.getAll(key)) {
      nextSearchParams.append(key, value);
    }
  }

  const nextSearch = nextSearchParams.toString();
  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
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
        width={28}
        height={28}
        className="h-7 w-7 rounded-full object-cover"
        style={{
          outline: active ? "2px solid #f59e0b" : "2px solid transparent",
          outlineOffset: "1px",
        }}
      />
    );
  }

  return (
    <UserCircle
      size={30}
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

  const conversationsPath = `/${locale}/conversations`;
  const mypagePath = `/${locale}/mypage`;
  const conversationsHref = buildNativeAwareTabPath(conversationsPath, searchParams);
  const mypageHref = buildNativeAwareTabPath(mypagePath, searchParams);

  const isConversationsActive = activeRoute === undefined
    ? pathname === conversationsPath || pathname.startsWith(`${conversationsPath}/`)
    : activeRoute === "conversations";
  const isMypageActive = activeRoute === undefined
    ? pathname === mypagePath || pathname.startsWith(`${mypagePath}/`)
    : activeRoute === "mypage";

  useEffect(() => {
    if (typeof window === "undefined") return;

    const bridgeWindow = window as NativeBridgeWindow;
    if (typeof bridgeWindow.ReactNativeWebView?.postMessage !== "function") return;

    try {
      bridgeWindow.ReactNativeWebView.postMessage(JSON.stringify({
        type: "native_navigation_state",
        payload: {
          canGoBack: window.history.length > 1,
          url: window.location.href,
        },
      }));
    } catch {
      // Leave native navigation unchanged when bridge serialization fails.
    }
  }, [pathname, searchParamsKey]);

  return (
    <nav
      aria-label={dictionary.navigation.bottomTabBarLabel}
      className="flex w-full shrink-0 items-stretch border-t border-gray-100 bg-white"
      style={{
        height: "calc(52px + env(safe-area-inset-bottom, 0px))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <button
        type="button"
        onClick={() => router.push(conversationsHref)}
        className="flex flex-1 items-center justify-center transition active:opacity-60"
        aria-label={dictionary.navigation.conversationsTab}
        aria-current={isConversationsActive ? "page" : undefined}
      >
        <MessageCircle
          size={28}
          fill={isConversationsActive ? "#f59e0b" : "none"}
          stroke={isConversationsActive ? "#f59e0b" : "#9ca3af"}
          strokeWidth={1.9}
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        onClick={() => router.push(mypageHref)}
        className="flex flex-1 items-center justify-center transition active:opacity-60"
        aria-label={dictionary.navigation.myPageTab}
        aria-current={isMypageActive ? "page" : undefined}
      >
        <ProfileTabIcon
          active={isMypageActive}
          alt={dictionary.navigation.profileImageAlt}
          imageUrl={session?.user?.image}
        />
      </button>
    </nav>
  );
}
