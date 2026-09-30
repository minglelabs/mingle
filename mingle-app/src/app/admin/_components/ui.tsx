import Link from "next/link";
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { ArrowLeft, BadgeCheck, ChevronLeft, ChevronRight, UserRoundCog, type LucideIcon } from "lucide-react";
import { accountBadgeCopy } from "@/i18n/account-badge-copy";
import { resolveAccountBadge, type AccountBadgeFlags } from "@/lib/account-badge";
import { cn } from "@/lib/utils";

/**
 * Shared building blocks for admin screens: phone-first (375 px), >= 44 px
 * touch targets, slate neutrals + sky accent, Korean copy. Semantic status
 * colors (emerald / amber / rose) only mark state, never decoration.
 *
 * Pages render inside `AdminShell`, whose `<main id={ADMIN_SCROLL_CONTAINER_ID}>`
 * is the only scroll container (html/body never scroll in this app), so a
 * page must not set its own `h-svh` / `overflow-y-auto`.
 */
export const ADMIN_SCROLL_CONTAINER_ID = "admin-scroll";

const BADGE_COPY = accountBadgeCopy("ko");

/** Centered content column for one admin page. `wide` for dashboards. */
export function AdminPage({ children, wide = false, className }: { children: ReactNode; wide?: boolean; className?: string }) {
  return (
    <div className={cn("mx-auto w-full min-w-0 px-4 pb-10 pt-4 sm:px-6", wide ? "max-w-6xl" : "max-w-3xl", className)}>
      {children}
    </div>
  );
}

export function AdminPageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Link above the title, e.g. back to 더보기 for pages reached from there. */
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-4 min-w-0">
      {back ? (
        <Link
          className="-ml-2 mb-1 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-sky-700 hover:bg-sky-50"
          href={back.href}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-xl font-semibold text-slate-900">{title}</h1>
          {description ? <p className="mt-1 break-words text-sm leading-6 text-slate-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function AdminCard({
  as: Component = "section",
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLElement> & { as?: "section" | "article" | "div" }) {
  return (
    <Component className={cn("min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm", className)} {...rest}>
      {children}
    </Component>
  );
}

export type AdminButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const BUTTON_VARIANT: Record<AdminButtonVariant, string> = {
  primary: "border-sky-600 bg-sky-600 text-white hover:border-sky-700 hover:bg-sky-700",
  secondary: "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  danger: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
  ghost: "border-transparent bg-transparent text-slate-600 hover:bg-slate-100",
};

export function adminButtonClassName({
  variant = "secondary",
  block = false,
  className,
}: { variant?: AdminButtonVariant; block?: boolean; className?: string } = {}): string {
  return cn(
    "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500",
    "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    BUTTON_VARIANT[variant],
    block && "w-full",
    className,
  );
}

export function AdminButton({
  variant,
  block,
  className,
  type = "button",
  ...rest
}: ComponentProps<"button"> & { variant?: AdminButtonVariant; block?: boolean }) {
  return <button type={type} className={adminButtonClassName({ variant, block, className })} {...rest} />;
}

export function AdminButtonLink({
  variant,
  block,
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: AdminButtonVariant; block?: boolean }) {
  return <Link className={adminButtonClassName({ variant, block, className })} {...rest} />;
}

/** Text input / select: 44 px tall, 16 px text (no iOS focus zoom). */
export const adminInputClassName =
  "min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed disabled:bg-slate-100";

export const adminTextareaClassName =
  "min-h-28 w-full min-w-0 resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-base leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-200";

export const adminLabelClassName = "mb-1.5 block text-sm font-medium text-slate-700";

export type AdminChipTone = "neutral" | "accent" | "success" | "warning" | "danger";

const CHIP_TONE: Record<AdminChipTone, string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  accent: "border-sky-200 bg-sky-50 text-sky-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
};

export function AdminChip({
  tone = "neutral",
  icon: Icon,
  title,
  className,
  children,
}: {
  tone?: AdminChipTone;
  icon?: LucideIcon;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-5",
        CHIP_TONE[tone],
        className,
      )}
      title={title}
    >
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
      <span className="min-w-0 break-words">{children}</span>
    </span>
  );
}

/** The "운영 계정" chip: an account run by Mingle staff (same copy as the app badge). */
export function OperatorAccountChip({ className }: { className?: string }) {
  return (
    <AdminChip tone="accent" icon={UserRoundCog} title={BADGE_COPY.operatorDescription} className={className}>
      {BADGE_COPY.operator}
    </AdminChip>
  );
}

/** Account-kind chip through the one badge rule (`resolveAccountBadge`): 운영 계정, 공식, or nothing. */
export function AccountBadgeChip({ flags, className }: { flags: AccountBadgeFlags | null | undefined; className?: string }) {
  const kind = resolveAccountBadge(flags);
  if (kind === "operator") return <OperatorAccountChip className={className} />;
  if (kind === "official") {
    return (
      <AdminChip icon={BadgeCheck} title={BADGE_COPY.officialDescription} className={className}>
        {BADGE_COPY.official}
      </AdminChip>
    );
  }
  return null;
}

/** Pill link for a list filter (current filter is filled). */
export function AdminFilterLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition",
        active ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
      )}
      href={href}
    >
      {children}
    </Link>
  );
}

export function AdminEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
      {Icon ? <Icon className="mx-auto mb-3 h-8 w-8 text-slate-400" aria-hidden="true" /> : null}
      <p className="break-words text-base font-semibold text-slate-800">{title}</p>
      {description ? <p className="mt-1 break-words text-sm leading-6 text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

const NOTICE_TONE = {
  info: "border-sky-200 bg-sky-50 text-sky-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-rose-200 bg-rose-50 text-rose-700",
} as const;

/** One-line result / error message. Errors are announced (`role="alert"`). */
export function AdminNotice({ tone = "info", className, children }: { tone?: keyof typeof NOTICE_TONE; className?: string; children: ReactNode }) {
  return (
    <p
      className={cn("break-words rounded-lg border px-3 py-2.5 text-sm font-medium leading-6", NOTICE_TONE[tone], className)}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}

/** Previous / next page links. A missing href renders a disabled control. */
export function AdminPagination({
  label,
  summary,
  previousHref,
  nextHref,
}: {
  label: string;
  summary: string;
  previousHref?: string;
  nextHref?: string;
}) {
  const disabled = "inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm font-semibold text-slate-400";
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2">
      {previousHref ? (
        <AdminButtonLink className="px-3" href={previousHref}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          이전
        </AdminButtonLink>
      ) : (
        <span aria-disabled="true" className={disabled}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          이전
        </span>
      )}
      <span className="min-w-0 text-center text-sm font-medium text-slate-600">{summary}</span>
      {nextHref ? (
        <AdminButtonLink className="px-3" href={nextHref}>
          다음
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </AdminButtonLink>
      ) : (
        <span aria-disabled="true" className={disabled}>
          다음
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      )}
    </nav>
  );
}

/** One row of a navigation list (icon, title, description, chevron). */
export function AdminListLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <Link
      className="flex min-h-14 items-center gap-3 px-4 py-3 transition hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
      href={href}
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-[15px] font-semibold text-slate-900">{title}</span>
        {description ? <span className="mt-0.5 block break-words text-sm text-slate-500">{description}</span> : null}
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
    </Link>
  );
}
