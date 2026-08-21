"use client";

import type { AppDictionary, AppLocale } from "@/i18n";
import { getConversationDictionary } from "@/i18n/conversations";
import { buildClientApiPath } from "@/lib/api-contract";
import { formatHandle } from "@/lib/handles";
import SlideSurface from "@/components/slide-surface";
import { ArrowLeft, Check, Loader2, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type NotificationPanelProps = {
  open: boolean;
  enabled: boolean;
  locale: AppLocale;
  dictionary: AppDictionary;
  nativeTopInsetPx?: number;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  onUnreadCountChange?: (count: number) => void;
};

type NotificationRecord = {
  id: string;
  type: "follow";
  isRead: boolean;
  createdAt: string;
  actor: {
    id: string;
    handle: string | null;
    name: string | null;
    image: string | null;
  };
  isFollowing: boolean;
};

type NotificationCopy = {
  buttonLabel: string;
  title: string;
  closeAction: string;
  loadingLabel: string;
  emptyLabel: string;
  unreadSectionLabel: string;
  readSectionLabel: string;
  followMessage: string;
  followBackAction: string;
  followingAction: string;
  loadError: string;
  followError: string;
};

function getNotificationCopy(dictionary: AppDictionary, locale: AppLocale): NotificationCopy {
  const copy = getConversationDictionary(locale, dictionary);
  const isKorean = locale === "ko";

  return {
    buttonLabel: copy.notificationsButtonLabel ?? (isKorean ? "알림" : "Notifications"),
    title: copy.notificationsTitle ?? (isKorean ? "알림" : "Notifications"),
    closeAction: copy.notificationsCloseAction ?? (isKorean ? "알림 닫기" : "Close notifications"),
    loadingLabel: copy.notificationsLoadingLabel ?? (isKorean ? "알림을 불러오는 중" : "Loading notifications"),
    emptyLabel: copy.notificationsEmptyLabel ?? (isKorean ? "아직 알림이 없어요" : "No notifications yet"),
    unreadSectionLabel: copy.notificationsUnreadSectionLabel ?? (isKorean ? "읽지 않음" : "Unread"),
    readSectionLabel: copy.notificationsReadSectionLabel ?? (isKorean ? "읽음" : "Read"),
    followMessage: copy.notificationsFollowMessage ?? (isKorean ? "님이 회원님을 팔로우했습니다." : "followed you."),
    followBackAction: copy.notificationsFollowBackAction ?? (isKorean ? "맞팔로우" : "Follow back"),
    followingAction: copy.notificationsFollowingAction ?? (isKorean ? "팔로잉" : "Following"),
    loadError: copy.notificationsLoadError ?? (isKorean ? "알림을 불러오지 못했습니다." : "Could not load notifications."),
    followError: copy.notificationsFollowError ?? (isKorean ? "팔로우하지 못했습니다." : "Could not follow this user."),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseNotification(value: unknown): NotificationRecord | null {
  if (!isRecord(value) || value.type !== "follow") return null;
  if (typeof value.id !== "string" || typeof value.createdAt !== "string") return null;
  if (!isRecord(value.actor) || typeof value.actor.id !== "string") return null;

  return {
    id: value.id,
    type: "follow",
    isRead: value.isRead === true,
    createdAt: value.createdAt,
    actor: {
      id: value.actor.id,
      handle: nullableString(value.actor.handle),
      name: nullableString(value.actor.name),
      image: nullableString(value.actor.image),
    },
    isFollowing: value.isFollowing === true,
  };
}

function formatNotificationTime(isoTimestamp: string, locale: AppLocale): string {
  const timestamp = new Date(isoTimestamp);
  if (Number.isNaN(timestamp.getTime())) return "";

  const elapsedMs = Math.max(0, Date.now() - timestamp.getTime());
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  const elapsedHours = Math.floor(elapsedMs / 3_600_000);

  if (locale === "ko") {
    if (elapsedMinutes < 1) return "방금 전";
    if (elapsedMinutes < 60) return `${elapsedMinutes}분 전`;
    if (elapsedHours < 24) return `${elapsedHours}시간 전`;
  } else {
    if (elapsedMinutes < 1) return "Just now";
    if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
    if (elapsedHours < 24) return `${elapsedHours}h ago`;
  }

  try {
    return new Intl.DateTimeFormat(locale, {
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
  onUnreadCountChange,
}: NotificationPanelProps) {
  const copy = useMemo(() => getNotificationCopy(dictionary, locale), [dictionary, locale]);
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
      const nextUnreadCount = typeof payload.unreadCount === "number" ? payload.unreadCount : 0;

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

  const markAsRead = useCallback((notification: NotificationRecord) => {
    if (notification.isRead) return;

    setNotifications((current) => current.map((item) => (
      item.id === notification.id ? { ...item, isRead: true } : item
    )));
    updateUnreadCount(unreadCount - 1);
    void fetch(buildClientApiPath(`/notifications/${encodeURIComponent(notification.id)}`), {
      method: "PATCH",
    }).catch(() => {
      // The row remains optimistically read; the next refresh reconciles it.
    });
  }, [unreadCount, updateUnreadCount]);

  const handleOpenNotification = useCallback((notification: NotificationRecord) => {
    markAsRead(notification);
    onOpenProfile(notification.actor.handle || notification.actor.id);
  }, [markAsRead, onOpenProfile]);

  const handleFollowBack = useCallback(async (notification: NotificationRecord) => {
    if (notification.isFollowing || pendingFollowIds.has(notification.id)) return;

    setFollowErrorId(null);
    setPendingFollowIds((current) => new Set(current).add(notification.id));
    try {
      const response = await fetch(
        buildClientApiPath(`/users/${encodeURIComponent(notification.actor.id)}/follow`),
        { method: "POST" },
      );
      if (!response.ok) throw new Error("follow_failed");

      setNotifications((current) => current.map((item) => (
        item.id === notification.id ? { ...item, isFollowing: true, isRead: true } : item
      )));
      if (!notification.isRead) updateUnreadCount(unreadCount - 1);
      void fetch(buildClientApiPath(`/notifications/${encodeURIComponent(notification.id)}`), {
        method: "PATCH",
      }).catch(() => {
        // The follow action succeeded even if marking the row read is delayed.
      });
    } catch {
      setFollowErrorId(notification.id);
    } finally {
      setPendingFollowIds((current) => {
        const next = new Set(current);
        next.delete(notification.id);
        return next;
      });
    }
  }, [pendingFollowIds, unreadCount, updateUnreadCount]);

  const unreadNotifications = notifications.filter((notification) => !notification.isRead);
  const readNotifications = notifications.filter((notification) => notification.isRead);

  const renderNotification = (notification: NotificationRecord) => {
    const actorName = notification.actor.name
      || (notification.actor.handle ? formatHandle(notification.actor.handle) : (locale === "ko" ? "Mingle 사용자" : "Mingle user"));
    const actorHandle = notification.actor.handle ? formatHandle(notification.actor.handle) : "";
    const isPending = pendingFollowIds.has(notification.id);

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
            aria-label={`${actorName} ${copy.followMessage}`}
          >
            <NotificationAvatar image={notification.actor.image} label={actorName} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] leading-5 text-slate-900">
                <strong className="font-semibold">{actorName}</strong>{" "}
                <span>{copy.followMessage}</span>
              </span>
              <span className="mt-0.5 block truncate text-[12px] text-gray-500">
                {actorHandle || "\u00A0"}
                {actorHandle ? " · " : ""}
                {formatNotificationTime(notification.createdAt, locale)}
              </span>
            </span>
          </button>

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
        </div>
        {followErrorId === notification.id ? (
          <p className="mt-1 pl-[60px] text-[12px] text-red-500" role="alert">{copy.followError}</p>
        ) : null}
      </li>
    );
  };

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
                    {locale === "ko" ? "다시 시도" : "Try again"}
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
