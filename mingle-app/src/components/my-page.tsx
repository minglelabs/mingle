"use client";

import BottomTabBar from "@/components/bottom-tab-bar";
import type { AppLocale, AppDictionary } from "@/i18n";
import { SUPPORTED_LOCALES } from "@/i18n";
import { normalizeAppLocale } from "@/lib/app-locale";
import { clearNativeHistoryBackAnimateFlag, registerNativeBackHandler } from "@/lib/native-back-handler";
import { ChevronLeft, ChevronRight, Loader2, LogOut, Menu, Plus, Trash2, UserRound } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type MyPageProps = {
  dictionary: AppDictionary;
  locale: AppLocale;
};

type ProfileResponse = {
  appLocale: AppLocale | null;
  displayName: string | null;
  image: string | null;
};

type PanelProps = {
  children: React.ReactNode;
  open: boolean;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildLocalizedPath(pathname: string, currentLocale: AppLocale, nextLocale: AppLocale): string {
  const localePrefix = new RegExp(`^/${escapeRegExp(currentLocale)}(?=/|$)`);
  if (localePrefix.test(pathname)) {
    return pathname.replace(localePrefix, `/${nextLocale}`);
  }
  return `/${nextLocale}/mypage`;
}

function readProfileResponse(value: unknown): ProfileResponse | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;

  return {
    appLocale: normalizeAppLocale(typeof record.appLocale === "string" ? record.appLocale : null),
    displayName: typeof record.displayName === "string" ? record.displayName : null,
    image: typeof record.image === "string" ? record.image : null,
  };
}

function useLocaleLabels(locale: AppLocale): Record<AppLocale, string> {
  return useMemo(() => {
    const displayNames = typeof Intl !== "undefined" && "DisplayNames" in Intl
      ? new Intl.DisplayNames([locale], { type: "language" })
      : null;

    return Object.fromEntries(SUPPORTED_LOCALES.map((supportedLocale) => [
      supportedLocale,
      displayNames?.of(supportedLocale) ?? supportedLocale,
    ])) as Record<AppLocale, string>;
  }, [locale]);
}

function Panel({ children, open }: PanelProps) {
  return (
    <div
      className="absolute inset-0 z-50 flex min-h-0 flex-col bg-white transition-transform duration-300 ease-out"
      style={{
        pointerEvents: open ? "auto" : "none",
        transform: open ? "translateX(0)" : "translateX(100%)",
      }}
      aria-hidden={!open}
    >
      {children}
    </div>
  );
}

function PanelHeader({
  backLabel,
  onBack,
  onDone,
  title,
  doneLabel,
}: {
  backLabel: string;
  doneLabel?: string;
  onBack: () => void;
  onDone?: () => void;
  title: string;
}) {
  return (
    <header
      className="flex shrink-0 items-center border-b border-gray-100 px-3"
      style={{
        height: "calc(54px + env(safe-area-inset-top, 44px))",
        paddingTop: "env(safe-area-inset-top, 44px)",
      }}
    >
      <button
        type="button"
        onClick={onBack}
        className="flex h-10 w-10 items-center justify-center rounded-full transition active:bg-gray-100"
        aria-label={backLabel}
      >
        <ChevronLeft size={24} strokeWidth={2.2} />
      </button>
      <h2 className="min-w-0 flex-1 text-center text-[16px] font-semibold text-slate-950">
        {title}
      </h2>
      {onDone && doneLabel ? (
        <button
          type="button"
          onClick={onDone}
          className="h-10 min-w-10 rounded-full px-2 text-[15px] font-semibold text-amber-600 transition active:bg-amber-50"
        >
          {doneLabel}
        </button>
      ) : (
        <span className="h-10 w-10" aria-hidden="true" />
      )}
    </header>
  );
}

function ProfileAvatar({
  alt,
  imageUrl,
  size = 88,
}: {
  alt: string;
  imageUrl?: string | null;
  size?: number;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-100"
      style={{ height: size, width: size }}
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
  );
}

