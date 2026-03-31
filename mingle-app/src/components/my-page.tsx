"use client";

import type { AppDictionary } from "@/i18n/types";
import type { AppLocale } from "@/i18n";
import { useSession, signOut } from "next-auth/react";
import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import BottomTabBar from "@/components/bottom-tab-bar";
import NativeBottomTabBannerSlot from "@/components/native-bottom-tab-banner-slot";
import {
  clearNativeHistoryBackAnimateFlag,
  registerNativeBackHandler,
} from "@/lib/native-back-handler";
import { normalizeAppLocale, resolveAppLocale } from "@/lib/app-locale";
import {
  NATIONALITY_OPTIONS,
  resolveNationalityCode,
  resolveNationalityOption,
} from "@/lib/profile-nationality";
import {
  Plus, Menu, Globe, LogOut, Trash2,
  Share2, Edit3, ChevronLeft, ChevronRight,
} from "lucide-react";

const LANGUAGE_OPTIONS: ReadonlyArray<{ locale: AppLocale; label: string; flag: string }> = [
  { locale: "ko", label: "한국어", flag: "🇰🇷" },
  { locale: "ja", label: "日本語", flag: "🇯🇵" },
  { locale: "en", label: "English", flag: "🇺🇸" },
  { locale: "zh-CN", label: "中文(简体)", flag: "🇨🇳" },
  { locale: "zh-TW", label: "中文(繁體)", flag: "🇹🇼" },
  { locale: "fr", label: "Français", flag: "🇫🇷" },
  { locale: "de", label: "Deutsch", flag: "🇩🇪" },
  { locale: "es", label: "Español", flag: "🇪🇸" },
  { locale: "pt", label: "Português", flag: "🇧🇷" },
  { locale: "it", label: "Italiano", flag: "🇮🇹" },
  { locale: "ru", label: "Русский", flag: "🇷🇺" },
  { locale: "ar", label: "العربية", flag: "🇸🇦" },
  { locale: "hi", label: "हिन्दी", flag: "🇮🇳" },
  { locale: "th", label: "ภาษาไทย", flag: "🇹🇭" },
  { locale: "vi", label: "Tiếng Việt", flag: "🇻🇳" },
];
const MYPAGE_PANEL_HISTORY_KEY = "__MINGLE_MYPAGE_PANEL__";

type MyPageHistoryPanel = "settings" | "language" | "followers" | "following" | "edit";
type MyPagePanelTransitionMode = "animate" | "instant";

function getLanguageOption(locale: string | null | undefined) {
  const normalizedLocale = normalizeAppLocale(locale);
  if (!normalizedLocale) return null;
  return LANGUAGE_OPTIONS.find((option) => option.locale === normalizedLocale) ?? null;
}
const DUMMY_POSTS: { id: number; color: string }[] = [];

function readMyPageHistoryPanel(): MyPageHistoryPanel | null {
  if (typeof window === "undefined") return null;
  const historyState = window.history.state;
  if (!historyState || typeof historyState !== "object") return null;

  const panel = (historyState as Record<string, unknown>)[MYPAGE_PANEL_HISTORY_KEY];
  switch (panel) {
  case "settings":
  case "language":
  case "followers":
  case "following":
  case "edit":
    return panel;
  default:
    return null;
  }
}

function buildMyPageHistoryState(panel: MyPageHistoryPanel | null): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;

  const historyState = window.history.state;
  const nextState = historyState && typeof historyState === "object"
    ? { ...(historyState as Record<string, unknown>) }
    : {};

  if (panel) {
    nextState[MYPAGE_PANEL_HISTORY_KEY] = panel;
  } else {
    delete nextState[MYPAGE_PANEL_HISTORY_KEY];
  }

  return Object.keys(nextState).length > 0 ? nextState : null;
}

// ── 프로필 아바타 + 국기 배지 컴포넌트 (하나로 통합) ─────────────────────
function DefaultProfileIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" fill="none" aria-hidden>
      <circle cx="13" cy="13" r="13" fill="#e5e7eb" />
      <circle cx="13" cy="10" r="4" fill="#9ca3af" />
      <path d="M5 22c0-4.418 3.582-8 8-8s8 3.582 8 8" fill="#9ca3af" />
    </svg>
  );
}

