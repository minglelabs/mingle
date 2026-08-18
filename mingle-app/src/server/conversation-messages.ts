import { prisma } from "@/lib/prisma";
import {
  APP_CONVERSATION_MEMBER_ROLE_MEMBER,
  createConversationChannelForUser,
  type ConversationChannelSummary,
} from "@/lib/app-conversations";
import { translateText } from "@/server/translate-text";

export const CONVERSATION_MESSAGE_TEXT_MAX_LENGTH = 4000;
export const CONVERSATION_MESSAGE_PAGE_SIZE = 50;

/**
 * A room may hold any number of people. Two is the common case (a direct
 * message), but nothing below is written for two — the member set is the only
 * thing that distinguishes a direct message from a group.
 */
export const CONVERSATION_MAX_PARTICIPANTS = 50;

export type ConversationParticipant = {
  id: string;
  handle: string | null;
  name: string | null;
  image: string | null;
};

export type ConversationMessage = {
  id: string;
  clientMessageId: string | null;
  kind: string;
  originalText: string;
  sourceLanguage: string;
  // Every TRANSLATION_FINAL rendering stored for this message, keyed by
  // language, so the client can offer the same original/translation toggle
  // the interpreter room's ChatBubble already has — not just one pre-picked
  // language.
  translations: Record<string, string>;
  createdAt: string;
  sender: ConversationParticipant | null;
  isMine: boolean;
};

export type ConversationMessageFailure =
  | "not_a_member"
  | "conversation_not_found"
  | "user_not_found"
  | "user_blocked"
  | "cannot_message_self"
  | "no_participants"
  | "too_many_participants"
  | "empty_text";

export class ConversationMessageError extends Error {
  readonly reason: ConversationMessageFailure;

  constructor(reason: ConversationMessageFailure) {
    super(reason);
    this.name = "ConversationMessageError";
    this.reason = reason;
  }
}

const participantSelect = {
  id: true,
  handle: true,
  name: true,
  image: true,
} as const;

function visibleWhere() {
  return {
    OR: [
      { isDeleted: false },
      { isDeleted: null },
    ],
  };
}

/** The `conversationId_userId` compound-unique lookup every member query keys off. */
function memberWhereUnique(conversationId: string, userId: string) {
  return { conversationId_userId: { conversationId, userId } };
}

type MemberLanguageProfile = {
  displayLanguages: string[];
  user?: { primaryLanguages: string[] } | null;
};

/**
 * The languages a member reads this room's messages in: their explicit
 * additions if they ever set any, otherwise just their signup language.
 * Never returns an empty list for a member with a known primary language.
 */
function resolveMemberLanguages(member: MemberLanguageProfile): string[] {
  if (member.displayLanguages.length > 0) return member.displayLanguages;
  const primary = member.user?.primaryLanguages[0];
  return primary ? [primary] : [];
}

/**
 * Rejects if *any* pair inside the set has blocked the other, in either
 * direction. One query covers the whole set, so this stays cheap as rooms grow.
 */
async function assertNoBlocksAmong(userIds: string[]): Promise<void> {
  if (userIds.length < 2) return;

  const block = await prisma.userBlock.findFirst({
    where: {
      blockerId: { in: userIds },
      blockedId: { in: userIds },
    },
    select: { id: true },
  });
  if (block) {
    throw new ConversationMessageError("user_blocked");
  }
}

/**
 * Membership is the access check for every conversation read and write.
 * Callers must not fall back to the room's owner or session key.
 */
export async function requireConversationMembership(
  conversationId: string,
  userId: string,
): Promise<void> {
  const membership = await prisma.appConversationMember.findUnique({
    where: memberWhereUnique(conversationId, userId),
    select: { id: true },
  });
  if (!membership) {
    throw new ConversationMessageError("not_a_member");
  }
}

export async function listConversationParticipants(
  conversationId: string,
): Promise<ConversationParticipant[]> {
  const members = await prisma.appConversationMember.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: { user: { select: participantSelect } },
  });

  return members.map((member) => member.user);
}

/**
 * Normalizes a requested participant list into the room's full member set:
 * deduplicated, viewer included, viewer's own id never counted as a partner.
 */
function resolveMemberSet(viewerId: string, participantIds: string[]): string[] {
  const others = Array.from(new Set(
    participantIds.map((id) => id.trim()).filter(Boolean),
  )).filter((id) => id !== viewerId);

  if (others.length === 0) {
    // Either an empty list, or a list naming only the viewer.
    throw new ConversationMessageError(
      participantIds.some((id) => id.trim() === viewerId) ? "cannot_message_self" : "no_participants",
    );
  }
  if (others.length + 1 > CONVERSATION_MAX_PARTICIPANTS) {
    throw new ConversationMessageError("too_many_participants");
  }

  return [viewerId, ...others];
}

/**
 * Opens the room whose members are exactly `participantIds` plus the viewer, or
 * creates it. Matching on the exact member set matters: a two-person request
 * must not resolve to a group room that happens to contain both people.
 */
