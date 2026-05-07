import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildConversationMutationFailureSummary,
  isConversationDiagnosticsEnabled,
  logConversationMutationFailure,
  summarizeMutationBody,
  summarizeMutationError,
} from "@/components/conversation-list.diagnostics";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalNodeEnv === undefined) {
    delete (process.env as Record<string, string | undefined>).NODE_ENV;
  } else {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
  }
  vi.restoreAllMocks();
});

describe("summarizeMutationError", () => {
  it("returns name and message for Error instances", () => {
    expect(summarizeMutationError(new TypeError("nope"))).toEqual({
      name: "TypeError",
      message: "nope",
    });
  });

  it("returns the string itself when passed a plain string", () => {
    expect(summarizeMutationError("offline")).toEqual({ message: "offline" });
  });

  it("returns null when the error is null/undefined", () => {
    expect(summarizeMutationError(null)).toBeNull();
    expect(summarizeMutationError(undefined)).toBeNull();
  });

  it("does not leak nested object internals for unknown thrown shapes", () => {
    expect(summarizeMutationError({ secret: "x" })).toEqual({
      message: "non-error thrown value",
    });
  });
});

describe("summarizeMutationBody", () => {
  it("truncates very long strings", () => {
    const long = "a".repeat(2000);
    const summary = summarizeMutationBody(long);
    expect(typeof summary).toBe("string");
    expect((summary as string).endsWith("…")).toBe(true);
    expect((summary as string).length).toBeLessThanOrEqual(1025);
  });

  it("stringifies and truncates JSON bodies", () => {
    const summary = summarizeMutationBody({ ok: false, code: "err" });
    expect(summary).toBe('{"ok":false,"code":"err"}');
  });

  it("returns null for circular structures and nullish bodies", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(summarizeMutationBody(cyclic)).toBeNull();
    expect(summarizeMutationBody(null)).toBeNull();
    expect(summarizeMutationBody(undefined)).toBeNull();
  });
});

describe("isConversationDiagnosticsEnabled", () => {
  it("is disabled in production", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV ="production";
    expect(isConversationDiagnosticsEnabled()).toBe(false);
  });

  it("is enabled in development", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV ="development";
    expect(isConversationDiagnosticsEnabled()).toBe(true);
  });

  it("is enabled in test", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV ="test";
    expect(isConversationDiagnosticsEnabled()).toBe(true);
  });
});

describe("buildConversationMutationFailureSummary", () => {
  it("produces a deterministic summary with stale/aborted defaults", () => {
    const summary = buildConversationMutationFailureSummary({
      label: "status-change",
      conversationId: "conv-9",
      method: "PATCH",
      path: "/api/conversations/conv-9",
      responseStatus: 503,
      responseBody: { error: "upstream-timeout" },
      error: new Error("net"),
    });
    expect(summary).toEqual({
      label: "status-change",
      conversationId: "conv-9",
      method: "PATCH",
      path: "/api/conversations/conv-9",
      responseStatus: 503,
      responseBody: '{"error":"upstream-timeout"}',
      error: { name: "Error", message: "net" },
      stale: false,
      aborted: false,
    });
  });

  it("preserves stale/aborted when explicitly set", () => {
    const summary = buildConversationMutationFailureSummary({
      label: "selected-languages",
      conversationId: "conv-1",
      error: new Error("x"),
      stale: true,
      aborted: true,
    });
    expect(summary.stale).toBe(true);
    expect(summary.aborted).toBe(true);
  });
});

describe("logConversationMutationFailure", () => {
  it("writes a warn line with summarized payload when diagnostics enabled", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV ="test";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logConversationMutationFailure({
      label: "status-change",
      conversationId: "c",
      error: new Error("offline"),
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [tag, payload] = warnSpy.mock.calls[0]!;
    expect(tag).toBe("[mingle][conversation-list] mutation failure");
    expect((payload as { label: string }).label).toBe("status-change");
  });

  it("is a no-op when diagnostics are disabled (production)", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV ="production";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logConversationMutationFailure({
      label: "status-change",
      conversationId: "c",
      error: new Error("offline"),
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
