"use client";

import type { AppDictionary, AppLocale } from "@/i18n";
import { buildClientApiPath } from "@/lib/api-contract";
import { formatHandle } from "@/lib/handles";
import { buildProfileImageTransform, type ProfileImageCropInput } from "@/lib/profile-image-crop";
import ProfileImagePreview from "@/components/profile-image-preview";
import ProfileLanguageFlagStack from "@/components/profile-language-flag-stack";
import {
  STT_LANGUAGE_OPTIONS,
  canonicalizeSttLanguageCode,
  getSttLanguageDisplayName,
  sanitizeSttLanguageSelection,
} from "@/lib/stt-languages";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Loader2,
  UserRound,
  UserX,
  X,
} from "lucide-react";
import { motion, useAnimationControls, type PanInfo } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

type PublicUserProfileScreenProps = {
  dictionary: AppDictionary;
  locale: AppLocale;
  userId: string;
  onClose?: () => void;
};

type PublicUserProfile = {
  id: string;
  handle: string | null;
  name: string | null;
  image: string | null;
  imageCropScale: number | null;
  imageCropX: number | null;
  imageCropY: number | null;
  bio: string | null;
  nationality: string | null;
  primaryLanguages: string[];
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
  isBlocked: boolean;
};

type ReportReason = "spam" | "harassment" | "inappropriate" | "impersonation" | "other";

const PROFILE_TRANSITION = {
  duration: 0.32,
  ease: [0.22, 1, 0.36, 1] as const,
};
const SWIPE_THRESHOLD_PX = 72;
const SWIPE_VELOCITY_PX_PER_SECOND = 650;

function getCopy(dictionary: AppDictionary, locale: AppLocale) {
  const isKorean = locale === "ko";
  return {
    back: dictionary.profile.profileShareBackLabel ?? (isKorean ? "뒤로가기" : "Back"),
    userFallback: dictionary.connect.userFallbackLabel ?? (isKorean ? "Mingle 사용자" : "Mingle user"),
    profileLoadError: dictionary.profile.profileLoadError
      ?? (isKorean ? "프로필을 불러오지 못했습니다." : "Could not load this profile."),
    follow: dictionary.connect.followAction ?? (isKorean ? "팔로우" : "Follow"),
    following: dictionary.connect.followingAction ?? (isKorean ? "팔로잉" : "Following"),
    block: dictionary.profile.blockAction ?? (isKorean ? "차단" : "Block"),
    unblock: dictionary.profile.unblockAction ?? (isKorean ? "차단 해제" : "Unblock"),
    report: dictionary.profile.reportAction ?? (isKorean ? "신고" : "Report"),
    blockConfirm: dictionary.profile.blockConfirm
      ?? (isKorean ? "이 사용자를 차단하시겠습니까?" : "Block this user?"),
    unblockConfirm: dictionary.profile.unblockConfirm
      ?? (isKorean ? "차단을 해제하시겠습니까?" : "Unblock this user?"),
    blockError: dictionary.profile.blockError
      ?? (isKorean ? "차단 상태를 변경하지 못했습니다." : "Could not update the block status."),
    reportTitle: dictionary.profile.reportTitle ?? (isKorean ? "사용자 신고" : "Report user"),
    reportReasonLabel: dictionary.profile.reportReasonLabel ?? (isKorean ? "신고 사유" : "Reason"),
    reportMessageLabel: dictionary.profile.reportMessageLabel ?? (isKorean ? "상세 내용" : "Details"),
    reportMessagePlaceholder: dictionary.profile.reportMessagePlaceholder
      ?? (isKorean ? "상황을 자세히 적어 주세요. (선택사항)" : "Tell us what happened. (Optional)"),
    reportSubmit: dictionary.profile.reportSubmitAction ?? (isKorean ? "신고 보내기" : "Submit report"),
    reportCancel: dictionary.profile.reportCancelAction ?? (isKorean ? "취소" : "Cancel"),
    reportSubmitted: dictionary.profile.reportSubmitted
      ?? (isKorean ? "신고가 접수되었습니다." : "Your report was submitted."),
    reportError: dictionary.profile.reportError
      ?? (isKorean ? "신고를 보내지 못했습니다." : "Could not submit the report."),
    status: dictionary.profile.reportPendingLabel ?? (isKorean ? "운영진 확인 중" : "Under review"),
    loading: dictionary.profile.profileLoadingLabel ?? (isKorean ? "불러오는 중" : "Loading"),
    reasons: {
      spam: dictionary.profile.reportReasonSpam ?? (isKorean ? "스팸·도배" : "Spam"),
      harassment: dictionary.profile.reportReasonHarassment ?? (isKorean ? "괴롭힘·불쾌한 행동" : "Harassment"),
      inappropriate: dictionary.profile.reportReasonInappropriate ?? (isKorean ? "부적절한 콘텐츠" : "Inappropriate content"),
      impersonation: dictionary.profile.reportReasonImpersonation ?? (isKorean ? "사칭" : "Impersonation"),
      other: dictionary.profile.reportReasonOther ?? (isKorean ? "기타" : "Other"),
    } satisfies Record<ReportReason, string>,
  };
}

