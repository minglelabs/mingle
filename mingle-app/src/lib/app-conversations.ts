import { Prisma } from "@prisma/client/index";
import { prisma } from "@/lib/prisma";
import { sanitizeSttLanguageSelection } from "@/lib/stt-languages";

export const APP_CONVERSATION_STATUS_ACTIVE = "active";
export const APP_CONVERSATION_STATUS_PAUSED = "paused";

export type AppConversationChannelStatus =
  | typeof APP_CONVERSATION_STATUS_ACTIVE
  | typeof APP_CONVERSATION_STATUS_PAUSED;

export type ConversationChannelSummary = {
  id: string;
  sequenceNumber: number;
  title: string;
  status: AppConversationChannelStatus;
  sessionKey: string;
  selectedLanguages?: string[];
  latestMessagePreview?: string;
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
};

export type ConversationHydrationState = {
  conversation: ConversationChannelSummary;
  usageSec: number;
  utterances: ConversationHydrationUtterance[];
};

type ConversationChannelRecord = {
  id: string;
  sequenceNumber: number;
  title: string;
  status: string;
  sessionKey: string;
  selectedLanguages: string[];
  createdAt: Date;
  updatedAt: Date;
  pausedAt: Date | null;
};

const conversationChannelSelect = {
  id: true,
  sequenceNumber: true,
  title: true,
  status: true,
  sessionKey: true,
  selectedLanguages: true,
  createdAt: true,
  updatedAt: true,
  pausedAt: true,
} satisfies Prisma.AppConversationChannelSelect;

function createConversationSessionKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `conv_${crypto.randomUUID().replaceAll("-", "")}`;
  }

  return `conv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function formatConversationChannelTitle(sequenceNumber: number): string {
  return `Conversation (${sequenceNumber})`;
}

export function normalizeConversationChannelStatus(
  rawStatus: string,
): AppConversationChannelStatus {
  return rawStatus === APP_CONVERSATION_STATUS_PAUSED
    ? APP_CONVERSATION_STATUS_PAUSED
    : APP_CONVERSATION_STATUS_ACTIVE;
}

function serializeConversationChannel(
  record: ConversationChannelRecord,
  latestMessagePreview?: string,
): ConversationChannelSummary {
  return {
    id: record.id,
    sequenceNumber: record.sequenceNumber,
    title: record.title,
    status: normalizeConversationChannelStatus(record.status),
    sessionKey: record.sessionKey,
    selectedLanguages: [...record.selectedLanguages],
    latestMessagePreview,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    pausedAt: record.pausedAt?.toISOString() ?? null,
  };
}

function normalizeConversationPreview(rawValue: string | null | undefined): string {
  return (rawValue || "").replace(/\s+/g, " ").trim();
}

export async function listConversationChannelsForUser(
  userId: string,
): Promise<ConversationChannelSummary[]> {
  const records = await prisma.appConversationChannel.findMany({
    where: { ownerUserId: userId },
    orderBy: [
      { updatedAt: "desc" },
      { createdAt: "desc" },
    ],
    select: conversationChannelSelect,
  });

  if (records.length === 0) {
    return [];
  }

  const latestMessages = await prisma.appMessage.findMany({
    where: {
      sessionKey: {
        in: records.map((record) => record.sessionKey),
      },
    },
    orderBy: [
      { sessionKey: "asc" },
      { createdAt: "desc" },
    ],
    distinct: ["sessionKey"],
    select: {
      sessionKey: true,
      sourceLanguage: true,
      contents: {
        where: {
          contentType: "SOURCE",
        },
        orderBy: { createdAt: "asc" },
        select: {
          language: true,
          text: true,
        },
      },
    },
  });

  const previewBySessionKey = new Map<string, string>();
  for (const message of latestMessages) {
    const sourceContent = message.contents.find((content) => content.language === message.sourceLanguage)
      || message.contents[0]
      || null;
    const preview = normalizeConversationPreview(sourceContent?.text);
    if (!message.sessionKey || !preview) continue;
    previewBySessionKey.set(message.sessionKey, preview);
  }

  return records.map((record) => serializeConversationChannel(
    record,
    previewBySessionKey.get(record.sessionKey),
  ));
}

export async function createConversationChannelForUser(
  userId: string,
  options?: {
    preferredSessionKey?: string;
    selectedLanguages?: string[];
  },
): Promise<ConversationChannelSummary> {
  const normalizedPreferredSessionKey = (options?.preferredSessionKey || "").trim();
  const normalizedSelectedLanguages = sanitizeSttLanguageSelection(options?.selectedLanguages);
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
            title: formatConversationChannelTitle(sequenceNumber),
            status: APP_CONVERSATION_STATUS_PAUSED,
            sessionKey: normalizedPreferredSessionKey || createConversationSessionKey(),
            selectedLanguages: normalizedSelectedLanguages,
            pausedAt: new Date(),
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

  return serializeConversationChannel(record);
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
    },
    select: conversationChannelSelect,
  });

  return serializeConversationChannel(record);
}

export async function getConversationHydrationStateForUser(args: {
  conversationId: string;
  userId: string;
}): Promise<ConversationHydrationState | null> {
  const conversationRecord = await prisma.appConversationChannel.findFirst({
    where: {
      id: args.conversationId,
      ownerUserId: args.userId,
    },
    select: conversationChannelSelect,
  });

  if (!conversationRecord) {
    return null;
  }

  const [latestUsageEvent, messages] = await prisma.$transaction([
    prisma.appEventLog.findFirst({
      where: {
        sessionKey: conversationRecord.sessionKey,
        usageSec: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: { usageSec: true },
    }),
    prisma.appMessage.findMany({
      where: {
        sessionKey: conversationRecord.sessionKey,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        clientMessageId: true,
        sourceLanguage: true,
        createdAt: true,
        contents: {
          select: {
            contentType: true,
            language: true,
            text: true,
          },
        },
      },
    }),
  ]);

  const utterances: ConversationHydrationUtterance[] = messages.map((message) => {
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

    return {
      id: (message.clientMessageId || "").trim() || `db-${message.id}`,
      originalText: sourceContent?.text?.trim() || "",
      originalLang: (message.sourceLanguage || "").trim() || "unknown",
      targetLanguages,
      translations,
      translationFinalized,
      createdAtMs: message.createdAt.getTime(),
    };
  }).filter((utterance) => utterance.originalText.length > 0);

  return {
    conversation: serializeConversationChannel(conversationRecord),
    usageSec: Math.max(0, latestUsageEvent?.usageSec ?? 0),
    utterances,
  };
}
