"use client";

import type { AppDictionary, AppLocale } from "@/i18n";
import { buildClientApiPath } from "@/lib/api-contract";
import { isLeftEdgeSwipeStart } from "@/lib/edge-swipe";
import { formatHandle } from "@/lib/handles";
import SlideSurface from "@/components/slide-surface";
import { Check, ChevronLeft, Loader2, Search, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";

export type FollowListTab = "followers" | "following";

type FollowListScreenProps = {
  dictionary: AppDictionary;
  locale: AppLocale;
  initialQuery: string;
  initialTab: FollowListTab;
  open?: boolean;
  onClose?: () => void;
  onOpenProfile?: (userId: string) => void;
};

type FollowListUser = {
  id: string;
  handle: string | null;
  name: string | null;
  image: string | null;
  isFollowing: boolean;
  isFollowedBy: boolean;
};

function replaceFollowListSearchParams(updates: Record<string, string | null>): void {
  if (typeof window === "undefined") return;

  try {
    const nextUrl = new URL(window.location.href);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) nextUrl.searchParams.set(key, value);
      else nextUrl.searchParams.delete(key);
    });
    window.history.replaceState(window.history.state, "", nextUrl.toString());
  } catch {
    // Search state is a convenience; navigation remains usable if history is unavailable.
  }
}

