"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type Ref,
  type RefObject,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import { BadgeCheck, Info, X } from "lucide-react";
import { accountBadgeCopy } from "@/i18n/account-badge-copy";
import { commentsCopy } from "@/i18n/comments-copy";
import type { AccountBadgeKind } from "@/lib/account-badge";
import { registerNativeBackHandler } from "@/lib/native-back-handler";

export type AccountBadgeTone = "light" | "dark";

export type AccountBadgeProps = {
  /**
   * Always `resolveAccountBadge(user)` (`@/lib/account-badge`), never a flag
   * read by hand. Nothing renders for `null`.
   */
  kind: AccountBadgeKind | null | undefined;
  /** UI locale; any language tag (unknown → English). */
  locale: string;
  /**
   * `light` = on a dark surface or photo (white badge), `dark` = on a light
   * surface. Pass the post's `postForegroundTone(...)` on feed cards; lists on
   * a normal page surface use `dark`.
   */
  tone?: AccountBadgeTone;
  className?: string;
};

const CHIP_CLASS =
  "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none";

/**
 * Invisible ::before box that gives the small chip a >= 44 px touch target
 * without changing its layout (same technique as the feed card's controls).
 */
const HIT_AREA_44_CLASS =
  "relative before:absolute before:left-1/2 before:top-1/2 before:h-11 before:min-w-11 before:w-[calc(100%+12px)] before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']";

/** Above every app overlay, including the chat sheets (z 10000 / 10010). */
const SHEET_Z_CLASS = "z-[10020]";

/** Above every other native (Android) back handler; the image preview uses 80. */
export const OPERATOR_SHEET_BACK_PRIORITY = 100;

/**
 * The account badge next to another user's name. One component for every
 * surface, so the marking reads the same everywhere:
 *
 * - `official`: the Mingle team's own account. A small non-interactive chip
 *   with a screen-reader description (unchanged look).
 * - `operator`: an account run by Mingle staff. A real button: tapping it
 *   opens a small sheet explaining that Mingle staff run the account and
 *   write its posts and replies. Screen readers hear the label plus
 *   `operatorDescription`.
 *
 * Copy comes only from `accountBadgeCopy`. Never place the operator badge
 * inside another button or link (nested interactive elements, and the tap
 * would also run the parent's action): put it next to the name as a sibling,
 * or use `IdentityRow` for a row whose whole area is one action.
 */
export default function AccountBadge({ kind, locale, tone = "dark", className }: AccountBadgeProps) {
  if (kind === "operator") return <OperatorBadge locale={locale} tone={tone} className={className} />;
  if (kind === "official") return <OfficialBadge locale={locale} tone={tone} className={className} />;
  return null;
}

function OfficialBadge({ locale, tone, className }: { locale: string; tone: AccountBadgeTone; className?: string }) {
  const copy = accountBadgeCopy(locale);
  const toneClass =
    tone === "light"
      ? "bg-white/20 text-white ring-1 ring-white/40"
      : "bg-sky-50 text-sky-700 ring-1 ring-sky-200";
  return (
    <span
      data-account-badge="official"
      className={`${CHIP_CLASS} ${toneClass} ${className ?? ""}`}
      title={copy.officialDescription}
    >
      <BadgeCheck size={11} strokeWidth={2.4} aria-hidden="true" />
      <span aria-hidden="true">{copy.official}</span>
      <span className="sr-only">{copy.officialDescription}</span>
    </span>
  );
}

/**
 * What a tap on the operator badge does: open the sheet, and stop there. The
 * badge sits next to a name that often opens a profile (or likes a post on a
 * double tap), and none of that may run for this tap.
 */
export function activateAccountBadge(
  event: Pick<SyntheticEvent, "preventDefault" | "stopPropagation">,
  openSheet: () => void,
): void {
  event.preventDefault();
  event.stopPropagation();
  openSheet();
}

/** Accessible name of the operator badge: the visible label first, then the description. */
export function operatorBadgeAccessibleName(locale: string): string {
  const copy = accountBadgeCopy(locale);
  return `${copy.operator}, ${copy.operatorDescription}`;
}

function OperatorBadge({ locale, tone, className }: { locale: string; tone: AccountBadgeTone; className?: string }) {
  const copy = accountBadgeCopy(locale);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const openSheet = useCallback((event: SyntheticEvent) => {
    activateAccountBadge(event, () => setOpen(true));
  }, []);
  const closeSheet = useCallback(() => setOpen(false), []);
  const toneClass =
    tone === "light"
      ? "bg-white/20 text-white ring-1 ring-white/40"
      : "bg-slate-100 text-slate-700 ring-1 ring-slate-300";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-account-badge="operator"
        onClick={openSheet}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={operatorBadgeAccessibleName(locale)}
        className={`${CHIP_CLASS} ${toneClass} ${HIT_AREA_44_CLASS} pointer-events-auto cursor-pointer select-none transition active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${className ?? ""}`}
      >
        <Info size={11} strokeWidth={2.4} aria-hidden="true" />
        <span aria-hidden="true">{copy.operator}</span>
      </button>
      {open ? <OperatorAccountSheet locale={locale} onClose={closeSheet} returnFocusRef={buttonRef} /> : null}
    </>
  );
}

