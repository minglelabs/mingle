import { describe, expect, it } from "vitest";
import { ADMIN_TABS, formatAdminTabBadge, normalizeAdminTabBadge, resolveActiveAdminTab } from "./admin-tabs";

describe("admin tabs", () => {
  it("lists 인박스 · 알림 · 계정 · 게시물 · 더보기 in order", () => {
    expect(ADMIN_TABS.map((tab) => [tab.label, tab.href])).toEqual([
      ["인박스", "/admin/inbox"],
      ["알림", "/admin/activity"],
      ["계정", "/admin/operators"],
      ["게시물", "/admin/posts"],
      ["더보기", "/admin/more"],
    ]);
  });

  it.each([
    ["/admin/inbox", "inbox"],
    ["/admin/inbox/conv_1", "inbox"],
    ["/admin/activity", "activity"],
    ["/admin/activity/posts/post_1", "activity"],
    ["/admin/operators/new", "operators"],
    ["/admin/posts", "posts"],
    ["/admin/more", "more"],
    ["/admin", "more"],
    ["/admin/reports", "more"],
    ["/admin/dashboard", "more"],
    ["/admin/conversations", "more"],
    ["/admin/settings/notifications", "more"],
    ["/admin/inboxes", "more"],
  ] as const)("marks %s as the %s tab", (pathname, tab) => {
    expect(resolveActiveAdminTab(pathname)).toBe(tab);
  });

  it("shows a badge only for a positive count, capped at 99+", () => {
    expect(normalizeAdminTabBadge(undefined)).toBe(0);
    expect(normalizeAdminTabBadge(0)).toBe(0);
    expect(normalizeAdminTabBadge(-3)).toBe(0);
    expect(normalizeAdminTabBadge(Number.NaN)).toBe(0);
    expect(normalizeAdminTabBadge(3.7)).toBe(3);
    expect(formatAdminTabBadge(7)).toBe("7");
    expect(formatAdminTabBadge(99)).toBe("99");
    expect(formatAdminTabBadge(120)).toBe("99+");
  });
});
