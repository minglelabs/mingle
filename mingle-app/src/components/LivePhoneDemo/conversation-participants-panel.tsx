"use client";

import ProfileLanguageFlagStack from "@/components/profile-language-flag-stack";
import { buildClientApiPath } from "@/lib/api-contract";
import { formatHandle } from "@/lib/handles";
import { buildProfileImageTransform } from "@/lib/profile-image-crop";
import {
  sanitizeSttLanguageSelection,
} from "@/lib/stt-languages";
import { ChevronLeft, Loader2, RotateCcw, UserPlus, UserRound } from "lucide-react";
import { useSession } from "next-auth/react";
import { DEFAULT_LOCALE, resolveSupportedLocaleTag } from "@/i18n/config";
import { getPrimaryUiCopy } from "@/i18n/primary-ui-copy";
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
  // Solo (0-1 member) rooms have no membership list worth fetching — the
  // panel just shows the signed-in user, same as before this prop existed.
  conversationId?: string | null;
  // Label + handler for the header's invite button. Omitting onInvite hides
  // the button entirely (e.g. when there's no conversationId to invite into).
  inviteButtonLabel?: string;
  onInvite?: () => void;
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
  blocked: boolean;
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
    blocked: false,
  };
}

function parseConversationMemberProfile(value: unknown): ParticipantProfile | null {
  if (!isRecord(value) || typeof value.userId !== "string" || !value.userId.trim()) return null;

  return {
    id: value.userId.trim(),
    name: nullableString(value.name),
    image: nullableString(value.image),
    imageCropScale: finiteNumberOrNull(value.imageCropScale),
    imageCropX: finiteNumberOrNull(value.imageCropX),
    imageCropY: finiteNumberOrNull(value.imageCropY),
    handle: nullableString(value.handle),
    // The members endpoint doesn't return another member's STT language
    // selection (that's account-private data this room's membership row
    // doesn't carry) — other members' rows render without language flags.
    nationality: null,
    primaryLanguages: [],
    blocked: value.blocked === true,
  };
}

function parseConversationMemberList(value: unknown): ParticipantProfile[] {
  if (!isRecord(value) || !Array.isArray(value.members)) return [];
  return value.members
    .map(parseConversationMemberProfile)
    .filter((member): member is ParticipantProfile => member !== null);
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
    blocked: false,
  };
}

