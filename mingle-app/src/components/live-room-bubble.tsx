"use client";

// The live room bubble: a voice talk call (or, on the Chats tab, live speech
// recognition) keeps running after its room is left, and this small floating
// bubble shows it on every tab. A tap goes back to the room. It can be dragged:
// let go and it rests on the nearer side, clear of the tab bar and the keyboard;
// throw it past an edge and it folds into a thin handle; drop it on the circle at
// the bottom, or press its bottom strip, to leave. Leaving a call asks nothing and
// offers "Undo" for a few seconds. See lib/live-room-bubble.ts for where the state
// comes from. Not system picture-in-picture.

import { Mic, Phone, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { liveRoomBubbleCopy } from "@/i18n/live-room-bubble-copy";
import { voiceTalkCopy } from "@/i18n/voice-talk-copy";
import { replaceWithConversationListThenPush } from "@/lib/direct-conversation-navigation";
import {
  BUBBLE_DROP_RADIUS,
  BUBBLE_HANDLE_WIDTH,
  applyNativeVoiceEvent,
  bubbleDropPoint,
  bubbleLeft,
  clampBubbleY,
  getLiveRoomHandlers,
  getRememberedLiveRoom,
  isOverBubbleDrop,
  restBubble,
  useLiveRoomBubble,
  type BubbleArea,
  type BubbleRest,
  type LiveRoomBubbleView,
} from "@/lib/live-room-bubble";

const BOX = { width: 156, height: 72 };
const TOP_CLEAR_PX = 64;
/** Tab bar plus the home indicator. */
const BOTTOM_CLEAR_PX = 52 + 34;
const DRAG_START_PX = 6;
const UNDO_MS = 5000;

function readArea(): BubbleArea {
  // The visual viewport shrinks with the keyboard, so the bubble stays above it.
  const viewport = window.visualViewport;
  return {
    width: window.innerWidth,
    height: viewport ? viewport.height + viewport.offsetTop : window.innerHeight,
    top: TOP_CLEAR_PX,
    bottom: BOTTOM_CLEAR_PX,
  };
}

function postToApp(command: Record<string, unknown>): void {
  const bridge = (window as unknown as { ReactNativeWebView?: { postMessage?: (data: string) => void } }).ReactNativeWebView;
  bridge?.postMessage?.(JSON.stringify(command));
}

export default function LiveRoomBubble({
  locale,
  conversationListHref,
}: {
  locale: string;
  /** The Chats tab address, for opening the room from another tab. */
  conversationListHref: string;
}) {
  const bubble = useLiveRoomBubble();
  const router = useRouter();
  const copy = liveRoomBubbleCopy(locale);
  const voiceCopy = voiceTalkCopy(locale);
  const [mounted, setMounted] = useState(false);
  const [area, setArea] = useState<BubbleArea>({ width: 375, height: 812, top: TOP_CLEAR_PX, bottom: BOTTOM_CLEAR_PX });
  const [rest, setRest] = useState<BubbleRest>({ side: "right", y: 420, folded: false });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [left, setLeft] = useState<{ conversationId: string } | null>(null);
  const pointerRef = useRef<{ id: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const overDropRef = useRef(false);

  useEffect(() => {
    const sync = () => setArea(readArea());
    const first = window.setTimeout(() => {
      setMounted(true);
      sync();
    }, 0);
    window.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("resize", sync);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("resize", sync);
    };
  }, []);

  useEffect(() => {
    if (!left) return;
    const timer = window.setTimeout(() => setLeft(null), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [left]);

  const openRoom = useCallback((view: LiveRoomBubbleView) => {
    // On the Chats tab the list opens the room in place; elsewhere, go there.
    if (getLiveRoomHandlers().openRoom?.(view.conversationId)) return;
    void replaceWithConversationListThenPush(router, conversationListHref, view.conversationId);
  }, [conversationListHref, router]);

  const leave = useCallback((view: LiveRoomBubbleView) => {
    if (view.kind === "voice") {
      postToApp({ type: "native_voice_close" });
      // The bubble goes at once; the app's own "left" follows.
      applyNativeVoiceEvent({ type: "state", phase: "left", conversationId: view.conversationId });
      setLeft({ conversationId: view.conversationId });
    } else {
      getLiveRoomHandlers().stopStt?.(view.conversationId);
    }
  }, []);

  const undoLeave = useCallback(() => {
    if (!left) return;
    const room = getRememberedLiveRoom(left.conversationId);
    postToApp({
      type: "native_voice_open",
      payload: { conversationId: left.conversationId, title: room?.title || undefined, lang: room?.lang || undefined, interpret: false },
    });
    setLeft(null);
  }, [left]);

  if (!mounted) return null;

  const resting = { left: bubbleLeft(rest, BOX, area), top: clampBubbleY(rest.y, BOX, area) };
  const position = drag ?? { x: resting.left, y: resting.top };
  const dropPoint = bubbleDropPoint(area);
  const overDrop = drag ? isOverBubbleDrop(drag, BOX, area) : false;

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pointerRef.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.startX;
    const dy = event.clientY - pointer.startY;
    if (!pointer.moved && Math.hypot(dx, dy) < DRAG_START_PX) return;
    pointer.moved = true;
    const next = { x: pointer.originX + dx, y: pointer.originY + dy };
    const nowOver = isOverBubbleDrop(next, BOX, area);
    if (nowOver && !overDropRef.current) navigator.vibrate?.(12);
    overDropRef.current = nowOver;
    setDrag(next);
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>, view: LiveRoomBubbleView) => {
    const pointer = pointerRef.current;
    pointerRef.current = null;
    if (!pointer || pointer.id !== event.pointerId) return;
    const dropped = drag;
    setDrag(null);
    overDropRef.current = false;
    if (!pointer.moved || !dropped) {
      if (rest.folded) setRest({ ...rest, folded: false });
      else openRoom(view);
      return;
    }
    if (isOverBubbleDrop(dropped, BOX, area)) {
      leave(view);
      return;
    }
    setRest(restBubble(dropped, BOX, area));
  };

  const folded = Boolean(bubble) && rest.folded && !drag;
  const leaveLabel = bubble?.kind === "stt" ? copy.stop : voiceCopy.leave;

  return createPortal(
    <>
      {bubble && drag ? (
        <div
          aria-hidden="true"
          data-qa="live-room-bubble-drop"
          className={`pointer-events-none fixed z-[139] flex items-center justify-center rounded-full border-2 text-white transition-transform duration-150 ${overDrop ? "scale-110 border-rose-300 bg-rose-600" : "border-white/70 bg-black/55"}`}
          style={{ width: BUBBLE_DROP_RADIUS * 2, height: BUBBLE_DROP_RADIUS * 2, left: dropPoint.x - BUBBLE_DROP_RADIUS, top: dropPoint.y - BUBBLE_DROP_RADIUS }}
        >
          <X size={30} strokeWidth={2.4} />
        </div>
      ) : null}
      {bubble ? (
        <div
          data-qa="live-room-bubble"
          data-live-room-kind={bubble.kind}
          data-live-room-folded={folded ? "1" : "0"}
          role="button"
          tabIndex={0}
          aria-label={bubble.title || voiceCopy.start}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => onPointerUp(event, bubble)}
          onPointerCancel={() => {
            pointerRef.current = null;
            setDrag(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") openRoom(bubble);
          }}
          className={`fixed z-[140] touch-none select-none overflow-hidden bg-slate-950 text-white shadow-[0_10px_28px_rgba(15,23,42,0.35)] ${drag ? "" : "transition-[left,top,width] duration-200"} ${folded ? (rest.side === "left" ? "rounded-r-xl" : "rounded-l-xl") : "rounded-2xl"} ${overDrop ? "opacity-70" : ""}`}
          style={{ left: position.x, top: position.y, width: folded ? BUBBLE_HANDLE_WIDTH : BOX.width, height: BOX.height }}
        >
          {folded ? (
            <span className="flex h-full w-full items-center justify-center" aria-hidden="true">
              <span className={`h-8 w-1 rounded-full ${bubble.face?.speaking ? "bg-emerald-400" : "bg-white/60"}`} />
            </span>
          ) : (
            <>
              <div className="flex h-[48px] items-center gap-2 px-2.5">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/15 text-white/80 ring-2 ${bubble.face?.speaking ? "ring-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" : "ring-white/20"}`}
                  data-live-room-speaking={bubble.face?.speaking ? "1" : "0"}
                >
                  {bubble.face?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={bubble.face.image} alt="" className="h-full w-full object-cover" draggable={false} />
                  ) : bubble.kind === "stt" ? (
                    <Mic size={17} strokeWidth={2.2} aria-hidden="true" />
                  ) : bubble.face ? (
                    <UserRound size={18} strokeWidth={2} aria-hidden="true" />
                  ) : (
                    <Phone size={16} strokeWidth={2.2} aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold leading-tight">{bubble.title || voiceCopy.start}</span>
                  <span className="mt-0.5 block truncate text-[11px] leading-tight text-white/65">
                    {bubble.kind === "stt" ? copy.sttLive : bubble.face?.name || voiceCopy.start}
                  </span>
                </span>
              </div>
              {/* The whole bottom edge leaves. */}
              <button
                type="button"
                data-qa="live-room-bubble-leave"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => leave(bubble)}
                className="flex h-[24px] w-full items-center justify-center bg-rose-600 text-[11px] font-semibold text-white active:bg-rose-700"
              >
                {leaveLabel}
              </button>
            </>
          )}
        </div>
      ) : null}
      {left ? (
        <div
          role="status"
          data-qa="live-room-bubble-left"
          className="fixed left-1/2 z-[141] flex -translate-x-1/2 items-center gap-3 rounded-full bg-slate-950 px-4 py-2.5 text-[13px] text-white shadow-lg"
          style={{ bottom: `calc(${BOTTOM_CLEAR_PX}px + env(safe-area-inset-bottom, 0px) + 8px)` }}
        >
          <span>{copy.leftNotice}</span>
          <button type="button" data-qa="live-room-bubble-undo" onClick={undoLeave} className="font-semibold text-amber-300">
            {copy.undo}
          </button>
        </div>
      ) : null}
    </>,
    document.body,
  );
}
