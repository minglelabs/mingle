"use client";

import Link from "next/link";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

export type IdentityRowAction =
  | {
      kind: "button";
      onClick: () => void;
      /** For a pick-list row (toggle). */
      pressed?: boolean;
      /** For a row that expands in place. */
      expanded?: boolean;
    }
  | {
      kind: "link";
      href: string;
      onClick?: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
    };

type IdentityRowProps = {
  action: IdentityRowAction;
  /**
   * The row action's accessible name. Include the badge label next to the name
   * (`withAccountBadgeLabel(name, kind, locale)`), since the visible name is
   * hidden from screen readers to avoid reading it twice.
   */
  label: string;
  /** Outer box (its size is the tap target), e.g. `min-w-0 flex-1`. */
  className?: string;
  /** The action under the content: shape, press and focus styles. */
  actionClassName?: string;
  /** Layout of the visible content, e.g. `flex min-w-0 items-center gap-3`. */
  contentClassName?: string;
  /** The visible row content (avatar, name + badge, handle, ...). */
  children?: ReactNode;
};

/**
 * A row whose whole area runs one action (open a profile, toggle a pick,
 * expand a card) while an `<AccountBadge>` next to the name inside it stays its
 * own button.
 *
 * The action is a childless button / link stretched UNDER the content; the
 * content is laid over it and lets taps fall through (`pointer-events-none`),
 * except the badge, which takes its own. So nothing interactive is nested, a
 * tap on the badge opens the badge sheet instead of running the row action,
 * and the row keeps its full hit area, press state and focus ring.
 *
 * Mark the visible name / handle / avatar `aria-hidden` (the action's `label`
 * already says them) but never the badge.
 */
export default function IdentityRow({
  action,
  label,
  className,
  actionClassName,
  contentClassName,
  children,
}: IdentityRowProps) {
  const underlayClassName = `absolute inset-0 ${actionClassName ?? ""}`;
  return (
    <div className={`relative ${className ?? ""}`} data-identity-row="">
      {action.kind === "link" ? (
        <Link href={action.href} onClick={action.onClick} aria-label={label} className={underlayClassName} />
      ) : (
        <button
          type="button"
          onClick={action.onClick}
          aria-label={label}
          aria-pressed={action.pressed}
          aria-expanded={action.expanded}
          className={underlayClassName}
        />
      )}
      <div className={`pointer-events-none relative ${contentClassName ?? ""}`}>{children}</div>
    </div>
  );
}