function ParticipantRow({
  member,
  fallbackName,
  badgeLabel,
  onOpenProfile,
}: {
  member: ParticipantProfile;
  fallbackName: string;
  badgeLabel?: string;
  onOpenProfile?: (userId: string) => void;
}) {
  // Blocking hides the photo and stops profile taps, but the name/handle
  // stay real — the point is hiding what's new (their current photo,
  // reachability), not making someone you already know unrecognizable.
  const displayName = member.name?.trim() || fallbackName;
  const displayLanguages = sanitizeSttLanguageSelection(
    member.primaryLanguages,
    member.nationality ? [member.nationality] : [],
  );
  const displayHandle = formatHandle(member.handle);
  const resolvedOnOpenProfile = member.blocked ? undefined : onOpenProfile;

  return (
    <button
      type="button"
      onClick={() => resolvedOnOpenProfile?.(member.id)}
      disabled={!resolvedOnOpenProfile}
      className="w-full rounded-2xl border border-gray-200 bg-white px-3.5 py-3.5 text-left shadow-[0_8px_20px_rgba(15,23,42,0.04)] transition hover:border-gray-300 hover:bg-gray-50 active:bg-gray-50 disabled:cursor-default disabled:hover:border-gray-200 disabled:hover:bg-white"
    >
      <div className="flex items-center gap-3">
        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-visible rounded-full bg-gray-100">
          <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-100">
            {member.image && !member.blocked ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={member.image}
                alt={displayName}
                width={56}
                height={56}
                className="h-full w-full object-cover"
                style={{
                  transform: buildProfileImageTransform(56, {
                    scale: member.imageCropScale,
                    x: member.imageCropX,
                    y: member.imageCropY,
                  }),
                }}
              />
            ) : (
              <UserRound size={28} className="text-gray-400" aria-hidden="true" />
            )}
          </div>
          {displayLanguages.length > 0 ? (
            <ProfileLanguageFlagStack languages={displayLanguages} size={56} />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[0.98rem] font-semibold text-gray-950">{displayName}</p>
            {badgeLabel ? (
              <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[0.72rem] font-semibold text-amber-700">
                {badgeLabel}
              </span>
            ) : null}
          </div>
          {displayHandle ? <p className="mt-0.5 truncate text-[0.82rem] text-gray-500">{displayHandle}</p> : null}
        </div>
      </div>
    </button>
  );
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
  conversationId,
  inviteButtonLabel,
  onInvite,
}: ConversationParticipantsPanelProps) {
  const { data: session } = useSession();
  const fallbackProfile = useMemo(
    () => buildSessionFallbackProfile(session?.user),
    [session?.user],
  );
  const [profile, setProfile] = useState<ParticipantProfile | null>(fallbackProfile);
  const [loadState, setLoadState] = useState<ProfileLoadState>("idle");
  const [otherMembers, setOtherMembers] = useState<ParticipantProfile[]>([]);
  const [membersLoadState, setMembersLoadState] = useState<ProfileLoadState>("idle");
  const normalizedConversationId = conversationId?.trim() || "";

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

  const loadMembers = useCallback(async () => {
    if (!normalizedConversationId) {
      setOtherMembers([]);
      setMembersLoadState("ready");
      return;
    }
    setMembersLoadState("loading");
    try {
      const response = await fetch(
        buildClientApiPath(`/conversations/${normalizedConversationId}/members`),
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("participant_members_load_failed");
      const members = parseConversationMemberList(await response.json());
      const selfId = profile?.id || fallbackProfile?.id || "";
      setOtherMembers(members.filter((member) => member.id !== selfId));
      setMembersLoadState("ready");
    } catch {
      setOtherMembers([]);
      setMembersLoadState("error");
    }
  }, [normalizedConversationId, profile?.id, fallbackProfile?.id]);

  useEffect(() => {
    if (!active) return;
    void loadProfile();
  }, [active, loadProfile]);

  useEffect(() => {
    if (!active) return;
    void loadMembers();
  }, [active, loadMembers]);

  const fallbackLocale = resolveSupportedLocaleTag(uiLocale) ?? DEFAULT_LOCALE;
  const fallbackName = getPrimaryUiCopy(fallbackLocale).connect.userFallbackLabel ?? "Mingle user";

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
        {onInvite ? (
          <button
            type="button"
            aria-label={inviteButtonLabel}
            onClick={onInvite}
            className="inline-flex h-[38px] w-10 items-center justify-center text-gray-700 transition hover:text-gray-900 active:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <UserPlus size={20} strokeWidth={2.2} aria-hidden="true" />
          </button>
        ) : (
          <div className="w-10" aria-hidden="true" />
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {loadState === "loading" && !profile ? (
          <div className="flex items-center justify-center gap-2 py-12 text-[0.94rem] text-gray-500" role="status">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            <span>{loadingLabel}</span>
          </div>
        ) : null}

        <div className="flex flex-col gap-2.5">
          {profile ? (
            <ParticipantRow
              member={profile}
              fallbackName={fallbackName}
              badgeLabel={selfLabel}
              onOpenProfile={onOpenProfile}
            />
          ) : null}

          {otherMembers.map((member) => (
            <ParticipantRow
              key={member.id}
              member={member}
              fallbackName={fallbackName}
              onOpenProfile={onOpenProfile}
            />
          ))}
        </div>

        {membersLoadState === "loading" ? (
          <div className="flex items-center justify-center gap-2 py-6 text-[0.94rem] text-gray-500" role="status">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            <span>{loadingLabel}</span>
          </div>
        ) : null}

        {membersLoadState === "error" ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-[0.94rem] text-gray-500">{errorLabel}</p>
            <button
              type="button"
              onClick={() => void loadMembers()}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3.5 py-2 text-[0.86rem] font-semibold text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
            >
              <RotateCcw size={14} aria-hidden="true" />
              <span>{retryLabel}</span>
            </button>
          </div>
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
