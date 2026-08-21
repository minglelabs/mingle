import { Prisma } from "@prisma/client/index";
import { prisma } from "@/lib/prisma";
import { sanitizeSttLanguageSelection } from "@/lib/stt-languages";
import { formatLocalizedConversationTitle } from "@/i18n/conversations";

export const APP_CONVERSATION_STATUS_ACTIVE = "active";
export const APP_CONVERSATION_STATUS_PAUSED = "paused";
export const CONVERSATION_HYDRATION_MESSAGE_LIMIT = 100;
// Total people in a room, including the creator — matches the invite
// picker's selection cap.
export const MAX_CONVERSATION_MEMBERS = 10;

export type AppConversationChannelStatus =
  | typeof APP_CONVERSATION_STATUS_ACTIVE
  | typeof APP_CONVERSATION_STATUS_PAUSED;

export type ConversationChannelSummary = {
  id: string;
  sequenceNumber: number;
  title: string;
  status: AppConversationChannelStatus;
  sessionKey: string;
  // True once the room has 2+ real members. Solo (0-1 member) rooms use the
  // generated per-speaker-turn diarization avatar system instead of real
  // account identity, so the client needs this to decide which avatar
  // system a bubble belongs to.
  isMultiMember: boolean;
  messageCount?: number;
  selectedLanguages?: string[];
  speechLanguages?: string[];
  translationLanguagesLinked?: boolean;
  defaultDisplayLanguage?: string | null;
  latestMessagePreview?: string;
  latestMessageAt?: string | null;
  latestSpeaker?: string | null;
  latestSpeakerAvatarSeed?: string | null;
  latestSpeakerAvatarIndex?: number | null;
  createdAt: string;
  updatedAt: string;
  pausedAt: string | null;
};

export type ConversationHydrationUtterance = {
  id: string;
  originalText: string;
  originalLang: string;
  targetLanguages: string[];
  translations: Record<string, string>;
  translationFinalized: Record<string, boolean>;
  createdAtMs: number;
  speaker: string | null;
  speakerAvatarSeed: string | null;
  speakerAvatarIndex: number | null;
  // The real account that sent this message, if any — lets the client tell
  // "mine" from "theirs" for bubble alignment. Distinct from `speaker`, which
  // is a free-text diarization label used inside a single solo session.
  speakerUserId: string | null;
  // The sender's real uploaded profile photo, populated only once the room
  // has 2+ real members. Null in a solo room, where bubbles keep using the
  // generated animal avatar instead.
  speakerImage: string | null;
};

export type ConversationHydrationCursor = {
  createdAtMs: number;
  messageId: string;
};

export type ConversationHydrationState = {
  conversation: ConversationChannelSummary;
  usageSec: number;
  messageCount: number;
  utterances: ConversationHydrationUtterance[];
  hasMoreUtterances: boolean;
  oldestMessageCursor: ConversationHydrationCursor | null;
};

type ConversationChannelRecord = {
  id: string;
  sequenceNumber: number;
  title: string;
  status: string;
  sessionKey: string;
  selectedLanguages: string[];
  speechLanguages: string[];
  translationLanguagesLinked: boolean;
  defaultDisplayLanguage: string | null;
  createdAt: Date;
  updatedAt: Date;
  pausedAt: Date | null;
};

type ListConversationChannelsForUserOptions = {
  includeMessageSummaries?: boolean;
};

const conversationChannelSelect = {
  id: true,
  sequenceNumber: true,
  title: true,
  status: true,
  sessionKey: true,
  selectedLanguages: true,
  speechLanguages: true,
  translationLanguagesLinked: true,
  defaultDisplayLanguage: true,
  createdAt: true,
  updatedAt: true,
  pausedAt: true,
} satisfies Prisma.AppConversationChannelSelect;

function buildVisibleConversationWhere(): Prisma.AppConversationChannelWhereInput {
  return {
    OR: [
      { isDeleted: false },
      { isDeleted: null },
    ],
  };
}

function buildVisibleMessageWhere(): Prisma.AppMessageWhereInput {
  return {
    OR: [
      { isDeleted: false },
      { isDeleted: null },
    ],
  };
}

function buildVisibleMessageContentWhere(): Prisma.AppMessageContentWhereInput {
  return {
    OR: [
      { isDeleted: false },
      { isDeleted: null },
    ],
  };
}

// Every read/update on a channel is gated on membership, not ownership, so a
// non-owner member (someone invited into a multi-member room) can use it too.
// ownerUserId stays on the channel purely as creator/admin metadata (it drives
// sequenceNumber numbering and delete permission) — it is not an auth check.
function buildVisibleMembershipWhere(userId: string): Prisma.AppConversationChannelWhereInput {
  return {
    members: { some: { userId } },
  };
}

type ChannelMemberProfile = {
  userId: string;
  name: string | null;
  handle: string | null;
  image: string | null;
  imageCropScale: number | null;
  imageCropX: number | null;
  imageCropY: number | null;
  displayLanguage: string | null;
  status: string;
  pausedAt: Date | null;
};

