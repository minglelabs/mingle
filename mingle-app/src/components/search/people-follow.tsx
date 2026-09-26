"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { UserRound } from "lucide-react";
import { buildClientApiPath, clientApiNamespace } from "@/lib/api-contract";
import { getOrCreateTrackingUserId } from "@/components/LivePhoneDemo/realtime-storage";
import { captureMingleClientEvent } from "@/lib/posthog-client";
import { buildSearchAnalyticsProperties, digestAnalyticsValue, type SearchAnalyticsProperties } from "@/lib/search-analytics";
import { formatHandle } from "@/lib/handles";
import { buildProfileImageTransform } from "@/lib/profile-image-crop";
import type { ConnectSearchResult } from "@/components/connect-search-cache";
import OfficialBadge from "@/components/posts/official-badge";

/** Request headers the legacy connect search sent, for PostHog attribution. */
export function buildConnectTrackingHeaders(): Record<string, string> {
  const clientPlatform = clientApiNamespace.startsWith("android/")
    ? "android"
    : clientApiNamespace.startsWith("ios/")
      ? "ios"
      : "web";
  return {
    "x-mingle-user-id": getOrCreateTrackingUserId(),
    "x-mingle-api-namespace": clientApiNamespace,
    "x-mingle-client-platform": clientPlatform,
  };
}

export type PeopleSearchContext = {
  query: string;
  sequence: number;
  properties: SearchAnalyticsProperties;
} | null;

/**
 * The inline follow toggle for a people search row, shared by the unified
 * search preview and the full "see all" list so both behave identically and
 * emit the same `mingle_connect_follow_clicked` / `_completed` events as the
 * legacy connect search. Optimistic with rollback; the follow API exists on
 * every namespace, so no rollout gate is applied.
 */
export function usePeopleFollow(
  setPeople: React.Dispatch<React.SetStateAction<ConnectSearchResult[]>>,
  getSearchContext: () => PeopleSearchContext,
) {
  const [followInFlightIds, setFollowInFlightIds] = useState<Set<string>>(new Set());
  const [followError, setFollowError] = useState(false);
  const peopleCountRef = useRef(0);

  const toggleFollow = useCallback(async (user: ConnectSearchResult, resultIndex: number, resultCount: number) => {
    if (followInFlightIds.has(user.id)) return;

    const nextIsFollowing = !user.isFollowing;
    const searchContext = getSearchContext();
    const followStartedAt = performance.now();

    setFollowError(false);
    setFollowInFlightIds((current) => new Set(current).add(user.id));
    setPeople((current) => current.map((candidate) => (
      candidate.id === user.id ? { ...candidate, isFollowing: nextIsFollowing } : candidate
    )));

    try {
      const [targetUserDigest, searchProperties] = await Promise.all([
        digestAnalyticsValue(user.id),
        searchContext?.properties
          ? Promise.resolve(searchContext.properties)
          : buildSearchAnalyticsProperties(searchContext?.query ?? ""),
      ]);
      captureMingleClientEvent("mingle_connect_follow_clicked", {
        action: nextIsFollowing ? "follow" : "unfollow",
        target_user_digest: targetUserDigest,
        result_index: resultIndex >= 0 ? resultIndex : null,
        result_count: resultCount,
        search_sequence: searchContext?.sequence ?? 0,
        has_search_context: Boolean(searchContext),
        ...searchProperties,
      });

      const response = await fetch(
        buildClientApiPath(`/users/${encodeURIComponent(user.id)}/follow`),
        { method: nextIsFollowing ? "POST" : "DELETE", headers: buildConnectTrackingHeaders() },
      );
      if (!response.ok) throw new Error("follow_update_failed");
      captureMingleClientEvent("mingle_connect_follow_completed", {
        action: nextIsFollowing ? "follow" : "unfollow",
        target_user_digest: targetUserDigest,
        success: true,
        http_status: response.status,
        duration_ms: Math.max(0, Math.round(performance.now() - followStartedAt)),
      });
    } catch {
      captureMingleClientEvent("mingle_connect_follow_completed", {
        action: nextIsFollowing ? "follow" : "unfollow",
        success: false,
        duration_ms: Math.max(0, Math.round(performance.now() - followStartedAt)),
      });
      setFollowError(true);
      setPeople((current) => current.map((candidate) => (
        candidate.id === user.id ? { ...candidate, isFollowing: user.isFollowing } : candidate
      )));
    } finally {
      setFollowInFlightIds((current) => {
        const next = new Set(current);
        next.delete(user.id);
        return next;
      });
    }
  }, [followInFlightIds, getSearchContext, setPeople]);

  return { followInFlightIds, followError, toggleFollow, peopleCountRef };
}

export type PersonRowLabels = {
  userFallback: string;
  follow: string;
  following: string;
};

export function PersonRow({
  person,
  labels,
  onOpen,
  canFollow,
  isFollowPending,
  onToggleFollow,
  className = "px-4 py-2.5",
  trailing,
  locale,
}: {
  /** `isOfficial` rides along from `/api/users/search` (absent means false). */
  person: ConnectSearchResult & { isOfficial?: boolean };
  labels: PersonRowLabels;
  onOpen: (userId: string) => void;
  canFollow: boolean;
  isFollowPending: boolean;
  onToggleFollow: () => void;
  className?: string;
  trailing?: ReactNode;
  /** UI locale for the official-account badge label. */
  locale: string;
}) {
  const profileName = person.name?.trim() || "";
  const rawHandle = person.handle?.trim() || "";
  const formattedHandle = formatHandle(rawHandle);
  const name = profileName || rawHandle || labels.userFallback;
  const showHandle = Boolean(formattedHandle && profileName
    && profileName.replace(/^@/, "").toLocaleLowerCase() !== rawHandle.toLocaleLowerCase());

  return (
    <li className={className}>
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => onOpen(person.id)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left transition active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80"
          aria-label={showHandle ? `${name}, ${formattedHandle}` : name}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100">
            {person.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={person.image}
                alt=""
                className="h-full w-full object-cover"
                style={{ transform: buildProfileImageTransform(44, {
                  scale: person.imageCropScale,
                  x: person.imageCropX,
                  y: person.imageCropY,
                }) }}
              />
            ) : (
              <UserRound size={24} className="text-gray-400" aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-1">
              <span className="block truncate text-[15px] font-semibold text-slate-900">{name}</span>
              {person.isOfficial === true ? <OfficialBadge locale={locale} tone="dark" /> : null}
            </span>
            {showHandle ? <span className="block truncate text-[13px] text-gray-500">{formattedHandle}</span> : null}
          </span>
        </button>
        {trailing ?? (canFollow ? (
          <button
            type="button"
            onClick={onToggleFollow}
            disabled={isFollowPending}
            aria-busy={isFollowPending}
            aria-pressed={person.isFollowing}
            className={`ml-auto flex h-10 min-w-[4.5rem] shrink-0 items-center justify-center rounded-lg border px-3 text-center text-[13px] font-semibold transition-colors active:opacity-70 disabled:cursor-wait disabled:opacity-50 ${
              person.isFollowing
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-gray-200 bg-white text-slate-800"
            }`}
          >
            {isFollowPending ? "…" : person.isFollowing ? labels.following : labels.follow}
          </button>
        ) : null)}
      </div>
    </li>
  );
}
