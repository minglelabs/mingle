import { describe, expect, it } from "vitest";
import { sanitizeAdminReturnTo } from "@/lib/admin-return-to";

const FALLBACK = "/admin/reports";

describe("sanitizeAdminReturnTo", () => {
  const accepted: Array<[string, string, string]> = [
    ["reports list", "/admin/reports", "/admin/reports"],
    ["filtered reports list", "/admin/reports?status=open&type=post&page=2", "/admin/reports?status=open&type=post&page=2"],
    ["admin root", "/admin", "/admin"],
    ["feedback list", "/admin?filter=unanswered&page=3", "/admin?filter=unanswered&page=3"],
    ["report detail", "/admin/reports/rep_123", "/admin/reports/rep_123"],
    ["stale result is dropped", "/admin/reports?status=open&result=reply_sent", "/admin/reports?status=open"],
    ["only a result param", "/admin/reports?result=note_saved", "/admin/reports"],
    ["hash is dropped", "/admin/reports?page=2#r1", "/admin/reports?page=2"],
    ["surrounding whitespace", "  /admin/reports  ", "/admin/reports"],
  ];

  it.each(accepted)("accepts %s", (_label, input, expected) => {
    expect(sanitizeAdminReturnTo(input, FALLBACK)).toBe(expected);
  });

  const refused: Array<[string, unknown]> = [
    ["absolute https URL", "https://evil.example/admin/reports"],
    ["absolute URL on the same-looking host", "https://mingle.local/admin/reports"],
    ["protocol-relative URL", "//evil.example/admin"],
    ["backslash protocol-relative URL", "/\\evil.example/admin"],
    ["tab-smuggled protocol-relative URL", "/\t/evil.example/admin"],
    ["newline-smuggled protocol-relative URL", "/\n/evil.example/admin"],
    ["javascript: URL", "javascript:alert(1)"],
    ["data: URL", "data:text/html,hi"],
    ["non-admin app path", "/ko/feed"],
    ["prefix look-alike", "/administrator"],
    ["dot-segment escape", "/admin/../ko/feed"],
    ["encoded dot-segment escape", "/admin/%2e%2e/ko/feed"],
    ["relative path without a leading slash", "admin/reports"],
    ["empty string", ""],
    ["missing form field", null],
    ["uploaded file instead of text", new Blob(["x"])],
  ];

  it.each(refused)("falls back for %s", (_label, input) => {
    expect(sanitizeAdminReturnTo(input, FALLBACK)).toBe(FALLBACK);
  });
});
