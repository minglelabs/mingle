import { describe, expect, it } from "vitest";
import { isReadOnlyPost, readOnlyPostKind } from "./read-only-post";

describe("read-only post (author's archive / trash)", () => {
  it("public, not deleted: interactive", () => {
    expect(readOnlyPostKind({ visibility: "public", deletedAt: null })).toBeNull();
    expect(isReadOnlyPost({ visibility: "public", deletedAt: null })).toBe(false);
  });

  it("archived: read-only", () => {
    expect(readOnlyPostKind({ visibility: "archived", deletedAt: null })).toBe("archived");
  });

  it("in trash (even if it was archived): read-only, labelled as trash", () => {
    expect(readOnlyPostKind({ visibility: "public", deletedAt: "2026-09-01T00:00:00.000Z" })).toBe("trashed");
    expect(readOnlyPostKind({ visibility: "archived", deletedAt: "2026-09-01T00:00:00.000Z" })).toBe("trashed");
    expect(isReadOnlyPost({ visibility: "archived", deletedAt: "2026-09-01T00:00:00.000Z" })).toBe(true);
  });
});
