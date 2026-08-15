"use client";

import type { AppDictionary, AppLocale } from "@/i18n";
import { getConversationDictionary } from "@/i18n/conversations";
import { buildClientApiPath } from "@/lib/api-contract";
import { isLeftEdgeSwipeStart } from "@/lib/edge-swipe";
import { formatHandle } from "@/lib/handles";
import { AnimatePresence, motion, useAnimationControls, useDragControls, type PanInfo } from "framer-motion";
import { ArrowLeft, Check, Loader2, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type NotificationPanelProps = {
  open: boolean;
  enabled: boolean;
  locale: AppLocale;
  dictionary: AppDictionary;
  nativeTopInsetPx?: number;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  onUnreadCountChange: (count: number) => void;
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

const PANEL_TRANSITION = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1] as const,
};
const NOTIFICATION_SWIPE_THRESHOLD_PX = 72;
const NOTIFICATION_SWIPE_VELOCITY_PX_PER_SECOND = 650;

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
  const motionControls = useAnimationControls();
  const dragControls = useDragControls();
  const isMountedRef = useRef(false);
  const isLeavingRef = useRef(false);
  const copy = useMemo(() => getNotificationCopy(dictionary, locale), [dictionary, locale]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [pendingFollowIds, setPendingFollowIds] = useState<Set<string>>(() => new Set());
  const [followErrorId, setFollowErrorId] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(1);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    isLeavingRef.current = false;
    const syncViewportWidth = () => setViewportWidth(Math.max(1, window.innerWidth));
    syncViewportWidth();
    window.addEventListener("resize", syncViewportWidth);
    void motionControls.start({ x: 0, transition: PANEL_TRANSITION });
    return () => window.removeEventListener("resize", syncViewportWidth);
  }, [motionControls, open]);

  const updateUnreadCount = useCallback((nextCount: number) => {
    const normalizedCount = Math.max(0, Math.floor(nextCount));
    setUnreadCount(normalizedCount);
    onUnreadCountChange(normalizedCount);
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
    if (!enabled) return null;

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
  }, [enabled, updateUnreadCount]);

  useEffect(() => {
    if (!enabled) {
      abortControllerRef.current?.abort();
      setNotifications([]);
      setHasLoaded(false);
      setLoadError(false);
      updateUnreadCount(0);
      return;
    }

    void loadNotifications();
    return () => abortControllerRef.current?.abort();
  }, [enabled, loadNotifications, updateUnreadCount]);

  useEffect(() => {
    if (!open || !enabled) return;
    let isCurrent = true;
    void loadNotifications().then((result) => {
      if (!isCurrent || !result || result.unreadCount <= 0) return;
      markAllNotificationsAsRead();
    });
    return () => {
      isCurrent = false;
    };
  }, [enabled, loadNotifications, markAllNotificationsAsRead, open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  const handlePanelPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const localClientX = event.clientX - event.currentTarget.getBoundingClientRect().left;
    if (!isLeftEdgeSwipeStart(localClientX)) return;
    dragControls.start(event);
  }, [dragControls]);

  const handleDragEnd = useCallback(async (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (!isMountedRef.current || isLeavingRef.current) return;
    if (
      info.offset.x >= NOTIFICATION_SWIPE_THRESHOLD_PX
      || info.velocity.x >= NOTIFICATION_SWIPE_VELOCITY_PX_PER_SECOND
    ) {
      isLeavingRef.current = true;
      await motionControls.start({ x: "100%", transition: PANEL_TRANSITION });
      if (isMountedRef.current) onClose();
      return;
    }
    await motionControls.start({ x: 0, transition: PANEL_TRANSITION });
  }, [motionControls, onClose]);

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
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          className="absolute inset-0 z-[100] overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 h-full w-full bg-slate-950/25"
            onClick={onClose}
            aria-label={copy.closeAction}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={motionControls}
            exit={{ x: "100%" }}
            transition={PANEL_TRANSITION}
            drag="x"
            dragControls={dragControls}
            dragDirectionLock
            dragListener={false}
            dragConstraints={{ left: 0, right: viewportWidth }}
            dragElastic={0.08}
            dragMomentum={false}
            onPointerDown={handlePanelPointerDown}
            onDragEnd={handleDragEnd}
            className="absolute inset-y-0 right-0 flex w-full max-w-[430px] flex-col bg-white shadow-2xl"
            style={{ touchAction: "pan-y" }}
            role="dialog"
            aria-modal="true"
            aria-label={copy.title}
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
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
