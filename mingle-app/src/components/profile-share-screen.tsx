"use client";

import type { AppDictionary, AppLocale } from "@/i18n";
import { buildClientApiPath } from "@/lib/api-contract";
import {
  ChevronLeft,
  Download,
  Link2,
  QrCode,
  Share2,
} from "lucide-react";
import * as QRCode from "qrcode";
import { useSession } from "next-auth/react";
import { formatHandle } from "@/lib/handles";
import { isLeftEdgeSwipeStart } from "@/lib/edge-swipe";
import { buildProfileLinkUrl, parseMingleProfileLink } from "@/lib/profile-link";
import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";
import { useRouter } from "next/navigation";
import { motion, useAnimationControls } from "framer-motion";

type ProfileShareScreenProps = {
  dictionary: AppDictionary;
  locale: AppLocale;
  initialHandle?: string;
  initialUserId?: string;
};

type NativeBridgeWindow = Window & {
  ReactNativeWebView?: {
    postMessage?: (message: string) => void;
  };
};

type NativeQrScannerEventDetail = {
  type?: "result" | "cancel" | "error";
  value?: string;
  message?: string;
};

type NativeQrSaveEventDetail = {
  type?: "success" | "error";
  message?: string;
};

const PROFILE_SHARE_TRANSITION = {
  duration: 0.32,
  ease: [0.22, 1, 0.36, 1] as const,
};
const PROFILE_SHARE_SWIPE_THRESHOLD_PX = 72;
const PROFILE_SHARE_BACKGROUND = "linear-gradient(135deg, #1295e8 0%, #3569ed 52%, #7338f2 100%)";

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