export type SheetKeyAction = { type: "close" } | { type: "focus"; index: number };

/**
 * Keyboard rule of the sheet: Escape closes it; Tab and Shift+Tab cycle
 * through its focusable elements and never leave it. `activeIndex` is the
 * focused element's index among them (-1 = focus is elsewhere). `index: -1`
 * means "focus the panel itself" (nothing focusable inside).
 */
export function resolveSheetKeyAction(
  key: string,
  shiftKey: boolean,
  activeIndex: number,
  focusableCount: number,
): SheetKeyAction | null {
  if (key === "Escape" || key === "Esc") return { type: "close" };
  if (key !== "Tab") return null;
  if (focusableCount <= 0) return { type: "focus", index: -1 };
  const last = focusableCount - 1;
  if (shiftKey) return activeIndex <= 0 ? { type: "focus", index: last } : null;
  return activeIndex < 0 || activeIndex >= last ? { type: "focus", index: 0 } : null;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function stopPropagation(event: SyntheticEvent) {
  event.stopPropagation();
}

/**
 * React events from a portal still bubble through the React tree to the
 * badge's owners (the feed card's double-tap-to-like, the slide surface's edge
 * swipe, row handlers). The sheet keeps every one of them to itself.
 */
const ISOLATE_EVENTS = {
  onClick: stopPropagation,
  onDoubleClick: stopPropagation,
  onContextMenu: stopPropagation,
  onKeyDown: stopPropagation,
  onMouseDown: stopPropagation,
  onMouseUp: stopPropagation,
  onPointerDown: stopPropagation,
  onPointerMove: stopPropagation,
  onPointerUp: stopPropagation,
  onPointerCancel: stopPropagation,
  onTouchStart: stopPropagation,
  onTouchMove: stopPropagation,
  onTouchEnd: stopPropagation,
  onTouchCancel: stopPropagation,
} as const;

/**
 * The bottom sheet behind the operator badge: portal on `document.body`,
 * focus moved in and trapped, closed by the backdrop, Escape, the close
 * button or the Android back button; focus returns to the badge.
 */
function OperatorAccountSheet({
  locale,
  onClose,
  returnFocusRef,
}: {
  locale: string;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const titleId = useId();
  const bodyId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const returnFocusTo = returnFocusRef.current;
    closeButtonRef.current?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const active = document.activeElement;
      const action = resolveSheetKeyAction(
        event.key,
        event.shiftKey,
        focusables.findIndex((element) => element === active),
        focusables.length,
      );
      if (!action) return;
      // Capture phase + stop: the sheet owns the keyboard while open, so a
      // sheet underneath (comments, image preview) neither closes nor steals
      // focus on the same key.
      event.preventDefault();
      event.stopPropagation();
      if (action.type === "close") {
        onClose();
        return;
      }
      (focusables[action.index] ?? panel).focus({ preventScroll: true });
    };
    document.addEventListener("keydown", handleKeyDown, true);
    const unregisterBack = registerNativeBackHandler(() => {
      onClose();
      return true;
    }, OPERATOR_SHEET_BACK_PRIORITY);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      unregisterBack();
      if (returnFocusTo?.isConnected) returnFocusTo.focus({ preventScroll: true });
    };
  }, [onClose, returnFocusRef]);

  return createPortal(
    <div className={`fixed inset-0 ${SHEET_Z_CLASS} flex items-end justify-center`} {...ISOLATE_EVENTS}>
      {/* Backdrop: tap to close; swallows touches meant for the page behind. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label={commentsCopy(locale).close}
        onClick={onClose}
        className="absolute inset-0 touch-none bg-black/40 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
      />
      <OperatorAccountSheetPanel
        locale={locale}
        titleId={titleId}
        bodyId={bodyId}
        onClose={onClose}
        panelRef={panelRef}
        closeButtonRef={closeButtonRef}
      />
    </div>,
    document.body,
  );
}

/** The sheet's dialog panel (pure markup, rendered by `OperatorAccountSheet`). */
export function OperatorAccountSheetPanel({
  locale,
  titleId,
  bodyId,
  onClose,
  panelRef,
  closeButtonRef,
}: {
  locale: string;
  titleId: string;
  bodyId: string;
  onClose: () => void;
  panelRef?: Ref<HTMLElement>;
  closeButtonRef?: Ref<HTMLButtonElement>;
}) {
  const copy = accountBadgeCopy(locale);
  return (
    <section
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      tabIndex={-1}
      data-account-badge-sheet="operator"
      className="relative max-h-[85dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[24px] bg-white px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-4 text-slate-900 shadow-2xl outline-none motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:duration-200"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5 pt-1">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700"
            aria-hidden="true"
          >
            <Info size={18} strokeWidth={2.2} />
          </span>
          <h2 id={titleId} className="min-w-0 break-words text-[17px] font-bold leading-snug">
            {copy.operatorSheetTitle}
          </h2>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label={commentsCopy(locale).close}
          className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 transition active:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <p id={bodyId} className="mt-3 break-words text-[15px] leading-relaxed text-slate-600">
        {copy.operatorSheetBody}
      </p>
    </section>
  );
}