function ProfileAvatarBadge({
  size = 86,
  imageUrl,
  altLabel,
  flag,
}: {
  size?: number;
  imageUrl?: string | null;
  altLabel: string;
  flag?: string | null;
}) {
  const badgeSize = Math.max(24, Math.round(size * 0.32));

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-100">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={altLabel}
            width={size}
            height={size}
            className="h-full w-full object-cover"
          />
        ) : (
          <DefaultProfileIcon size={size} />
        )}
      </div>
      {flag ? (
        <div
          className="absolute bottom-0 left-0 flex items-center justify-center rounded-full border-2 border-white bg-white shadow-sm"
          style={{ width: badgeSize, height: badgeSize }}
        >
          <span aria-hidden="true" className="text-sm leading-none">
            {flag}
          </span>
        </div>
      ) : null}
    </div>
  );
}

// ── 공통 헤더 ─────────────────────────────────────────────────────────────
function PanelHeader({ title, onBack, backLabel, rightLabel, onRight }: {
  title: string; onBack: () => void; backLabel: string;
  rightLabel?: string; onRight?: () => void;
}) {
  return (
    <div
      className="flex shrink-0 items-center border-b border-gray-100 px-4"
      style={{ paddingTop: "env(safe-area-inset-top, 44px)", height: "calc(52px + env(safe-area-inset-top, 44px))" }}
    >
      <button type="button" onClick={onBack} aria-label={backLabel}
        className="flex h-10 w-10 items-center justify-center rounded-full transition active:bg-gray-100">
        <ChevronLeft size={24} />
      </button>
      <span className="mx-auto text-[16px] font-semibold">{title}</span>
      {rightLabel && onRight
        ? <button type="button" onClick={onRight} className="text-[15px] font-semibold text-blue-500">{rightLabel}</button>
        : <div className="w-10" />}
    </div>
  );
}