export default function ProfileShareScreen({
  dictionary,
  locale,
  initialHandle = "",
  initialUserId = "",
}: ProfileShareScreenProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const motionControls = useAnimationControls();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [profileName, setProfileName] = useState("");
  const [rawHandle, setRawHandle] = useState(initialHandle.trim());
  const [profileRecordId, setProfileRecordId] = useState("");
  const [qrData, setQrData] = useState<{ profileUrl: string; dataUrl: string } | null>(null);
  const statusTimeoutRef = useRef<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const isLeavingRef = useRef(false);
  const isMountedRef = useRef(false);

  const sessionUserId = session?.user?.id ?? "";
  const requestedUserId = initialUserId.trim();
  const profileUserId = profileRecordId || sessionUserId;
  const fallbackUserName = dictionary.connect.userFallbackLabel
    ?? (locale === "ko" ? "Mingle 사용자" : "Mingle user");
  const name = profileName
    || (requestedUserId ? fallbackUserName : session?.user?.name?.trim() || dictionary.titles.my);
  const profileHandle = formatHandle(rawHandle);
  const profileUrl = useMemo(() => {
    if (typeof window === "undefined" || !profileUserId) return "";
    return buildProfileLinkUrl(window.location.origin, profileUserId) ?? "";
  }, [profileUserId]);
  const qrDataUrl = qrData?.profileUrl === profileUrl ? qrData.dataUrl : null;
  const copy = {
    copyLink: dictionary.profile.profileShareCopyLinkLabel ?? "Copy link",
    copied: dictionary.profile.profileShareCopiedMessage ?? "Profile link copied.",
    copyFailed: dictionary.profile.profileShareCopyFailedMessage ?? "Could not copy the profile link.",
    download: dictionary.profile.profileShareDownloadLabel ?? "Download",
    qrScan: dictionary.profile.profileShareQrScanLabel ?? "Scan QR code",
    qrLoading: locale === "ko" ? "QR 코드를 만드는 중..." : "Creating your QR code...",
    qrUnavailable: locale === "ko" ? "프로필 링크를 아직 준비하지 못했습니다." : "Your profile link is not ready yet.",
    qrScannerUnavailable: locale === "ko"
      ? "QR 스캔은 Mingle 앱에서 사용할 수 있습니다."
      : "QR scanning is available in the Mingle app.",
    qrInvalid: locale === "ko" ? "Mingle 프로필 QR이 아닙니다." : "This is not a Mingle profile QR code.",
    qrScanFailed: locale === "ko" ? "QR 코드를 처리하지 못했습니다." : "Could not process this QR code.",
    qrSaving: locale === "ko" ? "QR 코드를 저장하는 중..." : "Saving your QR code...",
    qrDownloaded: locale === "ko" ? "QR 코드를 저장했습니다." : "QR code downloaded.",
    qrDownloadFailed: locale === "ko" ? "QR 코드 저장에 실패했습니다." : "Could not download the QR code.",
  };

  useEffect(() => {
    if (!requestedUserId && !sessionUserId) return;

    let cancelled = false;
    setProfileRecordId(requestedUserId);
    setProfileName("");
    setRawHandle(initialHandle.trim());
    const endpoint = requestedUserId
      ? buildClientApiPath(`/users/${encodeURIComponent(requestedUserId)}`)
      : buildClientApiPath("/profile");
    void fetch(endpoint, { cache: "no-store" })
      .then(async (response) => (response.ok
        ? response.json() as Promise<{ id?: unknown; name?: unknown; handle?: unknown }>
        : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (typeof data.id === "string") setProfileRecordId(data.id.trim());
        if (typeof data.name === "string") setProfileName(data.name.trim());
        if (typeof data.handle === "string") setRawHandle(data.handle.trim());
      })
      .catch(() => {
        // The session name remains available when profile hydration fails.
      });

    return () => {
      cancelled = true;
    };
  }, [initialHandle, requestedUserId, sessionUserId]);

  useEffect(() => {
    if (!profileUrl) {
      return;
    }

    let cancelled = false;
    void QRCode.toDataURL(profileUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 720,
      color: {
        dark: "#111827",
        light: "#ffffff",
      },
    })
      .then((dataUrl) => {
        if (!cancelled) setQrData({ profileUrl, dataUrl });
      })
      .catch(() => {
        if (!cancelled) setQrData((current) => (current?.profileUrl === profileUrl ? null : current));
      });

    return () => {
      cancelled = true;
    };
  }, [profileUrl]);

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
    if (!profileUrl) {
      showStatus(copy.qrUnavailable);
      return;
    }
    try {
      await copyTextToClipboard(profileUrl);
      showStatus(copy.copied);
    } catch {
      showStatus(copy.copyFailed);
    }
  }, [copy.copyFailed, copy.copied, copy.qrUnavailable, profileUrl, showStatus]);

  const handleOpenQrScanner = useCallback(() => {
    if (typeof window === "undefined") return;
    const bridgeWindow = window as NativeBridgeWindow;
    if (typeof bridgeWindow.ReactNativeWebView?.postMessage !== "function") {
      showStatus(copy.qrScannerUnavailable);
      return;
    }

    bridgeWindow.ReactNativeWebView.postMessage(JSON.stringify({
      type: "native_qr_scanner_open",
      payload: {
        title: copy.qrScan,
        instruction: locale === "ko" ? "프로필 QR 코드를 사각형 안에 맞춰주세요." : "Place the profile QR code inside the frame.",
        cancelLabel: dictionary.profile.profileShareBackLabel ?? (locale === "ko" ? "뒤로가기" : "Back"),
        settingsLabel: locale === "ko" ? "설정 열기" : "Open settings",
      },
    }));
  }, [copy.qrScan, copy.qrScannerUnavailable, dictionary.profile.profileShareBackLabel, locale, showStatus]);

  const handleDownloadQr = useCallback(() => {
    if (!qrDataUrl) {
      showStatus(copy.qrUnavailable);
      return;
    }

    const fileName = `mingle-profile-${profileUserId || "profile"}.png`;
    const bridgeWindow = window as NativeBridgeWindow;
    if (typeof bridgeWindow.ReactNativeWebView?.postMessage === "function") {
      try {
        showStatus(copy.qrSaving);
        bridgeWindow.ReactNativeWebView.postMessage(JSON.stringify({
          type: "native_qr_save",
          payload: {
            dataUrl: qrDataUrl,
            fileName,
          },
        }));
      } catch {
        showStatus(copy.qrDownloadFailed);
      }
      return;
    }

    try {
      const anchor = document.createElement("a");
      anchor.href = qrDataUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      showStatus(copy.qrDownloaded);
    } catch {
      showStatus(copy.qrDownloadFailed);
    }
  }, [copy.qrDownloadFailed, copy.qrDownloaded, copy.qrSaving, copy.qrUnavailable, profileUserId, qrDataUrl, showStatus]);

  const handleShareProfile = useCallback(async () => {
    if (!profileUrl) {
      showStatus(copy.qrUnavailable);
      return;
    }

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
  }, [copy.qrUnavailable, dictionary.profile.shareProfile, name, handleCopyLink, profileUrl, showStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleNativeQrScannerEvent = (event: Event) => {
      const detail = (event as CustomEvent<NativeQrScannerEventDetail>).detail;
      if (!detail || detail.type !== "result" || typeof detail.value !== "string") return;

      const parsed = parseMingleProfileLink(detail.value, [window.location.origin]);
      if (!parsed) {
        showStatus(copy.qrInvalid);
        return;
      }

      router.push(`/${locale}/users/${encodeURIComponent(parsed.userId)}`);
    };

    window.addEventListener("mingle:native-qr-scanner", handleNativeQrScannerEvent);
    return () => window.removeEventListener("mingle:native-qr-scanner", handleNativeQrScannerEvent);
  }, [copy.qrInvalid, locale, router, showStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleNativeQrSaveEvent = (event: Event) => {
      const detail = (event as CustomEvent<NativeQrSaveEventDetail>).detail;
      if (!detail) return;
      if (detail.type === "success") {
        showStatus(copy.qrDownloaded);
      } else if (detail.type === "error") {
        showStatus(copy.qrDownloadFailed);
      }
    };

    window.addEventListener("mingle:native-qr-save", handleNativeQrSaveEvent);
    return () => window.removeEventListener("mingle:native-qr-save", handleNativeQrSaveEvent);
  }, [copy.qrDownloadFailed, copy.qrDownloaded, showStatus]);

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
          onClick={handleOpenQrScanner}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/35 transition active:bg-white/50"
          aria-label={copy.qrScan}
        >
          <QrCode size={24} strokeWidth={2.1} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-8">
        <div className="mx-auto flex min-h-[300px] w-full max-w-[360px] flex-col items-center justify-center rounded-[28px] bg-white px-6 py-8 shadow-[0_16px_40px_rgba(22,50,140,0.18)]">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt={`${name} Mingle profile QR code`}
              className="h-64 w-64 rounded-xl"
            />
          ) : (
            <QrCode size={92} strokeWidth={1.35} className="text-indigo-500" aria-hidden="true" />
          )}
          <span className="mt-6 text-center text-[15px] font-semibold text-gray-500">
            {qrDataUrl ? profileHandle || profileUrl : copy.qrLoading}
          </span>
          {profileUrl ? (
            <span className="mt-2 max-w-full truncate text-center text-[11px] text-gray-400">{profileUrl}</span>
          ) : null}
        </div>

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
            onClick={handleDownloadQr}
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
