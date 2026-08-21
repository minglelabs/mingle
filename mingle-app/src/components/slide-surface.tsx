"use client";

import { isLeftEdgeSwipeStart } from "@/lib/edge-swipe";
import { registerNativeBackHandler } from "@/lib/native-back-handler";
import { motion, useAnimationControls, useDragControls, type PanInfo } from "framer-motion";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from "react";

type NativeBridgeWindow = Window & {
  ReactNativeWebView?: {
    postMessage?: (message: string) => void;
  };
};

type SlideSurfaceProps = {
  open: boolean;
  ariaLabel: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  backdropClassName?: string;
  style?: CSSProperties;
  role?: "dialog" | "main";
  zIndex?: number;
  nativeBackPriority?: number;
  canClose?: boolean;
  onTouchStart?: (event: ReactTouchEvent<HTMLElement>) => void;
  onTouchEnd?: (event: ReactTouchEvent<HTMLElement>) => void;
  onTouchCancel?: (event: ReactTouchEvent<HTMLElement>) => void;
  onRequestClose?: () => boolean;
  onBackdropClick?: () => void;
  stopPropagation?: boolean;
};

const SURFACE_TRANSITION = {
  duration: 0.32,
  ease: [0.22, 1, 0.36, 1] as const,
};
const SURFACE_SWIPE_THRESHOLD_PX = 72;
const SURFACE_SWIPE_VELOCITY_PX_PER_SECOND = 650;

const nativeSuppressedSurfaceTokens = new Set<string>();
let nativeSuppressionTokenSequence = 0;

function postNativeNavigationState(suppressEdgeSwipe: boolean): void {
  if (typeof window === "undefined") return;

  try {
    const bridgeWindow = window as NativeBridgeWindow;
    bridgeWindow.ReactNativeWebView?.postMessage(JSON.stringify({
      type: "native_navigation_state",
      payload: {
        canGoBack: window.history.length > 1,
        url: window.location.href,
        suppressEdgeSwipe,
      },
    }));
  } catch {
    // Browser navigation remains available if the native bridge is unavailable.
  }
}

function registerNativeEdgeSwipeSuppression(): () => void {
  const token = `slide-surface-${nativeSuppressionTokenSequence}`;
  nativeSuppressionTokenSequence += 1;
  nativeSuppressedSurfaceTokens.add(token);
  postNativeNavigationState(true);

  return () => {
    nativeSuppressedSurfaceTokens.delete(token);
    postNativeNavigationState(nativeSuppressedSurfaceTokens.size > 0);
  };
}

export default function SlideSurface({
  open,
  ariaLabel,
  onClose,
  children,
  className = "fixed inset-0 z-[100] flex min-h-0 w-full flex-col overflow-hidden bg-white text-slate-950 shadow-2xl",
  backdropClassName,
  style,
  role = "dialog",
  zIndex,
  nativeBackPriority = 20,
  canClose = true,
  onTouchStart,
  onTouchEnd,
  onTouchCancel,
  onRequestClose,
  onBackdropClick,
  stopPropagation = false,
}: SlideSurfaceProps) {
  const motionControls = useAnimationControls();
  const dragControls = useDragControls();
  const isMountedRef = useRef(false);
  const isLeavingRef = useRef(false);
  const [viewportWidth, setViewportWidth] = useState(1);

  useEffect(() => {
    isMountedRef.current = true;
    const syncViewportWidth = () => setViewportWidth(Math.max(1, window.innerWidth));
    syncViewportWidth();
    window.addEventListener("resize", syncViewportWidth);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener("resize", syncViewportWidth);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      isLeavingRef.current = false;
      void motionControls.start({ x: "100%", transition: SURFACE_TRANSITION });
      return;
    }

    isLeavingRef.current = false;
    const frameId = window.requestAnimationFrame(() => {
      if (!isMountedRef.current) return;
      void motionControls.start({ x: 0, transition: SURFACE_TRANSITION });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [motionControls, open]);

  useEffect(() => {
    if (!open) return;
    return registerNativeEdgeSwipeSuppression();
  }, [open]);

  const requestClose = useCallback(async () => {
    if (!open || !canClose || isLeavingRef.current || !isMountedRef.current) return;
    if (onRequestClose && !onRequestClose()) {
      void motionControls.start({ x: 0, transition: SURFACE_TRANSITION });
      return;
    }
    isLeavingRef.current = true;
    await motionControls.start({ x: "100%", transition: SURFACE_TRANSITION });
    if (isMountedRef.current) onClose();
  }, [canClose, motionControls, onClose, onRequestClose, open]);

  useEffect(() => registerNativeBackHandler(() => {
    if (!open || !canClose) return false;
    void requestClose();
    return true;
  }, nativeBackPriority), [canClose, nativeBackPriority, open, requestClose]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!open || !canClose || !isLeftEdgeSwipeStart(event.clientX)) return;
    dragControls.start(event);
  }, [canClose, dragControls, open]);

  const handleDragEnd = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (!open || !canClose || !isMountedRef.current || isLeavingRef.current) return;
    const threshold = Math.max(SURFACE_SWIPE_THRESHOLD_PX, viewportWidth * 0.2);
    if (info.offset.x >= threshold || info.velocity.x >= SURFACE_SWIPE_VELOCITY_PX_PER_SECOND) {
      void requestClose();
      return;
    }
    void motionControls.start({ x: 0, transition: SURFACE_TRANSITION });
  }, [canClose, motionControls, open, requestClose, viewportWidth]);

  const surface = (
    <motion.main
      initial={{ x: "100%" }}
      animate={motionControls}
      drag="x"
      dragControls={dragControls}
      dragDirectionLock
      dragListener={false}
      dragConstraints={{ left: 0, right: viewportWidth }}
      dragElastic={0.08}
      dragMomentum={false}
      onPointerDown={(event) => {
        if (stopPropagation) event.stopPropagation();
        handlePointerDown(event);
      }}
      onDragEnd={handleDragEnd}
      onTouchStart={(event) => {
        if (stopPropagation) event.stopPropagation();
        onTouchStart?.(event);
      }}
      onTouchEnd={(event) => {
        if (stopPropagation) event.stopPropagation();
        onTouchEnd?.(event);
      }}
      onTouchCancel={(event) => {
        if (stopPropagation) event.stopPropagation();
        onTouchCancel?.(event);
      }}
      onClick={stopPropagation ? (event) => event.stopPropagation() : undefined}
      className={className}
      style={{ ...style, ...(zIndex === undefined ? {} : { zIndex }) }}
      role={role}
      aria-modal={role === "dialog" ? true : undefined}
      aria-label={ariaLabel}
      aria-hidden={!open}
      inert={!open}
      data-slide-surface="true"
    >
      {children}
    </motion.main>
  );

  if (!backdropClassName) return surface;

  return (
    <div
      className={backdropClassName}
      onClick={onBackdropClick ? () => onBackdropClick() : undefined}
      style={{
        pointerEvents: open ? "auto" : "none",
        opacity: open ? 1 : 0,
      }}
      aria-hidden={!open}
      data-slide-surface-backdrop="true"
    >
      {surface}
    </div>
  );
}
