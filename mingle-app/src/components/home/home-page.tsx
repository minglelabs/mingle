"use client";

import { Check, Loader2, MessageCircle, UserPlus, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import BottomTabBar from "@/components/bottom-tab-bar";
import MingleWordmark from "@/components/mingle-wordmark";
import FlagEmoji from "@/components/flag-emoji";
import HomeNoticeStrip from "@/components/home/home-notices";
import ProfileStartCard from "@/components/home/profile-start-card";
import { useAppAccess } from "@/components/onboarding/invite-gate";
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
import { resolveFirstRunCopy } from "@/i18n/first-run-copy";
import { clearSignedOutHere, isFirstSpeakPending } from "@/lib/first-run";
import { conversationsHref } from "@/lib/posting-feed-guard";
import { buildNativeAwareTabPath } from "@/lib/tab-navigation";
import { BOTTOM_TAB_BAR_HEIGHT_PX } from "@/components/bottom-tab-bar";
import { Mic } from "lucide-react";

const InviteGate = lazy(() => import("@/components/onboarding/invite-gate"));
const PhoneGate = lazy(() => import("@/components/onboarding/phone-gate"));
const BannedGate = lazy(() => import("@/components/onboarding/banned-gate"));

/** Pages kept for the session so coming back to the tab neither refetches nor jumps. */
const pageCache = new Map<string, DiscoveryPage>();

const MAX_LANGUAGES_ON_CARD = 2;

async function fetchDiscoveryPage(locale: string, cursor: string | null): Promise<DiscoveryPage> {
  const params = new URLSearchParams({ locale });
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(buildClientApiPath(`/users/discover?${params.toString()}`), { cache: "no-store" });
  if (!response.ok) throw new Error("people_discovery_failed");
  return parseDiscoveryPage(await response.json());
}

type HomePageProps = {
  dictionary: AppDictionary;
  locale: AppLocale;
};

/**
 * The home tab (docs/home-explore-rooms-plan.md): cards of people to talk to,
 * the other side of the language exchange first and whoever is online on top.
 * A card opens the person's profile. Above the cards sits the notice strip.
 * The required phone number, the invite gate and a permanent ban stop this
 * tab as they stop the chat list.
 */
export default function HomePage({ dictionary, locale }: HomePageProps) {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const viewerId = typeof session?.user?.id === "string" ? session.user.id.trim() : "";
  const copy = useMemo(() => resolveHomeCopy(locale), [locale]);
  const peopleCopy = useMemo(() => resolvePeopleDiscoveryCopy(locale), [locale]);
  const cacheKey = `${viewerId}:${locale}`;
  const [page, setPage] = useState<DiscoveryPage | null>(() => (viewerId ? pageCache.get(cacheKey) ?? null : null));
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { access: appAccess, setAccess: setAppAccess } = useAppAccess(sessionStatus === "authenticated", locale);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !viewerId) return;
    const cached = pageCache.get(cacheKey);
    if (cached && reloadKey === 0) {
      setPage(cached);
      return;
    }
    let cancelled = false;
    setFailed(false);
    void fetchDiscoveryPage(locale, null)
      .then((first) => {
        pageCache.set(cacheKey, first);
        if (!cancelled) setPage(first);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [cacheKey, locale, reloadKey, sessionStatus, viewerId]);

  const loadMore = useCallback(async () => {
    if (!page?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = mergeDiscoveryPage(page, await fetchDiscoveryPage(locale, page.nextCursor));
      pageCache.set(cacheKey, next);
      setPage(next);
    } catch {
      // What is on screen stays; scrolling to the end again retries.
    } finally {
      setLoadingMore(false);
    }
  }, [cacheKey, loadingMore, locale, page]);

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
    else if (result.kind === "failed") toast(actionLabels.failed);
  }, [actionLabels.failed, copy.dailyLimit, startDirectConversation]);

  const heading = page?.viewerSide === "korean" ? peopleCopy.headingForKorean : peopleCopy.headingForForeigner;
  const gated = sessionStatus === "authenticated" && appAccess && !appAccess.allowed;
  // A new account's "say something" card (see @/lib/first-run): read after mount so the first paint matches the server.
  const firstRunCopy = useMemo(() => resolveFirstRunCopy(locale), [locale]);
  const [firstSpeakPending, setFirstSpeakPending] = useState(false);
  useEffect(() => {
    // Home is on screen: the "go Home after sign-in" move is finished.
    clearSignedOutHere();
    const timer = window.setTimeout(() => setFirstSpeakPending(isFirstSpeakPending()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const showFirstSpeakCard = firstSpeakPending && sessionStatus === "authenticated" && !gated;
  const handleFirstSpeak = useCallback(() => {
    // buildNativeAwareTabPath keeps only the app shell's own params, so `firstSpeak` is added after it.
    const path = buildNativeAwareTabPath(conversationsHref(locale), new URLSearchParams(window.location.search), { skipConversationRestore: true, tabRoot: true });
    router.push(`${path}${path.includes("?") ? "&" : "?"}firstSpeak=1`);
  }, [locale, router]);

  return (
    <main className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-white" data-qa="home-tab">
      <header
        className="shrink-0 border-b border-gray-100 bg-white px-4 pb-2.5"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
      >
        <h1 className="flex items-center" aria-label="HashChat"><MingleWordmark /></h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={showFirstSpeakCard ? { paddingBottom: 150 } : undefined}>
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
          <p className="px-6 pt-20 text-center text-[15px] text-slate-600">{copy.empty}</p>
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
      {showFirstSpeakCard ? (
        // A new account's first try at speaking, offered among the people (it
        // used to be only on the Chats tab, where a new account landed).
        <div
          data-qa="home-first-speak-card"
          className="pointer-events-none absolute inset-x-0 z-20 px-4 pb-3"
          style={{ bottom: `calc(${BOTTOM_TAB_BAR_HEIGHT_PX}px + env(safe-area-inset-bottom, 0px))` }}
        >
          <div className="pointer-events-auto rounded-[1.6rem] border border-amber-200 bg-amber-50 px-5 pb-4 pt-4 text-center shadow-[0_16px_36px_rgba(245,158,11,0.18)]">
            <p className="text-[1.05rem] font-extrabold leading-snug tracking-[-0.02em] text-slate-950">{firstRunCopy.speakTitle}</p>
            <button
              type="button"
              data-qa="home-first-speak"
              onClick={handleFirstSpeak}
              className="mt-3 flex h-12 w-full items-center justify-center gap-2.5 rounded-full text-[1rem] font-bold text-white shadow-[0_12px_26px_rgba(245,158,11,0.3)] active:scale-[0.99]"
              style={{ backgroundImage: "linear-gradient(90deg, #f59e0b 0%, #f97316 100%)" }}
            >
              <Mic size={19} strokeWidth={2.4} aria-hidden />
              <span>{firstRunCopy.speakButton}</span>
            </button>
          </div>
        </div>
      ) : null}
      <BottomTabBar activeRoute="home" dictionary={dictionary} locale={locale} />
      {gated ? (
        <Suspense fallback={null}>
          {appAccess.reason === "banned"
            ? <BannedGate locale={locale} />
            : appAccess.reason === "needs_phone"
              ? <PhoneGate locale={locale} onAccess={setAppAccess} />
              : <InviteGate locale={locale} onAccess={setAppAccess} />}
        </Suspense>
      ) : null}
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
        className="block w-full flex-1 text-left transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80"
      >
        <span className="relative block aspect-square w-full overflow-hidden bg-gray-100" aria-hidden="true">
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
          {primary.length || interest.length ? (
            <CompactLanguageLevels primaryLanguages={primary} interestLanguages={interest} locale={locale} className="mt-1.5" />
          ) : null}
          {person.bio ? <span className="mt-1.5 line-clamp-2 block text-[12.5px] leading-snug text-slate-600">{person.bio}</span> : null}
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
