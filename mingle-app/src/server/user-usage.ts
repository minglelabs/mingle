import { Prisma } from "@prisma/client/index";
import { prisma } from "@/lib/prisma";

export type UserUsageLanguageBreakdown = {
  language: string;
  usageSec: number;
  messageCount: number;
};

export type UserUsageSummary = {
  totalUsageSec: number;
  messageCount: number;
  conversationCount: number;
  speechLanguages: UserUsageLanguageBreakdown[];
  translationLanguages: UserUsageLanguageBreakdown[];
};

function visibleMessageWhere(): Prisma.AppMessageWhereInput {
  return {
    OR: [
      { isDeleted: false },
      { isDeleted: null },
    ],
  };
}

function visibleConversationWhere(): Prisma.AppConversationChannelWhereInput {
  return {
    OR: [
      { isDeleted: false },
      { isDeleted: null },
    ],
  };
}

function visibleContentWhere(): Prisma.AppMessageContentWhereInput {
  return {
    OR: [
      { isDeleted: false },
      { isDeleted: null },
    ],
  };
}

function normalizeLanguage(value: string | null | undefined): string {
  const normalized = value?.trim() ?? "";
  return normalized || "unknown";
}

function sortLanguageBreakdown(
  rows: UserUsageLanguageBreakdown[],
): UserUsageLanguageBreakdown[] {
  return rows.sort((left, right) => (
    right.usageSec - left.usageSec
    || right.messageCount - left.messageCount
    || left.language.localeCompare(right.language)
  ));
}

export async function getUserUsageSummary(userId: string): Promise<UserUsageSummary | null> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return null;

  const [user, messageCount, conversationCount, speechLanguageRows, translationLanguageRows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: normalizedUserId },
      select: { totalUsageSec: true },
    }),
    prisma.appMessage.count({
      where: {
        userId: normalizedUserId,
        ...visibleMessageWhere(),
      },
    }),
    prisma.appConversationChannel.count({
      where: {
        ownerUserId: normalizedUserId,
        ...visibleConversationWhere(),
      },
    }),
    prisma.appMessage.groupBy({
      by: ["sourceLanguage"],
      where: {
        userId: normalizedUserId,
        ...visibleMessageWhere(),
      },
      _count: { _all: true },
      _sum: { sttDurationMs: true },
    }),
    prisma.appMessageContent.groupBy({
      by: ["language"],
      where: {
        contentType: "TRANSLATION_FINAL",
        ...visibleContentWhere(),
        message: {
          userId: normalizedUserId,
          ...visibleMessageWhere(),
        },
      },
      _count: { _all: true },
    }),
  ]);

  if (!user) return null;

  const speechLanguages = sortLanguageBreakdown(
    speechLanguageRows.map((row) => ({
      language: normalizeLanguage(row.sourceLanguage),
      usageSec: Math.max(0, Math.round((row._sum.sttDurationMs ?? 0) / 1_000)),
      messageCount: Math.max(0, row._count._all),
    })),
  );
  const translationLanguages = sortLanguageBreakdown(
    translationLanguageRows.map((row) => ({
      language: normalizeLanguage(row.language),
      usageSec: 0,
      messageCount: Math.max(0, row._count._all),
    })),
  );

  return {
    totalUsageSec: Math.max(0, user.totalUsageSec),
    messageCount: Math.max(0, messageCount),
    conversationCount: Math.max(0, conversationCount),
    speechLanguages,
    translationLanguages,
  };
}
