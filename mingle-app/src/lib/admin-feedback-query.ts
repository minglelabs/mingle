export const ADMIN_FEEDBACK_PAGE_SIZE = 50;

export type AdminFeedbackFilter = "all" | "needs-reply";

type AdminHrefOptions = {
  filter?: AdminFeedbackFilter;
  page?: number;
  sent?: string;
  error?: string;
};

function normalizePositiveInteger(value: unknown): number {
  if (typeof value !== "string" && typeof value !== "number") return 1;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.floor(parsed));
}

export function normalizeAdminFeedbackFilter(value: unknown): AdminFeedbackFilter {
  return value === "needs-reply" ? "needs-reply" : "all";
}

export function normalizeAdminFeedbackPage(value: unknown): number {
  return normalizePositiveInteger(value);
}

export function buildAdminFeedbackHref(options: AdminHrefOptions = {}): string {
  const filter = options.filter ?? "all";
  const page = normalizeAdminFeedbackPage(options.page ?? 1);
  const params = new URLSearchParams();

  if (filter !== "all") {
    params.set("filter", filter);
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  if (options.sent) {
    params.set("sent", options.sent);
  }
  if (options.error) {
    params.set("error", options.error);
  }

  const query = params.toString();
  return query ? `/admin?${query}` : "/admin";
}

export function sanitizeAdminFeedbackReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value) return "/admin";

  try {
    const parsed = new URL(value, "https://mingle.local");
    if (parsed.origin !== "https://mingle.local" || parsed.pathname !== "/admin") {
      return "/admin";
    }

    return buildAdminFeedbackHref({
      filter: normalizeAdminFeedbackFilter(parsed.searchParams.get("filter")),
      page: normalizeAdminFeedbackPage(parsed.searchParams.get("page")),
    });
  } catch {
    return "/admin";
  }
}

