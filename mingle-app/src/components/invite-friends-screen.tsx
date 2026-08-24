"use client";

import type { AppDictionary, AppLocale } from "@/i18n";
import { getConversationDictionary } from "@/i18n/conversations";
import { buildClientApiPath } from "@/lib/api-contract";
import { formatHandle } from "@/lib/handles";
import { MAX_CONVERSATION_MEMBERS } from "@/lib/app-conversations";
import ExistingConversationChoiceDialog from "@/components/existing-conversation-choice-dialog";
import { postNativeBannerZone } from "@/lib/native-banner-zone";
import { replaceWithConversationListThenPush } from "@/lib/direct-conversation-navigation";
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

export default function InviteFriendsScreen({ dictionary, locale }: InviteFriendsScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const motionControls = useAnimationControls();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestSequenceRef = useRef(0);
  const isMountedRef = useRef(false);
  const isLeavingRef = useRef(false);

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

  const viewerName = session?.user?.name?.trim()
    || dictionary.profile.selfLabel
    || "You";
  const viewerImage = typeof session?.user?.image === "string" ? session.user.image : null;

  const normalizedQuery = query.trim();
  const selectedIds = useMemo(() => new Set(selectedUsers.map((user) => user.id)), [selectedUsers]);

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

  useEffect(() => {
    postNativeBannerZone("hidden");
  }, []);

  // Same set of people already has a room together — offer a choice instead
  // of silently reusing it (which would be confusing for a group, unlike
  // the 1:1 "message this person" flow) or silently spawning a duplicate.
  const handleStartConversation = useCallback(async () => {
    if (isStarting || selectedUsers.length === 0) return;
    setIsStarting(true);
    setStartError(null);
    try {
      const { conversationId, reused } = await requestConversationStart(false);
      if (reused) {
        setExistingConversationId(conversationId);
        return;
      }
      await navigateToConversation(conversationId);
    } catch {
      setStartError(copy.inviteFriendsCreateErrorMessage ?? null);
    } finally {
      setIsStarting(false);
    }
  }, [copy.inviteFriendsCreateErrorMessage, isStarting, navigateToConversation, requestConversationStart, selectedUsers]);

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
  }, [activeTab, normalizedQuery]);

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-white">
      <motion.main
        initial={{ x: "100%" }}
        animate={motionControls}
        className="absolute inset-0 flex min-h-0 w-full flex-col overflow-hidden bg-white text-slate-950"
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
            onClick={() => void handleBack()}
            className="flex h-10 w-10 items-center justify-center rounded-full transition active:bg-gray-100"
            aria-label={labels.back}
          >
            <ChevronLeft size={25} strokeWidth={2.1} aria-hidden="true" />
          </button>
          <h1 className="truncate text-center text-[17px] font-bold">
            {copy.inviteFriendsPageTitle}
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
          ) : users.length === 0 ? (
            <p className="px-6 pt-8 text-center text-[14px] text-gray-500">
              {labels.empty}
            </p>
          ) : (
            <ul className="border-t border-gray-100">
              {users.map((user) => {
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
            {isStarting ? <Loader2 size={20} className="animate-spin" /> : copy.inviteFriendsStartButtonLabel}
          </button>
        </div>
      </motion.main>

      {existingConversationId ? (
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
      ) : null}
    </div>
  );
}
