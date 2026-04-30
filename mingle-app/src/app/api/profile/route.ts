import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { normalizeAppLocale } from "@/lib/app-locale";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function normalizeDisplayName(rawValue: unknown): string | null | undefined {
  if (rawValue === undefined) return undefined;
  if (typeof rawValue !== "string") return null;

  const normalized = rawValue.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  return normalized.slice(0, 80);
}

export async function GET() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      image: true,
      language: true,
      name: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    appLocale: normalizeAppLocale(user.language),
    displayName: user.name,
    id: user.id,
    image: user.image,
  });
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const data: {
    language?: string | null;
    name?: string | null;
  } = {};

  const displayName = normalizeDisplayName(input.displayName);
  if (displayName !== undefined) {
    data.name = displayName;
  }

  if (input.appLocale !== undefined) {
    const appLocale = typeof input.appLocale === "string"
      ? normalizeAppLocale(input.appLocale)
      : null;

    if (input.appLocale && !appLocale) {
      return NextResponse.json({ error: "invalid_app_locale" }, { status: 400 });
    }

    data.language = appLocale;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no_fields_to_update" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: {
      id: true,
      image: true,
      language: true,
      name: true,
    },
  });

  return NextResponse.json({
    appLocale: normalizeAppLocale(updated.language),
    displayName: updated.name,
    id: updated.id,
    image: updated.image,
  });
}
