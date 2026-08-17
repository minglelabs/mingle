"use client";

import ProfileLanguageFlagStack from "@/components/profile-language-flag-stack";
import { buildClientApiPath } from "@/lib/api-contract";
import { formatHandle } from "@/lib/handles";
import { buildProfileImageTransform } from "@/lib/profile-image-crop";
import {
  sanitizeSttLanguageSelection,
} from "@/lib/stt-languages";
import { ChevronLeft, Loader2, RotateCcw, UserRound } from "lucide-react";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";

type ConversationParticipantsPanelProps = {
  active: boolean;
  uiLocale: string;
  pageTitle: string;
  backLabel: string;
  selfLabel: string;
  loadingLabel: string;
  errorLabel: string;
  retryLabel: string;
  onOpenProfile?: (userId: string) => void;
  onBack: () => void;
};

type ParticipantProfile = {
  id: string;
  name: string | null;
  image: string | null;
  imageCropScale: number | null;
  imageCropX: number | null;
  imageCropY: number | null;
  handle: string | null;
  nationality: string | null;
  primaryLanguages: string[];
};

type ProfileLoadState = "idle" | "loading" | "ready" | "error";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseParticipantProfile(value: unknown): ParticipantProfile | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id.trim()) return null;

  const nationality = nullableString(value.nationality);
  const primaryLanguages = sanitizeSttLanguageSelection(
    Array.isArray(value.primaryLanguages) ? value.primaryLanguages : [],
    nationality ? [nationality] : [],
  );

  return {
    id: value.id.trim(),
    name: nullableString(value.name),
    image: nullableString(value.image),
    imageCropScale: finiteNumberOrNull(value.imageCropScale),
    imageCropX: finiteNumberOrNull(value.imageCropX),
    imageCropY: finiteNumberOrNull(value.imageCropY),
    handle: nullableString(value.handle),
    nationality: primaryLanguages[0] ?? nationality,
    primaryLanguages,
  };
}

function buildSessionFallbackProfile(
  sessionUser: { id?: unknown; name?: unknown; image?: unknown } | null | undefined,
): ParticipantProfile | null {
  if (typeof sessionUser?.id !== "string" || !sessionUser.id.trim()) return null;

  return {
    id: sessionUser.id.trim(),
    name: nullableString(sessionUser.name),
    image: nullableString(sessionUser.image),
    imageCropScale: null,
    imageCropX: null,
    imageCropY: null,
    handle: null,
    nationality: null,
    primaryLanguages: [],
  };
}

export default function ConversationParticipantsPanel({
  active,
  uiLocale,
  pageTitle,
  backLabel,
  selfLabel,
  loadingLabel,
  errorLabel,
  retryLabel,
  onOpenProfile,
  onBack,
}: ConversationParticipantsPanelProps) {
  const { data: session } = useSession();
  const fallbackProfile = useMemo(
    () => buildSessionFallbackProfile(session?.user),
    [session?.user],
  );
  const [profile, setProfile] = useState<ParticipantProfile | null>(fallbackProfile);
  const [loadState, setLoadState] = useState<ProfileLoadState>("idle");

  const loadProfile = useCallback(async () => {
    setLoadState("loading");
    try {
      const response = await fetch(buildClientApiPath("/profile"), { cache: "no-store" });
      if (!response.ok) throw new Error("participant_profile_load_failed");
      const nextProfile = parseParticipantProfile(await response.json());
      if (!nextProfile) throw new Error("participant_profile_invalid");
      setProfile(nextProfile);
      setLoadState("ready");
    } catch {
      setProfile(fallbackProfile);
      setLoadState(fallbackProfile ? "ready" : "error");
    }
  }, [fallbackProfile]);

  useEffect(() => {
    if (!active) return;
    void loadProfile();
  }, [active, loadProfile]);

  const displayName = profile?.name?.trim() || (uiLocale.trim().toLowerCase().startsWith("ko") ? "밍글 사용자" : "Mingle user");
  const displayLanguages = sanitizeSttLanguageSelection(
    profile?.primaryLanguages,
    profile?.nationality ? [profile.nationality] : [],
  );
  const displayHandle = formatHandle(profile?.handle);

  return (
    <section className="flex h-full min-h-0 flex-col bg-white">
      <header
        className="flex shrink-0 items-center border-b border-gray-200 px-4"
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          height: "calc(55px + env(safe-area-inset-top, 0px))",
        }}
      >
        <button
          type="button"
          aria-label={backLabel}
          onClick={onBack}
          className="inline-flex h-[38px] w-10 items-center justify-center text-gray-700 transition hover:text-gray-900 active:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <ChevronLeft size={22} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <div className="flex-1 text-center text-[1rem] font-semibold text-gray-950">{pageTitle}</div>
        <div className="w-10" aria-hidden="true" />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {loadState === "loading" && !profile ? (
          <div className="flex items-center justify-center gap-2 py-12 text-[0.94rem] text-gray-500" role="status">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            <span>{loadingLabel}</span>
          </div>
        ) : null}

        {profile ? (
          <button
            type="button"
            onClick={() => onOpenProfile?.(profile.id)}
            disabled={!onOpenProfile}
            className="w-full rounded-2xl border border-gray-200 bg-white px-3.5 py-3.5 text-left shadow-[0_8px_20px_rgba(15,23,42,0.04)] transition hover:border-gray-300 hover:bg-gray-50 active:bg-gray-50 disabled:cursor-default disabled:hover:border-gray-200 disabled:hover:bg-white"
          >
            <div className="flex items-center gap-3">
              <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-visible rounded-full bg-gray-100">
                <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-100">
                  {profile.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.image}
                      alt={displayName}
                      width={56}
                      height={56}
                      className="h-full w-full object-cover"
                      style={{
                        transform: buildProfileImageTransform(56, {
                          scale: profile.imageCropScale,
                          x: profile.imageCropX,
                          y: profile.imageCropY,
                        }),
                      }}
                    />
                  ) : (
                    <UserRound size={28} className="text-gray-400" aria-hidden="true" />
                  )}
                </div>
                <ProfileLanguageFlagStack languages={displayLanguages} size={56} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[0.98rem] font-semibold text-gray-950">{displayName}</p>
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[0.72rem] font-semibold text-amber-700">
                    {selfLabel}
                  </span>
                </div>
                {displayHandle ? <p className="mt-0.5 truncate text-[0.82rem] text-gray-500">{displayHandle}</p> : null}
              </div>
            </div>
          </button>
        ) : null}

        {loadState === "error" ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-[0.94rem] text-gray-500">{errorLabel}</p>
            <button
              type="button"
              onClick={() => void loadProfile()}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3.5 py-2 text-[0.86rem] font-semibold text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
            >
              <RotateCcw size={14} aria-hidden="true" />
              <span>{retryLabel}</span>
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
