"use client";

import BottomTabBar, { buildNativeAwareTabPath } from "@/components/bottom-tab-bar";
import type { AppDictionary, AppLocale } from "@/i18n";
import { buildClientApiPath } from "@/lib/api-contract";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { ChevronLeft, FileText, Loader2, Menu, ShieldOff, UserRound, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type MyPageProps = {
  dictionary: AppDictionary;
  locale: AppLocale;
};

type ProfileRecord = {
  displayName: string | null;
  bio: string | null;
  nationality: string | null;
  followersCount: number;
  followingCount: number;
};

type ProfileDraft = {
  displayName: string;
  bio: string;
  nationality: AppLocale;
};

type BlockedUserRecord = {
  id: string;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    image: string | null;
    displayName: string | null;
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
    displayName: string | null;
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

const LANGUAGE_OPTIONS: ReadonlyArray<{ locale: AppLocale; label: string; flag: string }> = [
  { locale: "ko", label: "한국어", flag: "🇰🇷" },
  { locale: "ja", label: "日本語", flag: "🇯🇵" },
  { locale: "en", label: "English", flag: "🇺🇸" },
  { locale: "zh-CN", label: "简体中文", flag: "🇨🇳" },
  { locale: "zh-TW", label: "繁體中文", flag: "🇹🇼" },
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

function getNationalityOption(value: string | null | undefined) {
  const normalized = value === "zh" ? "zh-CN" : value;
  return LANGUAGE_OPTIONS.find((option) => option.locale === normalized) ?? null;
}

function getFallbackNationality(locale: AppLocale): AppLocale {
  return getNationalityOption(locale)?.locale ?? "ko";
}

function ProfileAvatar({
  alt,
  flag,
  imageUrl,
  size = 88,
}: {
  alt: string;
  flag?: string;
  imageUrl?: string | null;
  size?: number;
}) {
  const badgeSize = Math.max(24, Math.round(size * 0.32));

  return (
    <div className="relative shrink-0" style={{ height: size, width: size }}>
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
          />
        ) : (
          <UserRound size={Math.round(size * 0.58)} className="text-gray-400" aria-hidden="true" />
        )}
      </div>
      {flag ? (
        <span
          className="absolute bottom-[-2px] left-[-2px] flex items-center justify-center rounded-full border-2 border-white bg-white shadow-sm"
          style={{ height: badgeSize, width: badgeSize, fontSize: badgeSize * 0.62, lineHeight: 1 }}
          aria-hidden="true"
        >
          {flag}
        </span>
      ) : null}
    </div>
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
  open,
  sessionStatus,
}: {
  dictionary: AppDictionary;
  locale: AppLocale;
  onClose: () => void;
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
  const [viewportWidth, setViewportWidth] = useState(1);
  const copy = {
    title: dictionary.profile.menuSettingsTitle ?? (locale === "ko" ? "메뉴 및 설정" : "Menu and settings"),
    blocked: dictionary.profile.blockedUsersLabel ?? (locale === "ko" ? "차단한 사용자" : "Blocked users"),
    reports: dictionary.profile.reportsLabel ?? (locale === "ko" ? "신고 내역" : "Reports"),
    noBlocked: dictionary.profile.noBlockedUsers ?? (locale === "ko" ? "차단한 사용자가 없습니다." : "You have not blocked anyone."),
    noReports: dictionary.profile.noReports ?? (locale === "ko" ? "신고 내역이 없습니다." : "You have not submitted any reports."),
    unblock: dictionary.profile.unblockAction ?? (locale === "ko" ? "차단 해제" : "Unblock"),
    unblockError: dictionary.profile.unblockError ?? (locale === "ko" ? "차단을 해제하지 못했습니다." : "Could not unblock this user."),
    pending: dictionary.profile.reportPendingLabel ?? (locale === "ko" ? "운영진 확인 중" : "Under review"),
    close: locale === "ko" ? "닫기" : "Close",
    loading: locale === "ko" ? "불러오는 중..." : "Loading...",
    loadError: locale === "ko" ? "관리 내역을 불러오지 못했습니다." : "Could not load your activity.",
    authRequired: locale === "ko" ? "로그인 후 확인할 수 있습니다." : "Sign in to view this history.",
    reportedUser: locale === "ko" ? "신고한 사용자" : "Reported user",
    myMessage: locale === "ko" ? "신고 내용" : "Your report",
    teamReply: locale === "ko" ? "운영진 답변" : "Team reply",
    reasonLabels: {
      spam: dictionary.profile.reportReasonSpam ?? (locale === "ko" ? "스팸·도배" : "Spam"),
      harassment: dictionary.profile.reportReasonHarassment ?? (locale === "ko" ? "괴롭힘·불쾌한 행동" : "Harassment"),
      inappropriate: dictionary.profile.reportReasonInappropriate ?? (locale === "ko" ? "부적절한 콘텐츠" : "Inappropriate content"),
      impersonation: dictionary.profile.reportReasonImpersonation ?? (locale === "ko" ? "사칭" : "Impersonation"),
      other: dictionary.profile.reportReasonOther ?? (locale === "ko" ? "기타" : "Other"),
    } as Record<string, string>,
  };

  useEffect(() => {
    if (!open) return;
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

  const handleDragEnd = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x >= Math.max(72, viewportWidth * 0.2) || info.velocity.x >= 650) onClose();
  }, [onClose, viewportWidth]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.section
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          drag="x"
          dragConstraints={{ left: 0, right: viewportWidth }}
          dragElastic={0.08}
          dragMomentum={false}
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

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-6">
            {isLoading ? (
              <div className="flex justify-center pt-8 text-gray-400"><Loader2 size={24} className="animate-spin" aria-label={copy.loading} /></div>
            ) : (
              <div className="space-y-8">
                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <ShieldOff size={18} className="text-gray-500" aria-hidden="true" />
                    <h3 className="text-[15px] font-bold">{copy.blocked}</h3>
                  </div>
                  {requiresAuthentication || blocksLoadState === "unauthorized" ? (
                    <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-[13px] text-gray-500">{copy.authRequired}</p>
                  ) : blocksLoadState === "error" ? (
                    <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-[13px] text-gray-500" role="alert">{copy.loadError}</p>
                  ) : blocks.length === 0 ? (
                    <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-[13px] text-gray-500">{copy.noBlocked}</p>
                  ) : (
                    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                      {blocks.map((block) => {
                        const name = block.user.displayName?.trim() || block.user.name?.trim() || block.user.id;
                        return (
                          <li key={block.id} className="flex items-center gap-3 px-3 py-3">
                            <UserMiniAvatar image={block.user.image} label={name} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[14px] font-semibold">{name}</p>
                              <p className="truncate text-[12px] text-gray-500">{block.user.id}</p>
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
                  )}
                </section>

                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <FileText size={18} className="text-gray-500" aria-hidden="true" />
                    <h3 className="text-[15px] font-bold">{copy.reports}</h3>
                  </div>
                  {requiresAuthentication || reportsLoadState === "unauthorized" ? (
                    <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-[13px] text-gray-500">{copy.authRequired}</p>
                  ) : reportsLoadState === "error" ? (
                    <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-[13px] text-gray-500" role="alert">{copy.loadError}</p>
                  ) : reports.length === 0 ? (
                    <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-[13px] text-gray-500">{copy.noReports}</p>
                  ) : (
                    <div className="space-y-3">
                      {reports.map((report) => {
                        const name = report.reportedUser.displayName?.trim() || report.reportedUser.name?.trim() || report.reportedUser.id;
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
                </section>
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} className="absolute right-3 top-[calc(env(safe-area-inset-top,44px)+8px)] flex h-9 w-9 items-center justify-center rounded-full text-gray-400 active:bg-gray-100" aria-label={copy.close}>
            <X size={18} aria-hidden="true" />
          </button>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}

function ProfileEditPanel({
  dictionary,
  imageUrl,
  initialBio,
  initialDisplayName,
  initialNationality,
  onClose,
  onSave,
  open,
}: {
  dictionary: AppDictionary;
  imageUrl?: string | null;
  initialBio: string;
  initialDisplayName: string;
  initialNationality: AppLocale;
  onClose: () => void;
  onSave: (draft: ProfileDraft) => Promise<boolean>;
  open: boolean;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [bio, setBio] = useState(initialBio);
  const [nationality, setNationality] = useState<AppLocale>(initialNationality);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const copy = {
    title: dictionary.profile.editProfileTitle ?? dictionary.profile.editProfile,
    nameLabel: dictionary.profile.profileNameLabel ?? "Name",
    namePlaceholder: dictionary.profile.profileNamePlaceholder ?? "Enter your name",
    bioLabel: dictionary.profile.bioLabel ?? "Bio",
    bioPlaceholder: dictionary.profile.bioPlaceholder ?? "Tell us about yourself",
    nationalityLabel: dictionary.profile.nationalityLabel ?? "Country",
    saveAction: dictionary.profile.saveAction ?? "Save",
    cancelAction: dictionary.profile.cancelAction ?? "Cancel",
    saveError: dictionary.profile.profileSaveError ?? "Could not save your profile.",
  };

  useEffect(() => {
    if (!open) return;
    setDisplayName(initialDisplayName);
    setBio(initialBio);
    setNationality(initialNationality);
    setSaveError(null);
  }, [initialBio, initialDisplayName, initialNationality, open]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      const saved = await onSave({
        displayName: displayName.trim(),
        bio: bio.trim(),
        nationality,
      });
      if (saved) {
        onClose();
      } else {
        setSaveError(copy.saveError);
      }
    } catch {
      setSaveError(copy.saveError);
    } finally {
      setIsSaving(false);
    }
  }, [bio, copy.saveError, displayName, isSaving, nationality, onClose, onSave]);

  const handleDragEnd = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (isSaving) return;
    if (info.offset.x >= 92 || info.velocity.x >= 650) {
      onClose();
    }
  }, [isSaving, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.section
          key="profile-edit-panel"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          drag="x"
          dragConstraints={{ left: 0, right: 480 }}
          dragElastic={0.08}
          dragMomentum={false}
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
              disabled={isSaving}
              className="min-w-[52px] text-[15px] font-semibold text-blue-600 transition active:opacity-60 disabled:opacity-50"
            >
              {isSaving ? "…" : copy.saveAction}
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-6">
            <div className="flex justify-center pb-7">
              <ProfileAvatar
                alt={copy.title}
                imageUrl={imageUrl}
                flag={getNationalityOption(nationality)?.flag}
                size={84}
              />
            </div>

            <div className="space-y-5">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-gray-600">{copy.nameLabel}</span>
                <input
                  type="text"
                  value={displayName}
                  maxLength={40}
                  onChange={(event) => setDisplayName(event.target.value)}
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
                  placeholder={copy.bioPlaceholder}
                  className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[15px] leading-relaxed outline-none transition focus:border-gray-400 focus:bg-white"
                />
                <span className="mt-1 block text-right text-[12px] text-gray-400">{bio.length}/160</span>
              </label>

              <fieldset>
                <legend className="mb-2 text-[13px] font-semibold text-gray-600">{copy.nationalityLabel}</legend>
                <div className="grid grid-cols-3 gap-2">
                  {LANGUAGE_OPTIONS.map((option) => {
                    const selected = nationality === option.locale;
                    return (
                      <button
                        key={option.locale}
                        type="button"
                        onClick={() => setNationality(option.locale)}
                        className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px] transition active:bg-gray-100"
                        style={{
                          borderColor: selected ? "#f59e0b" : "#e5e7eb",
                          backgroundColor: selected ? "#fffbeb" : "#f9fafb",
                        }}
                        aria-pressed={selected}
                      >
                        <span className="text-lg" aria-hidden="true">{option.flag}</span>
                        <span className="min-w-0 truncate text-gray-700">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
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

export default function MyPage({ dictionary, locale }: MyPageProps) {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<ProfileRecord>({
    displayName: null,
    bio: null,
    nationality: null,
    followersCount: 0,
    followingCount: 0,
  });
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);

  const sessionUserId = session?.user?.id ?? "";
  const fallbackName = session?.user?.name?.trim() || dictionary.titles.my;
  const displayName = profile.displayName?.trim() || fallbackName;
  const bio = profile.bio?.trim() || dictionary.profile.bio;
  const nationality = getNationalityOption(profile.nationality)?.locale
    ?? getFallbackNationality(locale);
  const nationalityFlag = getNationalityOption(nationality)?.flag;
  const profileShareHref = buildNativeAwareTabPath(`/${locale}/mypage/share`, searchParams);
  const comingSoonLabel = dictionary.profile.comingSoonLabel
    ?? (locale === "ko" ? "기능 준비중입니다." : "Coming soon.");

  useEffect(() => {
    if (!sessionUserId) return;

    let cancelled = false;
    void fetch("/api/profile", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() as Promise<Partial<ProfileRecord>> : null))
      .then((data) => {
        if (cancelled || !data) return;
        setProfile({
          displayName: typeof data.displayName === "string" ? data.displayName : null,
          bio: typeof data.bio === "string" ? data.bio : null,
          nationality: typeof data.nationality === "string" ? data.nationality : null,
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

  const handleSaveProfile = useCallback(async (draft: ProfileDraft): Promise<boolean> => {
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) return false;

      const saved = await response.json() as Partial<ProfileRecord>;
      setProfile({
        displayName: typeof saved.displayName === "string" ? saved.displayName : null,
        bio: typeof saved.bio === "string" ? saved.bio : null,
        nationality: typeof saved.nationality === "string" ? saved.nationality : null,
        followersCount: typeof saved.followersCount === "number" ? saved.followersCount : 0,
        followingCount: typeof saved.followingCount === "number" ? saved.followingCount : 0,
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  return (
    <main className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-white text-slate-900">
      <ProfileEditPanel
        dictionary={dictionary}
        imageUrl={session?.user?.image}
        initialBio={profile.bio ?? ""}
        initialDisplayName={displayName}
        initialNationality={nationality}
        onClose={() => setShowProfileEdit(false)}
        onSave={handleSaveProfile}
        open={showProfileEdit}
      />
      <ProfileSettingsPanel
        dictionary={dictionary}
        locale={locale}
        onClose={() => setShowProfileSettings(false)}
        open={showProfileSettings}
        sessionStatus={sessionStatus}
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
          {displayName}
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
          <div className="flex items-center gap-6">
            <ProfileAvatar
              alt={dictionary.profile.shareProfile}
              flag={nationalityFlag}
              imageUrl={session?.user?.image}
            />
            <div className="grid flex-1 grid-cols-3 gap-1 text-center">
              <div>
                <p className="text-[18px] font-semibold leading-tight">0</p>
                <p className="mt-0.5 text-[12px] text-gray-500">{dictionary.profile.postsLabel}</p>
              </div>
              <div>
                <p className="text-[18px] font-semibold leading-tight">{profile.followersCount}</p>
                <p className="mt-0.5 text-[12px] text-gray-500">{dictionary.profile.followersLabel}</p>
              </div>
              <div>
                <p className="text-[18px] font-semibold leading-tight">{profile.followingCount}</p>
                <p className="mt-0.5 text-[12px] text-gray-500">{dictionary.profile.followingLabel}</p>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-[15px] font-semibold text-slate-950">{displayName}</p>
            <p className="mt-1 text-[14px] leading-snug text-slate-700">{bio}</p>
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

        <section className="flex min-h-[220px] items-center justify-center border-t border-gray-200 px-6 text-center">
          <p className="text-[15px] font-semibold text-gray-500">{comingSoonLabel}</p>
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
