import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ProfileAge from "@/components/profile-age";

describe("ProfileAge", () => {
  it("renders a localized age label", () => {
    expect(renderToStaticMarkup(createElement(ProfileAge, { age: 32, locale: "ko" }))).toContain("32세");
  });

  it("renders nothing when the age is absent or invalid", () => {
    expect(renderToStaticMarkup(createElement(ProfileAge, { age: undefined, locale: "ko" }))).toBe("");
    expect(renderToStaticMarkup(createElement(ProfileAge, { age: -1, locale: "ko" }))).toBe("");
  });
});