export async function getOrCreateConversationWith(args: {
  viewerId: string;
  participantIds: string[];
  locale?: string;
}): Promise<ConversationChannelSummary> {
  const memberIds = resolveMemberSet(args.viewerId, args.participantIds);
  const others = memberIds.slice(1);

  const known = await prisma.user.findMany({
    where: { id: { in: others } },
    select: { id: true },
  });
  if (known.length !== others.length) {
    throw new ConversationMessageError("user_not_found");
  }

  await assertNoBlocksAmong(memberIds);

  // Scope the search to the viewer's own rooms first (indexed by userId, and
  // bounded by how many rooms one person is in) before checking the other
  // participants. Filtering `app_conversation_channels` directly instead would
  // scan every room in the app, not just the viewer's, which does not scale
  // as the total number of rooms grows.
  const viewerRoomIds = (await prisma.appConversationMember.findMany({
    where: { userId: args.viewerId },
    select: { conversationId: true },
  })).map((membership) => membership.conversationId);

  const exact = viewerRoomIds.length > 0
    ? (await prisma.appConversationChannel.findMany({
        where: {
          id: { in: viewerRoomIds },
          ...visibleWhere(),
          AND: others.map((userId) => ({ members: { some: { userId } } })),
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, _count: { select: { members: true } } },
      })).find((candidate) => candidate._count.members === memberIds.length)
    : undefined;

  if (exact) {
    return loadConversationSummary(exact.id);
  }

  const conversation = await createConversationChannelForUser(args.viewerId, {
    locale: args.locale,
  });

  await prisma.appConversationMember.createMany({
    data: others.map((userId) => ({
      conversationId: conversation.id,
      userId,
      role: APP_CONVERSATION_MEMBER_ROLE_MEMBER,
    })),
    skipDuplicates: true,
  });

  return conversation;
}

/** Two-person convenience wrapper over {@link getOrCreateConversationWith}. */
export async function getOrCreateDirectConversation(args: {
  viewerId: string;
  partnerId: string;
  locale?: string;
}): Promise<ConversationChannelSummary> {
  return getOrCreateConversationWith({
    viewerId: args.viewerId,
    participantIds: [args.partnerId],
    locale: args.locale,
  });
}

async function loadConversationSummary(conversationId: string): Promise<ConversationChannelSummary> {
  const record = await prisma.appConversationChannel.findUnique({
    where: { id: conversationId },
    select: {
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
    },
  });

  if (!record) {
    throw new ConversationMessageError("conversation_not_found");
  }

  return {
    id: record.id,
    sequenceNumber: record.sequenceNumber,
    title: record.title,
    status: record.status === "paused" ? "paused" : "active",
    sessionKey: record.sessionKey,
    selectedLanguages: [...record.selectedLanguages],
    speechLanguages: [...record.speechLanguages],
    translationLanguagesLinked: record.translationLanguagesLinked,
    defaultDisplayLanguage: record.defaultDisplayLanguage,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    pausedAt: record.pausedAt ? record.pausedAt.toISOString() : null,
  };
}

export async function listConversationMessages(args: {
  conversationId: string;
  viewerId: string;
  limit?: number;
}): Promise<ConversationMessage[]> {
  const viewerMember = await prisma.appConversationMember.findUnique({
    where: memberWhereUnique(args.conversationId, args.viewerId),
    select: { displayLanguages: true, user: { select: { primaryLanguages: true } } },
  });
  if (!viewerMember) {
    throw new ConversationMessageError("not_a_member");
  }
  // Read fresh on every call, not cached on the message: a message may carry
  // translations other members asked for too, and the viewer's own language
  // picks can change room to room. Badges must reflect what the viewer wants
  // *right now*, not whatever happened to exist when the message was sent.
  const viewerLanguages = new Set(resolveMemberLanguages(viewerMember));

  const limit = Math.min(Math.max(args.limit ?? CONVERSATION_MESSAGE_PAGE_SIZE, 1), 100);
  const messages = await prisma.appMessage.findMany({
    where: {
      conversationId: args.conversationId,
      kind: "text",
      ...visibleWhere(),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      clientMessageId: true,
      kind: true,
      sourceLanguage: true,
      createdAt: true,
      senderId: true,
      sender: { select: participantSelect },
      // Every stored rendering (source + every TRANSLATION_FINAL language)
      // is fetched; the map step below keeps only the ones the viewer
      // currently cares about, same idea as the interpreter room's toggle.
      contents: {
        where: { OR: [{ isDeleted: false }, { isDeleted: null }] },
        orderBy: { createdAt: "asc" },
        select: { contentType: true, language: true, text: true },
      },
    },
  });

  return messages
    .map((message) => {
      const source = message.contents.find((content) => content.contentType === "SOURCE");
      const translations: Record<string, string> = {};
      for (const content of message.contents) {
        if (content.contentType === "TRANSLATION_FINAL" && viewerLanguages.has(content.language)) {
          translations[content.language] = content.text;
        }
      }

      return {
        id: message.id,
        clientMessageId: message.clientMessageId,
        kind: message.kind,
        originalText: source?.text ?? "",
        sourceLanguage: message.sourceLanguage,
        translations,
        createdAt: message.createdAt.toISOString(),
        sender: message.sender,
        isMine: message.senderId === args.viewerId,
      };
    })
    .reverse();
}

