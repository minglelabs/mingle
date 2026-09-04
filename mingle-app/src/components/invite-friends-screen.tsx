"use client";

import type { AppDictionary, AppLocale } from "@/i18n";
import { getConversationDictionary } from "@/i18n/conversations";
import { buildClientApiPath } from "@/lib/api-contract";
import { formatHandle } from "@/lib/handles";
import { MAX_CONVERSATION_MEMBERS } from "@/lib/app-conversations";
import ExistingConversationChoiceDialog from "@/components/existing-conversation-choice-dialog";
import { postNativeBannerZone } from "@/lib/native-banner-zone";
import { replaceWithConversationListThenPush } from "@/lib/direct-conversation-navigation";
import { showRouteTransitionCurtain } from "@/lib/route-transition-curtain";
import { buildNativeAwareTabPath } from "@/lib/tab-navigation";
import { Check, ChevronLeft, Loader2, Search, UserRound, X } from "lucide-react";
import { motion, useAnimationControls } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type InviteFriendsTab = "followers" | "following";

type InviteFriendsScreenProps = {
  dictionary: AppDictionary;
  locale: AppLocale;
  // When set, the picker adds people to this ALREADY-EXISTING room instead
  // of starting a new one — e.g. inviting someone into a solo room the
  // owner had been using alone. Reuses the exact same follower/following
  // picker; only the submit target, copy, and success navigation differ.
  conversationId?: string;
  // Set when this screen is embedded as another layer of the room's own
  // menu stack (LivePhoneDemo's 'invite' screen) instead of being routed to
  // as its own page (/conversations/add-members). When present, closing —
  // via the header back button or after a successful add — just calls this
  // instead of any router navigation, and the outer full-screen route
  // chrome (fixed overlay + its own slide-in/out) is skipped, since the
  // parent layer already provides both.
  onRequestClose?: () => void;
  // Embedded mode keeps this component mounted for the room's whole
  // lifetime (see conversation-participants-panel.tsx's identical `active`
  // prop) so its content survives the parent SlideSurface's close-slide
  // instead of vanishing mid-animation into a blank panel. `active` gates
  // its data fetching and native side effects the same way — on by default,
  // since the standalone-page use (no onRequestClose) is always "active"
  // for its whole mounted lifetime anyway.
  active?: boolean;
};

type InviteFriendsUser = {
  id: string;
  handle: string | null;
  name: string | null;
  image: string | null;
};

const INVITE_FRIENDS_TRANSITION = {
  duration: 0.32,
  ease: [0.22, 1, 0.36, 1] as const,
};

// The viewer counts toward the 10-person cap, so at most this many others
// can be invited alongside them.
const MAX_INVITEES = MAX_CONVERSATION_MEMBERS - 1;

function AvatarCircle({ image, size }: { image: string | null; size: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100"
      style={{ width: size, height: size }}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-full w-full object-cover" />
      ) : (
        <UserRound size={Math.round(size * 0.55)} className="text-gray-400" aria-hidden="true" />
      )}
    </div>
  );
}

