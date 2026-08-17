export type ConversationMutationFailureLabel =
  | "status-change"
  | "selected-languages"
  | "speech-languages"
  | "translation-linked"
  | "language-onboarding"
  | "default-display-language"
  | "route-open"
  | "popstate-open"
  | "create";

export type ConversationMutationFailureContext = {
  label: ConversationMutationFailureLabel;
  conversationId: string;
  method?: string;
  path?: string;
  responseStatus?: number;
  responseBody?: unknown;
  error?: unknown;
  stale?: boolean;
  aborted?: boolean;
};

export type ConversationMutationFailureSummary = {
  label: ConversationMutationFailureLabel;
  conversationId: string;
  method?: string;
  path?: string;
  responseStatus?: number;
  responseBody?: unknown;
  error: { name?: string; message?: string } | null;
  stale: boolean;
  aborted: boolean;
};

const MAX_BODY_PREVIEW_CHARS = 1024;

export function isConversationDiagnosticsEnabled(): boolean {
  if (typeof process === "undefined") return false;
  if (!process.env) return false;
  return process.env.NODE_ENV !== "production";
}

export function summarizeMutationError(error: unknown): { name?: string; message?: string } | null {
  if (error == null) return null;
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  if (typeof error === "string") return { message: error };
  return { message: "non-error thrown value" };
}

export function isAbortLikeMutationError(error: unknown): boolean {
  if (error == null) return false;
  if (typeof error === "object") {
    const record = error as {
      name?: unknown;
      code?: unknown;
      message?: unknown;
    };
    if (record.name === "AbortError") return true;
    if (record.code === "ABORT_ERR") return true;
    if (
      typeof record.message === "string"
      && /\babort(?:ed)?\b/i.test(record.message)
    ) {
      return true;
    }
  }
  return typeof error === "string" && /\babort(?:ed)?\b/i.test(error);
}

export function summarizeMutationBody(body: unknown): unknown {
  if (body == null) return null;
  if (typeof body === "string") {
    return body.length > MAX_BODY_PREVIEW_CHARS
      ? `${body.slice(0, MAX_BODY_PREVIEW_CHARS)}…`
      : body;
  }
  try {
    const text = JSON.stringify(body);
    if (text.length > MAX_BODY_PREVIEW_CHARS) {
      return `${text.slice(0, MAX_BODY_PREVIEW_CHARS)}…`;
    }
    return text;
  } catch {
    return null;
  }
}

export function buildConversationMutationFailureSummary(
  context: ConversationMutationFailureContext,
): ConversationMutationFailureSummary {
  return {
    label: context.label,
    conversationId: context.conversationId,
    method: context.method,
    path: context.path,
    responseStatus: context.responseStatus,
    responseBody: summarizeMutationBody(context.responseBody),
    error: summarizeMutationError(context.error),
    stale: context.stale ?? false,
    aborted: context.aborted ?? false,
  };
}

export function logConversationMutationFailure(
  context: ConversationMutationFailureContext,
): void {
  if (!isConversationDiagnosticsEnabled()) return;
  const summary = buildConversationMutationFailureSummary(context);
  console.warn("[mingle][conversation-list] mutation failure", summary);
}
