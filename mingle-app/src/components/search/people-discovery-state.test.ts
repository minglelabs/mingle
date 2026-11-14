import { describe, expect, it } from "vitest";
import { mergeDiscoveryPage, parseDiscoveryPage } from "./people-discovery-state";

describe("people discovery state", () => {
  it("parses the wire payload and drops malformed rows", () => {
    const page = parseDiscoveryPage({
      users: [
        {
          id: "mina", handle: "mina", name: "Mina", image: "https://cdn/x.jpg", age: 24, nationalityCountry: "KR",
          primaryLanguages: ["ko", 3], interestLanguages: [{ code: "en", level: 9 }, { level: 2 }], badge: "new",
        },
        { name: "no id" },
        null,
      ],
      nextCursor: "abc",
      viewerSide: "korean",
    });
    expect(page.viewerSide).toBe("korean");
    expect(page.nextCursor).toBe("abc");
    expect(page.users).toHaveLength(1);
    expect(page.users[0]).toMatchObject({
      id: "mina",
      age: 24,
      primaryLanguages: ["ko"],
      interestLanguages: [{ code: "en", level: 5 }],
      badge: "new",
    });
  });

  it("defaults to a foreign viewer and no next page", () => {
    expect(parseDiscoveryPage({})).toEqual({ users: [], nextCursor: null, viewerSide: "foreign" });
    expect(parseDiscoveryPage({ users: [{ id: "a", badge: "vip", age: -1 }] }).users[0]).not.toHaveProperty("badge");
  });

  it("appends the next page without duplicates", () => {
    const person = (id: string) => ({ id, handle: id, name: null, image: null, nationalityCountry: null, primaryLanguages: [], interestLanguages: [] });
    const merged = mergeDiscoveryPage(
      { users: [person("a"), person("b")], nextCursor: "c1", viewerSide: "foreign" },
      { users: [person("b"), person("c")], nextCursor: null, viewerSide: "foreign" },
    );
    expect(merged.users.map((user) => user.id)).toEqual(["a", "b", "c"]);
    expect(merged.nextCursor).toBeNull();
  });
});