export default function InviteFriendsScreen({ dictionary, locale, conversationId, onRequestClose, active = true }: InviteFriendsScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const motionControls = useAnimationControls();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestSequenceRef = useRef(0);
  const isMountedRef = useRef(false);
  const isLeavingRef = useRef(false);
  const normalizedConversationId = conversationId?.trim() || null;
  const isAddingToExistingConversation = Boolean(normalizedConversationId);

  const [activeTab, setActiveTab] = useState<InviteFriendsTab>("followers");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<InviteFriendsUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<InviteFriendsUser[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [capMessageVisible, setCapMessageVisible] = useState(false);
  const [existingConversationId, setExistingConversationId] = useState<string | null>(null);
  // Already-in-the-room people, hidden from the picker when adding to an
  // existing conversation — inviting them again would just 400.
  const [existingMemberIds, setExistingMemberIds] = useState<Set<string>>(new Set());

  const copy = useMemo(() => getConversationDictionary(locale, dictionary), [dictionary, locale]);
  const labels = useMemo(() => ({
    followers: dictionary.profile.followersLabel ?? (locale === "ko" ? "팔로워" : "Followers"),
    following: dictionary.profile.followingLabel ?? (locale === "ko" ? "팔로잉" : "Following"),
    back: dictionary.profile.profileShareBackLabel ?? (locale === "ko" ? "뒤로가기" : "Back"),
    search: dictionary.connect.searchPlaceholder
      ?? (locale === "ko" ? "아이디 또는 이름 검색" : "Search by handle or name"),
    loading: dictionary.profile.profileLoadingLabel ?? (locale === "ko" ? "불러오는 중" : "Loading"),
    error: dictionary.connect.searchError
      ?? (locale === "ko" ? "목록을 불러오지 못했습니다. 다시 시도해 주세요." : "Could not load the list. Please try again."),
    userFallback: dictionary.connect.userFallbackLabel ?? (locale === "ko" ? "Mingle 사용자" : "Mingle user"),
    clearSearch: dictionary.connect.clearSearchLabel ?? (locale === "ko" ? "검색어 지우기" : "Clear search"),
    empty: activeTab === "followers"
      ? (dictionary.profile.noFollowersLabel ?? "No followers yet.")
      : (dictionary.profile.noFollowingLabel ?? "No following yet."),
  }), [activeTab, dictionary, locale]);

  const pageTitle = isAddingToExistingConversation
    ? copy.inviteFriendsAddMembersPageTitle
    : copy.inviteFriendsPageTitle;
  const submitButtonLabel = isAddingToExistingConversation
    ? copy.inviteFriendsAddButtonLabel
    : copy.inviteFriendsStartButtonLabel;
  const submitErrorMessage = isAddingToExistingConversation
    ? copy.inviteFriendsAddErrorMessage
    : copy.inviteFriendsCreateErrorMessage;

  const viewerName = session?.user?.name?.trim()
    || dictionary.profile.selfLabel
    || "You";
  const viewerImage = typeof session?.user?.image === "string" ? session.user.image : null;

  const normalizedQuery = query.trim();
  const selectedIds = useMemo(() => new Set(selectedUsers.map((user) => user.id)), [selectedUsers]);
  const visibleUsers = useMemo(
    () => (existingMemberIds.size === 0 ? users : users.filter((user) => !existingMemberIds.has(user.id))),
    [existingMemberIds, users],
  );

  const navigateBack = useCallback(() => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push(buildNativeAwareTabPath(`/${locale}/conversations`, searchParams, { tabRoot: true }));
  }, [locale, router, searchParams]);

  const handleBack = useCallback(async () => {
    if (!isMountedRef.current || isLeavingRef.current) return;
    isLeavingRef.current = true;
    await motionControls.start({ x: "100%", transition: INVITE_FRIENDS_TRANSITION });
    if (isMountedRef.current) navigateBack();
  }, [motionControls, navigateBack]);

  // Only reachable now by visiting /conversations/add-members directly —
  // the room's participants panel opens the invite picker as an in-page
  // menu screen instead (see LivePhoneDemo's 'invite' screen), which never
  // routes here and so never needs any of this. Kept as a working fallback
  // for a direct/bookmarked visit to this route, which always arrives via a
  // real router.push from the room it's inviting into, so returning after a
  // successful invite always has one known destination: the room entry
  // pushed FROM to get here. Earlier code chose between router.back() and a
  // reconstructed push by checking
  // `window.history.length > 1` (navigateBack's generic "cancel" logic,
  // still used below) — but that length check is unreliable inside a native
  // WebView tab, often under-reporting even right after a real push, which
  // silently forced the reconstructed-push fallback every time and dropped
  // `?conversation=` in the process. Since this call site's history shape is
  // never ambiguous, skip the check and call router.back() directly.
  //
  // This also isn't just about avoiding that flaky check: this page reads
  // cookies()/headers()/searchParams, so it's a fully dynamic route with
  // staleTimes.dynamic = 0 — a router.push() back to it, even to the exact
  // original URL, always triggers a fresh RSC fetch over the network. Real
  // back/forward navigation is the one case Next.js's Router Cache always
  // reuses regardless of staleness, so router.back() is the only way to
  // return with no network round trip and no flash.
  const navigateBackToConversation = useCallback(() => {
    if (!normalizedConversationId) {
      navigateBack();
      return;
    }
    router.back();
  }, [navigateBack, normalizedConversationId, router]);

  // router.back() replaces this whole page's tree with conversation-list.tsx's
  // in one React commit, but the browser doesn't paint that commit
  // instantly — remounting a component that size is real synchronous work,
  // and on-device that boundary was visible for a frame regardless of what
  // this screen's own exit animation did (a slide made it worse — two
  // disconnected motions; a fade only shrank the gap, it didn't close it).
  // showRouteTransitionCurtain() covers the screen through that boundary
  // instead: it lives in the root layout, so it survives the navigation and
  // only lifts once the destination has actually painted. Nothing needs to
  // animate out here anymore — the curtain hides it.
  const handleBackToConversation = useCallback(() => {
    if (!isMountedRef.current || isLeavingRef.current) return;
    isLeavingRef.current = true;
    showRouteTransitionCurtain();
    navigateBackToConversation();
  }, [navigateBackToConversation]);

  const toggleUser = useCallback((user: InviteFriendsUser) => {
    setSelectedUsers((current) => {
      if (current.some((candidate) => candidate.id === user.id)) {
        return current.filter((candidate) => candidate.id !== user.id);
      }
      if (current.length >= MAX_INVITEES) {
        setCapMessageVisible(true);
        return current;
      }
      setCapMessageVisible(false);
      return [...current, user];
    });
  }, []);

  const requestConversationStart = useCallback(async (force: boolean) => {
    const response = await fetch(buildClientApiPath("/conversations"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locale,
        inviteeUserIds: selectedUsers.map((user) => user.id),
        force,
      }),
    });
    if (!response.ok) throw new Error("group_conversation_create_failed");
    const data = await response.json() as { conversation?: { id?: string }; reused?: boolean };
    const conversationId = data.conversation?.id;
    if (!conversationId) throw new Error("group_conversation_create_failed");
    return { conversationId, reused: data.reused === true };
  }, [locale, selectedUsers]);

  const navigateToConversation = useCallback(async (conversationId: string) => {
    const conversationListHref = buildNativeAwareTabPath(
      `/${locale}/conversations`,
      searchParams,
      { skipConversationRestore: true, tabRoot: true },
    );
    await replaceWithConversationListThenPush(router, conversationListHref, conversationId);
  }, [locale, router, searchParams]);

  // Adds the picked people to the room we were opened from, instead of
  // creating a new one — see inviteMembersToConversationChannel.
  const requestMemberInvite = useCallback(async () => {
    if (!normalizedConversationId) throw new Error("missing_conversation_id");
    const response = await fetch(
      buildClientApiPath(`/conversations/${normalizedConversationId}/members`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteeUserIds: selectedUsers.map((user) => user.id) }),
      },
    );
    if (!response.ok) throw new Error("conversation_member_invite_failed");
  }, [normalizedConversationId, selectedUsers]);

  useEffect(() => {
    if (!active) return;
    postNativeBannerZone("hidden");
  }, [active]);

  // Solo/shared rooms both expose the same members endpoint — fetch it only
  // in "add to existing room" mode, to hide already-in-the-room people from
  // the picker below.
  useEffect(() => {
    if (!active) return;
    if (!normalizedConversationId) {
      setExistingMemberIds(new Set());
      return;
    }
    let cancelled = false;
    void fetch(buildClientApiPath(`/conversations/${normalizedConversationId}/members`), {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("conversation_members_load_failed");
        return response.json() as Promise<{ members?: { userId?: string }[] }>;
      })
      .then((payload) => {
        if (cancelled) return;
        const memberIds = (payload.members ?? [])
          .map((member) => member.userId)
          .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
        setExistingMemberIds(new Set(memberIds));
      })
      .catch(() => {
        if (!cancelled) setExistingMemberIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [active, normalizedConversationId]);

  // Same set of people already has a room together — offer a choice instead
  // of silently reusing it (which would be confusing for a group, unlike
  // the 1:1 "message this person" flow) or silently spawning a duplicate.
  // Not applicable when adding to an already-existing room: there's only one
  // target room, so it's a straight invite-and-return.
  const handleStartConversation = useCallback(async () => {
    if (isStarting || selectedUsers.length === 0) return;
    setIsStarting(true);
    setStartError(null);
    try {
      if (isAddingToExistingConversation) {
        await requestMemberInvite();
        if (onRequestClose) {
          onRequestClose();
        } else {
          await handleBackToConversation();
        }
        return;
      }
      const { conversationId, reused } = await requestConversationStart(false);
      if (reused) {
        setExistingConversationId(conversationId);
        return;
      }
      await navigateToConversation(conversationId);
    } catch {
      setStartError(submitErrorMessage ?? null);
    } finally {
      setIsStarting(false);
    }
  }, [
    handleBackToConversation,
    isAddingToExistingConversation,
    isStarting,
    navigateToConversation,
    onRequestClose,
    requestConversationStart,
    requestMemberInvite,
    selectedUsers,
    submitErrorMessage,
  ]);

  const handleContinuePreviousConversation = useCallback(async () => {
    if (!existingConversationId) return;
    await navigateToConversation(existingConversationId);
  }, [existingConversationId, navigateToConversation]);

  const handleCreateNewDespiteExisting = useCallback(async () => {
    if (isStarting) return;
    setIsStarting(true);
    setStartError(null);
    try {
      const { conversationId } = await requestConversationStart(true);
      setExistingConversationId(null);
      await navigateToConversation(conversationId);
    } catch {
      setStartError(copy.inviteFriendsCreateErrorMessage ?? null);
    } finally {
      setIsStarting(false);
    }
  }, [copy.inviteFriendsCreateErrorMessage, isStarting, navigateToConversation, requestConversationStart]);

  useEffect(() => {
    isMountedRef.current = true;
    void router.prefetch(`/${locale}/conversations`);
    void motionControls.start({ x: 0, transition: INVITE_FRIENDS_TRANSITION });
    return () => {
      isMountedRef.current = false;
    };
  }, [locale, motionControls, router]);

  useEffect(() => {
    if (!active) return;
    const requestSequence = ++requestSequenceRef.current;
    const timeoutId = window.setTimeout(() => {
      void fetch(buildClientApiPath(`/profile/${activeTab}?q=${encodeURIComponent(normalizedQuery)}`), {
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("invite_list_load_failed");
          return response.json() as Promise<{ users?: InviteFriendsUser[] }>;
        })
        .then((payload) => {
          if (!isMountedRef.current || requestSequenceRef.current !== requestSequence) return;
          setUsers(Array.isArray(payload.users) ? payload.users : []);
        })
        .catch(() => {
          if (!isMountedRef.current || requestSequenceRef.current !== requestSequence) return;
          setUsers([]);
          setLoadError(true);
        })
        .finally(() => {
          if (isMountedRef.current && requestSequenceRef.current === requestSequence) {
            setIsLoading(false);
          }
        });
    }, 220);

    return () => window.clearTimeout(timeoutId);
  }, [active, activeTab, normalizedQuery]);

  const content = (
    <>
        <header
          className="grid shrink-0 grid-cols-[44px_1fr_44px] items-center border-b border-gray-100 px-4"
          style={{
            height: "calc(54px + env(safe-area-inset-top, 44px))",
            paddingTop: "env(safe-area-inset-top, 44px)",
          }}
        >
          <button
            type="button"
            onClick={() => {
              if (onRequestClose) {
                onRequestClose();
                return;
              }
              if (isAddingToExistingConversation) {
                handleBackToConversation();
                return;
              }
              void handleBack();
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full transition active:bg-gray-100"
            aria-label={labels.back}
          >
            <ChevronLeft size={25} strokeWidth={2.1} aria-hidden="true" />
          </button>
          <h1 className="truncate text-center text-[17px] font-bold">
            {pageTitle}
          </h1>
          <div aria-hidden="true" />
        </header>

        <div className="shrink-0 border-b border-gray-100 px-4 py-3">
          <div className="-mx-1 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            <div className="flex min-w-max items-center gap-3 px-1">
              <div className="flex flex-col items-center gap-1" style={{ width: 56 }}>
                <div className="rounded-full border-2 border-amber-400 p-0.5">
                  <AvatarCircle image={viewerImage} size={48} />
                </div>
                <span className="max-w-[56px] truncate text-[11px] text-gray-500">{viewerName}</span>
              </div>
              {selectedUsers.map((user) => {
                const name = user.name?.trim() || labels.userFallback;
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => toggleUser(user)}
                    className="flex flex-col items-center gap-1"
                    style={{ width: 56 }}
                    aria-label={name}
                  >
                    <div className="relative rounded-full border-2 border-amber-400 p-0.5">
                      <AvatarCircle image={user.image} size={48} />
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-gray-700 text-white">
                        <X size={10} strokeWidth={3} aria-hidden="true" />
                      </span>
                    </div>
                    <span className="max-w-[56px] truncate text-[11px] text-gray-500">{name}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {capMessageVisible ? (
            <p className="mt-1 text-[12px] text-amber-600" role="alert">
              {copy.inviteFriendsMaxMembersReachedMessage}
            </p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-8">
          <div className="border-b border-gray-100 px-4 pt-3">
            <div className="flex rounded-xl bg-gray-50 p-1" role="tablist" aria-label={`${labels.followers} / ${labels.following}`}>
              {(["followers", "following"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => {
                    setActiveTab(tab);
                    setIsLoading(true);
                    setLoadError(false);
                  }}
                  className={`flex-1 rounded-lg px-3 py-2.5 text-[14px] font-semibold transition ${activeTab === tab
                    ? "bg-white text-amber-600 shadow-[0_4px_12px_rgba(15,23,42,0.08)]"
                    : "text-gray-500 active:bg-gray-100"}`}
                >
                  {labels[tab]}
                </button>
              ))}
            </div>

            <label className="relative my-3 block">
              <Search
                size={18}
                strokeWidth={2.1}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setIsLoading(true);
                  setLoadError(false);
                }}
                placeholder={labels.search}
                aria-label={labels.search}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-10 text-[15px] outline-none transition placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:ring-2 focus:ring-amber-100"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition active:bg-gray-200"
                  aria-label={labels.clearSearch}
                >
                  <X size={16} strokeWidth={2.2} aria-hidden="true" />
                </button>
              ) : null}
            </label>
          </div>

          {isLoading ? (
            <div className="flex justify-center pt-8 text-gray-400" aria-live="polite">
              <Loader2 size={23} className="animate-spin" aria-label={labels.loading} />
            </div>
          ) : loadError ? (
            <p className="px-6 pt-8 text-center text-[14px] text-gray-500" role="alert">{labels.error}</p>
          ) : visibleUsers.length === 0 ? (
            <p className="px-6 pt-8 text-center text-[14px] text-gray-500">
              {labels.empty}
            </p>
          ) : (
            <ul className="border-t border-gray-100">
              {visibleUsers.map((user) => {
                const name = user.name?.trim() || labels.userFallback;
                const isSelected = selectedIds.has(user.id);
                return (
                  <li key={user.id} className="border-b border-gray-100">
                    <button
                      type="button"
                      onClick={() => toggleUser(user)}
                      className="flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition active:bg-gray-50"
                      aria-pressed={isSelected}
                      aria-label={user.handle ? `${name}, ${formatHandle(user.handle)}` : name}
                    >
                      <AvatarCircle image={user.image} size={44} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold text-slate-900">{name}</p>
                        {user.handle ? <p className="truncate text-[13px] text-gray-500">{formatHandle(user.handle)}</p> : null}
                      </div>
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${
                          isSelected ? "border-amber-500 bg-amber-500" : "border-gray-300 bg-white"
                        }`}
                      >
                        {isSelected ? <Check size={14} strokeWidth={3} className="text-white" aria-hidden="true" /> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div
          className="shrink-0 border-t border-gray-100 px-5 pt-3"
          style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}
        >
          {startError ? (
            <p className="mb-2 text-center text-[12px] text-red-500" role="alert">{startError}</p>
          ) : null}
          <button
            type="button"
            onClick={() => void handleStartConversation()}
            disabled={selectedUsers.length === 0 || isStarting}
            className="flex h-12 w-full items-center justify-center rounded-xl text-[15px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundImage: "linear-gradient(90deg, #f59e0b 0%, #f97316 100%)" }}
          >
            {isStarting ? <Loader2 size={20} className="animate-spin" /> : submitButtonLabel}
          </button>
        </div>
    </>
  );

  const existingConversationDialog = existingConversationId ? (
    <ExistingConversationChoiceDialog
      title={copy.inviteFriendsExistingConversationTitle}
      message={copy.inviteFriendsExistingConversationMessage}
      createNewLabel={copy.inviteFriendsCreateNewAction}
      continueLabel={copy.inviteFriendsContinuePreviousAction}
      isPending={isStarting}
      onCreateNew={handleCreateNewDespiteExisting}
      onContinue={handleContinuePreviousConversation}
      onDismiss={() => setExistingConversationId(null)}
    />
  ) : null;

  // Embedded in the room's own menu stack (LivePhoneDemo's 'invite' screen):
  // the parent motion.section/SlideSurface already provides full-screen
  // positioning and the slide transition, so skip this screen's own copy of
  // both instead of nesting them.
  if (onRequestClose) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white text-slate-950">
        {content}
        {existingConversationDialog}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-white">
      <motion.main
        initial={{ x: "100%" }}
        animate={motionControls}
        className="absolute inset-0 flex min-h-0 w-full flex-col overflow-hidden bg-white text-slate-950"
      >
        {content}
      </motion.main>

      {existingConversationDialog}
    </div>
  );
}
