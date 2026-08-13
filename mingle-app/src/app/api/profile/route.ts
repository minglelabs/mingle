import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { resolveSupportedLocaleTag } from "@/i18n/config";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_DISPLAY_NAME_LENGTH = 40;
const MAX_BIO_LENGTH = 160;

const profileSelect = {
  id: true,
  name: true,
  image: true,
  displayName: true,
  bio: true,
  nationality: true,
  _count: {
    select: {
      followerRelations: true,
      followingRelations: true,
    },
  },
} as const;

type ProfileRecord = {
  id: string;
  name: string | null;
  image: string | null;
  displayName: string | null;
  bio: string | null;
  nationality: string | null;
  _count: {
    followerRelations: number;
    followingRelations: number;
  };
};

function profileResponse(profile: ProfileRecord): NextResponse {
  const { _count, ...profileFields } = profile;
  return NextResponse.json({
    ...profileFields,
    followersCount: _count.followerRelations,
    followingCount: _count.followingRelations,
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

function getSessionUserId(session: { user?: { id?: unknown } } | null): string {
  return typeof session?.user?.id === "string" ? session.user.id.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeOptionalText(
  value: unknown,
  maxLength: number,
): { value: string | null; valid: boolean } {
  if (value === null) return { value: null, valid: true };
  if (typeof value !== "string") return { value: null, valid: false };

  const normalized = value.trim();
  if (normalized.length > maxLength) return { value: null, valid: false };
  return { value: normalized || null, valid: true };
}

function normalizeNationality(value: unknown): { value: string | null; valid: boolean } {
  if (value === null) return { value: null, valid: true };
  if (typeof value !== "string") return { value: null, valid: false };

  const normalized = value.trim();
  if (!normalized) return { value: null, valid: true };

  return {
    value: resolveSupportedLocaleTag(normalized),
    valid: Boolean(resolveSupportedLocaleTag(normalized)),
  };
}

export async function GET() {
  const session = await getServerSession(getAuthOptions());
  const userId = getSessionUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const profile = await prisma.user.findUnique({
    where: { id: userId },
    select: profileSelect,
  });
  if (!profile) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }

  return profileResponse(profile);
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  const userId = getSessionUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!isRecord(body)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const data: {
    displayName?: string | null;
    bio?: string | null;
    nationality?: string | null;
  } = {};

  if (Object.prototype.hasOwnProperty.call(body, "displayName")) {
    const displayName = normalizeOptionalText(body.displayName, MAX_DISPLAY_NAME_LENGTH);
    if (!displayName.valid) {
      return NextResponse.json({ error: "invalid_display_name" }, { status: 400 });
    }
    data.displayName = displayName.value;
  }

  if (Object.prototype.hasOwnProperty.call(body, "bio")) {
    const bio = normalizeOptionalText(body.bio, MAX_BIO_LENGTH);
    if (!bio.valid) {
      return NextResponse.json({ error: "invalid_bio" }, { status: 400 });
    }
    data.bio = bio.value;
  }

  if (Object.prototype.hasOwnProperty.call(body, "nationality")) {
    const nationality = normalizeNationality(body.nationality);
    if (!nationality.valid) {
      return NextResponse.json({ error: "invalid_nationality" }, { status: 400 });
    }
    data.nationality = nationality.value;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no_fields_to_update" }, { status: 400 });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: profileSelect,
    });
    return profileResponse(updated);
  } catch {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }
}
