import { Prisma } from "@prisma/client/index";
import { prisma } from "@/lib/prisma";
import { sanitizeSttLanguageSelection } from "@/lib/stt-languages";
import { formatLocalizedConversationTitle } from "@/i18n/conversations";

export const APP_CONVERSATION_STATUS_ACTIVE = "active";
export const APP_CONVERSATION_STATUS_PAUSED = "paused";
export const CONVERSATION_HYDRATION_MESSAGE_LIMIT = 100;

export type AppConversationChannelStatus =
  | typeof APP_CONVERSATION_STATUS_ACTIVE
  | typeof APP_CONVERSATION_STATUS_PAUSED;

export type ConversationChannelSummary = {
  id: string;
  sequenceNumber: number;
  title: string;
  status: AppConversationChannelStatus;
  sessionKey: string;
  messageCount?: number;
  selectedLanguages?: string[];
  speechLanguages?: string[];
  translationLanguagesLinked?: boolean;
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
): ConversationChannelSummary {
  const selectedLanguages = [...record.selectedLanguages];
  const speechLanguages = record.speechLanguages.length > 0
    ? [...record.speechLanguages]
    : [...selectedLanguages];
  const translationLanguagesLinked = record.translationLanguagesLinked !== false;
  const effectiveSelectedLanguages = translationLanguagesLinked
    ? [...speechLanguages]
    : selectedLanguages;

  return {
    id: record.id,
    sequenceNumber: record.sequenceNumber,
    title: record.title,
    status: normalizeConversationChannelStatus(record.status),
    sessionKey: record.sessionKey,
    ...(typeof messageCount === "number"
      ? { messageCount: normalizeConversationMessageCount(messageCount) }
      : {}),
    selectedLanguages: effectiveSelectedLanguages,
    speechLanguages,
    translationLanguagesLinked,
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
    pausedAt: record.pausedAt?.toISOString() ?? null,
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
): Promise<ConversationChannelSummary> {
  const summaryBySessionKey = await listLatestMessageSummaryBySessionKey([record.sessionKey]);
  const latestMessage = summaryBySessionKey.get(record.sessionKey);
  return serializeConversationChannel(
    record,
    latestMessage?.preview,
    latestMessage?.createdAt,
    latestMessage?.speaker,
    latestMessage?.speakerAvatarSeed,
    latestMessage?.speakerAvatarIndex,
  );
}

export async function listConversationChannelsForUser(
  userId: string,
  options: ListConversationChannelsForUserOptions = {},
): Promise<ConversationChannelSummary[]> {
  const records = await prisma.appConversationChannel.findMany({
    where: {
      ownerUserId: userId,
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

  if (options.includeMessageSummaries === false) {
    return records.map((record) => serializeConversationChannel(record));
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
      );
    })
    .sort((left, right) => {
      const leftTimestamp = Date.parse(left.latestMessageAt || left.createdAt) || 0;
      const rightTimestamp = Date.parse(right.latestMessageAt || right.createdAt) || 0;
      return rightTimestamp - leftTimestamp;
    });
}

export async function createConversationChannelForUser(
  userId: string,
  options?: {
    locale?: string;
    preferredSessionKey?: string;
    selectedLanguages?: string[];
    speechLanguages?: string[];
    translationLanguagesLinked?: boolean;
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
  const resolvedSelectedLanguages = translationLanguagesLinked
    ? [...resolvedSpeechLanguages]
    : normalizedSelectedLanguages;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const record = await prisma.$transaction(async (tx) => {
        const lastChannel = await tx.appConversationChannel.findFirst({
          where: { ownerUserId: userId },
          orderBy: { sequenceNumber: "desc" },
          select: { sequenceNumber: true },
        });
        const sequenceNumber = (lastChannel?.sequenceNumber ?? 0) + 1;

        return tx.appConversationChannel.create({
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
      });

      return serializeConversationChannelWithPreview(record);
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

export async function updateConversationChannelStatus(args: {
  conversationId: string;
  userId: string;
  status: AppConversationChannelStatus;
}): Promise<ConversationChannelSummary | null> {
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

  const record = await prisma.$transaction(async (tx) => {
    if (args.status === APP_CONVERSATION_STATUS_ACTIVE) {
      const pausedAt = new Date();
      await tx.appConversationChannel.updateMany({
        where: {
          ownerUserId: args.userId,
          id: { not: args.conversationId },
          status: APP_CONVERSATION_STATUS_ACTIVE,
          ...buildVisibleConversationWhere(),
        },
        data: {
          status: APP_CONVERSATION_STATUS_PAUSED,
          pausedAt,
        },
      });
    }

    return tx.appConversationChannel.update({
      where: { id: args.conversationId },
      data: {
        status: args.status,
        pausedAt: args.status === APP_CONVERSATION_STATUS_PAUSED ? new Date() : null,
      },
      select: conversationChannelSelect,
    });
  });

  return serializeConversationChannelWithPreview(record);
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
      ownerUserId: args.userId,
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

  return serializeConversationChannelWithPreview(record);
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
      ownerUserId: args.userId,
      ...buildVisibleConversationWhere(),
    },
    select: { id: true, translationLanguagesLinked: true },
  });

  if (!existing) {
    return null;
  }

  const record = await prisma.appConversationChannel.update({
    where: { id: args.conversationId },
    data: {
      speechLanguages: normalizedSpeechLanguages,
      ...(existing.translationLanguagesLinked !== false
        ? { selectedLanguages: normalizedSpeechLanguages }
        : {}),
    },
    select: conversationChannelSelect,
  });

  return serializeConversationChannelWithPreview(record);
}

export async function updateConversationChannelTranslationLanguagesLinked(args: {
  conversationId: string;
  userId: string;
  translationLanguagesLinked: boolean;
}): Promise<ConversationChannelSummary | null> {
  const existing = await prisma.appConversationChannel.findFirst({
    where: {
      id: args.conversationId,
      ownerUserId: args.userId,
      ...buildVisibleConversationWhere(),
    },
    select: {
      id: true,
      selectedLanguages: true,
      speechLanguages: true,
      translationLanguagesLinked: true,
    },
  });

  if (!existing) {
    return null;
  }

  const speechLanguages = existing.speechLanguages.length > 0
    ? existing.speechLanguages
    : existing.selectedLanguages;
  const shouldSyncSelectedLanguages =
    args.translationLanguagesLinked || existing.translationLanguagesLinked !== false;

  const record = await prisma.appConversationChannel.update({
    where: { id: args.conversationId },
    data: {
      translationLanguagesLinked: args.translationLanguagesLinked,
      ...(shouldSyncSelectedLanguages
        ? { selectedLanguages: speechLanguages }
        : {}),
    },
    select: conversationChannelSelect,
  });

  return serializeConversationChannelWithPreview(record);
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
      ownerUserId: args.userId,
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
    },
    select: conversationChannelSelect,
  });

  return serializeConversationChannelWithPreview(record);
}

export async function getConversationHydrationStateForUser(args: {
  conversationId: string;
  userId: string;
  before?: ConversationHydrationCursor | null;
}): Promise<ConversationHydrationState | null> {
  const conversationRecord = await prisma.appConversationChannel.findFirst({
    where: {
      id: args.conversationId,
      ownerUserId: args.userId,
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
    };
  }).filter((utterance) => utterance.originalText.length > 0);

  return {
    conversation: serializeConversationChannel(conversationRecord),
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

  const record = await prisma.appConversationChannel.update({
    where: { id: args.conversationId },
    data: {
      isDeleted: true,
      status: APP_CONVERSATION_STATUS_PAUSED,
      pausedAt: new Date(),
    },
    select: conversationChannelSelect,
  });

  return serializeConversationChannel(record);
}
