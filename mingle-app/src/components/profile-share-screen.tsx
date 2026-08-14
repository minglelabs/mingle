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
import { formatHandle } from "@/lib/handles";
import { isLeftEdgeSwipeStart } from "@/lib/edge-swipe";
import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";
import { useRouter } from "next/navigation";
import { motion, useAnimationControls } from "framer-motion";

type ProfileShareScreenProps = {
  dictionary: AppDictionary;
  locale: AppLocale;
  initialHandle?: string;
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
const PROFILE_SHARE_BACKGROUND = "linear-gradient(135deg, #1295e8 0%, #3569ed 52%, #7338f2 100%)";

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

export default function ProfileShareScreen({ dictionary, locale, initialHandle = "" }: ProfileShareScreenProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const motionControls = useAnimationControls();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [profileName, setProfileName] = useState("");
  const [rawHandle, setRawHandle] = useState(initialHandle.trim());
  const statusTimeoutRef = useRef<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const isLeavingRef = useRef(false);
  const isMountedRef = useRef(false);

  const sessionUserId = session?.user?.id ?? "";
  const name = profileName || session?.user?.name?.trim() || dictionary.titles.my;
  const profileHandle = formatHandle(rawHandle);
  const profileUrl = useMemo(() => buildProfileShareUrl(locale), [locale]);
  const qrComingSoonLabel = dictionary.profile.profileShareQrComingSoonLabel
    ?? (locale === "ko" ? "아직 QR 기능은 준비중입니다." : "QR features are not available yet.");
  const copy = {
    copyLink: dictionary.profile.profileShareCopyLinkLabel ?? "Copy link",
    copied: dictionary.profile.profileShareCopiedMessage ?? "Profile link copied.",
    copyFailed: dictionary.profile.profileShareCopyFailedMessage ?? "Could not copy the profile link.",
    download: dictionary.profile.profileShareDownloadLabel ?? "Download",
    qrScan: dictionary.profile.profileShareQrScanLabel ?? "Scan QR code",
  };

  useEffect(() => {
    if (!sessionUserId) return;

    let cancelled = false;
    void fetch("/api/profile", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() as Promise<{ name?: unknown; handle?: unknown }> : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (typeof data.name === "string") setProfileName(data.name.trim());
        if (typeof data.handle === "string") setRawHandle(data.handle.trim());
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
    if (isMountedRef.current) navigateBack();
  }, [motionControls, navigateBack]);

  const handleTouchStart = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) {
      touchStartRef.current = null;
      return;
    }

    const localClientX = touch.clientX - event.currentTarget.getBoundingClientRect().left;
    if (!isLeftEdgeSwipeStart(localClientX)) {
      touchStartRef.current = null;
      return;
    }

    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || isLeavingRef.current || !isMountedRef.current) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = Math.abs(touch.clientY - start.y);
    const closeThreshold = Math.max(
      PROFILE_SHARE_SWIPE_THRESHOLD_PX,
      viewportWidth * 0.2,
    );
    if (deltaX >= closeThreshold && deltaX > deltaY * 1.2) {
      void handleBack();
    }
  }, [handleBack, viewportWidth]);

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
          title: name,
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
  }, [dictionary.profile.shareProfile, name, handleCopyLink, profileUrl]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    isMountedRef.current = true;
    const syncViewportWidth = () => {
      setViewportWidth(Math.max(1, window.innerWidth));
    };
    syncViewportWidth();
    window.addEventListener("resize", syncViewportWidth);

    void router.prefetch(`/${locale}/mypage`);
    void motionControls.start({ x: 0, transition: PROFILE_SHARE_TRANSITION });

    return () => {
      isMountedRef.current = false;
      window.removeEventListener("resize", syncViewportWidth);
    };
  }, [locale, motionControls, router]);

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
    <div
      className="fixed inset-0 z-[100] overflow-hidden"
      style={{ background: PROFILE_SHARE_BACKGROUND }}
    >
      <motion.main
        initial={{ x: "100%" }}
        animate={motionControls}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => {
          touchStartRef.current = null;
        }}
        className="absolute inset-0 flex min-h-0 w-full flex-col overflow-hidden text-slate-950"
        style={{ touchAction: "pan-y" }}
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
          onClick={() => void handleBack()}
          className="flex h-11 w-11 items-center justify-center rounded-full transition active:bg-white/15"
          aria-label={dictionary.profile.profileShareBackLabel ?? "Back"}
        >
          <ChevronLeft size={30} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <h1 className="truncate text-center text-[18px] font-semibold">{dictionary.profile.shareProfile}</h1>
        <button
          type="button"
          onClick={() => showStatus(qrComingSoonLabel)}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/35 transition active:bg-white/50"
          aria-label={copy.qrScan}
        >
          <QrCode size={24} strokeWidth={2.1} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-8">
        <button
          type="button"
          onClick={() => showStatus(qrComingSoonLabel)}
          className="mx-auto flex min-h-[300px] w-full max-w-[360px] flex-col items-center justify-center rounded-[28px] bg-white px-6 py-8 shadow-[0_16px_40px_rgba(22,50,140,0.18)] transition active:bg-white/90"
          aria-label={qrComingSoonLabel}
        >
          <QrCode size={92} strokeWidth={1.35} className="text-indigo-500" aria-hidden="true" />
          <span className="mt-6 text-[15px] font-semibold text-gray-500">{qrComingSoonLabel}</span>
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
            onClick={() => showStatus(qrComingSoonLabel)}
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
    </div>
  );
}
