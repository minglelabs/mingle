import { describe, expect, it } from "vitest";
import {
  buildAdminFeedbackHref,
  normalizeAdminFeedbackFilter,
  normalizeAdminFeedbackPage,
  sanitizeAdminFeedbackReturnTo,
} from "@/lib/admin-feedback-query";

describe("admin-feedback-query", () => {
  it("normalizes admin feedback filters and pages", () => {
    expect(normalizeAdminFeedbackFilter("needs-reply")).toBe("needs-reply");
    expect(normalizeAdminFeedbackFilter("other")).toBe("all");
    expect(normalizeAdminFeedbackPage("3")).toBe(3);
    expect(normalizeAdminFeedbackPage("-2")).toBe(1);
    expect(normalizeAdminFeedbackPage("abc")).toBe(1);
  });

  it("builds compact admin hrefs with optional filter and page state", () => {
    expect(buildAdminFeedbackHref()).toBe("/admin");
    expect(buildAdminFeedbackHref({ filter: "all", page: 1 })).toBe("/admin");
    expect(buildAdminFeedbackHref({ filter: "needs-reply", page: 1 })).toBe("/admin?filter=needs-reply");
    expect(buildAdminFeedbackHref({ filter: "needs-reply", page: 2 })).toBe("/admin?filter=needs-reply&page=2");
    expect(buildAdminFeedbackHref({ filter: "all", page: 2, sent: "feedback_1" })).toBe("/admin?page=2&sent=feedback_1");
  });

  it("keeps return paths inside the admin inbox", () => {
    expect(sanitizeAdminFeedbackReturnTo("/admin?filter=needs-reply&page=3")).toBe("/admin?filter=needs-reply&page=3");
    expect(sanitizeAdminFeedbackReturnTo("https://evil.example/admin?page=2")).toBe("/admin");
    expect(sanitizeAdminFeedbackReturnTo("/en/admin?page=2")).toBe("/admin");
    expect(sanitizeAdminFeedbackReturnTo("/admin?error=invalid_credentials&sent=feedback_1&page=2")).toBe("/admin?page=2");
  });
});

