"use client";

import { resolvePeopleSafetyCopy } from "@/i18n/people-safety-copy";
import { Check, Loader2, MessageCircle, Search, SlidersHorizontal, UserPlus, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BottomTabBar from "@/components/bottom-tab-bar";
import MingleWordmark from "@/components/mingle-wordmark";
import FlagEmoji from "@/components/flag-emoji";
import HomeNoticeStrip from "@/components/home/home-notices";
import ProfileStartCard from "@/components/home/profile-start-card";
import AccountBadge from "@/components/posts/account-badge";
import { CompactLanguageLevels } from "@/components/profile-language-levels";
import {
  mergeDiscoveryPage,
  parseDiscoveryPage,
  type DiscoveryPage,
  type DiscoveryPerson,
} from "@/components/search/people-discovery-state";
import type { AppDictionary, AppLocale } from "@/i18n";
import { fillHomeCount, resolveHomeCopy, type HomeCopy } from "@/i18n/home-copy";
import { resolvePeopleDiscoveryCopy, type PeopleDiscoveryCopy } from "@/i18n/people-discovery-copy";
import { formatProfileAge } from "@/i18n/profile-age-copy";
import { resolveAccountBadge, withAccountBadgeLabel } from "@/lib/account-badge";
import { buildClientApiPath } from "@/lib/api-contract";
import { countryFlagEmoji, getCountryDisplayName } from "@/lib/nationality";
import { normalizeProfileImageCrop } from "@/lib/profile-image-crop";
import { requestProfileBasics } from "@/lib/profile-basics";
import { useStartDirectConversation } from "@/lib/use-start-direct-conversation";
import { searchCopy } from "@/i18n/search-copy";
import { buildNativeAwareTabPath } from "@/lib/tab-navigation";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { TAB_BANNER_TOP_BAR_HEIGHT_PX, useTabNativeBanner } from "@/lib/use-tab-native-banner";
import ExploreFilterSheet, {
  NO_EXPLORE_FILTERS,
  exploreFilterParams,
  isFiltering,
  readExploreFilters,
  writeExploreFilters,
  type ExploreFilters,
} from "@/components/explore/explore-filter-sheet";

/** Pages kept for the session so coming back to the tab neither refetches nor jumps. */
const pageCache = new Map<string, DiscoveryPage>();

const MAX_LANGUAGES_ON_CARD = 2;

async function fetchDiscoveryPage(locale: string, cursor: string | null, filters: ExploreFilters): Promise<DiscoveryPage> {
  const params = new URLSearchParams({ locale, ...exploreFilterParams(filters) });
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(buildClientApiPath(`/users/discover?${params.toString()}`), { cache: "no-store" });
  if (!response.ok) throw new Error("people_discovery_failed");
  return parseDiscoveryPage(await response.json());
}

type ExplorePeoplePageProps = {
  dictionary: AppDictionary;
  locale: AppLocale;
};

/**
 * The explore tab (owner, 2026-11-23: home is the feed again, the people cards
 * moved here): cards of people to talk to, two per row, the other side of the
 * language exchange first and whoever is online on top. A card opens the
 * person's profile. A search bar on top opens the search screen; the notice
 * strip sits above the cards.
 */
export default function ExplorePeoplePage({ dictionary, locale }: ExplorePeoplePageProps) {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const viewerId = typeof session?.user?.id === "string" ? session.user.id.trim() : "";
  const copy = useMemo(() => resolveHomeCopy(locale), [locale]);
  const peopleCopy = useMemo(() => resolvePeopleDiscoveryCopy(locale), [locale]);
  const safetyCopy = useMemo(() => resolvePeopleSafetyCopy(locale), [locale]);
  // Kept on the device (owner, 2026-11-25); read after mount so the server render matches.
  const [filters, setFilters] = useState<ExploreFilters>(NO_EXPLORE_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters(readExploreFilters()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const filtering = isFiltering(filters);
  const bannerHeightPx = useTabNativeBanner(sessionStatus === "authenticated");
  const cacheKey = `${viewerId}:${locale}:${JSON.stringify(exploreFilterParams(filters))}`;
  const [page, setPage] = useState<DiscoveryPage | null>(() => (viewerId ? pageCache.get(cacheKey) ?? null : null));
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !viewerId) return;
    const cached = pageCache.get(cacheKey);
    if (cached && reloadKey === 0) {
      setPage(cached);
      return;
    }
    let cancelled = false;
    setFailed(false);
    void fetchDiscoveryPage(locale, null, filters)
      .then((first) => {
        pageCache.set(cacheKey, first);
        if (!cancelled) setPage(first);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [cacheKey, filters, locale, reloadKey, sessionStatus, viewerId]);

  const loadMore = useCallback(async () => {
    if (!page?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = mergeDiscoveryPage(page, await fetchDiscoveryPage(locale, page.nextCursor, filters));
      pageCache.set(cacheKey, next);
      setPage(next);
    } catch {
      // What is on screen stays; scrolling to the end again retries.
    } finally {
      setLoadingMore(false);
    }
  }, [cacheKey, filters, loadingMore, locale, page]);

  // Pull down at the top of the list (owner, 2026-11-25): the first page is read again.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const refreshFromTop = useCallback(async () => {
    try {
      const first = await fetchDiscoveryPage(locale, null, filters);
      pageCache.set(cacheKey, first);
      setPage(first);
      setFailed(false);
    } catch {
      // What is on screen stays.
      toast(copy.loadError);
    }
  }, [cacheKey, copy.loadError, filters, locale]);
  const pull = usePullToRefresh(scrollEl, refreshFromTop, sessionStatus === "authenticated" && Boolean(viewerId) && !filterOpen);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !page?.nextCursor || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { rootMargin: "600px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, page?.nextCursor]);

  const openPerson = useCallback((userId: string) => {
    router.push(`/${locale}/users/${encodeURIComponent(userId)}`);
  }, [locale, router]);

  const isKorean = locale === "ko";
  const actionLabels = useMemo(() => ({
    follow: dictionary.connect.followAction ?? (isKorean ? "팔로우" : "Follow"),
    following: dictionary.connect.followingAction ?? (isKorean ? "팔로잉" : "Following"),
    message: dictionary.profile.messageAction ?? (isKorean ? "메시지 보내기" : "Message"),
    failed: dictionary.profile.messageError ?? (isKorean ? "잠시 후 다시 시도해 주세요." : "Please try again in a moment."),
  }), [dictionary, isKorean]);

  // Follow and Message work from the card itself, without opening the profile.
  const followBusyRef = useRef(new Set<string>());
  const setFollowing = useCallback((userId: string, isFollowing: boolean) => {
    setPage((current) => {
      if (!current) return current;
      const next = { ...current, users: current.users.map((user) => (user.id === userId ? { ...user, isFollowing } : user)) };
      // The session cache too, or the button reverts on coming back to the tab.
      pageCache.set(cacheKey, next);
      return next;
    });
  }, [cacheKey]);
  const toggleFollow = useCallback(async (person: DiscoveryPerson) => {
    const next = !person.isFollowing;
    if (followBusyRef.current.has(person.id)) return;
    if (next && !(await requestProfileBasics())) return;
    followBusyRef.current.add(person.id);
    setFollowing(person.id, next);
    try {
      const response = await fetch(buildClientApiPath(`/users/${encodeURIComponent(person.id)}/follow`), { method: next ? "POST" : "DELETE" });
      if (!response.ok) throw new Error("follow_failed");
    } catch {
      setFollowing(person.id, !next);
      toast(actionLabels.failed);
    } finally {
      followBusyRef.current.delete(person.id);
    }
  }, [actionLabels.failed, setFollowing]);

  const { start: startDirectConversation, pendingUserId: messagePendingUserId } = useStartDirectConversation(locale);
  const messagePerson = useCallback(async (person: DiscoveryPerson) => {
    const result = await startDirectConversation(person.id);
    if (result.kind === "daily_limit") toast(fillHomeCount(copy.dailyLimit, result.limit));
    else if (result.kind === "recipient_blocks_men") toast(resolvePeopleSafetyCopy(locale).recipientBlocksMen);
    else if (result.kind === "failed") toast(actionLabels.failed);
  }, [actionLabels.failed, copy.dailyLimit, locale, startDirectConversation]);

  const heading = page?.viewerSide === "korean" ? peopleCopy.headingForKorean : peopleCopy.headingForForeigner;
  const searchPlaceholder = searchCopy(locale).searchPlaceholder;
  const openSearch = useCallback(() => {
    router.push(buildNativeAwareTabPath(`/${locale}/connect`, new URLSearchParams(window.location.search), { tabRoot: true }));
  }, [locale, router]);

  return (
    <main className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-white" data-qa="explore-tab">
      {/* One row, exactly as tall as the app expects, so its ad banner sits right under it. */}
      <header className="shrink-0 bg-white" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="flex items-center gap-2 px-4" style={{ height: TAB_BANNER_TOP_BAR_HEIGHT_PX }}>
          <h1 className="flex shrink-0 items-center" aria-label="HashChat"><MingleWordmark /></h1>
          <button
            type="button"
            data-qa="explore-open-search"
            onClick={openSearch}
            className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl bg-gray-100 px-3 text-left text-[15px] text-gray-400 active:bg-gray-200"
          >
            <Search size={17} strokeWidth={2.2} aria-hidden="true" />
            <span className="truncate">{searchPlaceholder}</span>
          </button>
          <button
            type="button"
            data-qa="explore-open-filter"
            onClick={() => setFilterOpen(true)}
            aria-label={safetyCopy.filterButton}
            title={safetyCopy.filterButton}
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl active:scale-[0.98] ${filtering ? "bg-amber-50 text-amber-700 ring-1 ring-amber-300" : "bg-gray-100 text-slate-700"}`}
          >
            <SlidersHorizontal size={18} strokeWidth={2.2} aria-hidden="true" />
            {filtering ? <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-500" /> : null}
          </button>
        </div>
      </header>
      {/* The ad banner (drawn by the app) is pinned here; the cards scroll below it. */}
      <div
        data-qa="tab-banner-slot"
        aria-hidden="true"
        className="shrink-0 border-b border-gray-100 bg-white"
        style={{ height: bannerHeightPx }}
      />
      {filterOpen ? (
        <ExploreFilterSheet
          copy={safetyCopy}
          value={filters}
          onClose={() => setFilterOpen(false)}
          onApply={(next) => {
            setFilterOpen(false);
            writeExploreFilters(next);
            setFilters(next);
          }}
        />
      ) : null}
      <div ref={setScrollEl} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* The row a pull opens above the list, with its spinner. */}
        <div
          data-qa="explore-pull-refresh"
          data-refreshing={pull.refreshing ? "true" : "false"}
          className="flex items-end justify-center overflow-hidden"
          style={{ height: pull.offset, transition: pull.dragging ? "none" : "height 200ms ease" }}
          role={pull.refreshing ? "status" : undefined}
          aria-hidden={pull.refreshing ? undefined : true}
        >
          <Loader2
            size={22}
            className={`mb-3 shrink-0 ${pull.refreshing ? "animate-spin text-slate-400" : "text-slate-300"}`}
            style={pull.refreshing ? undefined : { opacity: pull.progress, transform: `rotate(${pull.progress * 270}deg)` }}
            aria-hidden="true"
          />
        </div>
        {sessionStatus === "authenticated" && viewerId ? <ProfileStartCard locale={locale} userId={viewerId} /> : null}
        <HomeNoticeStrip locale={locale} />
        {sessionStatus === "unauthenticated" ? (
          <div className="flex flex-col items-center px-6 pt-20 text-center">
            <p className="text-[15px] leading-relaxed text-slate-700">{copy.signInPrompt}</p>
            <button
              type="button"
              onClick={() => router.replace(`/${locale}/conversations`)}
              className="mt-5 flex h-12 items-center justify-center rounded-2xl bg-slate-950 px-8 text-[15px] font-bold text-white transition active:scale-[0.985]"
            >
              {copy.signIn}
            </button>
          </div>
        ) : failed && !page ? (
          <div className="flex flex-col items-center px-6 pt-20 text-center">
            <p className="text-[15px] text-slate-700">{copy.loadError}</p>
            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
              className="mt-4 flex h-11 items-center justify-center rounded-xl border border-gray-200 px-6 text-[14px] font-semibold text-slate-700 active:bg-gray-50"
            >
              {copy.retry}
            </button>
          </div>
        ) : !page ? (
          <div className="flex justify-center pt-24 text-gray-300"><Loader2 size={26} className="animate-spin" aria-hidden="true" /></div>
        ) : page.users.length === 0 ? (
          <p className="px-6 pt-20 text-center text-[15px] text-slate-600">{filtering ? safetyCopy.filterEmpty : copy.empty}</p>
        ) : (
          <section className="px-3 pb-6 pt-3" aria-label={heading}>
            <h2 className="px-1 pb-2.5 text-[17px] font-bold text-slate-900">{heading}</h2>
            <ul className="grid grid-cols-2 gap-2.5">
              {page.users.map((person) => (
                <PersonCard
                  key={person.id}
                  person={person}
                  locale={locale}
                  copy={copy}
                  peopleCopy={peopleCopy}
                  labels={actionLabels}
                  isOwn={person.id === viewerId}
                  messagePending={messagePendingUserId === person.id}
                  onOpen={openPerson}
                  onToggleFollow={toggleFollow}
                  onMessage={messagePerson}
                />
              ))}
            </ul>
            <div ref={sentinelRef} className="flex h-12 items-center justify-center" aria-hidden={!loadingMore}>
              {loadingMore ? <Loader2 size={18} className="animate-spin text-gray-300" aria-hidden="true" /> : null}
            </div>
          </section>
        )}
      </div>
      <BottomTabBar activeRoute="connect" dictionary={dictionary} locale={locale} />
    </main>
  );
}

function PersonCard({
  person,
  locale,
  copy,
  peopleCopy,
  labels,
  isOwn,
  messagePending,
  onOpen,
  onToggleFollow,
  onMessage,
}: {
  person: DiscoveryPerson;
  locale: AppLocale;
  copy: HomeCopy;
  peopleCopy: PeopleDiscoveryCopy;
  labels: { follow: string; following: string; message: string };
  isOwn: boolean;
  messagePending: boolean;
  onOpen: (userId: string) => void;
  onToggleFollow: (person: DiscoveryPerson) => void;
  onMessage: (person: DiscoveryPerson) => void;
}) {
  const name = person.name?.trim() || person.handle?.trim() || peopleCopy.userFallback;
  // A photo that fails to load (expired URL, removed object) falls back to the silhouette.
  const [imageFailed, setImageFailed] = useState(false);
  const accountBadge = resolveAccountBadge(person);
  const crop = normalizeProfileImageCrop({ scale: person.imageCropScale, x: person.imageCropX, y: person.imageCropY });
  const primary = person.primaryLanguages.slice(0, MAX_LANGUAGES_ON_CARD);
  const interest = person.interestLanguages.slice(0, MAX_LANGUAGES_ON_CARD);
  const countryName = person.nationalityCountry ? getCountryDisplayName(person.nationalityCountry, locale) : "";
  const badgeLabel = person.badge === "online" ? copy.badgeOnline
    : person.badge === "new" ? peopleCopy.badgeNew
      : person.badge === "active" ? peopleCopy.badgeActive
        : "";
  const label = [
    withAccountBadgeLabel(name, accountBadge, locale),
    formatProfileAge(person.age, locale),
    countryName,
    badgeLabel,
  ].filter(Boolean).join(", ");

  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_1px_4px_rgba(15,23,42,0.06)]">
      <button
        type="button"
        onClick={() => onOpen(person.id)}
        aria-label={label}
        data-qa="home-person-card"
        className="flex w-full flex-1 flex-col items-stretch justify-start text-left transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80"
      >
        {/* The photo is always the same square at the top; Safari centres a button's content otherwise. */}
        <span className="relative block aspect-square w-full shrink-0 overflow-hidden bg-gray-100" aria-hidden="true">
          {person.image && !imageFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={person.image}
              alt=""
              loading="lazy"
              draggable={false}
              onError={() => setImageFailed(true)}
              className="h-full w-full object-cover"
              // The stored crop offsets are fractions of the (square) viewport.
              style={{ transform: `translate3d(${crop.x * 100}%, ${crop.y * 100}%, 0) scale(${crop.scale})` }}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <UserRound size={48} className="text-gray-300" />
            </span>
          )}
          {/* Active in the last hour (owner, 2026-11-25): a light green dot, explained nowhere on purpose. */}
          {person.live ? (
            <span data-qa="explore-live-dot" className="absolute right-2 top-2 flex h-3.5 w-3.5 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-400 opacity-60 [animation-duration:2.4s]" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-lime-400 ring-2 ring-white" />
            </span>
          ) : null}
          {badgeLabel ? (
            <span
              className={`absolute left-2 top-2 rounded-full px-2 py-[3px] text-[11px] font-bold leading-none shadow-sm ${
                person.badge === "new" ? "bg-amber-400 text-white" : "bg-white/90 text-emerald-700"
              }`}
            >
              {person.badge === "new" ? null : (
                <span className={`mr-1 inline-block h-[6px] w-[6px] rounded-full align-middle ${person.badge === "online" ? "bg-emerald-500" : "bg-emerald-300"}`} />
              )}
              <span className="align-middle">{badgeLabel}</span>
            </span>
          ) : null}
        </span>
        <span className="block px-2.5 pb-2.5 pt-2" aria-hidden="true">
          <span className="flex min-w-0 items-center gap-1">
            {person.nationalityCountry ? (
              <FlagEmoji emoji={countryFlagEmoji(person.nationalityCountry)} className="shrink-0 text-[15px] leading-none" />
            ) : null}
            <span className="truncate text-[15px] font-semibold text-slate-900">{name}</span>
            {typeof person.age === "number" ? (
              <span className="shrink-0 text-[14px] text-gray-500">{person.age}</span>
            ) : null}
            {typeof person.heightCm === "number" ? (
              <span className="shrink-0 text-[12px] tabular-nums text-gray-400">{person.heightCm}cm</span>
            ) : null}
            <AccountBadge kind={accountBadge} locale={locale} tone="dark" />
          </span>
          {/* Same height on every card: the language row and two bio lines are kept even when empty. */}
          <span className="mt-1.5 block min-h-[26px]">
            {primary.length || interest.length ? (
              <CompactLanguageLevels primaryLanguages={primary} interestLanguages={interest} locale={locale} />
            ) : null}
          </span>
          <span className="mt-1.5 line-clamp-2 block h-[2.75em] text-[12.5px] leading-snug text-slate-600">{person.bio ?? ""}</span>
        </span>
      </button>
      {isOwn ? null : (
        // Follow and Message right on the card (no trip to the profile).
        <div className="flex items-center gap-1.5 px-2.5 pb-2.5">
          <button
            type="button"
            data-qa="home-card-follow"
            data-following={person.isFollowing ? "true" : "false"}
            onClick={() => onToggleFollow(person)}
            aria-pressed={person.isFollowing === true}
            className={`flex h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-full px-2 text-[13px] font-bold transition active:scale-[0.97] ${
              person.isFollowing ? "bg-gray-100 text-gray-600" : "bg-slate-900 text-white"
            }`}
          >
            {person.isFollowing ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : <UserPlus size={14} strokeWidth={2.4} aria-hidden="true" />}
            <span className="truncate">{person.isFollowing ? labels.following : labels.follow}</span>
          </button>
          <button
            type="button"
            data-qa="home-card-message"
            onClick={() => onMessage(person)}
            disabled={messagePending}
            aria-label={labels.message}
            title={labels.message}
            className="flex h-9 w-11 shrink-0 items-center justify-center rounded-full bg-amber-400 text-white transition active:scale-[0.97] disabled:opacity-60"
          >
            {messagePending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <MessageCircle size={17} strokeWidth={2.4} aria-hidden="true" />}
          </button>
        </div>
      )}
    </li>
  );
}
