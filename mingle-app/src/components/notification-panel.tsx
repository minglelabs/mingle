"use client";

import type { AppDictionary, AppLocale } from "@/i18n";
import { resolveLegalDocumentLocale } from "@/i18n/config";
import { resolveNotificationCopy, type NotificationCopy } from "@/i18n/notification-copy";
import { buildClientApiPath } from "@/lib/api-contract";
import { formatHandle } from "@/lib/handles";
import SlideSurface from "@/components/slide-surface";
import { ArrowLeft, Check, Loader2, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type NotificationType =
  | "follow"
  | "post_like"
  | "comment_like"
  | "comment"
  | "comment_reply"
  | "report_resolved";

type NotificationPanelProps = {
  open: boolean;
  enabled: boolean;
  locale: AppLocale;
  dictionary: AppDictionary;
  nativeTopInsetPx?: number;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  /**
   * Open a post (and optionally its comment thread) for like/comment/reply
   * notifications. Omitted in contexts that only surface follows.
   */
  onOpenPost?: (postId: string, commentId: string | null) => void;
  onUnreadCountChange?: (count: number) => void;
};

type NotificationActor = {
  id: string;
  handle: string | null;
  name: string | null;
  image: string | null;
};

type NotificationRecord = {
  id: string;
  type: NotificationType;
  postId: string | null;
  commentId: string | null;
  isRead: boolean;
  createdAt: string;
  actors: NotificationActor[];
  actorCount: number;
  isFollowing: boolean;
};

const NOTIFICATION_TYPES: ReadonlySet<string> = new Set([
  "follow",
  "post_like",
  "comment_like",
  "comment",
  "comment_reply",
  "report_resolved",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseActor(value: unknown): NotificationActor | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    handle: nullableString(value.handle),
    name: nullableString(value.name),
    image: nullableString(value.image),
  };
}

function parseNotification(value: unknown): NotificationRecord | null {
  if (!isRecord(value)) return null;
  if (typeof value.type !== "string" || !NOTIFICATION_TYPES.has(value.type)) return null;
  if (typeof value.id !== "string" || typeof value.createdAt !== "string") return null;

  // Support the grouped `actors` array, and fall back to a single `actor`.
  const rawActors = Array.isArray(value.actors)
    ? value.actors
    : isRecord(value.actor)
      ? [value.actor]
      : [];
  const actors = rawActors
    .map(parseActor)
    .filter((actor): actor is NotificationActor => actor !== null);

  // report_resolved has no meaningful actor; every other type needs one.
  if (actors.length === 0 && value.type !== "report_resolved") return null;

  const actorCount = typeof value.actorCount === "number" && value.actorCount > 0
    ? value.actorCount
    : Math.max(actors.length, 1);

  return {
    id: value.id,
    type: value.type as NotificationType,
    postId: nullableString(value.postId),
    commentId: nullableString(value.commentId),
    isRead: value.isRead === true,
    createdAt: value.createdAt,
    actors,
    actorCount,
    isFollowing: value.isFollowing === true,
  };
}

function formatNotificationTime(
  isoTimestamp: string,
  locale: AppLocale,
  copy: Pick<NotificationCopy, "justNow" | "minutesAgo" | "hoursAgo">,
): string {
  const timestamp = new Date(isoTimestamp);
  if (Number.isNaN(timestamp.getTime())) return "";

  const elapsedMs = Math.max(0, Date.now() - timestamp.getTime());
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  const elapsedHours = Math.floor(elapsedMs / 3_600_000);

  if (elapsedMinutes < 1) return copy.justNow;
  if (elapsedMinutes < 60) return copy.minutesAgo.replace("{count}", String(elapsedMinutes));
  if (elapsedHours < 24) return copy.hoursAgo.replace("{count}", String(elapsedHours));

  try {
    return new Intl.DateTimeFormat(resolveLegalDocumentLocale(locale), {
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(timestamp);
  } catch {
    return timestamp.toLocaleDateString();
  }
}

function NotificationAvatar({
  image,
  label,
}: {
  image: string | null;
  label: string;
}) {
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={label} className="h-full w-full object-cover" />
      ) : (
        <UserRound size={24} className="text-gray-400" aria-hidden="true" />
      )}
    </div>
  );
}

