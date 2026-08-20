"use client";

import BottomTabBar, { buildNativeAwareTabPath } from "@/components/bottom-tab-bar";
import ProfileImageCropper, {
  type ProfileImageCropperChange,
} from "@/components/profile-image-cropper";
import ProfileImagePreview from "@/components/profile-image-preview";
import ProfileFeedbackContent from "@/components/profile-feedback-content";
import ProfileUsageContent from "@/components/profile-usage-content";
import ProfileLanguageFlagStack from "@/components/profile-language-flag-stack";
import LanguagePreferencePicker from "@/components/language-preference-picker";
import LanguageFlag from "@/components/language-flag";
import SignupBirthDatePicker from "@/components/signup-birth-date-picker";
import { resolveLivePhoneDemoRoomManagementCopy } from "@/components/LivePhoneDemo/live-phone-demo.room-management-copy";
import { resolveLivePhoneDemoFeedbackCopy } from "@/components/LivePhoneDemo/live-phone-demo.feedback-copy";
import {
  DEFAULT_NATIVE_APP_UPDATE_DETAIL,
  NATIVE_APP_UPDATE_EVENT,
  parseNativeAppUpdateDetail,
  resolveNativeAppUpdateCopy,
  type NativeAppUpdateDetail,
  type NativeAppUpdateCopy,
} from "@/components/LivePhoneDemo/live-phone-demo.app-update.logic";
import { isNativeUiBridgeEnabledFromSearch } from "@/components/LivePhoneDemo/live-phone-demo.native-ui.logic";
import { PRIMARY_UI_LANGUAGE_OPTIONS, type AppDictionary, type AppLocale, type PrimaryUiLocale } from "@/i18n";
import { storeAppLocale } from "@/components/app-locale-preference-sync";
import { DEFAULT_CONVERSATION_LANGUAGES_SYNC_EVENT } from "@/components/LivePhoneDemo/live-phone-demo.preferences";
import { buildClientApiPath } from "@/lib/api-contract";
import { unregisterNativePushToken } from "@/lib/native-push";
import { isLeftEdgeSwipeStart } from "@/lib/edge-swipe";
import {
  buildProfileImageTransform,
  DEFAULT_PROFILE_IMAGE_CROP,
  normalizeProfileImageCrop,
  type ProfileImageCrop,
  type ProfileImageCropInput,
} from "@/lib/profile-image-crop";
import {
  MAX_STT_LANGUAGE_SELECTION,
  STT_LANGUAGE_OPTIONS,
  canonicalizeSttLanguageCode,
  deriveDefaultConversationLanguages,
  getSttLanguageDisplayName,
  sanitizeSttLanguageSelection,
  type SttLanguageCode,
} from "@/lib/stt-languages";
import { formatHandle, HANDLE_MAX_LENGTH } from "@/lib/handles";
import {
  formatBirthDate,
  isOldEnoughForSignup,
  parseBirthDate,
  type BirthDateParts,
} from "@/lib/birth-date";
import { resolveSignupCopy } from "@/i18n/signup-copy";
import { AnimatePresence, motion, useAnimationControls, useDragControls, type PanInfo } from "framer-motion";
import { BarChart3, Check, ChevronLeft, ChevronRight, Download, Languages, Loader2, LogOut, Menu, MessageCircle, Siren, UserRound, UserRoundX, X } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type MyPageProps = {
  dictionary: AppDictionary;
  initialProfile: ProfileRecord | null;
  locale: AppLocale;
};

type ProfileRecord = {
  image: string | null;
  imageCropScale: number | null;
  imageCropX: number | null;
  imageCropY: number | null;
  handle: string | null;
  name: string | null;
  bio: string | null;
  nationality: string | null;
  primaryLanguages: string[];
  defaultConversationLanguages: string[];
  birthDate?: BirthDateParts | null;
  followersCount: number;
  followingCount: number;
};

type ProfileDraft = {
  imageFile: File | null;
  imageCrop: ProfileImageCrop;
  handle: string;
  name: string;
  bio: string;
  nationality: SttLanguageCode | null;
  primaryLanguages: SttLanguageCode[];
  birthDate: BirthDateParts | null;
};

const DEFAULT_PROFILE_EDIT_BIRTH_DATE: BirthDateParts = {
  year: 2000,
  month: 1,
  day: 1,
};

function parseProfileBirthDate(value: unknown): BirthDateParts | null {
  const parsed = parseBirthDate(value);
  return parsed
    ? {
        year: parsed.getUTCFullYear(),
        month: parsed.getUTCMonth() + 1,
        day: parsed.getUTCDate(),
      }
    : null;
}

type ProfileSaveResult = "saved" | "handle_taken" | "handle_invalid" | "failed";

const PROFILE_EDIT_TRANSITION = {
  duration: 0.32,
  ease: [0.22, 1, 0.36, 1] as const,
};
const PROFILE_EDIT_SWIPE_THRESHOLD_PX = 92;
const PROFILE_EDIT_SWIPE_VELOCITY_PX_PER_SECOND = 650;

type BlockedUserRecord = {
  id: string;
  createdAt: string;
  user: {
    id: string;
    handle: string | null;
    name: string | null;
    image: string | null;
  };
};

type ReportRecord = {
  id: string;
  reason: string;
  message: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  reportedUser: {
    id: string;
    handle: string | null;
    name: string | null;
    image: string | null;
  };
  replies: Array<{
    id: string;
    authorType: string;
    message: string;
    createdAt: string;
  }>;
};

type SessionStatus = "loading" | "authenticated" | "unauthenticated";
type ManagementLoadState = "idle" | "loading" | "ready" | "unauthorized" | "error";

type NativeAppUpdateWindow = Window & {
  __MINGLE_NATIVE_APP_UPDATE_STATUS?: unknown;
  ReactNativeWebView?: {
    postMessage?: (message: string) => void;
  };
};

type NativeOpenUpdateStoreCommand = {
  type: "native_open_update_store";
  payload?: {
    updateUrl?: string;
  };
};

function isNativeAppRuntimeSignalPresent(): boolean {
  if (typeof window === "undefined") return false;
  const nativeWindow = window as NativeAppUpdateWindow;
  return typeof nativeWindow.ReactNativeWebView?.postMessage === "function"
    || isNativeUiBridgeEnabledFromSearch(window.location.search || "");
}

function NativeAppUpdateCard({
  copy,
  installedVersion,
  latestVersion,
  statusMessage,
  showUpdateAction,
  onUpdate,
}: {
  copy: NativeAppUpdateCopy;
  installedVersion: string;
  latestVersion: string;
  statusMessage: string;
  showUpdateAction: boolean;
  onUpdate: () => void;
}) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-amber-700">
            {copy.sectionLabel}
          </div>
          <div className="mt-2 text-sm font-semibold text-gray-900">
            {copy.installedLabel} {installedVersion}
          </div>
          {latestVersion ? (
            <div className="mt-1 text-xs font-medium text-gray-600">
              {copy.latestLabel} {latestVersion}
            </div>
          ) : null}
          <div className="mt-2 text-xs leading-5 text-gray-600">
            {statusMessage}
          </div>
        </div>
        {showUpdateAction ? (
          <button
            type="button"
            onClick={onUpdate}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <Download size={13} strokeWidth={2.2} />
            <span>{copy.updateButtonLabel}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

const LANGUAGE_OPTIONS: ReadonlyArray<{ locale: SttLanguageCode; label: string; flag: string }> =
  STT_LANGUAGE_OPTIONS.map(({ code, englishName, flag }) => ({
    locale: code,
    label: englishName,
    flag,
  }));

function getNationalityOption(value: string | null | undefined) {
  const normalized = typeof value === "string" ? canonicalizeSttLanguageCode(value) : "";
  return LANGUAGE_OPTIONS.find((option) => option.locale === normalized) ?? null;
}

function appendPathSearchParam(path: string, key: string, value: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function ProfileAvatar({
  alt,
  languages,
  imageUrl,
  imageCrop,
  size = 88,
  onClick,
}: {
  alt: string;
  languages: readonly string[];
  imageUrl?: string | null;
  imageCrop?: ProfileImageCropInput;
  size?: number;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80"
      style={{ height: size, width: size }}
      aria-label={alt}
    >
      <div
        className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-100"
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={alt}
            width={size}
            height={size}
            className="h-full w-full object-cover"
            style={{ transform: buildProfileImageTransform(size, imageCrop) }}
          />
        ) : (
          <UserRound size={Math.round(size * 0.58)} className="text-gray-400" aria-hidden="true" />
        )}
      </div>
      <ProfileLanguageFlagStack languages={languages} size={size} />
    </button>
  );
}

function UserMiniAvatar({ image, label }: { image: string | null; label: string }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={label} className="h-full w-full object-cover" />
      ) : (
        <UserRound size={22} className="text-gray-400" aria-hidden="true" />
      )}
    </div>
  );
}

