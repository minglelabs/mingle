import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import {
  MAX_STT_LANGUAGE_SELECTION,
  canonicalizeSttLanguageCode,
  sanitizeSttLanguageSelection,
} from "@/lib/stt-languages";
import { normalizeHandle } from "@/lib/handles";
import {
  isOldEnoughForSignup,
  parseBirthDate,
} from "@/lib/birth-date";
import { isDiscoverySource, type DiscoverySource } from "@/lib/discovery-source";
import {
  PROFILE_IMAGE_MAX_SCALE,
  PROFILE_IMAGE_MIN_SCALE,
} from "@/lib/profile-image-crop";
import {
  getUserProfile,
  serializeUserProfile,
  userProfileSelect,
  type UserProfile,
} from "@/server/user-profile";

export const runtime = "nodejs";

const MAX_NAME_LENGTH = 40;
const MAX_BIO_LENGTH = 160;

function profileResponse(profile: UserProfile): NextResponse {
  return NextResponse.json(profile, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

function serializePrivateBirthDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
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

  const languageCode = canonicalizeSttLanguageCode(normalized);

  return {
    value: languageCode || null,
    valid: Boolean(languageCode),
  };
}

function normalizeLanguageSelection(value: unknown): { value: string[]; valid: boolean } {
  if (value === null) return { value: [], valid: true };
  if (!Array.isArray(value)) return { value: [], valid: false };

  const normalized = sanitizeSttLanguageSelection(value);
  return {
    value: normalized,
    valid: normalized.length >= 1 && normalized.length <= MAX_STT_LANGUAGE_SELECTION,
  };
}

function normalizeCropValue(
  value: unknown,
  minimum: number,
  maximum: number,
): { value: number | null; valid: boolean } {
  if (value === null) return { value: null, valid: true };
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { value: null, valid: false };
  }
  if (value < minimum || value > maximum) {
    return { value: null, valid: false };
  }
  return { value, valid: true };
}

export async function GET() {
  const session = await getServerSession(getAuthOptions());
  const userId = getSessionUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const profile = await getUserProfile(userId);
  if (!profile) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }

  const privateFields = await prisma.user.findUnique({
    where: { id: userId },
    select: { birthDate: true },
  });
  return profileResponse({
    ...profile,
    birthDate: serializePrivateBirthDate(privateFields?.birthDate),
  });
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
    handle?: string;
    name?: string | null;
    bio?: string | null;
    nationality?: string | null;
    primaryLanguages?: string[];
    defaultConversationLanguages?: string[];
    birthDate?: Date | null;
    discoverySource?: DiscoverySource | null;
    imageCropScale?: number | null;
    imageCropX?: number | null;
    imageCropY?: number | null;
  } = {};

  if (Object.prototype.hasOwnProperty.call(body, "handle")) {
    const handle = normalizeHandle(body.handle);
    if (!handle.valid || !handle.value) {
      return NextResponse.json({ error: "invalid_handle" }, { status: 400 });
    }
    data.handle = handle.value;
  }

  if (Object.prototype.hasOwnProperty.call(body, "name")) {
    const name = normalizeOptionalText(body.name, MAX_NAME_LENGTH);
    if (!name.valid) {
      return NextResponse.json({ error: "invalid_name" }, { status: 400 });
    }
    data.name = name.value;
  }

  if (Object.prototype.hasOwnProperty.call(body, "bio")) {
    const bio = normalizeOptionalText(body.bio, MAX_BIO_LENGTH);
    if (!bio.valid) {
      return NextResponse.json({ error: "invalid_bio" }, { status: 400 });
    }
    data.bio = bio.value;
  }

  const hasPrimaryLanguages = Object.prototype.hasOwnProperty.call(body, "primaryLanguages");
  const hasNationality = Object.prototype.hasOwnProperty.call(body, "nationality");

  if (hasNationality) {
    const nationality = normalizeNationality(body.nationality);
    if (!nationality.valid) {
      return NextResponse.json({ error: "invalid_nationality" }, { status: 400 });
    }
    data.nationality = nationality.value;
    if (!hasPrimaryLanguages) {
      data.primaryLanguages = nationality.value ? [nationality.value] : [];
    }
  }

  if (hasPrimaryLanguages) {
    const primaryLanguages = normalizeLanguageSelection(body.primaryLanguages);
    if (!primaryLanguages.valid) {
      return NextResponse.json({ error: "invalid_primary_languages" }, { status: 400 });
    }
    data.primaryLanguages = primaryLanguages.value;
    data.nationality = primaryLanguages.value[0] ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(body, "defaultConversationLanguages")) {
    const defaultConversationLanguages = normalizeLanguageSelection(body.defaultConversationLanguages);
    if (!defaultConversationLanguages.valid) {
      return NextResponse.json({ error: "invalid_default_conversation_languages" }, { status: 400 });
    }
    data.defaultConversationLanguages = defaultConversationLanguages.value;
  }

  if (Object.prototype.hasOwnProperty.call(body, "birthDate")) {
    if (body.birthDate === null) {
      data.birthDate = null;
    } else {
      const birthDate = parseBirthDate(body.birthDate);
      if (!birthDate) {
        return NextResponse.json({ error: "invalid_birth_date" }, { status: 400 });
      }
      const birthDateParts = {
        year: birthDate.getUTCFullYear(),
        month: birthDate.getUTCMonth() + 1,
        day: birthDate.getUTCDate(),
      };
      if (!isOldEnoughForSignup(birthDateParts)) {
        return NextResponse.json({ error: "minimum_age_required" }, { status: 400 });
      }
      data.birthDate = birthDate;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "discoverySource")) {
    if (body.discoverySource === null) {
      data.discoverySource = null;
    } else if (!isDiscoverySource(body.discoverySource)) {
      return NextResponse.json({ error: "invalid_discovery_source" }, { status: 400 });
    } else {
      data.discoverySource = body.discoverySource;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "imageCropScale")) {
    const imageCropScale = normalizeCropValue(
      body.imageCropScale,
      PROFILE_IMAGE_MIN_SCALE,
      PROFILE_IMAGE_MAX_SCALE,
    );
    if (!imageCropScale.valid) {
      return NextResponse.json({ error: "invalid_image_crop" }, { status: 400 });
    }
    data.imageCropScale = imageCropScale.value;
  }

  if (Object.prototype.hasOwnProperty.call(body, "imageCropX")) {
    const imageCropX = normalizeCropValue(body.imageCropX, -1, 1);
    if (!imageCropX.valid) {
      return NextResponse.json({ error: "invalid_image_crop" }, { status: 400 });
    }
    data.imageCropX = imageCropX.value;
  }

  if (Object.prototype.hasOwnProperty.call(body, "imageCropY")) {
    const imageCropY = normalizeCropValue(body.imageCropY, -1, 1);
    if (!imageCropY.valid) {
      return NextResponse.json({ error: "invalid_image_crop" }, { status: 400 });
    }
    data.imageCropY = imageCropY.value;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no_fields_to_update" }, { status: 400 });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: userProfileSelect,
    });
    const privateFields = await prisma.user.findUnique({
      where: { id: userId },
      select: { birthDate: true },
    });
    return profileResponse({
      ...serializeUserProfile(updated),
      birthDate: serializePrivateBirthDate(privateFields?.birthDate),
    });
  } catch (error) {
    if (
      typeof error === "object"
      && error !== null
      && "code" in error
      && error.code === "P2002"
    ) {
      return NextResponse.json({ error: "handle_taken" }, { status: 409 });
    }
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }
}