export default function NotificationPanel({
  open,
  enabled,
  locale,
  dictionary,
  nativeTopInsetPx = 0,
  onClose,
  onOpenProfile,
  onOpenPost,
  onUnreadCountChange,
}: NotificationPanelProps) {
  const copy = useMemo(() => resolveNotificationCopy(locale), [locale]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [pendingFollowIds, setPendingFollowIds] = useState<Set<string>>(() => new Set());
  const [followErrorId, setFollowErrorId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const updateUnreadCount = useCallback((nextCount: number) => {
    const normalizedCount = Math.max(0, Math.floor(nextCount));
    setUnreadCount(normalizedCount);
    onUnreadCountChange?.(normalizedCount);
  }, [onUnreadCountChange]);

  const markAllNotificationsAsRead = useCallback(() => {
    setNotifications((current) => current.map((notification) => (
      notification.isRead ? notification : { ...notification, isRead: true }
    )));
    updateUnreadCount(0);
    void fetch(buildClientApiPath("/notifications"), {
      method: "PATCH",
    }).catch(() => {
      // The panel remains optimistically read; the next refresh reconciles it.
    });
  }, [updateUnreadCount]);

  const loadNotifications = useCallback(async (): Promise<{ unreadCount: number } | null> => {
    if (!enabled || !open) return null;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsLoading(true);
    setLoadError(false);

    try {
      const response = await fetch(buildClientApiPath("/notifications?limit=50"), {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("notifications_load_failed");

      const payload = await response.json() as {
        notifications?: unknown;
        unreadCount?: unknown;
      };
      const nextNotifications = Array.isArray(payload.notifications)
        ? payload.notifications.map(parseNotification).filter((item): item is NotificationRecord => item !== null)
        : [];
      const nextUnreadCount = typeof payload.unreadCount === "number"
        ? payload.unreadCount
        : nextNotifications.filter((item) => !item.isRead).length;

      setNotifications(nextNotifications);
      updateUnreadCount(nextUnreadCount);
      setHasLoaded(true);
      return { unreadCount: nextUnreadCount };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return null;
      setLoadError(true);
      return null;
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [enabled, open, updateUnreadCount]);

  useEffect(() => {
    if (!enabled || !open) {
      abortControllerRef.current?.abort();
      if (!enabled) {
        setNotifications([]);
        setHasLoaded(false);
        setLoadError(false);
        updateUnreadCount(0);
      }
      return;
    }

    let isCurrent = true;
    // Entry marks everything that had arrived by now as read, regardless of
    // whether the row is ever scrolled into view or tapped.
    void loadNotifications().then((result) => {
      if (!isCurrent || !result || result.unreadCount <= 0) return;
      markAllNotificationsAsRead();
    });
    return () => {
      isCurrent = false;
      abortControllerRef.current?.abort();
    };
  }, [enabled, loadNotifications, markAllNotificationsAsRead, open, updateUnreadCount]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  const handleOpenNotification = useCallback((notification: NotificationRecord) => {
    const primaryActor = notification.actors[0] ?? null;
    switch (notification.type) {
      case "follow":
        if (primaryActor) onOpenProfile(primaryActor.handle || primaryActor.id);
        return;
      case "post_like":
        if (notification.postId) onOpenPost?.(notification.postId, null);
        return;
      case "comment":
      case "comment_reply":
      case "comment_like":
        if (notification.postId) onOpenPost?.(notification.postId, notification.commentId);
        return;
      case "report_resolved":
        // Read-only: entry already marked it read, no navigation.
        return;
    }
  }, [onOpenPost, onOpenProfile]);

  const handleFollowBack = useCallback(async (notification: NotificationRecord) => {
    const actor = notification.actors[0];
    if (!actor || notification.isFollowing || pendingFollowIds.has(notification.id)) return;

    setFollowErrorId(null);
    setPendingFollowIds((current) => new Set(current).add(notification.id));
    try {
      const response = await fetch(
        buildClientApiPath(`/users/${encodeURIComponent(actor.id)}/follow`),
        { method: "POST" },
      );
      if (!response.ok) throw new Error("follow_failed");

      setNotifications((current) => current.map((item) => (
        item.id === notification.id ? { ...item, isFollowing: true } : item
      )));
    } catch {
      setFollowErrorId(notification.id);
    } finally {
      setPendingFollowIds((current) => {
        const next = new Set(current);
        next.delete(notification.id);
        return next;
      });
    }
  }, [pendingFollowIds]);

  const unreadNotifications = notifications.filter((notification) => !notification.isRead);
  const readNotifications = notifications.filter((notification) => notification.isRead);

  const resolveActorName = useCallback((actor: NotificationActor | null): string => {
    if (!actor) return dictionary.connect.userFallbackLabel ?? "Mingle user";
    return actor.name
      || (actor.handle ? formatHandle(actor.handle) : (dictionary.connect.userFallbackLabel ?? "Mingle user"));
  }, [dictionary.connect.userFallbackLabel]);

  const resolveMessage = useCallback((notification: NotificationRecord): string => {
    switch (notification.type) {
      case "follow": return copy.followMessage;
      case "post_like": return copy.postLikeMessage;
      case "comment_like": return copy.commentLikeMessage;
      case "comment": return copy.commentMessage;
      case "comment_reply": return copy.replyMessage;
      case "report_resolved": return copy.reportResolvedMessage;
    }
  }, [copy]);

  const renderNotification = (notification: NotificationRecord) => {
    const primaryActor = notification.actors[0] ?? null;
    const actorName = resolveActorName(primaryActor);
    const actorHandle = primaryActor?.handle ? formatHandle(primaryActor.handle) : "";
    const isPending = pendingFollowIds.has(notification.id);
    const message = resolveMessage(notification);
    const isFollow = notification.type === "follow";
    const isReportResolved = notification.type === "report_resolved";
    // Grouped likes: "A and N others liked …". others = distinct actors - 1.
    const groupedSuffix = notification.actorCount > 1
      ? ` ${copy.andOthers.replace("{count}", String(notification.actorCount - 1))}`
      : "";

    const label = isReportResolved
      ? message
      : `${actorName}${groupedSuffix} ${message}`;

    return (
      <li
        key={notification.id}
        className={`border-b border-gray-100 px-4 py-3 ${notification.isRead ? "bg-white" : "bg-amber-50/60"}`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => handleOpenNotification(notification)}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left transition active:bg-gray-100"
            aria-label={label}
          >
            {isReportResolved ? (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100">
                <Check size={22} className="text-slate-500" aria-hidden="true" />
              </div>
            ) : (
              <NotificationAvatar image={primaryActor?.image ?? null} label={actorName} />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] leading-5 text-slate-900">
                {isReportResolved ? (
                  <span>{message}</span>
                ) : (
                  <>
                    <strong className="font-semibold">{actorName}</strong>
                    {groupedSuffix ? <span>{groupedSuffix}</span> : null}{" "}
                    <span>{message}</span>
                  </>
                )}
              </span>
              <span className="mt-0.5 block truncate text-[12px] text-gray-500">
                {actorHandle || "\u00A0"}
                {actorHandle ? " · " : ""}
                {formatNotificationTime(notification.createdAt, locale, copy)}
              </span>
            </span>
          </button>

          {isFollow && primaryActor ? (
            <button
              type="button"
              onClick={() => void handleFollowBack(notification)}
              disabled={notification.isFollowing || isPending}
              className={`min-h-9 shrink-0 rounded-full px-3 text-[12px] font-semibold transition ${
                notification.isFollowing
                  ? "bg-gray-100 text-gray-500"
                  : "bg-slate-900 text-white active:bg-slate-700 disabled:opacity-60"
              }`}
              aria-label={notification.isFollowing ? copy.followingAction : copy.followBackAction}
            >
              {isPending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
              {!isPending && notification.isFollowing ? <Check size={14} className="mr-1 inline" aria-hidden="true" /> : null}
              {isPending ? <span className="sr-only">{copy.followBackAction}</span> : null}
              {!isPending ? (notification.isFollowing ? copy.followingAction : copy.followBackAction) : null}
            </button>
          ) : null}
        </div>
        {followErrorId === notification.id ? (
          <p className="mt-1 pl-[60px] text-[12px] text-red-500" role="alert">{copy.followError}</p>
        ) : null}
      </li>
    );
  };
  void unreadCount;

  return (
    <SlideSurface
      open={open}
      onClose={onClose}
      ariaLabel={copy.title}
      className="fixed inset-0 z-[100] flex min-h-0 w-full flex-col bg-white text-slate-950 shadow-2xl"
      style={{ touchAction: "pan-y" }}
    >
            <header
              className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-4"
              style={{
                paddingTop: "env(safe-area-inset-top, 44px)",
                height: "calc(56px + env(safe-area-inset-top, 44px))",
              }}
            >
              <button
                type="button"
                onClick={onClose}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full transition active:bg-gray-100"
                aria-label={copy.closeAction}
              >
                <ArrowLeft size={22} strokeWidth={2} aria-hidden="true" />
              </button>
              <h1 className="truncate text-[17px] font-bold text-slate-900">{copy.title}</h1>
              {isLoading ? <Loader2 size={17} className="ml-auto animate-spin text-gray-400" aria-label={copy.loadingLabel} /> : null}
            </header>

            <div
              className="min-h-0 flex-1 overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
              style={{
                paddingTop: nativeTopInsetPx > 0 ? `${Math.round(nativeTopInsetPx)}px` : undefined,
              }}
            >
              {loadError && !hasLoaded ? (
                <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                  <p className="text-[14px] text-gray-500" role="alert">{copy.loadError}</p>
                  <button
                    type="button"
                    onClick={() => void loadNotifications()}
                    className="rounded-full bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white"
                  >
                    {copy.retryAction}
                  </button>
                </div>
              ) : isLoading && !hasLoaded ? (
                <div className="flex flex-col items-center gap-3 py-16 text-gray-400" aria-live="polite">
                  <Loader2 size={24} className="animate-spin" aria-hidden="true" />
                  <span className="text-[13px]">{copy.loadingLabel}</span>
                </div>
              ) : notifications.length === 0 ? (
                <p className="px-6 py-16 text-center text-[14px] text-gray-400">{copy.emptyLabel}</p>
              ) : (
                <div>
                  {unreadNotifications.length > 0 ? (
                    <section>
                      <h2 className="px-4 pb-2 pt-4 text-[12px] font-semibold tracking-[0.08em] text-gray-500">
                        {copy.unreadSectionLabel}
                      </h2>
                      <ul>{unreadNotifications.map(renderNotification)}</ul>
                    </section>
                  ) : null}
                  {readNotifications.length > 0 ? (
                    <section>
                      <h2 className="px-4 pb-2 pt-4 text-[12px] font-semibold tracking-[0.08em] text-gray-500">
                        {copy.readSectionLabel}
                      </h2>
                      <ul>{readNotifications.map(renderNotification)}</ul>
                    </section>
                  ) : null}
                </div>
              )}
            </div>
    </SlideSurface>
  );
}
