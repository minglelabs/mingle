import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import {
  ensureTrackingContext,
  parseClientContext,
  upsertTrackedUser,
} from "@/lib/app-analytics";
import { prisma } from "@/lib/prisma";
import { requestAllowsLegacyAnonymousUser } from "@/lib/request-user-identity";

export const runtime = "nodejs";

const FEEDBACK_CATEGORIES = new Set(["feedback", "suggestion", "inquiry"]);
const FEEDBACK_REPLY_AUTHOR_TYPES = new Set(["user", "team"]);
const MIN_MESSAGE_LENGTH = 5;

type FeedbackBody = {
  category?: unknown;
  message?: unknown;
  contactEmail?: unknown;
  locale?: unknown;
  pathname?: unknown;
};

type SessionUserIdentity = {
  id: string;
  email: string;
  externalUserId: string;
  sessionKey: string;
};

type FeedbackThreadResponse = {
  id: string;
  category: "feedback" | "suggestion" | "inquiry";
  contactEmail: string | null;
  createdAt: string;
  messages: Array<{
    id: string;
    authorType: "user" | "team";
    message: string;
    createdAt: string;
  }>;
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

function normalizeSessionUserIdentity(session: {
  user?: { id?: unknown; email?: unknown };
} | null): SessionUserIdentity {
  return {
    id: typeof session?.user?.id === "string" ? session.user.id.trim() : "",
    email: typeof session?.user?.email === "string"
      ? session.user.email.trim().toLowerCase()
      : "",
    externalUserId: "",
    sessionKey: "",
  };
}

function sanitizeTrackingValue(rawValue: string | null): string {
  return (rawValue || "").trim().slice(0, 128);
}

function readCookieValue(request: Request, cookieName: string): string {
  const cookieHeader = request.headers.get("cookie") || "";
  for (const segment of cookieHeader.split(";")) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;
    const name = trimmed.slice(0, separatorIndex).trim();
    if (name !== cookieName) continue;
    const value = trimmed.slice(separatorIndex + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return "";
}

function resolveTrackingSessionKey(request: Request): string {
  return sanitizeTrackingValue(
    request.headers.get("x-mingle-session-key")
    || readCookieValue(request, "mingle_sid")
    || null,
  );
}

function resolveTrackingExternalUserId(request: Request): string {
  return sanitizeTrackingValue(
    request.headers.get("x-mingle-user-id")
    || readCookieValue(request, "mingle_uid")
    || null,
  );
}

async function resolveFeedbackUserIds(identity: SessionUserIdentity): Promise<string[]> {
  const userIds = new Set<string>();

  if (identity.id) {
    const user = await prisma.user.findUnique({
      where: { id: identity.id },
      select: { id: true },
    });
    if (user?.id) userIds.add(user.id);
  }

  if (identity.email) {
    const user = await prisma.user.findUnique({
      where: { email: identity.email },
      select: { id: true },
    });
    if (user?.id) userIds.add(user.id);
  }

  if (identity.externalUserId) {
    const user = await prisma.user.findUnique({
      where: { externalUserId: identity.externalUserId },
      select: { id: true },
    });
    if (user?.id) userIds.add(user.id);
  }

  return [...userIds];
}

function serializeFeedbackThread(thread: {
  id: string;
  category: string;
  message: string;
  contactEmail: string | null;
  createdAt: Date;
  replies: Array<{
    id: string;
    authorType: string;
    message: string;
    createdAt: Date;
  }>;
}): FeedbackThreadResponse | null {
  if (!FEEDBACK_CATEGORIES.has(thread.category)) return null;

  const messages: FeedbackThreadResponse["messages"] = [
    {
      id: `${thread.id}:root`,
      authorType: "user",
      message: thread.message,
      createdAt: thread.createdAt.toISOString(),
    },
  ];

  for (const reply of thread.replies) {
    if (!FEEDBACK_REPLY_AUTHOR_TYPES.has(reply.authorType)) continue;
    messages.push({
      id: reply.id,
      authorType: reply.authorType as "user" | "team",
      message: reply.message,
      createdAt: reply.createdAt.toISOString(),
    });
  }

  return {
    id: thread.id,
    category: thread.category as "feedback" | "suggestion" | "inquiry",
    contactEmail: thread.contactEmail,
    createdAt: thread.createdAt.toISOString(),
    messages,
  };
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

export async function GET(request: Request) {
  const nextRequest = request as NextRequest;
  const session = await getServerSession(getAuthOptions());
  const trackingSeedResponse = new NextResponse();
  const tracking = ensureTrackingContext(nextRequest, trackingSeedResponse, {
    externalUserIdHint: resolveTrackingExternalUserId(request) || null,
    sessionKeyHint: resolveTrackingSessionKey(request) || null,
  });
  const sessionIdentity = normalizeSessionUserIdentity(session);
  const allowLegacyAnonymousUser = requestAllowsLegacyAnonymousUser(request);
  const hasAuthenticatedIdentity = Boolean(sessionIdentity.id || sessionIdentity.email);
  if (!hasAuthenticatedIdentity && !allowLegacyAnonymousUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const identity = {
    ...sessionIdentity,
    externalUserId: !hasAuthenticatedIdentity && allowLegacyAnonymousUser
      ? resolveTrackingExternalUserId(request) || tracking.externalUserId
      : "",
    sessionKey: !hasAuthenticatedIdentity && allowLegacyAnonymousUser
      ? resolveTrackingSessionKey(request) || tracking.sessionKey
      : "",
  };
  const userIds = await resolveFeedbackUserIds(identity);

  if (userIds.length === 0) {
    const response = NextResponse.json({ threads: [] satisfies FeedbackThreadResponse[] });
    return withTrackingCookies(nextRequest, response, tracking);
  }

  const feedbackThreads = await prisma.appFeedback.findMany({
    where: {
      userId: { in: userIds },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      category: true,
      message: true,
      contactEmail: true,
      createdAt: true,
      replies: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          authorType: true,
          message: true,
          createdAt: true,
        },
      },
    },
  });

  const threads = feedbackThreads
    .map(serializeFeedbackThread)
    .filter((thread): thread is FeedbackThreadResponse => Boolean(thread));

  const response = NextResponse.json({ threads });
  return withTrackingCookies(nextRequest, response, tracking);
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
  const tracking = ensureTrackingContext(nextRequest, trackingSeedResponse, {
    externalUserIdHint: resolveTrackingExternalUserId(request) || null,
    sessionKeyHint: resolveTrackingSessionKey(request) || null,
  });
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
  const sessionIdentity = normalizeSessionUserIdentity(session);
  const hasAuthenticatedIdentity = Boolean(sessionIdentity.id || sessionIdentity.email);
  if (hasAuthenticatedIdentity && !authenticatedUserId) {
    return NextResponse.json({ error: "authenticated_user_not_found" }, { status: 401 });
  }
  const allowLegacyAnonymousUser = requestAllowsLegacyAnonymousUser(request);
  if (!authenticatedUserId && !allowLegacyAnonymousUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = authenticatedUserId ?? await upsertTrackedUser({ tracking, clientContext });

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