async function listChannelMembersByChannelId(
  channelIds: string[],
): Promise<Map<string, ChannelMemberProfile[]>> {
  if (channelIds.length === 0) {
    return new Map();
  }

  const rows = await prisma.appConversationChannelMember.findMany({
    where: { channelId: { in: channelIds } },
    orderBy: { joinedAt: "asc" },
    select: {
      channelId: true,
      userId: true,
      displayLanguage: true,
      status: true,
      pausedAt: true,
      user: {
        select: {
          name: true,
          handle: true,
          image: true,
          imageCropScale: true,
          imageCropX: true,
          imageCropY: true,
        },
      },
    },
  });

  const membersByChannelId = new Map<string, ChannelMemberProfile[]>();
  for (const row of rows) {
    const members = membersByChannelId.get(row.channelId) ?? [];
    members.push({
      userId: row.userId,
      name: row.user.name,
      handle: row.user.handle,
      image: row.user.image,
      imageCropScale: row.user.imageCropScale,
      imageCropX: row.user.imageCropX,
      imageCropY: row.user.imageCropY,
      displayLanguage: row.displayLanguage,
      status: row.status,
      pausedAt: row.pausedAt,
    });
    membersByChannelId.set(row.channelId, members);
  }
  return membersByChannelId;
}

// A shared room's title should read as "who else is in it," not a generic
// auto-generated label — and that label is different depending on who's
// looking, so it's computed at read time from membership, never stored.
// 2 members: the other person's name. 3+: every other member's name,
// comma-joined (e.g. "a, b, c"). Solo (0-1 members) keeps the stored title.
function resolveViewerFacingTitle(
  storedTitle: string,
  members: ChannelMemberProfile[] | undefined,
  viewerUserId: string | null | undefined,
): string {
  if (!viewerUserId || !members || members.length < 2) return storedTitle;
  const others = members.filter((member) => member.userId !== viewerUserId);
  if (others.length === 0) return storedTitle;
  const names = others.map((member) => member.name?.trim() || member.handle?.trim() || "").filter(Boolean);
  if (names.length === 0) return storedTitle;
  return names.join(", ");
}

// Once a room has 2+ real members, one shared "display language" can't
// represent everyone's own reading preference — each member reads translated
// bubbles in their own language, sourced from their own membership row.
// Solo rooms (0-1 members) keep using the channel-wide value untouched.
function resolveViewerFacingDisplayLanguage(
  channelWideValue: string | null,
  members: ChannelMemberProfile[] | undefined,
  viewerUserId: string | null | undefined,
): string | null {
  if (!viewerUserId || !members || members.length < 2) return channelWideValue;
  const viewerMember = members.find((member) => member.userId === viewerUserId);
  return viewerMember?.displayLanguage?.trim() || channelWideValue;
}

// "One active room per account" is a per-person invariant, so once a room
// has 2+ real members, the channel-wide status/pausedAt can't represent it —
// Alice pausing her other rooms shouldn't pause the shared room for Bob, and
// vice versa. Solo rooms (0-1 members) keep using the channel-wide fields.
function resolveViewerFacingStatus(
  channelWideValue: string,
  members: ChannelMemberProfile[] | undefined,
  viewerUserId: string | null | undefined,
): string {
  if (!viewerUserId || !members || members.length < 2) return channelWideValue;
  const viewerMember = members.find((member) => member.userId === viewerUserId);
  return viewerMember?.status || channelWideValue;
}

function resolveViewerFacingPausedAt(
  channelWideValue: Date | null,
  members: ChannelMemberProfile[] | undefined,
  viewerUserId: string | null | undefined,
): Date | null {
  if (!viewerUserId || !members || members.length < 2) return channelWideValue;
  const viewerMember = members.find((member) => member.userId === viewerUserId);
  return viewerMember ? viewerMember.pausedAt : channelWideValue;
}

// Shared by both the 1:1 "message this person" entry point and the
// invite-friends group-creation flow — without it, knowing someone's user id
// is enough to bypass a block and reach (or create) shared room membership
// with them.
async function assertNoBlockAmong(userId: string, otherUserIds: string[]): Promise<void> {
  if (otherUserIds.length === 0) return;
  const block = await prisma.userBlock.findFirst({
    where: {
      OR: otherUserIds.flatMap((otherUserId) => [
        { blockerId: userId, blockedId: otherUserId },
        { blockerId: otherUserId, blockedId: userId },
      ]),
    },
    select: { blockerId: true },
  });
  if (block) {
    throw new Error("target_user_blocked");
  }
}

function createConversationSessionKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `conv_${crypto.randomUUID().replaceAll("-", "")}`;
  }

  return `conv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function formatConversationChannelTitle(
  sequenceNumber: number,
  locale = "en",
): string {
  return formatLocalizedConversationTitle(locale, sequenceNumber);
}

export function normalizeConversationChannelStatus(
  rawStatus: string,
): AppConversationChannelStatus {
  return rawStatus === APP_CONVERSATION_STATUS_PAUSED
    ? APP_CONVERSATION_STATUS_PAUSED
    : APP_CONVERSATION_STATUS_ACTIVE;
}

function normalizeConversationMessageCount(value: number | null | undefined): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? Math.floor(value ?? 0) : 0;
}

function serializeConversationChannel(
  record: ConversationChannelRecord,
  latestMessagePreview?: string,
  latestMessageAt?: string | null,
  latestSpeaker?: string | null,
  latestSpeakerAvatarSeed?: string | null,
  latestSpeakerAvatarIndex?: number | null,
  messageCount?: number,
  viewerFacingTitle?: string,
  viewerFacingDisplayLanguage?: string | null,
  viewerFacingStatus?: string,
  viewerFacingPausedAt?: Date | null,
  isMultiMember?: boolean,
): ConversationChannelSummary {
  const selectedLanguages = [...record.selectedLanguages];
  const speechLanguages = record.speechLanguages.length > 0
    ? [...record.speechLanguages]
    : [...selectedLanguages];
  const translationLanguagesLinked = record.translationLanguagesLinked !== false;

  return {
    id: record.id,
    sequenceNumber: record.sequenceNumber,
    title: viewerFacingTitle ?? record.title,
    status: normalizeConversationChannelStatus(viewerFacingStatus ?? record.status),
    sessionKey: record.sessionKey,
    isMultiMember: isMultiMember === true,
    ...(typeof messageCount === "number"
      ? { messageCount: normalizeConversationMessageCount(messageCount) }
      : {}),
    selectedLanguages,
    speechLanguages,
    translationLanguagesLinked,
    defaultDisplayLanguage: viewerFacingDisplayLanguage !== undefined
      ? (viewerFacingDisplayLanguage?.trim() || null)
      : (record.defaultDisplayLanguage?.trim() || null),
    latestMessagePreview,
    latestMessageAt: latestMessageAt || null,
    latestSpeaker: latestSpeaker || null,
    latestSpeakerAvatarSeed: latestSpeakerAvatarSeed || null,
    latestSpeakerAvatarIndex:
      typeof latestSpeakerAvatarIndex === "number" && Number.isInteger(latestSpeakerAvatarIndex)
        ? latestSpeakerAvatarIndex
        : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    pausedAt: (viewerFacingPausedAt !== undefined ? viewerFacingPausedAt : record.pausedAt)?.toISOString() ?? null,
  };
}

function normalizeConversationPreview(rawValue: string | null | undefined): string {
  return (rawValue || "").replace(/\s+/g, " ").trim();
}

type LatestMessageSummary = {
  preview: string;
  createdAt: string | null;
  speaker: string | null;
  speakerAvatarSeed: string | null;
  speakerAvatarIndex: number | null;
};

function readStringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function readIntegerValue(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    return null;
  }
  return value;
}

function readJsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

async function listLatestMessageSummaryBySessionKey(
  sessionKeys: string[],
): Promise<Map<string, LatestMessageSummary>> {
  if (sessionKeys.length === 0) {
    return new Map();
  }

  const latestMessages = await prisma.appMessage.findMany({
    where: {
      sessionKey: {
        in: sessionKeys,
      },
      ...buildVisibleMessageWhere(),
    },
    orderBy: [
      { sessionKey: "asc" },
      { createdAt: "desc" },
    ],
    distinct: ["sessionKey"],
    select: {
      sessionKey: true,
      createdAt: true,
      sourceLanguage: true,
      metadata: true,
      contents: {
        where: {
          contentType: "SOURCE",
          ...buildVisibleMessageContentWhere(),
        },
        orderBy: { createdAt: "asc" },
        select: {
          language: true,
          text: true,
        },
      },
    },
  });

  const summaryBySessionKey = new Map<string, LatestMessageSummary>();
  for (const message of latestMessages) {
    const sourceContent = message.contents.find((content) => content.language === message.sourceLanguage)
      || message.contents[0]
      || null;
    const preview = normalizeConversationPreview(sourceContent?.text);
    const metadata = readJsonObject(message.metadata);
    const clientMetadata = readJsonObject((metadata?.clientMetadata as Prisma.JsonValue | undefined) ?? null);
    if (!message.sessionKey) continue;
    summaryBySessionKey.set(message.sessionKey, {
      preview,
      createdAt: message.createdAt.toISOString(),
      speaker: readStringValue(clientMetadata?.speaker) ?? readStringValue(metadata?.speaker),
      speakerAvatarSeed:
        readStringValue(clientMetadata?.speakerAvatarSeed) ?? readStringValue(metadata?.speakerAvatarSeed),
      speakerAvatarIndex:
        readIntegerValue(clientMetadata?.speakerAvatarIndex) ?? readIntegerValue(metadata?.speakerAvatarIndex),
    });
  }

  return summaryBySessionKey;
}

async function listVisibleMessageCountsBySessionKey(
  sessionKeys: string[],
): Promise<Map<string, number>> {
  if (sessionKeys.length === 0) {
    return new Map();
  }

  const counts = await prisma.appMessage.groupBy({
    by: ["sessionKey"],
    where: {
      sessionKey: {
        in: sessionKeys,
      },
      ...buildVisibleMessageWhere(),
    },
    _count: {
      _all: true,
    },
  });

  const countBySessionKey = new Map<string, number>();
  for (const row of counts) {
    if (!row.sessionKey) continue;
    countBySessionKey.set(row.sessionKey, normalizeConversationMessageCount(row._count._all));
  }

  return countBySessionKey;
}

async function serializeConversationChannelWithPreview(
  record: ConversationChannelRecord,
  viewerUserId?: string | null,
): Promise<ConversationChannelSummary> {
  const [summaryBySessionKey, membersByChannelId] = await Promise.all([
    listLatestMessageSummaryBySessionKey([record.sessionKey]),
    viewerUserId ? listChannelMembersByChannelId([record.id]) : Promise.resolve(new Map<string, ChannelMemberProfile[]>()),
  ]);
  const latestMessage = summaryBySessionKey.get(record.sessionKey);
  return serializeConversationChannel(
    record,
    latestMessage?.preview,
    latestMessage?.createdAt,
    latestMessage?.speaker,
    latestMessage?.speakerAvatarSeed,
    latestMessage?.speakerAvatarIndex,
    undefined,
    resolveViewerFacingTitle(record.title, membersByChannelId.get(record.id), viewerUserId),
    resolveViewerFacingDisplayLanguage(record.defaultDisplayLanguage, membersByChannelId.get(record.id), viewerUserId),
    resolveViewerFacingStatus(record.status, membersByChannelId.get(record.id), viewerUserId),
    resolveViewerFacingPausedAt(record.pausedAt, membersByChannelId.get(record.id), viewerUserId),
    (membersByChannelId.get(record.id)?.length ?? 0) >= 2,
  );
}

async function listConversationChannelsForMember(
  memberWhere: Prisma.AppConversationChannelWhereInput,
  options: ListConversationChannelsForUserOptions = {},
  viewerUserId?: string | null,
): Promise<ConversationChannelSummary[]> {
  const records = await prisma.appConversationChannel.findMany({
    where: {
      ...memberWhere,
      ...buildVisibleConversationWhere(),
    },
    orderBy: [
      { updatedAt: "desc" },
      { createdAt: "desc" },
    ],
    select: conversationChannelSelect,
  });

  if (records.length === 0) {
    return [];
  }

  const membersByChannelId = viewerUserId
    ? await listChannelMembersByChannelId(records.map((record) => record.id))
    : new Map<string, ChannelMemberProfile[]>();

  if (options.includeMessageSummaries === false) {
    return records.map((record) => serializeConversationChannel(
      record,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      resolveViewerFacingTitle(record.title, membersByChannelId.get(record.id), viewerUserId),
      resolveViewerFacingDisplayLanguage(record.defaultDisplayLanguage, membersByChannelId.get(record.id), viewerUserId),
      resolveViewerFacingStatus(record.status, membersByChannelId.get(record.id), viewerUserId),
      resolveViewerFacingPausedAt(record.pausedAt, membersByChannelId.get(record.id), viewerUserId),
      (membersByChannelId.get(record.id)?.length ?? 0) >= 2,
    ));
  }

  const sessionKeys = [...new Set(records.map((record) => record.sessionKey))];
  const [latestMessageSummaryBySessionKey, messageCountBySessionKey] = await Promise.all([
    listLatestMessageSummaryBySessionKey(sessionKeys),
    listVisibleMessageCountsBySessionKey(sessionKeys),
  ]);

  return records
    .map((record) => {
      const latestMessage = latestMessageSummaryBySessionKey.get(record.sessionKey);
      return serializeConversationChannel(
        record,
        latestMessage?.preview,
        latestMessage?.createdAt,
        latestMessage?.speaker,
        latestMessage?.speakerAvatarSeed,
        latestMessage?.speakerAvatarIndex,
        messageCountBySessionKey.get(record.sessionKey) ?? 0,
        resolveViewerFacingTitle(record.title, membersByChannelId.get(record.id), viewerUserId),
        resolveViewerFacingDisplayLanguage(record.defaultDisplayLanguage, membersByChannelId.get(record.id), viewerUserId),
        resolveViewerFacingStatus(record.status, membersByChannelId.get(record.id), viewerUserId),
        resolveViewerFacingPausedAt(record.pausedAt, membersByChannelId.get(record.id), viewerUserId),
        (membersByChannelId.get(record.id)?.length ?? 0) >= 2,
      );
    })
    .sort((left, right) => {
      const leftTimestamp = Date.parse(left.latestMessageAt || left.createdAt) || 0;
      const rightTimestamp = Date.parse(right.latestMessageAt || right.createdAt) || 0;
      return rightTimestamp - leftTimestamp;
    });
}

export async function listConversationChannelsForUser(
  userId: string,
  options: ListConversationChannelsForUserOptions = {},
): Promise<ConversationChannelSummary[]> {
  return listConversationChannelsForMember(buildVisibleMembershipWhere(userId), options, userId);
}

export async function listConversationChannelsForExternalUserId(
  externalUserId: string,
  options: ListConversationChannelsForUserOptions = {},
): Promise<ConversationChannelSummary[]> {
  const normalizedExternalUserId = externalUserId.trim();
  if (!normalizedExternalUserId) return [];

  // Resolve the real internal user id so per-viewer title/display-language
  // overrides (which key off userId, not externalUserId) still apply on this
  // native-tracking-identity path.
  const user = await prisma.user.findUnique({
    where: { externalUserId: normalizedExternalUserId },
    select: { id: true },
  });

  return listConversationChannelsForMember({
    members: {
      some: { user: { is: { externalUserId: normalizedExternalUserId } } },
    },
  }, options, user?.id);
}

export async function createConversationChannelForUser(
  userId: string,
  options?: {
    locale?: string;
    preferredSessionKey?: string;
    selectedLanguages?: string[];
    speechLanguages?: string[];
    translationLanguagesLinked?: boolean;
    inviteeUserIds?: string[];
  },
): Promise<ConversationChannelSummary> {
  const normalizedLocale = (options?.locale || "en").trim() || "en";
  const normalizedPreferredSessionKey = (options?.preferredSessionKey || "").trim();
  const normalizedSelectedLanguages = sanitizeSttLanguageSelection(options?.selectedLanguages);
  const normalizedSpeechLanguages = sanitizeSttLanguageSelection(options?.speechLanguages);
  const translationLanguagesLinked = options?.translationLanguagesLinked !== false;
  const resolvedSpeechLanguages = normalizedSpeechLanguages.length > 0
    ? normalizedSpeechLanguages
    : [...normalizedSelectedLanguages];
  const resolvedSelectedLanguages = normalizedSelectedLanguages.length > 0
    ? normalizedSelectedLanguages
    : [...resolvedSpeechLanguages];
  const inviteeUserIds = [...new Set((options?.inviteeUserIds || []).filter((id) => id && id !== userId))];
  if (inviteeUserIds.length > MAX_CONVERSATION_MEMBERS - 1) {
    throw new Error("too_many_invitees");
  }
  await assertNoBlockAmong(userId, inviteeUserIds);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const record = await prisma.$transaction(async (tx) => {
        const lastChannel = await tx.appConversationChannel.findFirst({
          where: { ownerUserId: userId, ...buildVisibleConversationWhere() },
          orderBy: { sequenceNumber: "desc" },
          select: { sequenceNumber: true },
        });
        const sequenceNumber = (lastChannel?.sequenceNumber ?? 0) + 1;

        const lowestChannel = await tx.appConversationChannel.findFirst({
          where: { ownerUserId: userId },
          orderBy: { sequenceNumber: "asc" },
          select: { sequenceNumber: true },
        });
        const vacatedSequenceNumber = Math.min(lowestChannel?.sequenceNumber ?? 0, sequenceNumber) - 1;

        await tx.appConversationChannel.updateMany({
          where: { ownerUserId: userId, sequenceNumber, isDeleted: true },
          data: { sequenceNumber: vacatedSequenceNumber },
        });

        const created = await tx.appConversationChannel.create({
          data: {
            ownerUserId: userId,
            sequenceNumber,
            title: formatConversationChannelTitle(sequenceNumber, normalizedLocale),
            status: APP_CONVERSATION_STATUS_PAUSED,
            sessionKey: normalizedPreferredSessionKey || createConversationSessionKey(),
            selectedLanguages: resolvedSelectedLanguages,
            speechLanguages: resolvedSpeechLanguages,
            translationLanguagesLinked,
            pausedAt: new Date(),
          },
          select: conversationChannelSelect,
        });

        // Mirror the channel's own just-created status/pausedAt onto every
        // member row, rather than relying on the column's schema default —
        // a shared room's members must start out paused exactly like a solo
        // room does, until someone explicitly activates it.
        await tx.appConversationChannelMember.createMany({
          data: [
            { channelId: created.id, userId, role: "owner", status: created.status, pausedAt: created.pausedAt },
            ...inviteeUserIds.map((inviteeUserId) => ({
              channelId: created.id,
              userId: inviteeUserId,
              role: "member",
              status: created.status,
              pausedAt: created.pausedAt,
            })),
          ],
          skipDuplicates: true,
        });

        return created;
      });

      return serializeConversationChannelWithPreview(record, userId);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("conversation_channel_create_conflict");
}

// The entry point for "message this person": reuses whatever 1:1 room
// already exists between the two accounts instead of spawning a duplicate
// every time someone taps the button on a profile they've messaged before.
export async function findOrCreateDirectConversation(args: {
  userId: string;
  targetUserId: string;
  locale?: string;
}): Promise<ConversationChannelSummary> {
  const targetUserId = args.targetUserId.trim();
  if (!targetUserId || targetUserId === args.userId) {
    throw new Error("invalid_target_user");
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });
  if (!targetUser) {
    throw new Error("target_user_not_found");
  }

  await assertNoBlockAmong(args.userId, [targetUserId]);

  const existing = await prisma.appConversationChannel.findFirst({
    where: {
      ...buildVisibleConversationWhere(),
      members: { some: { userId: args.userId } },
      AND: [
        { members: { some: { userId: targetUserId } } },
        // Exactly these two — a channel where either has picked up extra
        // members (a future group chat) is not "the" 1:1 room anymore.
        { members: { none: { userId: { notIn: [args.userId, targetUserId] } } } },
      ],
    },
    select: conversationChannelSelect,
  });

  if (existing) {
    return serializeConversationChannelWithPreview(existing, args.userId);
  }

  return createConversationChannelForUser(args.userId, {
    locale: args.locale,
    inviteeUserIds: [targetUserId],
  });
}

export async function updateConversationChannelStatus(args: {
  conversationId: string;
  userId: string;
  status: AppConversationChannelStatus;
}): Promise<ConversationChannelSummary | null> {
  const existing = await prisma.appConversationChannel.findFirst({
    where: {
      id: args.conversationId,
      ...buildVisibleMembershipWhere(args.userId),
      ...buildVisibleConversationWhere(),
    },
    select: { id: true },
  });

  if (!existing) {
    return null;
  }

  const membersByChannelId = await listChannelMembersByChannelId([args.conversationId]);
  const isTargetMultiMember = (membersByChannelId.get(args.conversationId)?.length ?? 0) >= 2;
  const pausedAt = args.status === APP_CONVERSATION_STATUS_PAUSED ? new Date() : null;

  const record = await prisma.$transaction(async (tx) => {
    if (args.status === APP_CONVERSATION_STATUS_ACTIVE) {
      // Pause every OTHER room this caller is in, not just the ones they
      // own. "One active room per account" is a per-person invariant, so
      // for a shared (2+-member) room this must check and pause the
      // caller's OWN membership status, never the channel-wide status —
      // that field reflects some other member's state, not this caller's.
      const otherMemberships = await tx.appConversationChannelMember.findMany({
        where: {
          userId: args.userId,
          channelId: { not: args.conversationId },
          channel: { ...buildVisibleConversationWhere() },
        },
        select: {
          channelId: true,
          status: true,
          channel: { select: { status: true, _count: { select: { members: true } } } },
        },
      });

      const soloChannelIdsToPause: string[] = [];
      const memberRowChannelIdsToPause: string[] = [];
      for (const membership of otherMemberships) {
        const isMultiMember = membership.channel._count.members >= 2;
        const effectiveStatus = isMultiMember ? membership.status : membership.channel.status;
        if (effectiveStatus !== APP_CONVERSATION_STATUS_ACTIVE) continue;
        (isMultiMember ? memberRowChannelIdsToPause : soloChannelIdsToPause).push(membership.channelId);
      }

      const nowPausedAt = new Date();
      if (soloChannelIdsToPause.length > 0) {
        await tx.appConversationChannel.updateMany({
          where: { id: { in: soloChannelIdsToPause } },
          data: { status: APP_CONVERSATION_STATUS_PAUSED, pausedAt: nowPausedAt },
        });
      }
      if (memberRowChannelIdsToPause.length > 0) {
        await tx.appConversationChannelMember.updateMany({
          where: { userId: args.userId, channelId: { in: memberRowChannelIdsToPause } },
          data: { status: APP_CONVERSATION_STATUS_PAUSED, pausedAt: nowPausedAt },
        });
      }
    }

    if (isTargetMultiMember) {
      await tx.appConversationChannelMember.update({
        where: { channelId_userId: { channelId: args.conversationId, userId: args.userId } },
        data: { status: args.status, pausedAt },
      });
      return tx.appConversationChannel.findUniqueOrThrow({
        where: { id: args.conversationId },
        select: conversationChannelSelect,
      });
    }

    return tx.appConversationChannel.update({
      where: { id: args.conversationId },
      data: { status: args.status, pausedAt },
      select: conversationChannelSelect,
    });
  });

  return serializeConversationChannelWithPreview(record, args.userId);
}

export async function updateConversationChannelSelectedLanguages(args: {
  conversationId: string;
  userId: string;
  selectedLanguages: string[];
}): Promise<ConversationChannelSummary | null> {
  const normalizedSelectedLanguages = sanitizeSttLanguageSelection(args.selectedLanguages);
  if (normalizedSelectedLanguages.length === 0) {
    throw new Error("invalid_selected_languages");
  }

  const existing = await prisma.appConversationChannel.findFirst({
    where: {
      id: args.conversationId,
      ...buildVisibleMembershipWhere(args.userId),
      ...buildVisibleConversationWhere(),
    },
    select: { id: true },
  });

  if (!existing) {
    return null;
  }

  const record = await prisma.appConversationChannel.update({
    where: { id: args.conversationId },
    data: {
      selectedLanguages: normalizedSelectedLanguages,
      translationLanguagesLinked: false,
    },
    select: conversationChannelSelect,
  });

  return serializeConversationChannelWithPreview(record, args.userId);
}

export async function updateConversationChannelSpeechLanguages(args: {
  conversationId: string;
  userId: string;
  speechLanguages: string[];
}): Promise<ConversationChannelSummary | null> {
  const normalizedSpeechLanguages = sanitizeSttLanguageSelection(args.speechLanguages);
  if (normalizedSpeechLanguages.length === 0) {
    throw new Error("invalid_speech_languages");
  }

  const existing = await prisma.appConversationChannel.findFirst({
    where: {
      id: args.conversationId,
      ...buildVisibleMembershipWhere(args.userId),
      ...buildVisibleConversationWhere(),
    },
    select: { id: true },
  });

  if (!existing) {
    return null;
  }

  const record = await prisma.appConversationChannel.update({
    where: { id: args.conversationId },
    data: {
      speechLanguages: normalizedSpeechLanguages,
    },
    select: conversationChannelSelect,
  });

  return serializeConversationChannelWithPreview(record, args.userId);
}

export async function updateConversationChannelTranslationLanguagesLinked(args: {
  conversationId: string;
  userId: string;
  translationLanguagesLinked: boolean;
}): Promise<ConversationChannelSummary | null> {
  const existing = await prisma.appConversationChannel.findFirst({
    where: {
      id: args.conversationId,
      ...buildVisibleMembershipWhere(args.userId),
      ...buildVisibleConversationWhere(),
    },
    select: { id: true },
  });

  if (!existing) {
    return null;
  }

  const record = await prisma.appConversationChannel.update({
    where: { id: args.conversationId },
    data: {
      translationLanguagesLinked: args.translationLanguagesLinked,
    },
    select: conversationChannelSelect,
  });

  return serializeConversationChannelWithPreview(record, args.userId);
}

export async function updateConversationChannelDefaultDisplayLanguage(args: {
  conversationId: string;
  userId: string;
  defaultDisplayLanguage: string | null;
}): Promise<ConversationChannelSummary | null> {
  const normalizedDefaultDisplayLanguage = args.defaultDisplayLanguage
    ? sanitizeSttLanguageSelection([args.defaultDisplayLanguage])[0] ?? null
    : null;

  if (args.defaultDisplayLanguage && !normalizedDefaultDisplayLanguage) {
    throw new Error("invalid_default_display_language");
  }

  const existing = await prisma.appConversationChannel.findFirst({
    where: {
      id: args.conversationId,
      ...buildVisibleMembershipWhere(args.userId),
      ...buildVisibleConversationWhere(),
    },
    select: {
      id: true,
      selectedLanguages: true,
    },
  });

  if (!existing) {
    return null;
  }

  if (normalizedDefaultDisplayLanguage) {
    const normalizedRoomLanguages = sanitizeSttLanguageSelection(
      existing.selectedLanguages,
      existing.selectedLanguages,
    );
    if (!normalizedRoomLanguages.includes(normalizedDefaultDisplayLanguage)) {
      throw new Error("invalid_default_display_language");
    }
  }

  const membersByChannelId = await listChannelMembersByChannelId([args.conversationId]);
  const isMultiMember = (membersByChannelId.get(args.conversationId)?.length ?? 0) >= 2;

  // Once there's more than one real member, each person reads translations in
  // their own language — a single channel-wide value can't represent that, so
  // this becomes the caller's own membership preference instead of a shared
  // setting. Solo rooms keep writing the channel-wide field as before.
  let record: ConversationChannelRecord;
  if (isMultiMember) {
    await prisma.appConversationChannelMember.update({
      where: { channelId_userId: { channelId: args.conversationId, userId: args.userId } },
      data: { displayLanguage: normalizedDefaultDisplayLanguage },
    });
    record = await prisma.appConversationChannel.findUniqueOrThrow({
      where: { id: args.conversationId },
      select: conversationChannelSelect,
    });
  } else {
    record = await prisma.appConversationChannel.update({
      where: { id: args.conversationId },
      data: {
        defaultDisplayLanguage: normalizedDefaultDisplayLanguage,
      },
      select: conversationChannelSelect,
    });
  }

  return serializeConversationChannelWithPreview(record, args.userId);
}

export async function updateConversationChannelTitle(args: {
  conversationId: string;
  userId: string;
  title: string;
}): Promise<ConversationChannelSummary | null> {
  const normalizedTitle = args.title.trim();
  if (!normalizedTitle) {
    throw new Error("invalid_title");
  }

  const existing = await prisma.appConversationChannel.findFirst({
    where: {
      id: args.conversationId,
      ...buildVisibleMembershipWhere(args.userId),
      ...buildVisibleConversationWhere(),
    },
    select: { id: true },
  });

  if (!existing) {
    return null;
  }

  const record = await prisma.appConversationChannel.update({
    where: { id: args.conversationId },
    data: {
      title: normalizedTitle,
      userEditedTitleAt: new Date(),
    },
    select: conversationChannelSelect,
  });

  return serializeConversationChannelWithPreview(record, args.userId);
}

// Lightweight membership check + sessionKey lookup for callers (like minting
// a realtime-push token) that don't need the full hydration payload.
export async function getConversationSessionKeyForMember(args: {
  conversationId: string;
  userId: string;
}): Promise<string | null> {
  const record = await prisma.appConversationChannel.findFirst({
    where: {
      id: args.conversationId,
      ...buildVisibleMembershipWhere(args.userId),
      ...buildVisibleConversationWhere(),
    },
    select: { sessionKey: true },
  });
  return record?.sessionKey ?? null;
}

export type ConversationMemberSummary = {
  userId: string;
  name: string | null;
  handle: string | null;
  image: string | null;
  imageCropScale: number | null;
  imageCropX: number | null;
  imageCropY: number | null;
};

// Membership-gated: returns null (not an empty list) when the caller isn't a
// member of the channel, so the controller can 404 the same way the other
// per-conversation reads do instead of leaking who's in a room the caller
// can't see.
export async function listConversationMembersForUser(args: {
  conversationId: string;
  userId: string;
}): Promise<ConversationMemberSummary[] | null> {
  const conversationRecord = await prisma.appConversationChannel.findFirst({
    where: {
      id: args.conversationId,
      ...buildVisibleMembershipWhere(args.userId),
      ...buildVisibleConversationWhere(),
    },
    select: { id: true },
  });

  if (!conversationRecord) {
    return null;
  }

  const membersByChannelId = await listChannelMembersByChannelId([conversationRecord.id]);
  const members = membersByChannelId.get(conversationRecord.id) ?? [];

  return members.map((member) => ({
    userId: member.userId,
    name: member.name,
    handle: member.handle,
    image: member.image,
    imageCropScale: member.imageCropScale,
    imageCropX: member.imageCropX,
    imageCropY: member.imageCropY,
  }));
}

export async function getConversationHydrationStateForUser(args: {
  conversationId: string;
  userId: string;
  before?: ConversationHydrationCursor | null;
}): Promise<ConversationHydrationState | null> {
  const conversationRecord = await prisma.appConversationChannel.findFirst({
    where: {
      id: args.conversationId,
      ...buildVisibleMembershipWhere(args.userId),
      ...buildVisibleConversationWhere(),
    },
    select: conversationChannelSelect,
  });

  if (!conversationRecord) {
    return null;
  }

  const beforeDate = typeof args.before?.createdAtMs === "number"
    && Number.isFinite(args.before.createdAtMs)
    && args.before.createdAtMs > 0
    ? new Date(args.before.createdAtMs)
    : null;
  const beforeMessageId = (args.before?.messageId || "").trim();
  const messageWhere: Prisma.AppMessageWhereInput = {
    sessionKey: conversationRecord.sessionKey,
    ...buildVisibleMessageWhere(),
    ...(beforeDate && beforeMessageId
      ? {
          AND: [
            {
              OR: [
                { createdAt: { lt: beforeDate } },
                {
                  createdAt: beforeDate,
                  id: { lt: beforeMessageId },
                },
              ],
            },
          ],
        }
      : {}),
  };

  const [latestUsageEvent, totalMessageCount, messagesWithLookahead] = await prisma.$transaction([
    prisma.appEventLog.findFirst({
      where: {
        sessionKey: conversationRecord.sessionKey,
        usageSec: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: { usageSec: true },
    }),
    prisma.appMessage.count({
      where: {
        sessionKey: conversationRecord.sessionKey,
        ...buildVisibleMessageWhere(),
      },
    }),
    prisma.appMessage.findMany({
      where: messageWhere,
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],
      take: CONVERSATION_HYDRATION_MESSAGE_LIMIT + 1,
      select: {
        id: true,
        clientMessageId: true,
        sourceLanguage: true,
        createdAt: true,
        metadata: true,
        userId: true,
        contents: {
          where: buildVisibleMessageContentWhere(),
          orderBy: { createdAt: "asc" },
          select: {
            contentType: true,
            language: true,
            text: true,
          },
        },
      },
    }),
  ]);

  const hasMoreUtterances = messagesWithLookahead.length > CONVERSATION_HYDRATION_MESSAGE_LIMIT;
  const messages = messagesWithLookahead.slice(0, CONVERSATION_HYDRATION_MESSAGE_LIMIT);
  const oldestMessage = messages.at(-1) ?? null;
  const orderedMessages = [...messages].reverse();

  const membersByChannelId = await listChannelMembersByChannelId([conversationRecord.id]);
  const members = membersByChannelId.get(conversationRecord.id);
  // A real photo only makes sense once there's more than one real account in
  // the room — a solo session's diarized "speaker" turns aren't a second
  // real identity, so they keep the generated animal avatar unchanged.
  const isMultiMember = (members?.length ?? 0) >= 2;
  const imageByUserId = new Map((members ?? []).map((member) => [member.userId, member.image]));

  const utterances: ConversationHydrationUtterance[] = orderedMessages.map((message) => {
    const sourceContents = message.contents.filter((content) => content.contentType === "SOURCE");
    const sourceContent = sourceContents.find((content) => content.language === message.sourceLanguage)
      || sourceContents[0]
      || null;
    const translations: Record<string, string> = {};
    const translationFinalized: Record<string, boolean> = {};

    for (const content of message.contents) {
      if (content.contentType !== "TRANSLATION_FINAL") continue;
      const language = content.language.trim();
      const text = content.text.trim();
      if (!language || !text) continue;
      translations[language] = text;
      translationFinalized[language] = true;
    }

    const targetLanguages = Object.keys(translations);
    const metadata = readJsonObject(message.metadata);
    const clientMetadata = readJsonObject((metadata?.clientMetadata as Prisma.JsonValue | undefined) ?? null);

    return {
      id: (message.clientMessageId || "").trim() || `db-${message.id}`,
      originalText: sourceContent?.text?.trim() || "",
      originalLang: (message.sourceLanguage || "").trim() || "unknown",
      targetLanguages,
      translations,
      translationFinalized,
      createdAtMs: message.createdAt.getTime(),
      speaker: readStringValue(clientMetadata?.speaker) ?? readStringValue(metadata?.speaker),
      speakerAvatarSeed:
        readStringValue(clientMetadata?.speakerAvatarSeed) ?? readStringValue(metadata?.speakerAvatarSeed),
      speakerAvatarIndex:
        readIntegerValue(clientMetadata?.speakerAvatarIndex) ?? readIntegerValue(metadata?.speakerAvatarIndex),
      // Gated the same way as speakerImage: a solo session's diarized
      // "speaker" turns all resolve to the SAME single real account (the
      // one signed-in device), so leaving this populated there would make
      // every bubble compare equal to the viewer and force a right-aligned
      // "own message" layout onto what is actually a left/right speaker
      // distinction unrelated to account identity.
      speakerUserId: isMultiMember ? message.userId : null,
      speakerImage: isMultiMember && message.userId ? (imageByUserId.get(message.userId) ?? null) : null,
    };
  }).filter((utterance) => utterance.originalText.length > 0);

  return {
    conversation: serializeConversationChannel(
      conversationRecord,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      resolveViewerFacingTitle(conversationRecord.title, membersByChannelId.get(conversationRecord.id), args.userId),
      resolveViewerFacingDisplayLanguage(
        conversationRecord.defaultDisplayLanguage,
        membersByChannelId.get(conversationRecord.id),
        args.userId,
      ),
      resolveViewerFacingStatus(
        conversationRecord.status,
        membersByChannelId.get(conversationRecord.id),
        args.userId,
      ),
      resolveViewerFacingPausedAt(
        conversationRecord.pausedAt,
        membersByChannelId.get(conversationRecord.id),
        args.userId,
      ),
      isMultiMember,
    ),
    usageSec: Math.max(0, latestUsageEvent?.usageSec ?? 0),
    messageCount: Number.isFinite(totalMessageCount) ? Math.max(0, totalMessageCount) : 0,
    utterances,
    hasMoreUtterances,
    oldestMessageCursor: oldestMessage
      ? {
          createdAtMs: oldestMessage.createdAt.getTime(),
          messageId: oldestMessage.id,
        }
      : null,
  };
}

export async function deleteConversationChannel(args: {
  conversationId: string;
  userId: string;
}): Promise<ConversationChannelSummary | null> {
  // Delete-for-everyone stays owner-only, unlike every other operation above —
  // an arbitrary invited member shouldn't be able to remove the room for the
  // rest of the group. A "leave conversation" mutation (remove just the
  // caller's own membership row) would be the member-level equivalent; not
  // needed yet, nothing has asked for it.
  const existing = await prisma.appConversationChannel.findFirst({
    where: {
      id: args.conversationId,
      ownerUserId: args.userId,
      ...buildVisibleConversationWhere(),
    },
    select: { id: true },
  });

  if (!existing) {
    return null;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const record = await prisma.$transaction(async (tx) => {
        const lowestChannel = await tx.appConversationChannel.findFirst({
          where: { ownerUserId: args.userId },
          orderBy: { sequenceNumber: "asc" },
          select: { sequenceNumber: true },
        });
        const vacatedSequenceNumber = Math.min(lowestChannel?.sequenceNumber ?? 0, 0) - 1;

        return tx.appConversationChannel.update({
          where: { id: args.conversationId },
          data: {
            isDeleted: true,
            status: APP_CONVERSATION_STATUS_PAUSED,
            pausedAt: new Date(),
            sequenceNumber: vacatedSequenceNumber,
          },
          select: conversationChannelSelect,
        });
      });

      return serializeConversationChannel(record);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("conversation_channel_delete_conflict");
}