export default function FollowListScreen({
  dictionary,
  locale,
  initialQuery,
  initialTab,
  open = true,
  onClose,
  onOpenProfile,
}: FollowListScreenProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  // isEdge: true → 엣지 스와이프(뒤로가기), false → 탭 전환 스와이프
  const touchStartRef = useRef<{ x: number; y: number; isEdge: boolean } | null>(null);
  const requestSequenceRef = useRef(0);
  const [activeTab, setActiveTab] = useState<FollowListTab>(initialTab);
  const [query, setQuery] = useState(initialQuery);
  const [users, setUsers] = useState<FollowListUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(1);
  const [pendingFollowIds, setPendingFollowIds] = useState<Set<string>>(() => new Set());
  const [followErrorId, setFollowErrorId] = useState<string | null>(null);

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
    follow: dictionary.connect.followAction ?? (locale === "ko" ? "팔로우" : "Follow"),
    followError: dictionary.connect.followError ?? (locale === "ko" ? "팔로우하지 못했습니다." : "Could not follow this user."),
    mutual: dictionary.profile.mutualFollowLabel ?? (locale === "ko" ? "맞팔" : "Mutual"),
  }), [dictionary, locale]);

  const activeLabel = labels[activeTab];
  const normalizedQuery = query.trim();

  const navigateBack = useCallback(() => {
    if (onClose) {
      onClose();
      return;
    }
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push(`/${locale}/mypage`);
  }, [locale, onClose, router]);

  const handleTouchStart = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) {
      touchStartRef.current = null;
      return;
    }

    const localClientX = touch.clientX - event.currentTarget.getBoundingClientRect().left;
    const isEdge = isLeftEdgeSwipeStart(localClientX);
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, isEdge };
  }, []);

  const handleTouchEnd = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = Math.abs(touch.clientY - start.y);

    // 수직 스크롤이 우세하면 제스처 무시
    if (deltaY > Math.abs(deltaX) * 0.8) return;

    if (start.isEdge) {
      // SlideSurface owns the shared edge dismissal gesture.
      return;
    } else {
      // 일반 수평 스와이프 → 탭 전환
      const tabSwipeThreshold = Math.max(40, viewportWidth * 0.12);
      if (Math.abs(deltaX) >= tabSwipeThreshold && Math.abs(deltaX) > deltaY * 1.2) {
        if (deltaX < 0 && activeTab === "followers") {
          // 왼쪽으로 스와이프 → 팔로잉 탭으로
          setActiveTab("following");
          setIsLoading(true);
          setLoadError(false);
          replaceFollowListSearchParams({ tab: "following" });
        } else if (deltaX > 0 && activeTab === "following") {
          // 오른쪽으로 스와이프 → 팔로워 탭으로
          setActiveTab("followers");
          setIsLoading(true);
          setLoadError(false);
          replaceFollowListSearchParams({ tab: "followers" });
        }
      }
    }
  }, [activeTab, viewportWidth]);

  const handleTabChange = useCallback((nextTab: FollowListTab) => {
    setActiveTab(nextTab);
    setIsLoading(true);
    setLoadError(false);
    replaceFollowListSearchParams({ tab: nextTab });
  }, []);

  const handleQueryChange = useCallback((nextQuery: string) => {
    setQuery(nextQuery);
    setIsLoading(true);
    setLoadError(false);
    replaceFollowListSearchParams({ q: nextQuery.trim() || null });
  }, []);

  const handleFollow = useCallback(async (user: FollowListUser) => {
    if (user.isFollowing || pendingFollowIds.has(user.id)) return;

    setFollowErrorId(null);
    setPendingFollowIds((current) => new Set(current).add(user.id));
    try {
      const response = await fetch(
        buildClientApiPath(`/users/${encodeURIComponent(user.id)}/follow`),
        { method: "POST", cache: "no-store" },
      );
      if (!response.ok) throw new Error("follow_failed");
      const payload = await response.json() as { isFollowing?: unknown };
      const isFollowing = payload.isFollowing !== false;
      setUsers((current) => current.map((candidate) => (
        candidate.id === user.id
          ? { ...candidate, isFollowing, isFollowedBy: true }
          : candidate
      )));
    } catch {
      setFollowErrorId(user.id);
    } finally {
      setPendingFollowIds((current) => {
        const next = new Set(current);
        next.delete(user.id);
        return next;
      });
    }
  }, [pendingFollowIds]);

  useEffect(() => {
    const syncViewportWidth = () => setViewportWidth(Math.max(1, window.innerWidth));
    syncViewportWidth();
    window.addEventListener("resize", syncViewportWidth);
    void router.prefetch(`/${locale}/mypage`);

    return () => {
      window.removeEventListener("resize", syncViewportWidth);
    };
  }, [locale, router]);

  useEffect(() => {
    if (!open) return;
    const requestSequence = ++requestSequenceRef.current;

    const timeoutId = window.setTimeout(() => {
      void fetch(buildClientApiPath(`/profile/${activeTab}?q=${encodeURIComponent(normalizedQuery)}`), {
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("follow_list_load_failed");
          return response.json() as Promise<{ users?: FollowListUser[] }>;
        })
        .then((payload) => {
          if (requestSequenceRef.current !== requestSequence) return;
          setUsers(Array.isArray(payload.users) ? payload.users : []);
        })
        .catch(() => {
          if (requestSequenceRef.current !== requestSequence) return;
          setUsers([]);
          setLoadError(true);
        })
        .finally(() => {
          if (requestSequenceRef.current === requestSequence) {
            setIsLoading(false);
          }
        });
    }, 220);

    return () => window.clearTimeout(timeoutId);
  }, [activeTab, normalizedQuery, open]);

  return (
    <SlideSurface
      open={open}
      onClose={navigateBack}
      ariaLabel={activeLabel}
      className="fixed inset-0 z-[100] flex min-h-0 w-full flex-col overflow-hidden bg-white text-slate-950"
      style={{ touchAction: "pan-y" }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => {
        touchStartRef.current = null;
      }}
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
            onClick={navigateBack}
            className="flex h-10 w-10 items-center justify-center rounded-full transition active:bg-gray-100"
            aria-label={labels.back}
          >
            <ChevronLeft size={25} strokeWidth={2.1} aria-hidden="true" />
          </button>
          <h1 className="truncate text-center text-[17px] font-bold">{activeLabel}</h1>
          <div aria-hidden="true" />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto pb-8">
          <div className="border-b border-gray-100 px-4 pt-3">
            <div className="flex rounded-xl bg-gray-50 p-1" role="tablist" aria-label={`${labels.followers} / ${labels.following}`}>
              {(["followers", "following"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => handleTabChange(tab)}
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
                onChange={(event) => handleQueryChange(event.target.value)}
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
                    handleQueryChange("");
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
              {locale === "ko" ? `${activeLabel}가 없습니다.` : `No ${activeLabel.toLowerCase()} yet.`}
            </p>
          ) : (
            <ul className="border-t border-gray-100">
              {users.map((user) => {
                const name = user.name?.trim() || labels.userFallback;
                const profileHref = `/${locale}/users/${encodeURIComponent(user.id)}`;
                const isMutual = activeTab === "followers"
                  ? user.isFollowing
                  : user.isFollowedBy;
                const isPending = pendingFollowIds.has(user.id);
                return (
                  <li key={user.id} className="border-b border-gray-100 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Link
                        href={profileHref}
                        onClick={(event) => {
                          if (!onOpenProfile) return;
                          event.preventDefault();
                          onOpenProfile(user.id);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left transition active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80"
                        aria-label={user.handle ? `${name}, ${formatHandle(user.handle)}` : name}
                      >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100">
                          {user.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={user.image} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <UserRound size={24} className="text-gray-400" aria-hidden="true" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-semibold text-slate-900">{name}</p>
                          {user.handle ? <p className="truncate text-[13px] text-gray-500">{formatHandle(user.handle)}</p> : null}
                        </div>
                      </Link>

                      {activeTab === "followers" && !user.isFollowing ? (
                        <button
                          type="button"
                          onClick={() => void handleFollow(user)}
                          disabled={isPending}
                          className="shrink-0 rounded-full bg-amber-500 px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-amber-600 disabled:cursor-wait disabled:opacity-60"
                          aria-label={`${name} ${labels.follow}`}
                        >
                          {isPending ? "…" : labels.follow}
                        </button>
                      ) : isMutual ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-emerald-600">
                          <Check size={14} strokeWidth={2.5} aria-hidden="true" />
                          <span>{labels.mutual}</span>
                        </span>
                      ) : null}
                    </div>
                    {followErrorId === user.id ? (
                      <p className="mt-1 pl-14 text-[12px] text-red-500" role="alert">{labels.followError}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
    </SlideSurface>
  );
}