export default function MyPage({ dictionary, locale }: MyPageProps) {
  const { data: session } = useSession();
  const user = session?.user;
  const pathname = usePathname() || `/${locale}/mypage`;
  const router = useRouter();
  const searchParams = useSearchParams();
  const localeLabels = useLocaleLabels(locale);

  const [displayName, setDisplayName] = useState(user?.name ?? dictionary.myPage.anonymousUser);
  const [draftDisplayName, setDraftDisplayName] = useState(displayName);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(user?.image ?? null);
  const [selectedLocale, setSelectedLocale] = useState<AppLocale>(locale);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const closeTopPanel = useCallback(() => {
    if (deleteConfirmOpen) {
      setDeleteConfirmOpen(false);
      return true;
    }
    if (comingSoonOpen) {
      setComingSoonOpen(false);
      return true;
    }
    if (languageOpen) {
      setLanguageOpen(false);
      return true;
    }
    if (editOpen) {
      setEditOpen(false);
      return true;
    }
    if (settingsOpen) {
      setSettingsOpen(false);
      return true;
    }
    return false;
  }, [comingSoonOpen, deleteConfirmOpen, editOpen, languageOpen, settingsOpen]);

  useEffect(() => registerNativeBackHandler(() => {
    const handled = closeTopPanel();
    if (handled) {
      clearNativeHistoryBackAnimateFlag();
    }
    return handled;
  }, 10), [closeTopPanel]);

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/profile")
      .then((response) => response.ok ? response.json() : null)
      .then((body) => {
        if (cancelled) return;
        const profile = readProfileResponse(body);
        if (!profile) return;
        if (profile.displayName) {
          setDisplayName(profile.displayName);
          setDraftDisplayName(profile.displayName);
        }
        setProfileImageUrl(profile.image);
        if (profile.appLocale) {
          setSelectedLocale(profile.appLocale);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const openEditProfile = useCallback(() => {
    setDraftDisplayName(displayName);
    setEditOpen(true);
  }, [displayName]);

  const saveDisplayName = useCallback(async () => {
    if (savingProfile) return;
    const normalizedName = draftDisplayName.trim().replace(/\s+/g, " ");
    setSavingProfile(true);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: normalizedName }),
      });

      if (!response.ok) {
        throw new Error("profile_save_failed");
      }

      const profile = readProfileResponse(await response.json());
      setDisplayName(profile?.displayName || normalizedName || dictionary.myPage.anonymousUser);
      setEditOpen(false);
      toast.success(dictionary.myPage.savedToast);
    } catch {
      toast.error(dictionary.myPage.saveFailedToast);
    } finally {
      setSavingProfile(false);
    }
  }, [
    dictionary.myPage.anonymousUser,
    dictionary.myPage.saveFailedToast,
    dictionary.myPage.savedToast,
    draftDisplayName,
    savingProfile,
  ]);

  const selectLocale = useCallback(async (nextLocale: AppLocale) => {
    setSelectedLocale(nextLocale);
    setLanguageOpen(false);

    void fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appLocale: nextLocale }),
    }).catch(() => {});

    if (nextLocale !== locale) {
      const nextPath = buildLocalizedPath(pathname, locale, nextLocale);
      const nextSearch = searchParams.toString();
      router.push(nextSearch ? `${nextPath}?${nextSearch}` : nextPath);
    }
  }, [locale, pathname, router, searchParams]);

  const handleSignOut = useCallback(async () => {
    await signOut({ callbackUrl: `/${locale}/conversations` });
  }, [locale]);

  const handleDeleteAccount = useCallback(async () => {
    if (deletingAccount) return;
    setDeletingAccount(true);

    try {
      const response = await fetch("/api/account/delete", { method: "DELETE" });
      if (!response.ok) {
        throw new Error("account_delete_failed");
      }
      await signOut({ callbackUrl: `/${locale}/conversations` });
    } catch {
      toast.error(dictionary.profile.deleteAccountFailed);
    } finally {
      setDeletingAccount(false);
      setDeleteConfirmOpen(false);
    }
  }, [deletingAccount, dictionary.profile.deleteAccountFailed, locale]);

  return (
    <main className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-white text-slate-900">
      <header
        className="flex shrink-0 items-center px-4"
        style={{
          height: "calc(54px + env(safe-area-inset-top, 44px))",
          paddingTop: "env(safe-area-inset-top, 44px)",
        }}
      >
        <button
          type="button"
          onClick={() => setComingSoonOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full transition active:bg-gray-100"
          aria-label={dictionary.myPage.addPostButtonLabel}
        >
          <Plus size={24} strokeWidth={2.1} />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-center text-[17px] font-bold text-slate-950">
          {displayName}
        </h1>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full transition active:bg-gray-100"
          aria-label={dictionary.profile.menuLabel}
        >
          <Menu size={23} strokeWidth={2.2} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="px-4 pb-4 pt-5">
          <div className="flex items-center gap-6">
            <ProfileAvatar
              alt={dictionary.myPage.profileImageAlt}
              imageUrl={profileImageUrl}
            />
            <div className="grid flex-1 grid-cols-3 gap-1 text-center">
              <div>
                <p className="text-[18px] font-semibold leading-tight">0</p>
                <p className="mt-0.5 text-[12px] text-gray-500">{dictionary.profile.postsLabel}</p>
              </div>
              <div>
                <p className="text-[18px] font-semibold leading-tight">0</p>
                <p className="mt-0.5 text-[12px] text-gray-500">{dictionary.profile.followersLabel}</p>
              </div>
              <div>
                <p className="text-[18px] font-semibold leading-tight">0</p>
                <p className="mt-0.5 text-[12px] text-gray-500">{dictionary.profile.followingLabel}</p>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-[15px] font-semibold text-slate-950">{displayName}</p>
            <p className="mt-1 text-[14px] leading-snug text-slate-700">{dictionary.profile.bio}</p>
          </div>

          <button
            type="button"
            onClick={openEditProfile}
            className="mt-4 flex h-10 w-full items-center justify-center rounded-lg border border-gray-200 bg-gray-100 text-[13px] font-semibold text-slate-900 transition active:bg-gray-200"
          >
            {dictionary.profile.editProfile}
          </button>
        </section>

        <section className="border-t border-gray-200">
          <div className="flex flex-col items-center px-6 py-14 text-center text-gray-400">
            <button
              type="button"
              onClick={() => setComingSoonOpen(true)}
              className="mb-3 flex h-14 w-14 items-center justify-center rounded-full border-2 border-gray-300 transition active:bg-gray-50"
              aria-label={dictionary.myPage.addPostButtonLabel}
            >
              <Plus size={28} />
            </button>
            <p className="text-[15px] font-semibold text-slate-700">{dictionary.myPage.sharePostsTitle}</p>
            <p className="mt-1 text-[13px]">{dictionary.myPage.sharePostsDescription}</p>
          </div>
        </section>
      </div>

      <BottomTabBar
        activeRoute="mypage"
        dictionary={dictionary}
        locale={locale}
      />

      <Panel open={settingsOpen}>
        <PanelHeader
          backLabel={dictionary.myPage.backButtonLabel}
          onBack={() => setSettingsOpen(false)}
          title={dictionary.profile.menuLabel}
        />
        <div className="flex-1 overflow-y-auto">
          <button
            type="button"
            onClick={() => setLanguageOpen(true)}
            className="flex w-full items-center gap-3 px-5 py-4 text-left transition active:bg-gray-100"
          >
            <span className="flex-1 text-[15px] font-medium text-slate-800">
              {dictionary.myPage.languageSettings}
            </span>
            <span className="text-[13px] text-gray-500">{localeLabels[selectedLocale]}</span>
            <ChevronRight size={18} className="text-gray-400" />
          </button>
          <div className="mx-5 h-px bg-gray-100" />
          <button
            type="button"
            onClick={() => router.push(`/${locale}/account`)}
            className="flex w-full items-center gap-3 px-5 py-4 text-left transition active:bg-gray-100"
          >
            <span className="flex-1 text-[15px] font-medium text-slate-800">
              {dictionary.myPage.accountSettings}
            </span>
            <ChevronRight size={18} className="text-gray-400" />
          </button>
          <div className="mx-5 h-px bg-gray-100" />
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 px-5 py-4 text-left transition active:bg-gray-100"
          >
            <LogOut size={20} className="text-gray-500" />
            <span className="flex-1 text-[15px] font-medium text-slate-800">
              {dictionary.profile.logout}
            </span>
          </button>
          <div className="mx-5 h-px bg-gray-100" />
          <button
            type="button"
            onClick={() => {
              setSettingsOpen(false);
              setDeleteConfirmOpen(true);
            }}
            className="flex w-full items-center gap-3 px-5 py-4 text-left transition active:bg-red-50"
          >
            <Trash2 size={20} className="text-red-500" />
            <span className="flex-1 text-[15px] font-medium text-red-500">
              {dictionary.profile.deleteAccount}
            </span>
          </button>
        </div>
      </Panel>

      <Panel open={languageOpen}>
        <PanelHeader
          backLabel={dictionary.myPage.backButtonLabel}
          onBack={() => setLanguageOpen(false)}
          title={dictionary.myPage.languageSettings}
        />
        <div className="flex-1 overflow-y-auto">
          {SUPPORTED_LOCALES.map((supportedLocale) => (
            <button
              key={supportedLocale}
              type="button"
              onClick={() => selectLocale(supportedLocale)}
              className="flex w-full items-center gap-3 px-5 py-4 text-left transition active:bg-gray-100"
            >
              <span className="flex-1 text-[15px] font-medium text-slate-800">
                {localeLabels[supportedLocale]}
              </span>
              <span className="text-[12px] text-gray-400">{supportedLocale}</span>
              {selectedLocale === supportedLocale ? (
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden="true" />
              ) : null}
            </button>
          ))}
        </div>
      </Panel>

      <Panel open={editOpen}>
        <PanelHeader
          backLabel={dictionary.myPage.cancelAction}
          doneLabel={savingProfile ? undefined : dictionary.myPage.doneAction}
          onBack={() => setEditOpen(false)}
          onDone={savingProfile ? undefined : saveDisplayName}
          title={dictionary.myPage.editProfileTitle}
        />
        <div className="flex-1 overflow-y-auto px-5 py-6">
          <div className="flex justify-center">
            <ProfileAvatar
              alt={dictionary.myPage.profileImageAlt}
              imageUrl={profileImageUrl}
              size={84}
            />
          </div>
          <label className="mt-6 block text-[12px] font-semibold text-gray-500">
            {dictionary.myPage.usernameLabel}
          </label>
          <input
            type="text"
            value={draftDisplayName}
            onChange={(event) => setDraftDisplayName(event.target.value)}
            placeholder={dictionary.myPage.usernamePlaceholder}
            className="mt-2 h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-[15px] outline-none transition focus:border-amber-400"
          />
          {savingProfile ? (
            <div className="mt-4 flex items-center gap-2 text-[13px] text-gray-500">
              <Loader2 size={16} className="animate-spin" />
              <span>{dictionary.myPage.doneAction}</span>
            </div>
          ) : null}
        </div>
      </Panel>

      {comingSoonOpen ? (
        <div
          className="absolute inset-0 z-[70] flex items-center justify-center bg-black/45 px-8"
          onClick={() => setComingSoonOpen(false)}
        >
          <div
            className="w-full max-w-[280px] rounded-2xl bg-white p-6 text-center shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[16px] font-semibold text-slate-900">{dictionary.myPage.comingSoonTitle}</p>
            <p className="mt-1 text-[13px] text-gray-500">{dictionary.myPage.comingSoonDescription}</p>
            <button
              type="button"
              onClick={() => setComingSoonOpen(false)}
              className="mt-5 h-11 w-full rounded-xl bg-slate-900 text-[15px] font-semibold text-white transition active:bg-slate-700"
            >
              {dictionary.myPage.confirmAction}
            </button>
          </div>
        </div>
      ) : null}

      {deleteConfirmOpen ? (
        <div
          className="absolute inset-0 z-[70] flex items-center justify-center bg-black/45 px-8"
          onClick={() => setDeleteConfirmOpen(false)}
        >
          <div
            className="w-full max-w-[280px] rounded-2xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[16px] font-semibold text-slate-900">{dictionary.profile.deleteAccount}</p>
            <p className="mt-1 text-[13px] text-gray-500">{dictionary.profile.deleteAccountConfirm}</p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="h-11 flex-1 rounded-xl border border-gray-200 bg-gray-100 text-[15px] font-semibold text-slate-700 transition active:bg-gray-200"
              >
                {dictionary.profile.deleteAccountCancel}
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deletingAccount}
                className="flex h-11 flex-1 items-center justify-center rounded-xl bg-red-500 text-[15px] font-semibold text-white transition active:bg-red-600 disabled:opacity-60"
              >
                {deletingAccount ? <Loader2 size={18} className="animate-spin" /> : dictionary.profile.deleteAccountConfirmAction}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