export async function sendConversationMessage(args: {
  conversationId: string;
  senderId: string;
  text: string;
  clientMessageId?: string | null;
}): Promise<ConversationMessage> {
  const text = args.text.trim().slice(0, CONVERSATION_MESSAGE_TEXT_MAX_LENGTH);
  if (!text) {
    throw new ConversationMessageError("empty_text");
  }

  await requireConversationMembership(args.conversationId, args.senderId);

  const members = await prisma.appConversationMember.findMany({
    where: { conversationId: args.conversationId },
    select: {
      userId: true,
      displayLanguages: true,
      user: { select: { primaryLanguages: true } },
    },
  });
  await assertNoBlocksAmong(members.map((member) => member.userId));

  const sender = members.find((member) => member.userId === args.senderId);
  const senderUser = sender?.user
    ?? await prisma.user.findUnique({ where: { id: args.senderId }, select: { primaryLanguages: true } });
  const sourceLanguage = senderUser?.primaryLanguages[0] || "unknown";
  const clientMessageId = (args.clientMessageId || "").trim() || null;

  // Every member's chosen reading languages — the sender included, so their
  // own added languages show up as badges on their own sent bubble too —
  // deduped into one set, so a group room costs one translation call per
  // message rather than one per recipient.
  const targetLanguages = Array.from(new Set(
    members
      .flatMap((member) => resolveMemberLanguages(member))
      .filter((language) => language !== sourceLanguage),
  ));
  const translations = await translateText({
    text,
    sourceLanguage,
    targetLanguages,
    sessionKey: args.conversationId,
  });

  const message = await prisma.$transaction(async (tx) => {
    const created = clientMessageId
      ? await tx.appMessage.upsert({
          where: {
            conversationId_clientMessageId: {
              conversationId: args.conversationId,
              clientMessageId,
            },
          },
          create: {
            conversationId: args.conversationId,
            senderId: args.senderId,
            userId: args.senderId,
            kind: "text",
            clientMessageId,
            isDeleted: false,
            sourceLanguage,
          },
          update: {},
          select: { id: true, createdAt: true },
        })
      : await tx.appMessage.create({
          data: {
            conversationId: args.conversationId,
            senderId: args.senderId,
            userId: args.senderId,
            kind: "text",
            isDeleted: false,
            sourceLanguage,
          },
          select: { id: true, createdAt: true },
        });

    const upsertContent = (contentType: string, language: string, contentText: string) => (
      tx.appMessageContent.upsert({
        where: {
          messageId_contentType_language: { messageId: created.id, contentType, language },
        },
        create: {
          messageId: created.id,
          contentType,
          language,
          isDeleted: false,
          text: contentText,
        },
        update: { isDeleted: false, text: contentText },
      })
    );

    await upsertContent("SOURCE", sourceLanguage, text);
    for (const [language, translatedText] of Object.entries(translations)) {
      await upsertContent("TRANSLATION_FINAL", language, translatedText);
    }

    // Keep the room at the top of every member's list.
    await tx.appConversationChannel.update({
      where: { id: args.conversationId },
      data: { updatedAt: new Date() },
    });

    return created;
  });

  const senderProfile = await prisma.user.findUnique({
    where: { id: args.senderId },
    select: participantSelect,
  });

  return {
    id: message.id,
    clientMessageId,
    kind: "text",
    originalText: text,
    sourceLanguage,
    translations,
    createdAt: message.createdAt.toISOString(),
    sender: senderProfile,
    isMine: true,
  };
}

export async function markConversationRead(args: {
  conversationId: string;
  userId: string;
}): Promise<void> {
  await prisma.appConversationMember.updateMany({
    where: {
      conversationId: args.conversationId,
      userId: args.userId,
    },
    data: { lastReadAt: new Date() },
  });
}

export async function getMemberDisplayLanguages(args: {
  conversationId: string;
  userId: string;
}): Promise<{ displayLanguages: string[]; defaultLanguage: string }> {
  const member = await prisma.appConversationMember.findUnique({
    where: memberWhereUnique(args.conversationId, args.userId),
    select: { displayLanguages: true, user: { select: { primaryLanguages: true } } },
  });
  if (!member) {
    throw new ConversationMessageError("not_a_member");
  }

  return {
    displayLanguages: member.displayLanguages,
    defaultLanguage: member.user?.primaryLanguages[0] ?? "",
  };
}

/**
 * Replaces the caller's extra reading languages for this room. An empty list
 * resets them back to just their signup language (the implicit default).
 */
export async function setMemberDisplayLanguages(args: {
  conversationId: string;
  userId: string;
  displayLanguages: string[];
}): Promise<void> {
  await requireConversationMembership(args.conversationId, args.userId);

  await prisma.appConversationMember.update({
    where: memberWhereUnique(args.conversationId, args.userId),
    data: { displayLanguages: args.displayLanguages },
  });
}