function ProfileSettingsPanel({
  dictionary,
  locale,
  onClose,
  onChangeAppLanguage,
  initialPrimaryLanguages,
  onSavePrimaryLanguages,
  initialDefaultConversationLanguages,
  onSaveDefaultConversationLanguages,
  onSignOut,
  signOutCallbackUrl,
  defaultFeedbackEmail,
  open,
  sessionStatus,
}: {
  dictionary: AppDictionary;
  locale: AppLocale;
  onClose: () => void;
  onChangeAppLanguage: (locale: PrimaryUiLocale) => void;
  initialPrimaryLanguages: readonly string[];
  onSavePrimaryLanguages: (languages: SttLanguageCode[]) => Promise<boolean>;
  initialDefaultConversationLanguages: readonly string[];
  onSaveDefaultConversationLanguages: (languages: SttLanguageCode[]) => Promise<boolean>;
  onSignOut: () => void;
  signOutCallbackUrl: string;
  defaultFeedbackEmail?: string;
  open: boolean;
  sessionStatus: SessionStatus;
}) {
  const [blocks, setBlocks] = useState<BlockedUserRecord[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [requiresAuthentication, setRequiresAuthentication] = useState(false);
  const [blocksLoadState, setBlocksLoadState] = useState<ManagementLoadState>("idle");
  const [reportsLoadState, setReportsLoadState] = useState<ManagementLoadState>("idle");
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [managementPage, setManagementPage] = useState<"blocked" | "reports" | "language" | "primaryLanguages" | "defaultLanguages" | "usage" | "feedback" | null>(null);
  const [primaryLanguages, setPrimaryLanguages] = useState<SttLanguageCode[]>(() => (
    sanitizeSttLanguageSelection(initialPrimaryLanguages)
  ));
  const [isSavingPrimaryLanguages, setIsSavingPrimaryLanguages] = useState(false);
  const [defaultConversationLanguages, setDefaultConversationLanguages] = useState<SttLanguageCode[]>(() => (
    sanitizeSttLanguageSelection(initialDefaultConversationLanguages)
  ));
  const [isSavingDefaultConversationLanguages, setIsSavingDefaultConversationLanguages] = useState(false);
  const [isNativeAppRuntime, setIsNativeAppRuntime] = useState(false);
  const [nativeAppUpdate, setNativeAppUpdate] = useState<NativeAppUpdateDetail | null>(null);
  const [viewportWidth, setViewportWidth] = useState(1);
  const [isAccountActionModalOpen, setIsAccountActionModalOpen] = useState(false);
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);
  const [isWithdrawConfirmModalOpen, setIsWithdrawConfirmModalOpen] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const motionControls = useAnimationControls();
  const dragControls = useDragControls();
  const managementMotionControls = useAnimationControls();
  const managementDragControls = useDragControls();
  const isMountedRef = useRef(false);
  const isLeavingRef = useRef(false);
  const isManagementLeavingRef = useRef(false);
  const copy = {
    title: dictionary.profile.menuSettingsTitle ?? (locale === "ko" ? "메뉴 및 설정" : "Menu and settings"),
    blocked: dictionary.profile.blockedUsersLabel ?? (locale === "ko" ? "차단한 사용자" : "Blocked users"),
    reports: dictionary.profile.reportsLabel ?? (locale === "ko" ? "신고 내역" : "Reports"),
    appLanguage: dictionary.profile.appLanguageLabel ?? (locale === "ko" ? "앱 이용 언어" : "App language"),
    appLanguageTitle: dictionary.profile.appLanguageTitle ?? (locale === "ko" ? "앱 이용 언어" : "App language"),
    appLanguageDescription: dictionary.profile.appLanguageDescription
      ?? (locale === "ko" ? "Mingle UI와 UX에 사용할 언어를 선택하세요." : "Choose the language used for the Mingle interface."),
    defaultLanguages: locale === "ko" ? "대화 기본 언어" : "Default conversation languages",
    defaultLanguagesTitle: locale === "ko" ? "대화 기본 언어" : "Default conversation languages",
    defaultLanguagesDescription: locale === "ko"
      ? "새 대화방을 만들 때 사용할 언어를 원하는 순서대로 선택하세요."
      : "Choose the languages and order used when you create a new conversation.",
    defaultLanguagesSaveError: locale === "ko" ? "기본 언어를 저장하지 못했습니다." : "Could not save the default languages.",
    primaryLanguages: dictionary.profile.primaryLanguagesLabel
      ?? dictionary.profile.nationalityLabel
      ?? (locale === "ko" ? "주 사용 언어" : "Primary languages"),
    primaryLanguagesTitle: dictionary.profile.primaryLanguagesTitle
      ?? dictionary.profile.primaryLanguagesLabel
      ?? dictionary.profile.nationalityLabel
      ?? (locale === "ko" ? "주 사용 언어" : "Primary languages"),
    primaryLanguagesDescription: dictionary.profile.primaryLanguagesDescription
      ?? (locale === "ko"
        ? "프로필에 표시할 주 사용 언어를 원하는 순서대로 최대 5개 선택하세요."
        : "Choose up to five primary languages in the order they should appear on your profile."),
    primaryLanguagesSaveError: dictionary.profile.primaryLanguagesSaveError
      ?? (locale === "ko" ? "주 사용 언어를 저장하지 못했습니다." : "Could not save your primary languages."),
    usage: {
      title: locale === "ko" ? "사용량" : "Usage",
      totalUsage: locale === "ko" ? "총 사용시간" : "Total time",
      messages: locale === "ko" ? "메시지" : "Messages",
      conversations: locale === "ko" ? "대화방" : "Conversations",
      speechLanguages: locale === "ko" ? "음성 인식 언어별" : "By speech language",
      translationLanguages: locale === "ko" ? "번역 언어별 메시지" : "Messages by translation language",
      messageCountSuffix: locale === "ko" ? "개" : "messages",
      noData: locale === "ko" ? "아직 사용량이 없습니다." : "No usage yet.",
      loadError: locale === "ko" ? "사용량을 불러오지 못했습니다." : "Could not load your usage.",
      unknownLanguage: locale === "ko" ? "알 수 없는 언어" : "Unknown language",
    },
    noBlocked: dictionary.profile.noBlockedUsers ?? (locale === "ko" ? "차단한 사용자가 없습니다." : "You have not blocked anyone."),
    noReports: dictionary.profile.noReports ?? (locale === "ko" ? "신고 내역이 없습니다." : "You have not submitted any reports."),
    unblock: dictionary.profile.unblockAction ?? (locale === "ko" ? "차단 해제" : "Unblock"),
    unblockError: dictionary.profile.unblockError ?? (locale === "ko" ? "차단을 해제하지 못했습니다." : "Could not unblock this user."),
    pending: dictionary.profile.reportPendingLabel ?? (locale === "ko" ? "운영진 확인 중" : "Under review"),
    close: dictionary.profile.settingsCloseLabel ?? (locale === "ko" ? "닫기" : "Close"),
    loading: dictionary.profile.settingsLoadingLabel ?? (locale === "ko" ? "불러오는 중..." : "Loading..."),
    loadError: dictionary.profile.settingsLoadError ?? (locale === "ko" ? "관리 내역을 불러오지 못했습니다." : "Could not load your activity."),
    authRequired: dictionary.profile.settingsAuthRequired ?? (locale === "ko" ? "로그인 후 확인할 수 있습니다." : "Sign in to view this history."),
    logout: dictionary.profile.logout,
    deactivateAccount: dictionary.profile.deactivateAccount ?? (locale === "ko" ? "계정 비활성화/탈퇴" : "Deactivate / Delete Account"),
    deactivateConfirmTitle: dictionary.profile.deactivateAccountConfirmTitle ?? (locale === "ko" ? "비활성화하시겠습니까?" : "Do you want to deactivate your account?"),
    deactivateAction: dictionary.profile.deactivateAccountAction ?? (locale === "ko" ? "비활성화" : "Deactivate"),
    deactivateLogoutOnlyAction: dictionary.profile.deactivateAccountLogoutOnlyAction ?? (locale === "ko" ? "로그아웃만 하기" : "Just Log Out"),
    deactivateFailed: dictionary.profile.deactivateAccountFailed ?? (locale === "ko" ? "계정을 비활성화하지 못했습니다." : "Failed to deactivate account."),
    accountActionSelectTitle: dictionary.profile.accountActionSelectTitle ?? (locale === "ko" ? "비활성화 또는 탈퇴" : "Deactivate or Delete"),
    withdrawAccount: dictionary.profile.withdrawAccount ?? (locale === "ko" ? "회원탈퇴" : "Delete Account"),
    withdrawAccountConfirmTitle: dictionary.profile.withdrawAccountConfirmTitle ?? (locale === "ko" ? "회원탈퇴 안내" : "Account Deletion Notice"),
    withdrawAccountConfirmMessage: dictionary.profile.withdrawAccountConfirmMessage ?? (locale === "ko" ? "30일 동안 비활성화되며, 그 안에는 언제든 로그인하면 다시 살릴 수 있습니다." : "Your account will be deactivated for 30 days. You can restore it anytime by logging back in during this period."),
    withdrawAccountAction: dictionary.profile.withdrawAccountAction ?? (locale === "ko" ? "탈퇴하기" : "Delete Account"),
    withdrawAccountFailed: dictionary.profile.withdrawAccountFailed ?? (locale === "ko" ? "탈퇴 처리에 실패했습니다." : "Failed to delete account."),
    reportedUser: dictionary.profile.settingsReportedUserLabel ?? (locale === "ko" ? "신고한 사용자" : "Reported user"),
    userFallback: dictionary.connect.userFallbackLabel ?? (locale === "ko" ? "Mingle 사용자" : "Mingle user"),
    myMessage: dictionary.profile.settingsMyMessageLabel ?? (locale === "ko" ? "신고 내용" : "Your report"),
    teamReply: dictionary.profile.settingsTeamReplyLabel ?? (locale === "ko" ? "운영진 답변" : "Team reply"),
    reasonLabels: {
      spam: dictionary.profile.reportReasonSpam ?? (locale === "ko" ? "스팸·도배" : "Spam"),
      harassment: dictionary.profile.reportReasonHarassment ?? (locale === "ko" ? "괴롭힘·불쾌한 행동" : "Harassment"),
      inappropriate: dictionary.profile.reportReasonInappropriate ?? (locale === "ko" ? "부적절한 콘텐츠" : "Inappropriate content"),
      impersonation: dictionary.profile.reportReasonImpersonation ?? (locale === "ko" ? "사칭" : "Impersonation"),
      other: dictionary.profile.reportReasonOther ?? (locale === "ko" ? "기타" : "Other"),
    } as Record<string, string>,
  };
  const feedbackCopy = useMemo(() => resolveLivePhoneDemoFeedbackCopy(locale), [locale]);
  const roomManagementCopy = useMemo(() => resolveLivePhoneDemoRoomManagementCopy(locale), [locale]);
  const nativeAppUpdateCopy = useMemo(() => resolveNativeAppUpdateCopy(locale), [locale]);
  const nativeAppUpdateStatus = nativeAppUpdate ?? DEFAULT_NATIVE_APP_UPDATE_DETAIL;
  const nativeAppInstalledVersion = nativeAppUpdateStatus.clientVersion || nativeAppUpdateCopy.unknownVersionLabel;
  const nativeAppLatestVersion = nativeAppUpdateStatus.latestVersion || "";
  const nativeAppUpdateStatusMessage = nativeAppUpdateStatus.status === "checking"
    ? nativeAppUpdateCopy.checkingMessage
    : nativeAppUpdateStatus.status === "available"
      ? nativeAppUpdateCopy.availableMessage
      : nativeAppUpdateStatus.status === "current"
        ? nativeAppUpdateCopy.currentMessage
        : nativeAppUpdateCopy.unknownMessage;
  const showNativeAppUpdateAction = nativeAppUpdateStatus.updateAvailable && Boolean(nativeAppUpdateStatus.updateUrl);
  const managementPageTitle = managementPage === "blocked"
    ? copy.blocked
    : managementPage === "reports"
      ? copy.reports
      : managementPage === "feedback"
        ? feedbackCopy.pageTitle
        : managementPage === "usage"
          ? copy.usage.title
          : managementPage === "primaryLanguages"
            ? copy.primaryLanguagesTitle
            : managementPage === "defaultLanguages"
              ? copy.defaultLanguagesTitle
              : copy.appLanguageTitle;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncNativeRuntime = () => {
      if (isNativeAppRuntimeSignalPresent()) setIsNativeAppRuntime(true);
    };

    syncNativeRuntime();
    const nativeRuntimeTimerId = window.setTimeout(syncNativeRuntime, 0);
    const nativeRuntimeRetryTimerId = window.setTimeout(syncNativeRuntime, 250);
    const windowWithUpdate = window as NativeAppUpdateWindow;
    const cachedDetail = parseNativeAppUpdateDetail(windowWithUpdate.__MINGLE_NATIVE_APP_UPDATE_STATUS);
    const nativeUpdateTimerId = window.setTimeout(() => {
      setNativeAppUpdate(cachedDetail || DEFAULT_NATIVE_APP_UPDATE_DETAIL);
    }, 0);

    const handleNativeAppUpdate = (event: Event) => {
      const detail = parseNativeAppUpdateDetail((event as CustomEvent<unknown>).detail);
      if (!detail) return;
      setNativeAppUpdate(detail);
    };

    window.addEventListener(NATIVE_APP_UPDATE_EVENT, handleNativeAppUpdate as EventListener);
    return () => {
      window.clearTimeout(nativeRuntimeTimerId);
      window.clearTimeout(nativeRuntimeRetryTimerId);
      window.clearTimeout(nativeUpdateTimerId);
      window.removeEventListener(NATIVE_APP_UPDATE_EVENT, handleNativeAppUpdate as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!open || !isMountedRef.current) return;
    isLeavingRef.current = false;
    void motionControls.start({ x: 0, transition: PROFILE_EDIT_TRANSITION });
  }, [motionControls, open]);

  useEffect(() => {
    if (!open || !managementPage || !isMountedRef.current) return;
    isManagementLeavingRef.current = false;
    void managementMotionControls.start({ x: 0, transition: PROFILE_EDIT_TRANSITION });
  }, [managementMotionControls, managementPage, open]);

  useEffect(() => {
    if (!open) return;
    setDefaultConversationLanguages(sanitizeSttLanguageSelection(initialDefaultConversationLanguages));
  }, [initialDefaultConversationLanguages, open]);

  useEffect(() => {
    if (!open) return;
    setPrimaryLanguages(sanitizeSttLanguageSelection(initialPrimaryLanguages));
  }, [initialPrimaryLanguages, open]);

  useEffect(() => {
    if (!open) {
      setManagementPage(null);
      return;
    }

    let cancelled = false;
    setBlocks([]);
    setReports([]);
    setRequiresAuthentication(false);

    if (sessionStatus === "loading") {
      setIsLoading(true);
      setBlocksLoadState("loading");
      setReportsLoadState("loading");
      return () => {
        cancelled = true;
      };
    }

    if (sessionStatus !== "authenticated") {
      setIsLoading(false);
      setRequiresAuthentication(true);
      setBlocksLoadState("unauthorized");
      setReportsLoadState("unauthorized");
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);
    setBlocksLoadState("loading");
    setReportsLoadState("loading");

    const loadBlocks = async () => {
      try {
        const response = await fetch(buildClientApiPath("/account/blocks"), { cache: "no-store" });
        if (cancelled) return;
        if (response.status === 401) {
          setBlocksLoadState("unauthorized");
          return;
        }
        if (!response.ok) throw new Error("blocks_load_failed");
        const payload = await response.json() as { blocks?: BlockedUserRecord[] };
        if (cancelled) return;
        setBlocks(Array.isArray(payload.blocks) ? payload.blocks : []);
        setBlocksLoadState("ready");
      } catch {
        if (!cancelled) setBlocksLoadState("error");
      }
    };

    const loadReports = async () => {
      try {
        const response = await fetch(buildClientApiPath("/account/reports"), { cache: "no-store" });
        if (cancelled) return;
        if (response.status === 401) {
          setReportsLoadState("unauthorized");
          return;
        }
        if (!response.ok) throw new Error("reports_load_failed");
        const payload = await response.json() as { reports?: ReportRecord[] };
        if (cancelled) return;
        setReports(Array.isArray(payload.reports) ? payload.reports : []);
        setReportsLoadState("ready");
      } catch {
        if (!cancelled) setReportsLoadState("error");
      }
    };

    void Promise.all([loadBlocks(), loadReports()]).finally(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [open, sessionStatus]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const syncViewportWidth = () => setViewportWidth(Math.max(1, window.innerWidth));
    syncViewportWidth();
    window.addEventListener("resize", syncViewportWidth);
    return () => window.removeEventListener("resize", syncViewportWidth);
  }, [open]);

  const handleUnblock = useCallback(async (userId: string) => {
    if (unblockingId) return;
    setUnblockingId(userId);
    try {
      const response = await fetch(buildClientApiPath(`/account/blocks/${encodeURIComponent(userId)}`), {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("unblock_failed");
      setBlocks((current) => current.filter((block) => block.user.id !== userId));
    } catch {
      window.alert(copy.unblockError);
    } finally {
      setUnblockingId(null);
    }
  }, [copy.unblockError, unblockingId]);

  const handleSelectAppLanguage = useCallback((nextLocale: PrimaryUiLocale) => {
    if (nextLocale === locale) return;
    storeAppLocale(nextLocale);
    onChangeAppLanguage(nextLocale);
  }, [locale, onChangeAppLanguage]);

  const handleToggleDefaultConversationLanguage = useCallback(async (code: SttLanguageCode) => {
    if (isSavingDefaultConversationLanguages) return;

    const currentLanguages = sanitizeSttLanguageSelection(defaultConversationLanguages);
    const selected = currentLanguages.includes(code);
    if (selected && currentLanguages.length <= 1) return;
    if (!selected && currentLanguages.length >= MAX_STT_LANGUAGE_SELECTION) return;

    const nextLanguages = selected
      ? currentLanguages.filter((language) => language !== code)
      : [...currentLanguages, code];
    setDefaultConversationLanguages(nextLanguages);
    setIsSavingDefaultConversationLanguages(true);
    try {
      const saved = await onSaveDefaultConversationLanguages(nextLanguages);
      if (!saved) {
        setDefaultConversationLanguages(currentLanguages);
        window.alert(copy.defaultLanguagesSaveError);
      }
    } finally {
      setIsSavingDefaultConversationLanguages(false);
    }
  }, [copy.defaultLanguagesSaveError, defaultConversationLanguages, isSavingDefaultConversationLanguages, onSaveDefaultConversationLanguages]);

  const handleTogglePrimaryLanguage = useCallback(async (code: SttLanguageCode) => {
    if (isSavingPrimaryLanguages) return;

    const currentLanguages = sanitizeSttLanguageSelection(primaryLanguages);
    const selected = currentLanguages.includes(code);
    if (selected && currentLanguages.length <= 1) return;
    if (!selected && currentLanguages.length >= MAX_STT_LANGUAGE_SELECTION) return;

    const nextLanguages = selected
      ? currentLanguages.filter((language) => language !== code)
      : [...currentLanguages, code];
    setPrimaryLanguages(nextLanguages);
    setIsSavingPrimaryLanguages(true);
    try {
      const saved = await onSavePrimaryLanguages(nextLanguages);
      if (!saved) {
        setPrimaryLanguages(currentLanguages);
        window.alert(copy.primaryLanguagesSaveError);
      }
    } finally {
      setIsSavingPrimaryLanguages(false);
    }
  }, [copy.primaryLanguagesSaveError, isSavingPrimaryLanguages, onSavePrimaryLanguages, primaryLanguages]);

  const handleNativeAppUpdatePress = useCallback(() => {
    const updateUrl = nativeAppUpdate?.updateUrl?.trim() || "";
    if (!updateUrl) return;

    onClose();
    const command: NativeOpenUpdateStoreCommand = {
      type: "native_open_update_store",
      payload: { updateUrl },
    };
    const nativeWindow = typeof window === "undefined" ? null : window as NativeAppUpdateWindow;
    if (nativeWindow?.ReactNativeWebView?.postMessage) {
      try {
        nativeWindow.ReactNativeWebView.postMessage(JSON.stringify(command));
        return;
      } catch {
        // Fall back to browser navigation if the bridge errors.
      }
    }

    window.location.href = updateUrl;
  }, [nativeAppUpdate?.updateUrl, onClose]);

  const handlePanelPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const localClientX = event.clientX - event.currentTarget.getBoundingClientRect().left;
    if (!isLeftEdgeSwipeStart(localClientX)) return;
    dragControls.start(event);
  }, [dragControls]);

  const handleManagementPanelPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const localClientX = event.clientX - event.currentTarget.getBoundingClientRect().left;
    if (!isLeftEdgeSwipeStart(localClientX)) return;
    managementDragControls.start(event);
  }, [managementDragControls]);

  const handleDragEnd = useCallback(async (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (!isMountedRef.current || isLeavingRef.current) return;
    if (info.offset.x >= PROFILE_EDIT_SWIPE_THRESHOLD_PX || info.velocity.x >= PROFILE_EDIT_SWIPE_VELOCITY_PX_PER_SECOND) {
      isLeavingRef.current = true;
      await motionControls.start({ x: "100%", transition: PROFILE_EDIT_TRANSITION });
      if (isMountedRef.current) onClose();
      return;
    }
    await motionControls.start({ x: 0, transition: PROFILE_EDIT_TRANSITION });
  }, [motionControls, onClose]);

  const handleManagementDragEnd = useCallback(async (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (!isMountedRef.current || isManagementLeavingRef.current) return;
    if (info.offset.x >= PROFILE_EDIT_SWIPE_THRESHOLD_PX || info.velocity.x >= PROFILE_EDIT_SWIPE_VELOCITY_PX_PER_SECOND) {
      isManagementLeavingRef.current = true;
      await managementMotionControls.start({ x: "100%", transition: PROFILE_EDIT_TRANSITION });
      if (isMountedRef.current) setManagementPage(null);
      return;
    }
    await managementMotionControls.start({ x: 0, transition: PROFILE_EDIT_TRANSITION });
  }, [managementMotionControls]);

  const handleDeactivate = useCallback(async () => {
    if (isDeactivating) return;
    setIsDeactivating(true);
    try {
      const response = await fetch(buildClientApiPath("/account/deactivate"), {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Failed to deactivate account");
      }
      await unregisterNativePushToken();
      await signOut({ callbackUrl: signOutCallbackUrl });
      if (typeof window !== "undefined") {
        window.location.replace(signOutCallbackUrl);
      }
    } catch (err) {
      console.error("Account deactivation failed", err);
      alert(copy.deactivateFailed);
      setIsDeactivating(false);
    }
  }, [copy.deactivateFailed, isDeactivating, signOutCallbackUrl]);

  const handleWithdraw = useCallback(async () => {
    if (isWithdrawing) return;
    setIsWithdrawing(true);
    try {
      const response = await fetch(buildClientApiPath("/account/withdraw"), {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Failed to withdraw account");
      }
      await unregisterNativePushToken();
      await signOut({ callbackUrl: signOutCallbackUrl });
      if (typeof window !== "undefined") {
        window.location.replace(signOutCallbackUrl);
      }
    } catch (err) {
      console.error("Account withdrawal failed", err);
      alert(copy.withdrawAccountFailed);
      setIsWithdrawing(false);
    }
  }, [copy.withdrawAccountFailed, isWithdrawing, signOutCallbackUrl]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.section
          key="profile-settings-panel"
          initial={{ x: "100%" }}
          animate={motionControls}
          exit={{ x: "100%" }}
          transition={PROFILE_EDIT_TRANSITION}
          drag="x"
          dragControls={dragControls}
          dragDirectionLock
          dragListener={false}
          dragConstraints={{ left: 0, right: viewportWidth }}
          dragElastic={0.08}
          dragMomentum={false}
          onPointerDown={handlePanelPointerDown}
          onDragEnd={handleDragEnd}
          className="fixed inset-0 z-[90] flex min-h-0 w-full flex-col bg-white text-slate-950 shadow-2xl"
          style={{ touchAction: "pan-y" }}
          role="dialog"
          aria-modal="true"
          aria-label={copy.title}
        >
          <header
            className="grid shrink-0 grid-cols-[44px_1fr_44px] items-center border-b border-gray-100 px-4"
            style={{
              height: "calc(54px + env(safe-area-inset-top, 44px))",
              paddingTop: "env(safe-area-inset-top, 44px)",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full transition active:bg-gray-100"
              aria-label={copy.close}
            >
              <ChevronLeft size={25} strokeWidth={2.1} aria-hidden="true" />
            </button>
            <h2 className="truncate text-center text-[17px] font-bold">{copy.title}</h2>
            <div aria-hidden="true" />
          </header>

          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 pb-10 pt-6">
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
              <button
                type="button"
                onClick={() => setManagementPage("blocked")}
                className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-4 text-left transition active:bg-gray-50"
              >
                <UserRoundX size={20} strokeWidth={2} className="text-gray-600" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-[15px] font-semibold">{copy.blocked}</span>
                <ChevronRight size={19} strokeWidth={2} className="text-gray-400" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setManagementPage("reports")}
                className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-4 text-left transition active:bg-gray-50"
              >
                <Siren size={20} strokeWidth={2} className="text-gray-600" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-[15px] font-semibold">{copy.reports}</span>
                <ChevronRight size={19} strokeWidth={2} className="text-gray-400" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setManagementPage("feedback")}
                className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-4 text-left transition active:bg-gray-50"
              >
                <MessageCircle size={20} strokeWidth={2} className="text-gray-600" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-[15px] font-semibold">{feedbackCopy.feedbackMenuItemLabel}</span>
                <ChevronRight size={19} strokeWidth={2} className="text-gray-400" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setManagementPage("usage")}
                className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-4 text-left transition active:bg-gray-50"
              >
                <BarChart3 size={20} strokeWidth={2} className="text-gray-600" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-[15px] font-semibold">{copy.usage.title}</span>
                <ChevronRight size={19} strokeWidth={2} className="text-gray-400" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setManagementPage("primaryLanguages")}
                className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-4 text-left transition active:bg-gray-50"
              >
                <Languages size={20} strokeWidth={2} className="text-gray-600" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-[15px] font-semibold">{copy.primaryLanguages}</span>
                <ChevronRight size={19} strokeWidth={2} className="text-gray-400" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setManagementPage("defaultLanguages")}
                className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-4 text-left transition active:bg-gray-50"
              >
                <Languages size={20} strokeWidth={2} className="text-gray-600" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-[15px] font-semibold">{copy.defaultLanguages}</span>
                <ChevronRight size={19} strokeWidth={2} className="text-gray-400" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setManagementPage("language")}
                className="flex w-full items-center gap-3 px-4 py-4 text-left transition active:bg-gray-50"
              >
                <Languages size={20} strokeWidth={2} className="text-gray-600" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-[15px] font-semibold">{copy.appLanguage}</span>
                <ChevronRight size={19} strokeWidth={2} className="text-gray-400" aria-hidden="true" />
              </button>
            </div>
            {isNativeAppRuntime ? (
              <div className="mt-4 px-0">
                <NativeAppUpdateCard
                  copy={nativeAppUpdateCopy}
                  installedVersion={nativeAppInstalledVersion}
                  latestVersion={nativeAppLatestVersion}
                  statusMessage={nativeAppUpdateStatusMessage}
                  showUpdateAction={showNativeAppUpdateAction}
                  onUpdate={handleNativeAppUpdatePress}
                />
              </div>
            ) : null}
            <button
              type="button"
              onClick={onSignOut}
              disabled={sessionStatus !== "authenticated"}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-[14px] font-semibold text-slate-700 transition active:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogOut size={17} strokeWidth={2.1} aria-hidden="true" />
              {copy.logout}
            </button>
            <button
              type="button"
              onClick={() => setIsAccountActionModalOpen(true)}
              disabled={sessionStatus !== "authenticated"}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-transparent px-4 py-2 text-[13px] font-medium text-gray-400 transition hover:text-gray-600 active:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UserRoundX size={15} strokeWidth={2} aria-hidden="true" />
              {copy.deactivateAccount}
            </button>
          </div>
          <button type="button" onClick={onClose} className="absolute right-3 top-[calc(env(safe-area-inset-top,44px)+8px)] flex h-9 w-9 items-center justify-center rounded-full text-gray-400 active:bg-gray-100" aria-label={copy.close}>
            <X size={18} aria-hidden="true" />
          </button>
        </motion.section>
      ) : null}
      {isAccountActionModalOpen ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 px-5"
          onClick={() => setIsAccountActionModalOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            role="dialog"
            aria-modal="true"
            aria-label={copy.accountActionSelectTitle}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-[19rem] rounded-2xl border border-gray-200 bg-white p-5 shadow-xl text-center"
          >
            <p className="text-[16px] font-bold text-gray-900">
              {copy.accountActionSelectTitle}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsAccountActionModalOpen(false);
                  setIsWithdrawConfirmModalOpen(true);
                }}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-[13px] font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                {copy.withdrawAccount}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAccountActionModalOpen(false);
                  setIsDeactivateModalOpen(true);
                }}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-amber-500 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 active:bg-amber-700"
              >
                {copy.deactivateAction}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
      {isWithdrawConfirmModalOpen ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 px-5"
          onClick={() => {
            if (isWithdrawing) return;
            setIsWithdrawConfirmModalOpen(false);
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            role="dialog"
            aria-modal="true"
            aria-label={copy.withdrawAccountConfirmTitle}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-[19rem] rounded-2xl border border-gray-200 bg-white p-5 shadow-xl text-center"
          >
            <p className="text-[16px] font-bold text-gray-900">
              {copy.withdrawAccountConfirmTitle}
            </p>
            <p className="mt-2.5 text-[13px] leading-relaxed text-gray-500">
              {copy.withdrawAccountConfirmMessage}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleWithdraw()}
                disabled={isWithdrawing}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-[13px] font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isWithdrawing ? (
                  <Loader2 size={16} className="animate-spin text-gray-400" />
                ) : (
                  copy.withdrawAccountAction
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsWithdrawConfirmModalOpen(false)}
                disabled={isWithdrawing}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-amber-500 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 active:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {locale === "ko" ? "취소" : "Cancel"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
      {isDeactivateModalOpen ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 px-5"
          onClick={() => {
            if (isDeactivating) return;
            setIsDeactivateModalOpen(false);
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            role="dialog"
            aria-modal="true"
            aria-label={copy.deactivateConfirmTitle}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-[19rem] rounded-2xl border border-gray-200 bg-white p-5 shadow-xl text-center"
          >
            <p className="text-[16px] font-bold text-gray-900">
              {copy.deactivateConfirmTitle}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleDeactivate()}
                disabled={isDeactivating}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-[13px] font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeactivating ? (
                  <Loader2 size={16} className="animate-spin text-gray-400" />
                ) : (
                  copy.deactivateAction
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsDeactivateModalOpen(false);
                  onSignOut();
                }}
                disabled={isDeactivating}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-amber-500 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 active:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {copy.deactivateLogoutOnlyAction}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
      {open && managementPage ? (
        <motion.section
          key={`profile-management-${managementPage}`}
          initial={{ x: "100%" }}
          animate={managementMotionControls}
          exit={{ x: "100%" }}
          transition={PROFILE_EDIT_TRANSITION}
          drag="x"
          dragControls={managementDragControls}
          dragDirectionLock
          dragListener={false}
          dragConstraints={{ left: 0, right: viewportWidth }}
          dragElastic={0.08}
          dragMomentum={false}
          onPointerDown={handleManagementPanelPointerDown}
          onDragEnd={handleManagementDragEnd}
          className="fixed inset-0 z-[100] flex min-h-0 w-full flex-col bg-white text-slate-950 shadow-2xl"
          style={{ touchAction: "pan-y" }}
          role="dialog"
          aria-modal="true"
          aria-label={managementPageTitle}
        >
          <header
            className="grid shrink-0 grid-cols-[44px_1fr_44px] items-center border-b border-gray-100 px-4"
            style={{
              height: "calc(54px + env(safe-area-inset-top, 44px))",
              paddingTop: "env(safe-area-inset-top, 44px)",
            }}
          >
            <button
              type="button"
              onClick={() => setManagementPage(null)}
              className="flex h-10 w-10 items-center justify-center rounded-full transition active:bg-gray-100"
              aria-label={copy.close}
            >
              <ChevronLeft size={25} strokeWidth={2.1} aria-hidden="true" />
            </button>
            <h2 className="truncate text-center text-[17px] font-bold">
              {managementPageTitle}
            </h2>
            <div aria-hidden="true" />
          </header>

          <div className={managementPage === "feedback" ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 pb-10 pt-6"}>
            {managementPage === "feedback" ? (
              <ProfileFeedbackContent
                uiLocale={locale}
                defaultFeedbackEmail={defaultFeedbackEmail}
              />
            ) : managementPage === "usage" ? (
              <ProfileUsageContent uiLocale={locale} copy={copy.usage} />
            ) : managementPage === "primaryLanguages" ? (
              <div>
                <p className="mb-5 text-[13px] leading-relaxed text-gray-500">{copy.primaryLanguagesDescription}</p>
                <LanguagePreferencePicker
                  selectedLanguages={primaryLanguages}
                  onToggleLanguage={(code) => void handleTogglePrimaryLanguage(code)}
                  uiLocale={locale}
                  searchPlaceholder={roomManagementCopy.languageSelectorSearchPlaceholder}
                  sortLocaleLabel={roomManagementCopy.languageSelectorSortLocaleLabel}
                  sortAlphabeticalLabel={roomManagementCopy.languageSelectorSortAlphabeticalLabel}
                  noResultsLabel={roomManagementCopy.languageSelectorNoResultsLabel}
                  maxLanguages={MAX_STT_LANGUAGE_SELECTION}
                  minLanguages={1}
                  disabled={isSavingPrimaryLanguages}
                />
              </div>
            ) : managementPage === "defaultLanguages" ? (
              <div>
                <p className="mb-5 text-[13px] leading-relaxed text-gray-500">{copy.defaultLanguagesDescription}</p>
                <LanguagePreferencePicker
                  selectedLanguages={defaultConversationLanguages}
                  onToggleLanguage={(code) => void handleToggleDefaultConversationLanguage(code)}
                  uiLocale={locale}
                  searchPlaceholder={roomManagementCopy.languageSelectorSearchPlaceholder}
                  sortLocaleLabel={roomManagementCopy.languageSelectorSortLocaleLabel}
                  sortAlphabeticalLabel={roomManagementCopy.languageSelectorSortAlphabeticalLabel}
                  noResultsLabel={roomManagementCopy.languageSelectorNoResultsLabel}
                  disabled={isSavingDefaultConversationLanguages}
                />
              </div>
            ) : managementPage === "language" ? (
              <div>
                <p className="mb-5 text-[13px] leading-relaxed text-gray-500">{copy.appLanguageDescription}</p>
                <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
                  {PRIMARY_UI_LANGUAGE_OPTIONS.map((option, index) => {
                    const selected = option.code === locale;
                    return (
                      <button
                        key={option.code}
                        type="button"
                        onClick={() => handleSelectAppLanguage(option.code)}
                        className={`group relative flex w-full items-center gap-3 px-4 py-3.5 text-left transition focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400/80 ${selected ? "bg-amber-50/95 text-slate-950 shadow-[0_8px_20px_rgba(245,158,11,0.12)] ring-1 ring-inset ring-amber-300" : "bg-white text-slate-900 active:bg-gray-50"} ${index < PRIMARY_UI_LANGUAGE_OPTIONS.length - 1 ? selected ? "border-b border-amber-200" : "border-b border-gray-100" : ""}`}
                        aria-pressed={selected}
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg ${selected ? "border border-amber-300 bg-white shadow-[0_6px_14px_rgba(245,158,11,0.08)]" : "bg-gray-50"}`} aria-hidden="true">
                          <LanguageFlag language={option.code} className="text-lg leading-none" />
                        </span>
                        <span className={`min-w-0 flex-1 text-[15px] ${selected ? "font-bold text-slate-950" : "font-medium text-slate-900"}`}>{option.name}</span>
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition ${selected ? "border-amber-500 bg-amber-500 text-white shadow-sm" : "border-slate-300 bg-white text-transparent group-hover:border-slate-400"}`}
                          aria-hidden="true"
                        >
                          <Check size={21} strokeWidth={3.2} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : isLoading ? (
              <div className="flex justify-center pt-8 text-gray-400">
                <Loader2 size={24} className="animate-spin" aria-label={copy.loading} />
              </div>
            ) : managementPage === "blocked" ? (
              requiresAuthentication || blocksLoadState === "unauthorized" ? (
                <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-[13px] text-gray-500">{copy.authRequired}</p>
              ) : blocksLoadState === "error" ? (
                <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-[13px] text-gray-500" role="alert">{copy.loadError}</p>
              ) : blocks.length === 0 ? (
                <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-[13px] text-gray-500">{copy.noBlocked}</p>
              ) : (
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                  {blocks.map((block) => {
                    const name = block.user.name?.trim() || block.user.name?.trim() || copy.userFallback;
                    const handle = formatHandle(block.user.handle);
                    return (
                      <li key={block.id} className="flex items-center gap-3 px-3 py-3">
                        <UserMiniAvatar image={block.user.image} label={name} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-semibold">{name}</p>
                          {handle ? <p className="truncate text-[12px] text-gray-500">{handle}</p> : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleUnblock(block.user.id)}
                          disabled={unblockingId === block.user.id}
                          className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-2 text-[12px] font-semibold text-gray-700 transition active:bg-gray-50 disabled:opacity-50"
                        >
                          {unblockingId === block.user.id ? "…" : copy.unblock}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : requiresAuthentication || reportsLoadState === "unauthorized" ? (
              <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-[13px] text-gray-500">{copy.authRequired}</p>
            ) : reportsLoadState === "error" ? (
              <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-[13px] text-gray-500" role="alert">{copy.loadError}</p>
            ) : reports.length === 0 ? (
              <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-[13px] text-gray-500">{copy.noReports}</p>
            ) : (
              <div className="space-y-3">
                {reports.map((report) => {
                  const name = report.reportedUser.name?.trim() || report.reportedUser.name?.trim() || copy.userFallback;
                  const handle = formatHandle(report.reportedUser.handle);
                  const statusLabel = report.status === "resolved"
                    ? (dictionary.profile.reportStatusResolved ?? "Resolved")
                    : report.status === "rejected"
                      ? (dictionary.profile.reportStatusRejected ?? "Rejected")
                      : report.status === "in_review"
                        ? (dictionary.profile.reportStatusInReview ?? "In review")
                        : copy.pending;
                  const expanded = expandedReportId === report.id;
                  return (
                    <article key={report.id} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                      <button type="button" onClick={() => setExpandedReportId(expanded ? null : report.id)} className="w-full text-left">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-semibold">{name}</p>
                            {handle ? <p className="mt-0.5 truncate text-[12px] text-gray-500">{handle}</p> : null}
                            <p className="mt-1 text-[12px] text-gray-500">{copy.reasonLabels[report.reason] ?? report.reason}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-gray-600">{statusLabel}</span>
                        </div>
                      </button>
                      {expanded ? (
                        <div className="mt-3 space-y-3 border-t border-gray-200 pt-3 text-[13px] leading-relaxed">
                          {report.message ? <p><span className="font-semibold text-gray-600">{copy.myMessage}: </span>{report.message}</p> : null}
                          {report.replies.map((reply) => (
                            <div key={reply.id} className="rounded-lg bg-white px-3 py-2">
                              <p className="mb-1 text-[11px] font-semibold text-emerald-600">{copy.teamReply}</p>
                              <p className="whitespace-pre-wrap text-gray-700">{reply.message}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setManagementPage(null)}
            className="absolute right-3 top-[calc(env(safe-area-inset-top,44px)+8px)] flex h-9 w-9 items-center justify-center rounded-full text-gray-400 active:bg-gray-100"
            aria-label={copy.close}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}

function ProfileEditPanel({
  dictionary,
  locale,
  imageUrl,
  initialImageCrop,
  initialBio,
  initialName,
  initialHandle,
  initialPrimaryLanguages,
  initialBirthDate,
  onClose,
  onSave,
  open,
}: {
  dictionary: AppDictionary;
  locale: AppLocale;
  imageUrl?: string | null;
  initialImageCrop?: ProfileImageCropInput;
  initialBio: string;
  initialName: string;
  initialHandle: string;
  initialPrimaryLanguages: readonly string[];
  initialBirthDate?: BirthDateParts | null;
  onClose: () => void;
  onSave: (draft: ProfileDraft) => Promise<ProfileSaveResult>;
  open: boolean;
}) {
  const motionControls = useAnimationControls();
  const dragControls = useDragControls();
  const isMountedRef = useRef(false);
  const isLeavingRef = useRef(false);
  const [name, setName] = useState(initialName);
  const [handle, setHandle] = useState(initialHandle);
  const [bio, setBio] = useState(initialBio);
  const [primaryLanguages, setPrimaryLanguages] = useState<SttLanguageCode[]>(() => (
    sanitizeSttLanguageSelection(initialPrimaryLanguages)
  ));
  const [birthDate, setBirthDate] = useState<BirthDateParts>(initialBirthDate ?? DEFAULT_PROFILE_EDIT_BIRTH_DATE);
  const [hasBirthDate, setHasBirthDate] = useState(Boolean(initialBirthDate));
  const [imageDraft, setImageDraft] = useState<ProfileImageCropperChange>({
    file: null,
    crop: { ...DEFAULT_PROFILE_IMAGE_CROP },
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const copy = {
    title: dictionary.profile.editProfileTitle ?? dictionary.profile.editProfile,
    handleLabel: dictionary.profile.handleLabel ?? (locale === "ko" ? "아이디" : "Handle"),
    handlePlaceholder: dictionary.profile.handlePlaceholder ?? (locale === "ko" ? "아이디를 입력하세요" : "Enter a handle"),
    handleHint: dictionary.profile.handleHint ?? (locale === "ko" ? "영문, 숫자, 밑줄(_)과 마침표(.)만 사용할 수 있습니다." : "Use only letters, numbers, underscores (_), and periods (.)."),
    nameLabel: dictionary.profile.profileNameLabel ?? "Name",
    namePlaceholder: dictionary.profile.profileNamePlaceholder ?? "Enter your name",
    bioLabel: dictionary.profile.bioLabel ?? "Bio",
    primaryLanguagesLabel: dictionary.profile.primaryLanguagesLabel
      ?? dictionary.profile.nationalityLabel
      ?? "Primary languages",
    saveAction: dictionary.profile.saveAction ?? "Save",
    cancelAction: dictionary.profile.cancelAction ?? "Cancel",
    saveError: dictionary.profile.profileSaveError ?? "Could not save your profile.",
    handleTaken: dictionary.profile.handleTakenMessage ?? (locale === "ko" ? "이미 사용 중인 아이디입니다." : "That handle is already taken."),
    handleInvalid: dictionary.profile.handleInvalidMessage ?? (locale === "ko" ? "아이디는 영문, 숫자, 밑줄(_)과 마침표(.)만 사용할 수 있습니다." : "Use only letters, numbers, underscores (_), and periods (.)."),
  };
  const signupCopy = useMemo(() => resolveSignupCopy(locale), [locale]);
  const isEligibleAge = useMemo(() => isOldEnoughForSignup(birthDate), [birthDate]);
  const languageCopy = useMemo(() => resolveLivePhoneDemoRoomManagementCopy(locale), [locale]);
  const initialImageCropScale = initialImageCrop?.scale;
  const initialImageCropX = initialImageCrop?.x;
  const initialImageCropY = initialImageCrop?.y;
  const normalizedInitialImageCrop = useMemo(
    () => normalizeProfileImageCrop({
      scale: initialImageCropScale,
      x: initialImageCropX,
      y: initialImageCropY,
    }),
    [initialImageCropScale, initialImageCropX, initialImageCropY],
  );

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setHandle(initialHandle);
    setBio(initialBio);
    setPrimaryLanguages(sanitizeSttLanguageSelection(initialPrimaryLanguages));
    setBirthDate(initialBirthDate ?? DEFAULT_PROFILE_EDIT_BIRTH_DATE);
    setHasBirthDate(Boolean(initialBirthDate));
    setImageDraft({
      file: null,
      crop: normalizedInitialImageCrop,
    });
    setSaveError(null);
  }, [initialBirthDate, initialBio, initialHandle, initialName, initialPrimaryLanguages, normalizedInitialImageCrop, open]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open || !isMountedRef.current) return;
    isLeavingRef.current = false;
    void motionControls.start({ x: 0, transition: PROFILE_EDIT_TRANSITION });
  }, [motionControls, open]);

  const handlePanelPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const localClientX = event.clientX - event.currentTarget.getBoundingClientRect().left;
    if (!isLeftEdgeSwipeStart(localClientX)) return;
    dragControls.start(event);
  }, [dragControls]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      const saved = await onSave({
        imageFile: imageDraft.file,
        imageCrop: imageDraft.crop,
        handle: handle.trim(),
        name: name.trim(),
        bio: bio.trim(),
        nationality: primaryLanguages[0] ?? null,
        primaryLanguages,
        birthDate: hasBirthDate ? birthDate : null,
      });
      if (saved === "saved") {
        onClose();
      } else {
        setSaveError(saved === "handle_taken" ? copy.handleTaken : saved === "handle_invalid" ? copy.handleInvalid : copy.saveError);
      }
    } catch {
      setSaveError(copy.saveError);
    } finally {
      setIsSaving(false);
    }
  }, [bio, birthDate, copy.handleInvalid, copy.handleTaken, copy.saveError, handle, hasBirthDate, imageDraft, isSaving, name, onClose, onSave, primaryLanguages]);

  const handleBack = useCallback(async () => {
    if (isSaving || isLeavingRef.current || !isMountedRef.current) return;
    isLeavingRef.current = true;
    await motionControls.start({ x: "100%", transition: PROFILE_EDIT_TRANSITION });
    if (isMountedRef.current) onClose();
  }, [isSaving, motionControls, onClose]);

  const handleDragEnd = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (isSaving || isLeavingRef.current || !isMountedRef.current) return;
    if (
      info.offset.x >= PROFILE_EDIT_SWIPE_THRESHOLD_PX
      || info.velocity.x >= PROFILE_EDIT_SWIPE_VELOCITY_PX_PER_SECOND
    ) {
      void handleBack();
      return;
    }
    void motionControls.start({ x: 0, transition: PROFILE_EDIT_TRANSITION });
  }, [handleBack, isSaving, motionControls]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.section
          key="profile-edit-panel"
          initial={{ x: "100%" }}
          animate={motionControls}
          exit={{ x: "100%" }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          drag="x"
          dragControls={dragControls}
          dragDirectionLock
          dragListener={false}
          dragConstraints={{ left: 0, right: 480 }}
          dragElastic={0.08}
          dragMomentum={false}
          onPointerDown={handlePanelPointerDown}
          onDragEnd={handleDragEnd}
          className="fixed inset-0 z-[90] flex min-h-0 w-full flex-col bg-white text-slate-950 shadow-2xl"
          style={{ touchAction: "pan-y" }}
          role="dialog"
          aria-modal="true"
          aria-label={copy.title}
        >
          <header
            className="grid shrink-0 grid-cols-[44px_1fr_auto] items-center border-b border-gray-100 px-4"
            style={{
              height: "calc(54px + env(safe-area-inset-top, 44px))",
              paddingTop: "env(safe-area-inset-top, 44px)",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex h-10 w-10 items-center justify-center rounded-full transition active:bg-gray-100 disabled:opacity-50"
              aria-label={copy.cancelAction}
            >
              <ChevronLeft size={25} strokeWidth={2.1} aria-hidden="true" />
            </button>
            <h2 className="truncate text-center text-[17px] font-bold">{copy.title}</h2>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving || !isEligibleAge}
              className="min-w-[52px] text-[15px] font-semibold text-blue-600 transition active:opacity-60 disabled:opacity-50"
            >
              {isSaving ? "…" : copy.saveAction}
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 pb-10 pt-6">
            <div className="flex justify-center pb-7">
              <ProfileImageCropper
                key={`${open ? "open" : "closed"}:${imageUrl ?? ""}:${initialImageCrop?.scale ?? ""}:${initialImageCrop?.x ?? ""}:${initialImageCrop?.y ?? ""}`}
                imageUrl={imageUrl ?? null}
                initialCrop={initialImageCrop}
                locale={locale}
                onChange={setImageDraft}
                open={open}
              />
            </div>

            <div className="space-y-5">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-gray-600">{copy.handleLabel}</span>
                <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50 px-4 transition focus-within:border-gray-400 focus-within:bg-white">
                  <span className="text-[15px] text-gray-500">@</span>
                  <input
                    type="text"
                    value={handle}
                    maxLength={HANDLE_MAX_LENGTH}
                    onChange={(event) => setHandle(event.target.value.replace(/[^A-Za-z0-9_.]/g, "").toLowerCase())}
                    placeholder={copy.handlePlaceholder}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="h-12 min-w-0 flex-1 bg-transparent pl-1 text-[15px] outline-none"
                  />
                </div>
                <span className="mt-1 block text-[12px] text-gray-400">{copy.handleHint}</span>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-gray-600">{copy.nameLabel}</span>
                <input
                  type="text"
                  value={name}
                  maxLength={40}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={copy.namePlaceholder}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[15px] outline-none transition focus:border-gray-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-gray-600">{copy.bioLabel}</span>
                <textarea
                  value={bio}
                  maxLength={160}
                  rows={3}
                  onChange={(event) => setBio(event.target.value)}
                  className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[15px] leading-relaxed outline-none transition focus:border-gray-400 focus:bg-white"
                />
                <span className="mt-1 block text-right text-[12px] text-gray-400">{bio.length}/160</span>
              </label>

              <fieldset className="min-w-0 w-full max-w-full">
                <legend className="mb-2 text-[13px] font-semibold text-gray-600">
                  {signupCopy.birthDateTitle}
                </legend>
                <SignupBirthDatePicker
                  value={birthDate}
                  onChange={(nextBirthDate) => {
                    setBirthDate(nextBirthDate);
                    setHasBirthDate(true);
                  }}
                  yearLabel={signupCopy.yearLabel}
                  monthLabel={signupCopy.monthLabel}
                  dayLabel={signupCopy.dayLabel}
                />
                <p className="mt-2 text-[12px] leading-relaxed text-gray-400">
                  {signupCopy.birthDateDescription}
                </p>
                {!isEligibleAge ? (
                  <p className="mt-2 text-[12px] font-medium text-rose-600" role="alert">
                    {signupCopy.birthDateUnderage}
                  </p>
                ) : null}
              </fieldset>

              <fieldset className="min-w-0 w-full max-w-full">
                <legend className="mb-2 text-[13px] font-semibold text-gray-600">{copy.primaryLanguagesLabel}</legend>
                <LanguagePreferencePicker
                  selectedLanguages={primaryLanguages}
                  onToggleLanguage={(code) => {
                    setPrimaryLanguages((current) => {
                      const selected = current.includes(code);
                      if (selected) {
                        return current.length > 1 ? current.filter((language) => language !== code) : current;
                      }
                      return current.length < MAX_STT_LANGUAGE_SELECTION ? [...current, code] : current;
                    });
                  }}
                  uiLocale={locale}
                  searchPlaceholder={languageCopy.languageSelectorSearchPlaceholder}
                  sortLocaleLabel={languageCopy.languageSelectorSortLocaleLabel}
                  sortAlphabeticalLabel={languageCopy.languageSelectorSortAlphabeticalLabel}
                  noResultsLabel={languageCopy.languageSelectorNoResultsLabel}
                  maxLanguages={MAX_STT_LANGUAGE_SELECTION}
                  minLanguages={1}
                  disabled={isSaving}
                />
              </fieldset>

              {saveError ? (
                <p role="alert" className="text-center text-[13px] font-medium text-red-500">{saveError}</p>
              ) : null}
            </div>
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}

export default function MyPage({ dictionary, initialProfile, locale }: MyPageProps) {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<ProfileRecord>(() => initialProfile ?? ({
    image: null,
    imageCropScale: null,
    imageCropX: null,
    imageCropY: null,
    handle: null,
    name: null,
    bio: null,
    nationality: null,
    primaryLanguages: [],
    defaultConversationLanguages: [],
    birthDate: null,
    followersCount: 0,
    followingCount: 0,
  }));
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [showProfileImagePreview, setShowProfileImagePreview] = useState(false);

  const sessionUserId = session?.user?.id ?? "";
  const fallbackName = session?.user?.name?.trim() || dictionary.titles.my;
  const profileImageUrl = profile.image || session?.user?.image || null;
  const name = profile.name?.trim() || fallbackName;
  const bio = profile.bio?.trim() || "";
  const primaryLanguages = useMemo(
    () => sanitizeSttLanguageSelection(
      profile.primaryLanguages,
      profile.nationality ? [profile.nationality] : [],
    ),
    [profile.nationality, profile.primaryLanguages],
  );
  const nationality = getNationalityOption(profile.nationality || primaryLanguages[0] || null)?.locale ?? null;
  const nationalityFlag = getNationalityOption(nationality)?.flag;
  const nationalityName = nationality
    ? getSttLanguageDisplayName(nationality, locale)
      ?? getNationalityOption(nationality)?.label
      ?? nationality
    : null;
  const profileSharePath = buildNativeAwareTabPath(`/${locale}/mypage/share`, searchParams);
  const profileShareHref = profile.handle
    ? appendPathSearchParam(profileSharePath, "profileHandle", profile.handle)
    : profileSharePath;
  const followListPath = buildNativeAwareTabPath(`/${locale}/mypage/follows`, searchParams);
  const followersHref = appendPathSearchParam(followListPath, "tab", "followers");
  const followingHref = appendPathSearchParam(followListPath, "tab", "following");
  const signOutCallbackUrl = buildNativeAwareTabPath(`/${locale}`, searchParams, {
    skipConversationRestore: true,
    tabRoot: true,
  });

  useEffect(() => {
    void router.prefetch(profileShareHref);
  }, [profileShareHref, router]);

  useEffect(() => {
    if (!sessionUserId) return;

    let cancelled = false;
    void fetch(buildClientApiPath("/profile"), { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() as Promise<Partial<ProfileRecord>> : null))
      .then((data) => {
        if (cancelled || !data) return;
        setProfile({
          image: typeof data.image === "string" ? data.image : null,
          imageCropScale: typeof data.imageCropScale === "number" ? data.imageCropScale : null,
          imageCropX: typeof data.imageCropX === "number" ? data.imageCropX : null,
          imageCropY: typeof data.imageCropY === "number" ? data.imageCropY : null,
          handle: typeof data.handle === "string" ? data.handle : null,
          name: typeof data.name === "string" ? data.name : null,
          bio: typeof data.bio === "string" ? data.bio : null,
          nationality: typeof data.nationality === "string" ? data.nationality : null,
          primaryLanguages: sanitizeSttLanguageSelection(
            data.primaryLanguages,
            typeof data.nationality === "string" && data.nationality ? [data.nationality] : [],
          ),
          defaultConversationLanguages: sanitizeSttLanguageSelection(data.defaultConversationLanguages),
          birthDate: parseProfileBirthDate(data.birthDate),
          followersCount: typeof data.followersCount === "number" ? data.followersCount : 0,
          followingCount: typeof data.followingCount === "number" ? data.followingCount : 0,
        });
      })
      .catch(() => {
        // The session-backed name remains available when profile hydration fails.
      });

    return () => {
      cancelled = true;
    };
  }, [sessionUserId]);

  const handleSaveProfile = useCallback(async (draft: ProfileDraft): Promise<ProfileSaveResult> => {
    try {
      if (draft.imageFile) {
        const imageFormData = new FormData();
        imageFormData.append("file", draft.imageFile);
        imageFormData.append("imageCropScale", String(draft.imageCrop.scale));
        imageFormData.append("imageCropX", String(draft.imageCrop.x));
        imageFormData.append("imageCropY", String(draft.imageCrop.y));

        const imageResponse = await fetch(buildClientApiPath("/profile/image"), {
          method: "POST",
          body: imageFormData,
        });
        if (!imageResponse.ok) return "failed";

        const imageSaved = await imageResponse.json() as Partial<ProfileRecord>;
        setProfile((current) => ({
          ...current,
          image: typeof imageSaved.image === "string" ? imageSaved.image : current.image,
          imageCropScale: typeof imageSaved.imageCropScale === "number" ? imageSaved.imageCropScale : current.imageCropScale,
          imageCropX: typeof imageSaved.imageCropX === "number" ? imageSaved.imageCropX : current.imageCropX,
          imageCropY: typeof imageSaved.imageCropY === "number" ? imageSaved.imageCropY : current.imageCropY,
        }));
      }

      const response = await fetch(buildClientApiPath("/profile"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: draft.handle,
          name: draft.name,
          bio: draft.bio,
          nationality: draft.nationality,
          primaryLanguages: draft.primaryLanguages,
          birthDate: draft.birthDate ? formatBirthDate(draft.birthDate) : null,
          imageCropScale: draft.imageCrop.scale,
          imageCropX: draft.imageCrop.x,
          imageCropY: draft.imageCrop.y,
        }),
      });
      if (!response.ok) {
        if (response.status === 409) return "handle_taken";
        if (response.status === 400) {
          const errorBody = await response.json().catch(() => null) as { error?: unknown } | null;
          if (errorBody?.error === "invalid_handle") return "handle_invalid";
        }
        return "failed";
      }

      const saved = await response.json() as Partial<ProfileRecord>;
      setProfile((current) => ({
        ...current,
        handle: typeof saved.handle === "string" ? saved.handle : current.handle,
        bio: typeof saved.bio === "string" ? saved.bio : current.bio,
        birthDate: parseProfileBirthDate(saved.birthDate) ?? current.birthDate,
        nationality: typeof saved.nationality === "string" ? saved.nationality : current.nationality,
        primaryLanguages: sanitizeSttLanguageSelection(
          saved.primaryLanguages,
          typeof saved.nationality === "string" && saved.nationality ? [saved.nationality] : [],
        ),
      }));
      return "saved";
    } catch {
      return "failed";
    }
  }, []);

  const handleSavePrimaryLanguages = useCallback(async (languages: SttLanguageCode[]) => {
    try {
      const normalizedLanguages = sanitizeSttLanguageSelection(languages);
      if (normalizedLanguages.length === 0) return false;
      const response = await fetch(buildClientApiPath("/profile"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryLanguages: normalizedLanguages }),
      });
      if (!response.ok) return false;

      const saved = await response.json() as Partial<ProfileRecord>;
      setProfile((current) => ({
        ...current,
        primaryLanguages: sanitizeSttLanguageSelection(saved.primaryLanguages, normalizedLanguages),
      }));
      return true;
    } catch {
      return false;
    }
  }, []);

  const defaultConversationLanguages = useMemo(() => {
    const storedLanguages = sanitizeSttLanguageSelection(profile.defaultConversationLanguages);
    return storedLanguages.length > 0
      ? storedLanguages
      : deriveDefaultConversationLanguages(primaryLanguages, locale);
  }, [locale, primaryLanguages, profile.defaultConversationLanguages]);

  const handleSaveDefaultConversationLanguages = useCallback(async (languages: SttLanguageCode[]) => {
    try {
      const normalizedLanguages = sanitizeSttLanguageSelection(languages);
      if (normalizedLanguages.length === 0) return false;
      const response = await fetch(buildClientApiPath("/profile"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultConversationLanguages: normalizedLanguages }),
      });
      if (!response.ok) return false;

      const saved = await response.json() as Partial<ProfileRecord>;
      const savedLanguages = sanitizeSttLanguageSelection(saved.defaultConversationLanguages, normalizedLanguages);
      setProfile((current) => ({
        ...current,
        defaultConversationLanguages: savedLanguages,
      }));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(DEFAULT_CONVERSATION_LANGUAGES_SYNC_EVENT, {
          detail: savedLanguages,
        }));
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  const handleSignOut = useCallback(() => {
    void unregisterNativePushToken().finally(() => {
      void signOut({ callbackUrl: signOutCallbackUrl }).then(() => {
        if (typeof window !== "undefined") {
          window.location.replace(signOutCallbackUrl);
        }
      });
    });
  }, [signOutCallbackUrl]);

  const handleChangeAppLanguage = useCallback((nextLocale: PrimaryUiLocale) => {
    setShowProfileSettings(false);
    router.replace(buildNativeAwareTabPath(`/${nextLocale}/mypage`, searchParams, { tabRoot: true }));
  }, [router, searchParams]);

  return (
    <main className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-white text-slate-900">
      <ProfileEditPanel
        dictionary={dictionary}
        locale={locale}
        imageUrl={profileImageUrl}
        initialImageCrop={{
          scale: profile.imageCropScale,
          x: profile.imageCropX,
          y: profile.imageCropY,
        }}
        initialBio={profile.bio ?? ""}
        initialName={name}
        initialHandle={profile.handle ?? ""}
        initialPrimaryLanguages={primaryLanguages}
        initialBirthDate={profile.birthDate}
        onClose={() => setShowProfileEdit(false)}
        onSave={handleSaveProfile}
        open={showProfileEdit}
      />
      <ProfileSettingsPanel
        dictionary={dictionary}
        locale={locale}
        onClose={() => setShowProfileSettings(false)}
        onChangeAppLanguage={handleChangeAppLanguage}
        initialPrimaryLanguages={primaryLanguages}
        onSavePrimaryLanguages={handleSavePrimaryLanguages}
        initialDefaultConversationLanguages={defaultConversationLanguages}
        onSaveDefaultConversationLanguages={handleSaveDefaultConversationLanguages}
        onSignOut={handleSignOut}
        signOutCallbackUrl={signOutCallbackUrl}
        defaultFeedbackEmail={session?.user?.email ?? ""}
        open={showProfileSettings}
        sessionStatus={sessionStatus}
      />
      <ProfileImagePreview
        open={showProfileImagePreview}
        image={profileImageUrl}
        alt={name}
        crop={{
          scale: profile.imageCropScale,
          x: profile.imageCropX,
          y: profile.imageCropY,
        }}
        flag={nationalityFlag}
        languageName={nationalityName}
        closeLabel={dictionary.profile.settingsCloseLabel ?? dictionary.profile.profileShareBackLabel ?? "Close"}
        onClose={() => setShowProfileImagePreview(false)}
      />

      <header
        className="flex shrink-0 items-center px-4"
        style={{
          height: "calc(54px + env(safe-area-inset-top, 44px))",
          paddingTop: "env(safe-area-inset-top, 44px)",
        }}
      >
        <div aria-hidden="true" className="h-10 w-10 shrink-0" />
        <h1 className="min-w-0 flex-1 truncate text-center text-[17px] font-bold text-slate-950">
          {name}
        </h1>
        <button
          type="button"
          onClick={() => setShowProfileSettings(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full transition"
          aria-label={dictionary.profile.menuLabel}
        >
          <Menu size={23} strokeWidth={2.2} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="px-4 pb-4 pt-5">
          <div className="flex items-center gap-6 pl-2">
            <div className="flex shrink-0 flex-col items-center">
              <ProfileAvatar
                alt={name}
                languages={primaryLanguages}
                imageUrl={profileImageUrl}
                imageCrop={{
                  scale: profile.imageCropScale,
                  x: profile.imageCropX,
                  y: profile.imageCropY,
                }}
                onClick={() => setShowProfileImagePreview(true)}
              />
            </div>
            <div className="min-w-0 flex-1 grid grid-cols-2 gap-1 text-center">
              <button
                type="button"
                onClick={() => router.push(followersHref)}
                className="rounded-xl px-2 py-1 transition active:bg-gray-50"
                aria-label={`${profile.followersCount} ${dictionary.profile.followersLabel}`}
              >
                <p className="text-[18px] font-semibold leading-tight">{profile.followersCount}</p>
                <p className="mt-0.5 text-[13px] text-gray-500">{dictionary.profile.followersLabel}</p>
              </button>
              <button
                type="button"
                onClick={() => router.push(followingHref)}
                className="rounded-xl px-2 py-1 transition active:bg-gray-50"
                aria-label={`${profile.followingCount} ${dictionary.profile.followingLabel}`}
              >
                <p className="text-[18px] font-semibold leading-tight">{profile.followingCount}</p>
                <p className="mt-0.5 text-[13px] text-gray-500">{dictionary.profile.followingLabel}</p>
              </button>
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
              onClick={() => setShowProfileEdit(true)}
              className="flex h-10 min-w-0 flex-1 items-center justify-center rounded-lg border border-gray-200 bg-white px-2 text-[13px] font-semibold text-slate-900 transition active:bg-gray-100"
            >
              {dictionary.profile.editProfile}
            </button>
            <button
              type="button"
              onClick={() => router.push(profileShareHref)}
              className="flex h-10 min-w-0 flex-1 items-center justify-center rounded-lg border border-gray-200 bg-white px-2 text-[13px] font-semibold text-slate-900 transition active:bg-gray-100"
            >
              {dictionary.profile.shareProfile}
            </button>
          </div>
        </section>

      </div>

      <BottomTabBar
        activeRoute="mypage"
        dictionary={dictionary}
        locale={locale}
      />
    </main>
  );
}
