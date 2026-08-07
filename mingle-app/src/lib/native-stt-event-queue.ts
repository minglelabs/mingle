export type NativeSttQueuedMessage = {
  queueId?: string;
  raw: string;
  conversationId?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeNativeSttQueuedMessage(value: unknown): NativeSttQueuedMessage | null {
  if (!isRecord(value) || value.type !== "message") return null;
  if (typeof value.raw !== "string" || !value.raw.trim()) return null;

  const queueId = typeof value.queueId === "string" && value.queueId.trim()
    ? value.queueId.trim()
    : undefined;
  const conversationId = typeof value.conversationId === "string" && value.conversationId.trim()
    ? value.conversationId.trim()
    : undefined;

  return {
    ...(queueId ? { queueId } : {}),
    raw: value.raw,
    ...(conversationId ? { conversationId } : {}),
  };
}

export function readNativeSttMessageQueue(value: unknown): NativeSttQueuedMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const normalized = normalizeNativeSttQueuedMessage(item);
    return normalized ? [normalized] : [];
  });
}

export function isNativeSttMessageForConversation(
  message: Pick<NativeSttQueuedMessage, "conversationId">,
  conversationId: string | null | undefined,
): boolean {
  const messageConversationId = message.conversationId?.trim();
  if (!messageConversationId) return true;
  return messageConversationId === (conversationId || "").trim();
}

export function splitNativeSttMessagesForConversation(
  messages: NativeSttQueuedMessage[],
  conversationId: string | null | undefined,
): {
  matching: NativeSttQueuedMessage[];
  remaining: NativeSttQueuedMessage[];
} {
  const matching: NativeSttQueuedMessage[] = [];
  const remaining: NativeSttQueuedMessage[] = [];

  for (const message of messages) {
    if (isNativeSttMessageForConversation(message, conversationId)) {
      matching.push(message);
    } else {
      remaining.push(message);
    }
  }

  return { matching, remaining };
}

export function removeNativeSttQueuedMessage(
  messages: NativeSttQueuedMessage[],
  queueId: string | null | undefined,
): NativeSttQueuedMessage[] {
  const normalizedQueueId = queueId?.trim();
  if (!normalizedQueueId) return messages;
  return messages.filter((message) => message.queueId !== normalizedQueueId);
}
