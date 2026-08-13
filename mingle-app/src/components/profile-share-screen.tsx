"use client";

import type { AppDictionary, AppLocale } from "@/i18n";
import {
  ChevronLeft,
  Download,
  Link2,
  QrCode,
  Share2,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { formatUsername } from "@/lib/usernames";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useAnimationControls, type PanInfo } from "framer-motion";

type ProfileShareScreenProps = {
  dictionary: AppDictionary;
  locale: AppLocale;
};

type NativeBridgeWindow = Window & {
  ReactNativeWebView?: {
    postMessage?: (message: string) => void;
  };
};

const PROFILE_SHARE_TRANSITION = {
  duration: 0.32,
  ease: [0.22, 1, 0.36, 1] as const,
};
const PROFILE_SHARE_SWIPE_THRESHOLD_PX = 72;
const PROFILE_SHARE_SWIPE_VELOCITY_PX_PER_SECOND = 650;

function buildProfileShareUrl(locale: AppLocale): string {
  const profilePath = `/${locale}/mypage`;
  if (typeof window === "undefined") return profilePath;

  try {
    return new URL(profilePath, window.location.origin).toString();
  } catch {
    return profilePath;
  }
}

async function copyTextToClipboard(value: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("clipboard_unavailable");
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) {
    throw new Error("clipboard_copy_failed");
  }
}