function ProfileAvatar({
  image,
  label,
  crop,
  languages,
  size = 88,
  onClick,
}: {
  image: string | null;
  label: string;
  crop?: ProfileImageCropInput;
  languages: readonly string[];
  size?: number;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80"
      style={{ height: size, width: size }}
      aria-label={label}
    >
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-100">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={label}
            width={size}
            height={size}
            className="h-full w-full object-cover"
            style={{ transform: buildProfileImageTransform(size, crop) }}
          />
        ) : (
          <UserRound size={Math.round(size * 0.58)} className="text-gray-400" aria-hidden="true" />
        )}
      </div>
      <ProfileLanguageFlagStack languages={languages} size={size} />
    </button>
  );
}

function getLanguageOption(value: string | null | undefined) {
  const normalized = typeof value === "string" ? canonicalizeSttLanguageCode(value) : "";
  return STT_LANGUAGE_OPTIONS.find((option) => option.code === normalized) ?? null;
}

export default function PublicUserProfileScreen({
  dictionary,
  locale,
  userId,
  onClose,
}: PublicUserProfileScreenProps) {
  const router = useRouter();
  const motionControls = useAnimationControls();
  const isMountedRef = useRef(false);
  const isLeavingRef = useRef(false);
  const [viewportWidth, setViewportWidth] = useState(1);
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>("spam");
  const [reportMessage, setReportMessage] = useState("");
  const [reportPending, setReportPending] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [showProfileImagePreview, setShowProfileImagePreview] = useState(false);
  const copy = useMemo(() => getCopy(dictionary, locale), [dictionary, locale]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(false);
    void fetch(buildClientApiPath(`/users/${encodeURIComponent(userId)}`), { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("profile_load_failed");
        return response.json() as Promise<PublicUserProfile>;
      })
      .then((data) => {
        if (cancelled) return;
        setProfile(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    isMountedRef.current = true;
    const syncViewportWidth = () => setViewportWidth(Math.max(1, window.innerWidth));
    syncViewportWidth();
    window.addEventListener("resize", syncViewportWidth);
    void motionControls.start({ x: 0, transition: PROFILE_TRANSITION });

    return () => {
      isMountedRef.current = false;
      window.removeEventListener("resize", syncViewportWidth);
    };
  }, [motionControls]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.ReactNativeWebView?.postMessage(JSON.stringify({
        type: "native_navigation_state",
        payload: { canGoBack: window.history.length > 1, url: window.location.href },
      }));
    } catch {
      // Keep browser navigation available when the native bridge is unavailable.
    }
  }, []);

  const navigateBack = useCallback(() => {
    if (onClose) {
      onClose();
      return;
    }
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push(`/${locale}/connect`);
  }, [locale, onClose, router]);

  const handleBack = useCallback(async () => {
    if (!isMountedRef.current || isLeavingRef.current) return;
    isLeavingRef.current = true;
    await motionControls.start({ x: "100%", transition: PROFILE_TRANSITION });
    if (isMountedRef.current) navigateBack();
  }, [motionControls, navigateBack]);

  const handleDragEnd = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (!isMountedRef.current || isLeavingRef.current) return;
    const threshold = Math.max(SWIPE_THRESHOLD_PX, viewportWidth * 0.2);
    if (info.offset.x >= threshold || info.velocity.x >= SWIPE_VELOCITY_PX_PER_SECOND) {
      void handleBack();
      return;
    }
    void motionControls.start({ x: 0, transition: PROFILE_TRANSITION });
  }, [handleBack, motionControls, viewportWidth]);

  const handleToggleFollow = useCallback(async () => {
    if (!profile || isActionPending || profile.isBlocked) return;
    setIsActionPending(true);
    setActionError(false);
    const nextIsFollowing = !profile.isFollowing;
    try {
      const response = await fetch(
        buildClientApiPath(`/users/${encodeURIComponent(profile.id)}/follow`),
        { method: nextIsFollowing ? "POST" : "DELETE" },
      );
      if (!response.ok) throw new Error("follow_failed");
      setProfile((current) => current ? { ...current, isFollowing: nextIsFollowing } : current);
    } catch {
      setActionError(true);
    } finally {
      setIsActionPending(false);
    }
  }, [isActionPending, profile]);

  const handleToggleBlock = useCallback(async () => {
    if (!profile || isActionPending) return;
    const nextIsBlocked = !profile.isBlocked;
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(nextIsBlocked ? copy.blockConfirm : copy.unblockConfirm);
      if (!confirmed) return;
    }

    setIsActionPending(true);
    setActionError(false);
    try {
      const response = await fetch(
        buildClientApiPath(`/users/${encodeURIComponent(profile.id)}/block`),
        { method: nextIsBlocked ? "POST" : "DELETE" },
      );
      if (!response.ok) throw new Error("block_failed");
      setProfile((current) => current ? {
        ...current,
        isBlocked: nextIsBlocked,
        isFollowing: nextIsBlocked ? false : current.isFollowing,
      } : current);
    } catch {
      setActionError(true);
    } finally {
      setIsActionPending(false);
    }
  }, [copy.blockConfirm, copy.unblockConfirm, isActionPending, profile]);

  const handleReportSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile || reportPending) return;
    setReportPending(true);
    setReportSubmitted(false);
    setActionError(false);
    try {
      const response = await fetch(
        buildClientApiPath(`/users/${encodeURIComponent(profile.id)}/report`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: reportReason,
            message: reportMessage.trim() || undefined,
          }),
        },
      );
      if (!response.ok) throw new Error("report_failed");
      setReportSubmitted(true);
      setReportMessage("");
      window.setTimeout(() => setReportOpen(false), 700);
    } catch {
      setActionError(true);
    } finally {
      setReportPending(false);
    }
  }, [profile, reportMessage, reportPending, reportReason]);

  const name = profile?.name?.trim() || copy.userFallback;
  const bio = profile?.bio?.trim() || (locale === "ko" ? "" : "");
  const primaryLanguages = sanitizeSttLanguageSelection(
    profile?.primaryLanguages,
    profile?.nationality ? [profile.nationality] : [],
  );
  const languageOption = getLanguageOption(primaryLanguages[0] ?? profile?.nationality);
  const languageName = languageOption
    ? getSttLanguageDisplayName(languageOption.code, locale) ?? languageOption.englishName
    : null;
  const handleOpenProfileShare = useCallback(() => {
    if (!profile) return;
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set("profileUserId", profile.id);
    router.push(`/${locale}/mypage/share?${searchParams.toString()}`);
  }, [locale, profile, router]);

  return (
    <motion.main
      initial={{ x: "100%" }}
      animate={motionControls}
      drag="x"
      dragConstraints={{ left: 0, right: viewportWidth }}
      dragElastic={0.08}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      className="fixed inset-0 z-[110] flex min-h-0 w-full flex-col overflow-hidden bg-white text-slate-950"
      style={{ touchAction: "pan-y" }}
    >
      <header
        className="grid shrink-0 grid-cols-[44px_1fr_44px] items-center px-4"
        style={{
          height: "calc(54px + env(safe-area-inset-top, 44px))",
          paddingTop: "env(safe-area-inset-top, 44px)",
        }}
      >
        <button
          type="button"
          onClick={() => void handleBack()}
          className="flex h-10 w-10 items-center justify-center rounded-full transition active:bg-gray-100"
          aria-label={copy.back}
        >
          <ChevronLeft size={25} strokeWidth={2.1} aria-hidden="true" />
        </button>
        <h1 className="truncate text-center text-[17px] font-bold">{name}</h1>
        <div aria-hidden="true" />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center px-4 pt-12 text-gray-400" aria-live="polite">
            <Loader2 size={26} className="animate-spin" aria-label={copy.loading} />
          </div>
        ) : loadError || !profile ? (
          <p className="px-4 pt-12 text-center text-[14px] text-gray-500" role="alert">{copy.profileLoadError}</p>
        ) : (
          <>
            <ProfileImagePreview
              open={showProfileImagePreview}
              image={profile.image}
              alt={name}
              crop={{
                scale: profile.imageCropScale,
                x: profile.imageCropX,
                y: profile.imageCropY,
              }}
              language={languageOption?.code}
              languageName={languageName}
              closeLabel={dictionary.profile.settingsCloseLabel ?? copy.back}
              onClose={() => setShowProfileImagePreview(false)}
            />
            <section className="px-4 pb-4 pt-5">
              <div className="flex items-center gap-6 pl-2">
                <div className="flex shrink-0 flex-col items-center">
                  <ProfileAvatar
                    image={profile.image}
                    label={name}
                    languages={primaryLanguages}
                    crop={{
                      scale: profile.imageCropScale,
                      x: profile.imageCropX,
                      y: profile.imageCropY,
                    }}
                    onClick={() => setShowProfileImagePreview(true)}
                  />
                </div>
                <div className="min-w-0 flex-1 grid grid-cols-2 gap-1 text-center">
                  <div className="rounded-xl px-2 py-1">
                    <p className="text-[18px] font-semibold leading-tight">{profile.followersCount}</p>
                    <p className="mt-0.5 text-[13px] text-gray-500">{dictionary.profile.followersLabel}</p>
                  </div>
                  <div className="rounded-xl px-2 py-1">
                    <p className="text-[18px] font-semibold leading-tight">{profile.followingCount}</p>
                    <p className="mt-0.5 text-[13px] text-gray-500">{dictionary.profile.followingLabel}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 pl-2">
                <p className="text-[15px] font-semibold text-slate-950">{name}</p>
                {profile.handle ? <p className="mt-0.5 text-[13px] text-gray-500">{formatHandle(profile.handle)}</p> : null}
                {bio ? <p className="mt-1 text-[14px] leading-snug text-slate-700">{bio}</p> : null}
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleToggleFollow()}
                  disabled={isActionPending || profile.isBlocked}
                  className={`flex h-10 min-w-0 flex-1 items-center justify-center rounded-lg border px-2 text-[13px] font-semibold transition disabled:opacity-50 ${
                    profile.isFollowing ? "border-amber-200 bg-amber-50 text-amber-700" : "bg-amber-500 text-white active:bg-amber-600"
                  }`}
                >
                  {isActionPending ? "…" : profile.isFollowing ? copy.following : copy.follow}
                </button>
                <button
                  type="button"
                  onClick={handleOpenProfileShare}
                  className="flex h-10 min-w-0 flex-1 items-center justify-center rounded-lg border border-gray-200 bg-white px-2 text-[13px] font-semibold text-slate-900 transition active:bg-gray-100"
                >
                  {dictionary.profile.shareProfile}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void handleToggleBlock()}
                  disabled={isActionPending}
                  className="flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white text-[13px] font-semibold text-slate-800 transition active:bg-gray-50 disabled:opacity-50"
                >
                  <UserX size={17} strokeWidth={2} aria-hidden="true" />
                  {profile.isBlocked ? copy.unblock : copy.block}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReportSubmitted(false);
                    setActionError(false);
                    setReportOpen(true);
                  }}
                  className="flex h-10 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 text-[13px] font-semibold text-rose-600 transition active:bg-rose-100"
                >
                  <AlertTriangle size={17} strokeWidth={2} aria-hidden="true" />
                  {copy.report}
                </button>
              </div>
              {actionError ? (
                <p className="mt-2 text-center text-[13px] text-red-500" role="alert">{copy.blockError}</p>
              ) : null}
            </section>
          </>
        )}
      </div>

      {reportOpen ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/35" onClick={() => setReportOpen(false)}>
          <section
            className="w-full rounded-t-[24px] bg-white px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label={copy.reportTitle}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-[18px] font-bold">{copy.reportTitle}</h2>
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition active:bg-gray-100"
                aria-label={copy.reportCancel}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <form className="space-y-4" onSubmit={handleReportSubmit}>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-gray-600">{copy.reportReasonLabel}</span>
                <select
                  value={reportReason}
                  onChange={(event) => setReportReason(event.target.value as ReportReason)}
                  className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-[14px] outline-none focus:border-gray-400"
                >
                  {(Object.keys(copy.reasons) as ReportReason[]).map((reason) => (
                    <option key={reason} value={reason}>{copy.reasons[reason]}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-gray-600">{copy.reportMessageLabel}</span>
                <textarea
                  value={reportMessage}
                  onChange={(event) => setReportMessage(event.target.value)}
                  maxLength={4000}
                  rows={4}
                  placeholder={copy.reportMessagePlaceholder}
                  className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-[14px] leading-relaxed outline-none focus:border-gray-400"
                />
              </label>
              {actionError ? <p className="text-[13px] text-red-500" role="alert">{copy.reportError}</p> : null}
              {reportSubmitted ? (
                <p className="flex items-center gap-1.5 text-[13px] font-medium text-emerald-600" role="status">
                  <Check size={16} aria-hidden="true" /> {copy.reportSubmitted}
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setReportOpen(false)}
                  className="h-11 rounded-xl border border-gray-200 text-[14px] font-semibold text-gray-700 transition active:bg-gray-50"
                >
                  {copy.reportCancel}
                </button>
                <button
                  type="submit"
                  disabled={reportPending || reportSubmitted}
                  className="h-11 rounded-xl bg-rose-500 text-[14px] font-semibold text-white transition active:bg-rose-600 disabled:opacity-50"
                >
                  {reportPending ? "…" : copy.reportSubmit}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </motion.main>
  );
}
