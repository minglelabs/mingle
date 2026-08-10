import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";

export const AUTO_CONVERSATION_TITLE_TURN_COUNT = 10;
const AUTO_CONVERSATION_TITLE_MAX_LENGTH = 20;
const AUTO_CONVERSATION_TITLE_CONTEXT_MESSAGE_LIMIT = 500;
const AUTO_CONVERSATION_TITLE_MODEL = process.env.CONVERSATION_TITLE_MODEL || "gemini-2.5-flash-lite";

type GenerateConversationTitle = (turns: string[]) => Promise<string | null>;

export function shouldGenerateConversationTitle(args: {
  finalizedTurnCount: number;
  userEditedTitleAt: Date | null;
  autoTitleGeneratedAt: Date | null;
  autoTitleLastTurnCount: number | null;
}): boolean {
  if (args.finalizedTurnCount < AUTO_CONVERSATION_TITLE_TURN_COUNT || args.userEditedTitleAt) {
    return false;
  }
  if (!args.autoTitleGeneratedAt) return true;

  const lastTurnCount = args.autoTitleLastTurnCount && args.autoTitleLastTurnCount > 0
    ? args.autoTitleLastTurnCount
    : AUTO_CONVERSATION_TITLE_TURN_COUNT;
  return args.finalizedTurnCount >= lastTurnCount * 2;
}

export function sanitizeGeneratedConversationTitle(rawTitle: string): string | null {
  const title = rawTitle.replace(/\s+/g, " ").trim();
  const characters = Array.from(title);
  if (characters.length <= AUTO_CONVERSATION_TITLE_MAX_LENGTH) return title || null;

  const shortened = characters.slice(0, AUTO_CONVERSATION_TITLE_MAX_LENGTH).join("").trimEnd();
  if (/\s/.test(characters[AUTO_CONVERSATION_TITLE_MAX_LENGTH] || "")) return shortened || null;
  const lastWordBoundary = shortened.lastIndexOf(" ");
  if (lastWordBoundary >= AUTO_CONVERSATION_TITLE_MAX_LENGTH / 2) {
    return shortened.slice(0, lastWordBoundary).trimEnd() || null;
  }
  return shortened || null;
}

async function generateConversationTitleWithGemini(turns: string[]): Promise<string | null> {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey || turns.length === 0) return null;

  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: AUTO_CONVERSATION_TITLE_MODEL,
    systemInstruction: "Create one concise, descriptive title for this conversation using all provided turns. Return only a clear, specific, natural, complete noun phrase in the language used most in the conversation. Capture the main subject and its context; avoid vague, partial, or slogan-like wording. Do not return an adjective without a noun, a sentence, or quotation marks. It must be 20 characters or fewer and must not end mid-word or mid-phrase.",
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 40,
    },
  });
  const response = await model.generateContent(turns.map((turn, index) => `${index + 1}. ${turn}`).join("\n"));
  return sanitizeGeneratedConversationTitle(response.response.text() || "");
}

export async function maybeGenerateConversationTitleForSession(args: {
  sessionKey: string;
  generateTitle?: GenerateConversationTitle;
}): Promise<void> {
  const sessionKey = args.sessionKey.trim();
  if (!sessionKey) return;

  const conversation = await prisma.appConversationChannel.findFirst({
    where: {
      sessionKey,
      OR: [{ isDeleted: false }, { isDeleted: null }],
    },
    select: {
      id: true,
      userEditedTitleAt: true,
      autoTitleGeneratedAt: true,
      autoTitleLastTurnCount: true,
    },
  });
  if (!conversation) return;

  const finalizedTurnCount = await prisma.appMessage.count({
    where: {
      sessionKey,
      OR: [{ isDeleted: false }, { isDeleted: null }],
    },
  });
  if (!shouldGenerateConversationTitle({ ...conversation, finalizedTurnCount })) return;

  const messages = await prisma.appMessage.findMany({
    where: {
      sessionKey,
      OR: [{ isDeleted: false }, { isDeleted: null }],
    },
    orderBy: { createdAt: "asc" },
    take: AUTO_CONVERSATION_TITLE_CONTEXT_MESSAGE_LIMIT,
    select: {
      contents: {
        where: {
          contentType: "SOURCE",
          OR: [{ isDeleted: false }, { isDeleted: null }],
        },
        orderBy: { createdAt: "asc" },
        select: { text: true },
      },
    },
  });
  const turns = messages.flatMap((message) => message.contents.map((content) => content.text.trim()).filter(Boolean));
  const title = await (args.generateTitle || generateConversationTitleWithGemini)(turns);
  if (!title) return;

  await prisma.appConversationChannel.update({
    where: { id: conversation.id },
    data: {
      title,
      autoTitleGeneratedAt: new Date(),
      autoTitleLastTurnCount: finalizedTurnCount,
    },
  });
}
