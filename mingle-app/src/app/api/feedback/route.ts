import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import {
  ensureTrackingContext,
  parseClientContext,
  upsertTrackedUser,
} from "@/lib/app-analytics";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const FEEDBACK_CATEGORIES = new Set(["feedback", "suggestion", "inquiry"]);
const MIN_MESSAGE_LENGTH = 10;

type FeedbackBody = {
  category?: unknown;
  message?: unknown;
  contactEmail?: unknown;
  locale?: unknown;
  pathname?: unknown;
};

function normalizeFeedbackCategory(
  value: unknown,
): "feedback" | "suggestion" | "inquiry" | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!FEEDBACK_CATEGORIES.has(normalized)) return null;
  return normalized as "feedback" | "suggestion" | "inquiry";
}

function normalizeFeedbackMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (normalized.length < MIN_MESSAGE_LENGTH) return null;
  return normalized.slice(0, 4000);
}

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function normalizeOptionalEmail(value: unknown): string | null {
  const normalized = normalizeOptionalText(value, 320);
  if (!normalized) return null;
  const canonicalEmail = normalized.toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(canonicalEmail)
    ? canonicalEmail
    : null;
}

async function resolveAuthenticatedUserId(session: {
  user?: { id?: unknown; email?: unknown };
} | null): Promise<string | null> {
  const sessionUserId = typeof session?.user?.id === "string"
    ? session.user.id.trim()
    : "";
  if (sessionUserId) {
    const user = await prisma.user.findUnique({
      where: { id: sessionUserId },
      select: { id: true },
    });
    if (user?.id) return user.id;
  }

  const sessionEmail = typeof session?.user?.email === "string"
    ? session.user.email.trim().toLowerCase()
    : "";
  if (!sessionEmail) return null;

  const user = await prisma.user.findUnique({
    where: { email: sessionEmail },
    select: { id: true },
  });
  return user?.id ?? null;
}

function withTrackingCookies(
  request: NextRequest,
  response: NextResponse,
  tracking: { externalUserId: string; sessionKey: string },
): NextResponse {
  ensureTrackingContext(request, response, {
    externalUserIdHint: tracking.externalUserId,
    sessionKeyHint: tracking.sessionKey,
  });
  return response;
}

export async function POST(request: Request) {
  const nextRequest = request as NextRequest;

  let body: FeedbackBody;
  try {
    body = (await request.json()) as FeedbackBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const category = normalizeFeedbackCategory(body.category);
  if (!category) {
    return NextResponse.json({ error: "invalid_category" }, { status: 400 });
  }

  const message = normalizeFeedbackMessage(body.message);
  if (!message) {
    return NextResponse.json({ error: "message_too_short" }, { status: 400 });
  }

  const contactEmailRaw = normalizeOptionalText(body.contactEmail, 320);
  const contactEmail = normalizeOptionalEmail(body.contactEmail);
  if (contactEmailRaw && !contactEmail) {
    return NextResponse.json({ error: "invalid_contact_email" }, { status: 400 });
  }

  const locale = normalizeOptionalText(body.locale, 32);
  const pathname = normalizeOptionalText(body.pathname, 1024);
  const trackingSeedResponse = new NextResponse();
  const tracking = ensureTrackingContext(nextRequest, trackingSeedResponse);
  const session = await getServerSession(getAuthOptions());
  const sessionEmail = typeof session?.user?.email === "string"
    ? session.user.email.trim().toLowerCase()
    : null;

  const clientContext = parseClientContext({
    language: locale,
    pathname,
    appVersion: request.headers.get("x-mingle-app-version"),
    apiNamespace: request.headers.get("x-mingle-api-namespace"),
    clientPlatform: request.headers.get("x-mingle-client-platform"),
  });

  const authenticatedUserId = await resolveAuthenticatedUserId(session);
  const userId = authenticatedUserId ?? await upsertTrackedUser({
    tracking,
    clientContext,
  });

  const feedback = await prisma.appFeedback.create({
    data: {
      userId,
      sessionKey: tracking.sessionKey || undefined,
      category,
      message,
      contactEmail: contactEmail ?? sessionEmail ?? undefined,
      locale: clientContext.language ?? tracking.requestLocale ?? undefined,
      clientPlatform: clientContext.clientPlatform ?? undefined,
      appVersion: clientContext.appVersion ?? undefined,
      apiNamespace: clientContext.apiNamespace ?? undefined,
      pathname: clientContext.pathname ?? undefined,
      ipAddress: tracking.ipAddress ?? undefined,
      userAgent: tracking.userAgent ?? undefined,
    },
    select: { id: true },
  });

  const response = NextResponse.json({
    ok: true,
    feedbackId: feedback.id,
  }, { status: 201 });
  return withTrackingCookies(nextRequest, response, tracking);
}
