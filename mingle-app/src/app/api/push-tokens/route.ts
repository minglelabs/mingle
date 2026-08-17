import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_TOKEN_LENGTH = 4096;
const MAX_INSTALLATION_ID_LENGTH = 128;
const MAX_METADATA_LENGTH = 64;

type PushPlatform = "ios" | "android";

function getSessionUserId(session: { user?: { id?: unknown } } | null): string {
  return typeof session?.user?.id === "string" ? session.user.id.trim() : "";
}

function responseJson(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      ...init?.headers,
    },
  });
}

function normalizeBoundedString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function resolvePlatform(value: unknown): PushPlatform | null {
  const normalized = normalizeBoundedString(value, 16).toLowerCase();
  return normalized === "ios" || normalized === "android" ? normalized : null;
}

function resolveEnvironment(value: unknown, platform: PushPlatform): string {
  if (platform !== "ios") return "production";
  const normalized = normalizeBoundedString(value, 16).toLowerCase();
  return normalized === "sandbox" ? "sandbox" : "production";
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === "P2002";
}

async function readJsonBody(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

async function resolveViewerId(): Promise<string> {
  return getSessionUserId(await getServerSession(getAuthOptions()));
}

export async function POST(request: NextRequest) {
  const userId = await resolveViewerId();
  if (!userId) return responseJson({ error: "unauthorized" }, { status: 401 });

  const body = await readJsonBody(request);
  const platform = resolvePlatform(body.platform);
  const token = normalizeBoundedString(body.token, MAX_TOKEN_LENGTH);
  const installationId = normalizeBoundedString(body.installationId, MAX_INSTALLATION_ID_LENGTH);
  if (!platform || !token || !installationId) {
    return responseJson({ error: "invalid_push_token" }, { status: 400 });
  }

  const environment = resolveEnvironment(body.environment, platform);
  const appVersion = normalizeBoundedString(body.appVersion, MAX_METADATA_LENGTH) || null;
  const apiNamespace = normalizeBoundedString(body.apiNamespace, MAX_METADATA_LENGTH) || null;

  const installationKey = {
    installationId_platform: { installationId, platform },
  } as const;

  try {
    const existingInstallation = await prisma.userPushToken.findUnique({
      where: installationKey,
      select: { id: true },
    });

    if (existingInstallation) {
      await prisma.userPushToken.update({
        where: { id: existingInstallation.id },
        data: {
          userId,
          token,
          environment,
          appVersion,
          apiNamespace,
        },
      });
    } else {
      const existingToken = await prisma.userPushToken.findUnique({
        where: { token },
        select: { id: true },
      });

      if (existingToken) {
        await prisma.userPushToken.update({
          where: { id: existingToken.id },
          data: {
            userId,
            installationId,
            platform,
            environment,
            appVersion,
            apiNamespace,
          },
        });
      } else {
        await prisma.userPushToken.create({
          data: {
            userId,
            installationId,
            platform,
            token,
            environment,
            appVersion,
            apiNamespace,
          },
        });
      }
    }
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) throw error;

    // A token refresh and a login can arrive at the same time. The token is
    // the strongest identity in that race, so retry by token.
    await prisma.userPushToken.upsert({
      where: { token },
      create: {
        userId,
        installationId,
        platform,
        token,
        environment,
        appVersion,
        apiNamespace,
      },
      update: {
        userId,
        installationId,
        platform,
        environment,
        appVersion,
        apiNamespace,
      },
    });
  }

  return responseJson({ registered: true });
}

export async function DELETE(request: NextRequest) {
  const userId = await resolveViewerId();
  if (!userId) return responseJson({ error: "unauthorized" }, { status: 401 });

  const body = await readJsonBody(request);
  const platform = resolvePlatform(body.platform);
  const token = normalizeBoundedString(body.token, MAX_TOKEN_LENGTH);
  const installationId = normalizeBoundedString(body.installationId, MAX_INSTALLATION_ID_LENGTH);
  if (!token && !installationId) {
    return responseJson({ error: "invalid_push_token" }, { status: 400 });
  }

  const result = await prisma.userPushToken.deleteMany({
    where: {
      userId,
      ...(token ? { token } : {}),
      ...(installationId ? { installationId } : {}),
      ...(platform ? { platform } : {}),
    },
  });

  return responseJson({ removedCount: result.count });
}
