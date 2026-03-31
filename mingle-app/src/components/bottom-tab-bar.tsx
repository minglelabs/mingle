"use client";

import type { AppDictionary } from "@/i18n/types";
import { useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { useEffect } from "react";

type BottomTabBarProps = {
  locale: string;
  dictionary: AppDictionary;
  activeRoute?: "conversations" | "mypage" | null;
  onConversationsPress?: () => void;
  onMypagePress?: () => void;
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

function DefaultProfileIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" fill="none" aria-hidden>
      <circle cx="13" cy="13" r="13" fill="#e5e7eb" />
      <circle cx="13" cy="10" r="4" fill="#9ca3af" />
      <path d="M5 22c0-4.418 3.582-8 8-8s8 3.582 8 8" fill="#9ca3af" />
    </svg>
  );
}

function ProfileAvatar({
  imageUrl,
  altLabel,
}: {
  imageUrl?: string | null;
  altLabel: string;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={altLabel}
        width={28}
        height={28}
        className="h-7 w-7 rounded-full object-cover"
      />
    );
  }
  return <DefaultProfileIcon size={28} />;
}

export default function BottomTabBar({
  locale,
  dictionary,
  activeRoute,
  onConversationsPress,
  onMypagePress,
}: BottomTabBarProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const baseTabBarHeightPx = 72;
  const searchParamsKey = searchParams.toString();

  const conversationsPath = `/${locale}/conversations`;
  const mypagePath = `/${locale}/mypage`;
  const conversationsHref = buildNativeAwareTabPath(conversationsPath, searchParams);
  const mypageHref = buildNativeAwareTabPath(mypagePath, searchParams);

  const isConversationsActive = activeRoute === undefined
    ? (pathname === conversationsPath || pathname.startsWith(`/${locale}/conversations`))
    : activeRoute === "conversations";
  const isMypageActive = activeRoute === undefined
    ? (pathname === mypagePath || pathname.startsWith(`/${locale}/mypage`))
    : activeRoute === "mypage";

  const activeColor = "#f59e0b";
  const inactiveColor = "#9ca3af";

  useEffect(() => {
    if (typeof window === "undefined") return;

    const bridgeWindow = window as NativeBridgeWindow;
    if (typeof bridgeWindow.ReactNativeWebView?.postMessage !== "function") return;

    try {
      bridgeWindow.ReactNativeWebView.postMessage(JSON.stringify({
        type: "native_navigation_state",
        payload: {
          url: window.location.href,
          canGoBack: window.history.length > 1,
        },
      }));
    } catch {
      // Ignore bridge sync failures outside the native shell.
    }
  }, [pathname, searchParamsKey]);

  return (
    <nav
      className="flex w-full shrink-0 items-stretch border-t border-[#f4d6a2] bg-white"
      style={{
        // safe area 즉시 적용: iOS WKWebView에서 초기 렌더부터 반영
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        height: `calc(${baseTabBarHeightPx}px + env(safe-area-inset-bottom, 0px))`,
      }}
      aria-label={dictionary.navigation.bottomTabBarLabel}
    >
      {/* 대화목록 탭 */}
      <button
        type="button"
        onClick={() => {
          if (onConversationsPress) {
            onConversationsPress();
            return;
          }
          router.push(conversationsHref);
        }}
        className="flex flex-1 items-center justify-center transition-opacity active:opacity-60"
        style={{ paddingBottom: 0 }}
        aria-label={dictionary.navigation.conversationsTab}
        aria-current={isConversationsActive ? "page" : undefined}
      >
        <MessageCircle
          size={26}
          fill={isConversationsActive ? activeColor : "none"}
          stroke={isConversationsActive ? activeColor : inactiveColor}
          strokeWidth={1.8}
        />
      </button>

      {/* 마이페이지 탭 */}
      <button
        type="button"
        onClick={() => {
          if (onMypagePress) {
            onMypagePress();
            return;
          }
          router.push(mypageHref);
        }}
        className="flex flex-1 items-center justify-center transition-opacity active:opacity-60"
        style={{ paddingBottom: 0 }}
        aria-label={dictionary.navigation.myPageTab}
        aria-current={isMypageActive ? "page" : undefined}
      >
        <div
          className="rounded-full"
          style={{
            outline: isMypageActive ? `2px solid ${activeColor}` : "2px solid transparent",
            outlineOffset: "1px",
          }}
        >
          <ProfileAvatar
            imageUrl={session?.user?.image}
            altLabel={dictionary.navigation.profileImageAlt}
          />
        </div>
      </button>
    </nav>
  );
}
