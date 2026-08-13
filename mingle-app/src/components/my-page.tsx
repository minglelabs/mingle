"use client";

import BottomTabBar, { buildNativeAwareTabPath } from "@/components/bottom-tab-bar";
import type { AppDictionary, AppLocale } from "@/i18n";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { ChevronLeft, Menu, UserRound } from "lucide-react";
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
};

type ProfileDraft = {
  displayName: string;
  bio: string;
  nationality: AppLocale;
};

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
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<ProfileRecord>({
    displayName: null,
    bio: null,
    nationality: null,
  });
  const [showProfileEdit, setShowProfileEdit] = useState(false);

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
          disabled
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
            <p className="mt-1 text-[14px] leading-snug text-slate-700">{bio}</p>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setShowProfileEdit(true)}
              className="flex h-10 min-w-0 flex-1 items-center justify-center rounded-lg border border-gray-200 bg-gray-100 px-2 text-[13px] font-semibold text-slate-900 transition active:bg-gray-200"
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