// ── 스와이프-백 ───────────────────────────────────────────────────────────
function SwipeBack({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  const startX = useRef<number | null>(null);
  return (
    <div
      className="absolute inset-0 flex flex-col bg-white"
      onTouchStart={(e) => { startX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (startX.current !== null && e.changedTouches[0].clientX - startX.current > 60) onBack();
        startX.current = null;
      }}
    >
      {children}
    </div>
  );
}

// ── FullPanel: 오른쪽 슬라이드 ────────────────────────────────────────────
function FullPanel({ open, children, onClose, zIndex = 50, transitionMode = "animate" }: {
  open: boolean; onClose: () => void; children: React.ReactNode; zIndex?: number; transitionMode?: MyPagePanelTransitionMode;
}) {
  return (
    <div
      className={`absolute inset-0 transition-transform ease-in-out ${transitionMode === "instant" ? "duration-0" : "duration-300"}`}
      style={{
        transform: open ? "translateX(0)" : "translateX(100%)",
        pointerEvents: open ? "auto" : "none",
        zIndex,
      }}
      aria-hidden={!open}
    >
      <SwipeBack onBack={onClose}>{children}</SwipeBack>
    </div>
  );
}

// ── 준비중 모달 ───────────────────────────────────────────────────────────
function ComingSoonModal({
  open,
  onClose,
  dictionary,
}: {
  open: boolean;
  onClose: () => void;
  dictionary: AppDictionary;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[280px] rounded-2xl bg-white p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[16px] font-semibold text-slate-900">{dictionary.myPage.comingSoonTitle}</p>
        <p className="mt-1 text-[13px] text-gray-500">{dictionary.myPage.comingSoonDescription}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-slate-900 py-2.5 text-[15px] font-semibold text-white transition active:bg-slate-700"
        >
          {dictionary.myPage.confirmAction}
        </button>
      </div>
    </div>
  );
}

// ── 회원탈퇴 확인 모달 ────────────────────────────────────────────────────
function DeleteAccountModal({ open, onClose, onConfirm, loading, dictionary }: {
  open: boolean; onClose: () => void; onConfirm: () => void; loading: boolean; dictionary: AppDictionary;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[280px] rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[16px] font-semibold text-slate-900">{dictionary.profile.deleteAccount}</p>
        <p className="mt-1 text-[13px] text-gray-500">{dictionary.profile.deleteAccountConfirm}</p>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 bg-gray-100 py-2.5 text-[15px] font-semibold text-slate-700 transition active:bg-gray-200">
            {dictionary.profile.deleteAccountCancel}
          </button>
          <button type="button" onClick={onConfirm} disabled={loading}
            className="flex-1 rounded-xl bg-red-500 py-2.5 text-[15px] font-semibold text-white transition active:bg-red-600 disabled:opacity-60">
            {dictionary.profile.deleteAccountConfirmAction}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 언어 설정 패널 (설정 패널에서 한 뎁스 더 오른쪽) ─────────────────────
function LanguagePanel({ open, onClose, currentLocale, onSelect, dictionary, transitionMode }: {
  open: boolean; onClose: () => void;
  currentLocale: AppLocale; onSelect: (locale: AppLocale) => void;
  dictionary: AppDictionary;
  transitionMode?: MyPagePanelTransitionMode;
}) {
  return (
    <FullPanel open={open} onClose={onClose} zIndex={60} transitionMode={transitionMode}>
      <PanelHeader
        title={dictionary.myPage.languageSettings}
        onBack={onClose}
        backLabel={dictionary.myPage.backButtonLabel}
      />
      <div className="flex-1 overflow-y-auto">
        {LANGUAGE_OPTIONS.map((opt, idx) => (
          <div key={opt.locale}>
            <button
              type="button"
              onClick={() => onSelect(opt.locale)}
              className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-gray-50 active:bg-gray-100"
            >
              <span className="text-2xl">{opt.flag}</span>
              <span className="flex-1 text-[15px] font-medium text-slate-800">{opt.label}</span>
              {currentLocale === opt.locale && (
                <svg viewBox="0 0 20 20" fill="none" width="20" height="20">
                  <path d="M4 10l4 4 8-8" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            {idx < LANGUAGE_OPTIONS.length - 1 && <div className="mx-5 h-px bg-gray-100" />}
          </div>
        ))}
      </div>
    </FullPanel>
  );
}

// ── 설정 패널 ─────────────────────────────────────────────────────────────
function SettingsPanel({
  open, onClose, onLogout, onDeleteAccount, onLanguage, selectedLanguage, dictionary, transitionMode,
}: {
  open: boolean; onClose: () => void;
  onLogout: () => void; onDeleteAccount: () => void; onLanguage: () => void;
  selectedLanguage: { flag: string; label: string } | null;
  dictionary: AppDictionary;
  transitionMode?: MyPagePanelTransitionMode;
}) {
  return (
    <FullPanel open={open} onClose={onClose} zIndex={50} transitionMode={transitionMode}>
      <PanelHeader
        title={dictionary.profile.menuLabel}
        onBack={onClose}
        backLabel={dictionary.myPage.backButtonLabel}
      />
      <div className="flex-1 overflow-y-auto">
        {/* 언어 설정 - 오른쪽 화살표 */}
        <button type="button" onClick={onLanguage}
          className="flex w-full items-center px-6 py-4 text-left transition hover:bg-gray-50 active:bg-gray-100">
          <div className="flex min-w-0 flex-1 items-center">
            <span className="mr-4 inline-flex h-6 w-6 shrink-0 items-center justify-center">
              <Globe size={20} className="text-slate-500" />
            </span>
            <span className="flex-1 text-[15px] font-medium text-slate-800">{dictionary.myPage.languageSettings}</span>
          </div>
          {selectedLanguage && (
            <span className="flex items-center gap-2 text-[13px] text-slate-500">
              <span aria-hidden="true" className="text-base">{selectedLanguage.flag}</span>
              <span>{selectedLanguage.label}</span>
            </span>
          )}
          <ChevronRight size={18} className="shrink-0 text-gray-400" />
        </button>
        <div className="mx-6 h-px bg-gray-100" />
        {/* 로그아웃 */}
        <button type="button" onClick={onLogout}
          className="flex w-full items-center px-6 py-4 text-left transition hover:bg-gray-50 active:bg-gray-100">
          <span className="mr-4 inline-flex h-6 w-6 shrink-0 items-center justify-center">
            <LogOut size={20} className="text-slate-500" />
          </span>
          <span className="flex-1 text-[15px] font-medium text-slate-800">{dictionary.profile.logout}</span>
        </button>
        <div className="mx-6 h-px bg-gray-100" />
        {/* 회원탈퇴 */}
        <button type="button" onClick={onDeleteAccount}
          className="flex w-full items-center px-6 py-4 text-left transition hover:bg-red-50 active:bg-red-100">
          <span className="mr-4 inline-flex h-6 w-6 shrink-0 items-center justify-center">
            <Trash2 size={20} className="text-red-500" />
          </span>
          <span className="flex-1 text-[15px] font-medium text-red-500">{dictionary.profile.deleteAccount}</span>
        </button>
      </div>
    </FullPanel>
  );
}

// ── 팔로워/팔로잉 패널 ────────────────────────────────────────────────────
type FollowTab = "followers" | "following";
function FollowPanel({ open, defaultTab, username, onClose, dictionary, transitionMode }: {
  open: boolean; defaultTab: FollowTab; username: string; onClose: () => void;
  dictionary: AppDictionary;
  transitionMode?: MyPagePanelTransitionMode;
}) {
  const [tab, setTab] = useState<FollowTab>(defaultTab);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (open) setTab(defaultTab); }, [open, defaultTab]);

  return (
    <FullPanel open={open} onClose={onClose} zIndex={50} transitionMode={transitionMode}>
      <PanelHeader title={username} onBack={onClose} backLabel={dictionary.myPage.backButtonLabel} />
      <div className="flex shrink-0 border-b border-gray-100">
        {(["followers", "following"] as FollowTab[]).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className="flex-1 py-3 text-[14px] font-semibold"
            style={{ borderBottom: tab === t ? "2px solid #111827" : "2px solid transparent", color: tab === t ? "#111827" : "#9ca3af" }}>
            {t === "followers" ? dictionary.profile.followersLabel : dictionary.profile.followingLabel}
          </button>
        ))}
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-gray-400">
        <span className="text-4xl">👤</span>
        <p className="text-[14px]">{tab === "followers" ? dictionary.myPage.noFollowers : dictionary.myPage.noFollowing}</p>
      </div>
    </FullPanel>
  );
}

// ── 프로필 편집 패널 ─────────────────────────────────────────────────────
function EditProfilePanel({
  open,
  username,
  bio,
  nationalityCode,
  profileImageUrl,
  onClose,
  onSave,
  dictionary,
  transitionMode,
}: {
  open: boolean;
  username: string;
  bio: string;
  nationalityCode: string | null;
  profileImageUrl?: string | null;
  onClose: () => void;
  onSave: (d: { username: string; bio: string; nationalityCode: string | null }) => void;
  dictionary: AppDictionary;
  transitionMode?: MyPagePanelTransitionMode;
}) {
  const [lu, setLu] = useState(username);
  const [lb, setLb] = useState(bio);
  const [ln, setLn] = useState<string | null>(nationalityCode);
  const selectedNationality = resolveNationalityOption(ln);

  return (
    <FullPanel open={open} onClose={onClose} zIndex={50} transitionMode={transitionMode}>
      <PanelHeader
        title={dictionary.myPage.editProfileTitle}
        onBack={onClose}
        backLabel={dictionary.myPage.cancelAction}
        rightLabel={dictionary.myPage.doneAction}
        onRight={() => { onSave({ username: lu, bio: lb, nationalityCode: ln }); onClose(); }}
      />
      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-center py-5">
          <ProfileAvatarBadge
            size={80}
            imageUrl={profileImageUrl}
            altLabel={dictionary.navigation.profileImageAlt}
            flag={selectedNationality?.flag}
          />
        </div>
        <div className="space-y-4 px-5 pb-10">
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-gray-500">{dictionary.myPage.usernameLabel}</label>
            <input type="text" value={lu} onChange={(e) => setLu(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[15px] outline-none focus:border-gray-400"
              placeholder={dictionary.myPage.usernamePlaceholder} />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-gray-500">{dictionary.myPage.bioLabel}</label>
            <input type="text" value={lb} onChange={(e) => setLb(e.target.value)} maxLength={60}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[15px] outline-none focus:border-gray-400"
              placeholder={dictionary.myPage.bioPlaceholder} />
          </div>
          <div>
            <label className="mb-2 block text-[12px] font-semibold text-gray-500">{dictionary.myPage.nationalityLabel}</label>
            <div className="grid grid-cols-2 gap-2">
              {NATIONALITY_OPTIONS.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  onClick={() => setLn(option.code)}
                  className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition"
                  style={{
                    borderColor: ln === option.code ? "#f59e0b" : "#e5e7eb",
                    background: ln === option.code ? "#fef3c7" : "#f9fafb",
                  }}
                >
                  <span aria-hidden="true" className="text-xl leading-none">{option.flag}</span>
                  <span className="min-w-0 text-[13px] font-medium text-slate-800">{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </FullPanel>
  );
}

// ── 메인 ─────────────────────────────────────────────────────────────────
export default function MyPage({ locale, dictionary }: { locale: AppLocale; dictionary: AppDictionary }) {
  const { data: session } = useSession();
  const user = session?.user;

  const [showSettings, setShowSettings] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  const [followState, setFollowState] = useState<{ open: boolean; tab: FollowTab }>({ open: false, tab: "followers" });
  const [showEdit, setShowEdit] = useState(false);
  const [editPanelVersion, setEditPanelVersion] = useState(0);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [customUsername, setCustomUsername] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  // nationalityCode: 프로필 편집에서 수동 지정한 국적 코드 (언어 설정과 완전 별개)
  const [nationalityCode, setNationalityCode] = useState<string | null>(null);
  const [selectedLocale, setSelectedLocale] = useState<AppLocale>(() => resolveAppLocale(locale));
  const [panelTransitionMode, setPanelTransitionMode] = useState<MyPagePanelTransitionMode>("animate");

  const postsRef = useRef<HTMLDivElement>(null);
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const pendingHistoryPanelTransitionModeRef = useRef<MyPagePanelTransitionMode>("instant");
  const panelTransitionResetTimeoutRef = useRef<number | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const username = customUsername ?? user?.name ?? dictionary.myPage.anonymousUser;
  const selectedNationality =
    resolveNationalityOption(nationalityCode) ?? resolveNationalityOption(locale);
  const selectedLanguage = getLanguageOption(selectedLocale);
  const activeHistoryPanel: MyPageHistoryPanel | null = showLanguage
    ? "language"
    : showEdit
      ? "edit"
      : followState.open
        ? followState.tab
        : showSettings
          ? "settings"
          : null;
  const shouldHideBottomTabBannerSlot = showSettings
    || showLanguage
    || followState.open
    || showEdit
    || showComingSoon
    || showDeleteConfirm;

  // DB에서 프로필 초기값 로드
  useEffect(() => {
    fetch("/api/profile")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!data) return;
        if (data.displayName) setCustomUsername(data.displayName);
        if (data.bio) setBio(data.bio);
        if (data.nationality) setNationalityCode(resolveNationalityCode(data.nationality));
        if (data.appLocale) setSelectedLocale(resolveAppLocale(data.appLocale, locale));
      })
      .catch(() => {});
  }, [locale]);

  useEffect(() => () => {
    if (typeof window === "undefined") return;
    if (panelTransitionResetTimeoutRef.current === null) return;
    window.clearTimeout(panelTransitionResetTimeoutRef.current);
  }, []);

  const requestHistoryPanelClose = useCallback((panel: MyPageHistoryPanel) => {
    if (typeof window === "undefined") return false;
    if (readMyPageHistoryPanel() !== panel || window.history.length <= 1) return false;

    pendingHistoryPanelTransitionModeRef.current = "animate";
    window.history.back();
    return true;
  }, []);

  const handleSignOut = useCallback(async () => {
    setShowSettings(false);
    await signOut({ callbackUrl: `/${locale}` });
  }, [locale]);

  const handleDeleteAccount = useCallback(async () => {
    setDeleteLoading(true);
    try {
      const res = await fetch("/api/account/delete", { method: "DELETE" });
      if (res.ok) {
        await signOut({ callbackUrl: `/${locale}` });
      }
    } catch {
      // silent
    } finally {
      setDeleteLoading(false);
      setShowDeleteConfirm(false);
    }
  }, [locale]);

  // 언어 설정: locale 변경 = URL prefix 교체 + DB에 appLocale 저장
  const handleLanguageSelect = useCallback((newLocale: AppLocale) => {
    setShowLanguage(false);
    const normalizedLocale = resolveAppLocale(newLocale, locale);
    setSelectedLocale(normalizedLocale);

    // DB에 appLocale 저장 (비동기)
    fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appLocale: normalizedLocale }),
    }).catch(() => {});

    if (normalizedLocale !== locale) {
      const newPath = pathname.replace(new RegExp(`^/${locale}(/|$)`), `/${normalizedLocale}$1`);
      router.push(newPath);
    }
  }, [locale, pathname, router]);

  const handleScrollToPosts = useCallback(() => {
    const container = scrollBodyRef.current;
    const target = postsRef.current;
    if (!container || !target) return;

    const nextTop =
      target.getBoundingClientRect().top
      - container.getBoundingClientRect().top
      + container.scrollTop;

    container.scrollTo({ top: nextTop, behavior: "smooth" });
  }, []);

  const handleOpenSettings = useCallback(() => {
    setPanelTransitionMode("animate");
    setShowSettings(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    if (requestHistoryPanelClose("settings")) return;
    setShowSettings(false);
  }, [requestHistoryPanelClose]);

  const handleOpenLanguage = useCallback(() => {
    setPanelTransitionMode("animate");
    setShowLanguage(true);
  }, []);

  const handleCloseLanguage = useCallback(() => {
    if (requestHistoryPanelClose("language")) return;
    setShowLanguage(false);
  }, [requestHistoryPanelClose]);

  const handleOpenFollow = useCallback((tab: FollowTab) => {
    setPanelTransitionMode("animate");
    setFollowState({ open: true, tab });
  }, []);

  const handleCloseFollow = useCallback(() => {
    if (requestHistoryPanelClose(followState.tab)) return;
    setFollowState((current) => ({ ...current, open: false }));
  }, [followState.tab, requestHistoryPanelClose]);

  const handleOpenEditProfile = useCallback(() => {
    setEditPanelVersion((currentVersion) => currentVersion + 1);
    setPanelTransitionMode("animate");
    setShowEdit(true);
  }, []);

  const handleCloseEditProfile = useCallback(() => {
    if (requestHistoryPanelClose("edit")) return;
    setShowEdit(false);
  }, [requestHistoryPanelClose]);

  useEffect(() => {
    if (typeof window === "undefined" || !activeHistoryPanel) return;
    if (readMyPageHistoryPanel() === activeHistoryPanel) return;

    window.history.pushState(
      buildMyPageHistoryState(activeHistoryPanel),
      "",
      window.location.href,
    );
  }, [activeHistoryPanel]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncPanelsFromHistory = () => {
      const nextTransitionMode = pendingHistoryPanelTransitionModeRef.current;
      pendingHistoryPanelTransitionModeRef.current = "instant";
      setPanelTransitionMode(nextTransitionMode);

      const historyPanel = readMyPageHistoryPanel();
      setShowSettings(historyPanel === "settings" || historyPanel === "language");
      setShowLanguage(historyPanel === "language");
      setShowEdit(historyPanel === "edit");
      setFollowState((current) => {
        if (historyPanel === "followers" || historyPanel === "following") {
          return {
            open: true,
            tab: historyPanel,
          };
        }

        if (!current.open) return current;
        return {
          ...current,
          open: false,
        };
      });

      if (panelTransitionResetTimeoutRef.current !== null) {
        window.clearTimeout(panelTransitionResetTimeoutRef.current);
      }
      panelTransitionResetTimeoutRef.current = window.setTimeout(() => {
        setPanelTransitionMode("animate");
        panelTransitionResetTimeoutRef.current = null;
      }, 0);
    };

    syncPanelsFromHistory();
    window.addEventListener("popstate", syncPanelsFromHistory);
    return () => {
      window.removeEventListener("popstate", syncPanelsFromHistory);
    };
  }, []);

  useEffect(() => registerNativeBackHandler(() => {
    if (showDeleteConfirm) {
      clearNativeHistoryBackAnimateFlag();
      setShowDeleteConfirm(false);
      return true;
    }
    if (showComingSoon) {
      clearNativeHistoryBackAnimateFlag();
      setShowComingSoon(false);
      return true;
    }
    if (showLanguage) {
      clearNativeHistoryBackAnimateFlag();
      handleCloseLanguage();
      return true;
    }
    if (showEdit) {
      clearNativeHistoryBackAnimateFlag();
      handleCloseEditProfile();
      return true;
    }
    if (followState.open) {
      clearNativeHistoryBackAnimateFlag();
      handleCloseFollow();
      return true;
    }
    if (showSettings) {
      clearNativeHistoryBackAnimateFlag();
      handleCloseSettings();
      return true;
    }
    return false;
  }, 10), [
    followState.open,
    handleCloseEditProfile,
    handleCloseFollow,
    handleCloseLanguage,
    handleCloseSettings,
    showComingSoon,
    showDeleteConfirm,
    showEdit,
    showLanguage,
    showSettings,
  ]);

  return (
    <main className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-white text-slate-900">

      {/* ── 전역 모달 ── */}
      <ComingSoonModal
        open={showComingSoon}
        onClose={() => setShowComingSoon(false)}
        dictionary={dictionary}
      />
      <DeleteAccountModal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteAccount}
        loading={deleteLoading}
        dictionary={dictionary}
      />

      {/* ── 슬라이딩 패널 ── */}
      <SettingsPanel
        open={showSettings}
        onClose={handleCloseSettings}
        onLogout={handleSignOut}
        onDeleteAccount={() => { handleCloseSettings(); setShowDeleteConfirm(true); }}
        onLanguage={handleOpenLanguage}
        selectedLanguage={selectedLanguage}
        dictionary={dictionary}
        transitionMode={panelTransitionMode}
      />
      {/* 언어 설정 패널: 설정 위에 z-60으로 쌓임 */}
      <LanguagePanel
        open={showLanguage}
        onClose={handleCloseLanguage}
        currentLocale={selectedLocale}
        onSelect={handleLanguageSelect}
        dictionary={dictionary}
        transitionMode={panelTransitionMode}
      />
      <FollowPanel
        open={followState.open} defaultTab={followState.tab} username={username}
        onClose={handleCloseFollow}
        dictionary={dictionary}
        transitionMode={panelTransitionMode}
      />
      <EditProfilePanel
        key={`edit-profile:${editPanelVersion}`}
        open={showEdit}
        username={username}
        bio={bio}
        nationalityCode={selectedNationality?.code ?? null}
        profileImageUrl={user?.image}
        onClose={handleCloseEditProfile}
        onSave={async (d) => {
          // 로컸 상태 먼저 업데이트 (낙관적 UI)
          setCustomUsername(d.username);
          setBio(d.bio);
          setNationalityCode(d.nationalityCode);
          await fetch("/api/profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              displayName: d.username,
              bio: d.bio,
              nationality: d.nationalityCode,
            }),
          });
        }}
        dictionary={dictionary}
        transitionMode={panelTransitionMode}
      />

      {/* ── 상단 헤더 ── */}
      <header
        className="flex shrink-0 items-center px-4"
        style={{ paddingTop: "env(safe-area-inset-top, 44px)", height: "calc(52px + env(safe-area-inset-top, 44px))" }}
      >
        <button type="button" aria-label={dictionary.myPage.addPostButtonLabel} onClick={() => setShowComingSoon(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full transition active:bg-gray-100">
          <Plus size={24} strokeWidth={2} />
        </button>
        <span className="mx-auto text-[17px] font-bold">{username}</span>
        <button type="button" onClick={handleOpenSettings} aria-label={dictionary.profile.menuLabel}
          className="flex h-9 w-9 items-center justify-center rounded-full transition active:bg-gray-100">
          <Menu size={22} strokeWidth={2} />
        </button>
      </header>

      {/* ── 스크롤 본문 ── */}
      <div
        ref={scrollBodyRef}
        className="min-h-0 flex-1 overflow-y-auto"
        style={{ overscrollBehaviorY: "contain" }}
      >
        <section className="px-4 pb-3 pt-4">
          {/* 프로필 사진 + 통계 (인스타 레이아웃) */}
          <div className="flex items-center">
            <div className="translate-x-4">
              <ProfileAvatarBadge
                size={86}
                imageUrl={user?.image}
                altLabel={dictionary.navigation.profileImageAlt}
                flag={selectedNationality?.flag}
              />
            </div>
            <div className="ml-6 grid flex-1 grid-cols-3 gap-1">
              <button type="button" onClick={handleScrollToPosts}
                className="flex w-full min-w-0 flex-col items-center justify-center gap-0.5 px-2 py-1 text-center transition active:opacity-60">
                <span className="text-[18px] font-semibold leading-tight">{DUMMY_POSTS.length}</span>
                <span className="whitespace-nowrap text-[12px] text-gray-500">{dictionary.profile.postsLabel}</span>
              </button>
              <button type="button" onClick={() => handleOpenFollow("followers")}
                className="flex w-full min-w-0 flex-col items-center justify-center gap-0.5 px-2 py-1 text-center transition active:opacity-60">
                <span className="text-[18px] font-semibold leading-tight">0</span>
                <span className="whitespace-nowrap text-[12px] text-gray-500">{dictionary.profile.followersLabel}</span>
              </button>
              <button type="button" onClick={() => handleOpenFollow("following")}
                className="flex w-full min-w-0 flex-col items-center justify-center gap-0.5 px-2 py-1 text-center transition active:opacity-60">
                <span className="text-[18px] font-semibold leading-tight">0</span>
                <span className="whitespace-nowrap text-[12px] text-gray-500">{dictionary.profile.followingLabel}</span>
              </button>
            </div>
          </div>

          {/* bio (id 없이 바로 소개) */}
          {bio
            ? <p className="ml-4 mt-3 text-[14px] leading-snug text-slate-800">{bio}</p>
            : <p className="ml-4 mt-3 text-[14px] text-gray-400">{dictionary.myPage.addBioPrompt}</p>}

          {/* 프로필 편집 / 공유 버튼 */}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={handleOpenEditProfile}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-gray-100 py-[10px] text-[13px] font-semibold transition active:bg-gray-200">
              <Edit3 size={14} /> {dictionary.profile.editProfile}
            </button>
            <button type="button" onClick={() => setShowComingSoon(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-gray-100 py-[10px] text-[13px] font-semibold transition active:bg-gray-200">
              <Share2 size={14} /> {dictionary.profile.shareProfile}
            </button>
          </div>
        </section>
        <div className="mb-4" />

        {/* 게시물 그리드 (그리드 아이콘 탭바 없음) */}
        <div className="border-t border-gray-200" ref={postsRef}>
          {DUMMY_POSTS.length === 0 ? (
            <div className="flex flex-col items-center py-14 text-gray-400">
              <button
                type="button"
                onClick={() => setShowComingSoon(true)}
                className="mb-3 flex h-14 w-14 items-center justify-center rounded-full border-2 border-gray-300 transition active:bg-gray-50"
              >
                <Plus size={28} />
              </button>
              <p className="text-[15px] font-semibold text-slate-700">{dictionary.myPage.sharePostsTitle}</p>
              <p className="mt-1 text-[13px]">{dictionary.myPage.sharePostsDescription}</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-px">
              {DUMMY_POSTS.map((p) => <div key={p.id} className="aspect-[3/4]" style={{ background: p.color }} />)}
            </div>
          )}
        </div>
        <NativeBottomTabBannerSlot hidden={shouldHideBottomTabBannerSlot} />
      </div>

      <BottomTabBar locale={locale} dictionary={dictionary} />
    </main>
  );
}