export default function ProfileShareScreen({ dictionary, locale }: ProfileShareScreenProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const motionControls = useAnimationControls();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profileUsername, setProfileUsername] = useState("");
  const statusTimeoutRef = useRef<number | null>(null);
  const isLeavingRef = useRef(false);
  const isMountedRef = useRef(false);

  const sessionUserId = session?.user?.id ?? "";
  const displayName = profileDisplayName || session?.user?.name?.trim() || dictionary.titles.my;
  const profileHandle = formatUsername(profileUsername) || (displayName.startsWith("@")
    ? displayName
    : `@${displayName.replace(/\s+/g, "")}`);
  const profileUrl = useMemo(() => buildProfileShareUrl(locale), [locale]);
  const comingSoonLabel = locale === "ko"
    ? "아직 기능 준비중입니다."
    : dictionary.profile.comingSoonLabel ?? "Coming soon.";
  const copy = locale === "ko"
    ? {
        copyLink: "링크 복사",
        copied: "프로필 링크를 복사했습니다.",
        copyFailed: "링크 복사에 실패했습니다.",
        download: "다운로드",
        qrScan: "QR 스캔",
      }
    : {
        copyLink: "Copy link",
        copied: "Profile link copied.",
        copyFailed: "Could not copy the profile link.",
        download: "Download",
      qrScan: "Scan QR code",
    };

  useEffect(() => {
    if (!sessionUserId) return;

    let cancelled = false;
    void fetch("/api/profile", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() as Promise<{ displayName?: unknown; username?: unknown }> : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (typeof data.displayName === "string") setProfileDisplayName(data.displayName.trim());
        if (typeof data.username === "string") setProfileUsername(data.username.trim());
      })
      .catch(() => {
        // The session name remains available when profile hydration fails.
      });

    return () => {
      cancelled = true;
    };
  }, [sessionUserId]);

  const showStatus = useCallback((message: string) => {
    setStatusMessage(message);
    if (statusTimeoutRef.current) {
      window.clearTimeout(statusTimeoutRef.current);
    }
    statusTimeoutRef.current = window.setTimeout(() => {
      setStatusMessage(null);
      statusTimeoutRef.current = null;
    }, 2400);
  }, []);

  const navigateBack = useCallback(() => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push(`/${locale}/mypage`);
  }, [locale, router]);

  const handleBack = useCallback(async () => {
    if (isLeavingRef.current || !isMountedRef.current) return;
    isLeavingRef.current = true;
    await motionControls.start({ x: "100%", transition: PROFILE_SHARE_TRANSITION });
    if (!isMountedRef.current) return;
    navigateBack();
  }, [motionControls, navigateBack]);

  const handleDragEnd = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (isLeavingRef.current || !isMountedRef.current) return;

    const closeThreshold = Math.max(
      PROFILE_SHARE_SWIPE_THRESHOLD_PX,
      viewportWidth * 0.2,
    );
    if (info.offset.x >= closeThreshold || info.velocity.x >= PROFILE_SHARE_SWIPE_VELOCITY_PX_PER_SECOND) {
      void handleBack();
      return;
    }

    void motionControls.start({ x: 0, transition: PROFILE_SHARE_TRANSITION });
  }, [handleBack, motionControls, viewportWidth]);

  const handleCopyLink = useCallback(async () => {
    try {
      await copyTextToClipboard(profileUrl);
      showStatus(copy.copied);
    } catch {
      showStatus(copy.copyFailed);
    }
  }, [copy.copyFailed, copy.copied, profileUrl, showStatus]);

  const handleShareProfile = useCallback(async () => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: displayName,
          text: dictionary.profile.shareProfile,
          url: profileUrl,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }

    await handleCopyLink();
  }, [dictionary.profile.shareProfile, displayName, handleCopyLink, profileUrl]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    isMountedRef.current = true;
    const syncViewportWidth = () => {
      setViewportWidth(Math.max(1, window.innerWidth));
    };
    syncViewportWidth();
    window.addEventListener("resize", syncViewportWidth);

    void motionControls.start({ x: 0, transition: PROFILE_SHARE_TRANSITION });

    return () => {
      isMountedRef.current = false;
      window.removeEventListener("resize", syncViewportWidth);
    };
  }, [motionControls]);

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
  }, []);

  useEffect(() => () => {
    if (statusTimeoutRef.current) {
      window.clearTimeout(statusTimeoutRef.current);
    }
  }, []);

  return (
    <motion.main
      initial={{ x: "100%" }}
      animate={motionControls}
      drag="x"
      dragConstraints={{ left: 0, right: viewportWidth }}
      dragElastic={0.08}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      className="fixed inset-0 z-[100] flex min-h-0 w-full flex-col overflow-hidden text-slate-950"
      style={{
        background: "linear-gradient(135deg, #1295e8 0%, #3569ed 52%, #7338f2 100%)",
        touchAction: "pan-y",
      }}
    >
      <header
        className="grid shrink-0 grid-cols-[44px_1fr_44px] items-center px-4 text-white"
        style={{
          height: "calc(62px + env(safe-area-inset-top, 44px))",
          paddingTop: "env(safe-area-inset-top, 44px)",
        }}
      >
        <button
          type="button"
          onClick={handleBack}
          className="flex h-11 w-11 items-center justify-center rounded-full transition active:bg-white/15"
          aria-label={locale === "ko" ? "뒤로가기" : "Back"}
        >
          <ChevronLeft size={30} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <h1 className="truncate text-center text-[18px] font-semibold">{dictionary.profile.shareProfile}</h1>
        <button
          type="button"
          onClick={() => showStatus(comingSoonLabel)}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/35 transition active:bg-white/50"
          aria-label={copy.qrScan}
        >
          <QrCode size={24} strokeWidth={2.1} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-8">
        <button
          type="button"
          onClick={() => showStatus(comingSoonLabel)}
          className="mx-auto flex min-h-[300px] w-full max-w-[360px] flex-col items-center justify-center rounded-[28px] bg-white px-6 py-8 shadow-[0_16px_40px_rgba(22,50,140,0.18)] transition active:bg-white/90"
          aria-label={comingSoonLabel}
        >
          <QrCode size={92} strokeWidth={1.35} className="text-indigo-500" aria-hidden="true" />
          <span className="mt-6 text-[15px] font-semibold text-gray-500">{comingSoonLabel}</span>
          <span className="mt-2 text-[14px] text-gray-400">{profileHandle}</span>
        </button>

        <div className="mx-auto mt-7 grid w-full max-w-[360px] grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => void handleShareProfile()}
            className="flex min-h-[112px] flex-col items-center justify-center rounded-[22px] bg-white px-2 py-4 text-[14px] font-semibold text-slate-900 shadow-[0_12px_30px_rgba(22,50,140,0.16)] transition active:bg-white/90"
          >
            <Share2 size={30} strokeWidth={1.8} aria-hidden="true" />
            <span className="mt-3">{dictionary.profile.shareProfile}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleCopyLink()}
            className="flex min-h-[112px] flex-col items-center justify-center rounded-[22px] bg-white px-2 py-4 text-[14px] font-semibold text-slate-900 shadow-[0_12px_30px_rgba(22,50,140,0.16)] transition active:bg-white/90"
          >
            <Link2 size={30} strokeWidth={1.8} aria-hidden="true" />
            <span className="mt-3">{copy.copyLink}</span>
          </button>
          <button
            type="button"
            onClick={() => showStatus(comingSoonLabel)}
            className="flex min-h-[112px] flex-col items-center justify-center rounded-[22px] bg-white px-2 py-4 text-[14px] font-semibold text-slate-900 shadow-[0_12px_30px_rgba(22,50,140,0.16)] transition active:bg-white/90"
          >
            <Download size={30} strokeWidth={1.8} aria-hidden="true" />
            <span className="mt-3">{copy.download}</span>
          </button>
        </div>
      </div>

      {statusMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/70 px-4 py-2 text-[13px] font-medium text-white shadow-lg"
        >
          {statusMessage}
        </div>
      ) : null}
    </motion.main>
  );
}
