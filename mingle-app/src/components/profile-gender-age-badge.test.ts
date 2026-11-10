import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ProfileGenderAgeBadge from "@/components/profile-gender-age-badge";

const render = (props: Parameters<typeof ProfileGenderAgeBadge>[0]) =>
  renderToStaticMarkup(createElement(ProfileGenderAgeBadge, props));

describe("ProfileGenderAgeBadge", () => {
  it("shows a pink female pill with the age", () => {
    const html = render({ gender: "female", age: 24, locale: "ko" });
    expect(html).toContain('data-gender="female"');
    expect(html).toContain("bg-[#FF5E8E]");
    expect(html).toContain('aria-label="여성, 24세"');
    expect(html).toContain(">24<");
  });

  it("shows a blue male pill", () => {
    const html = render({ gender: "male", age: 31, locale: "en" });
    expect(html).toContain('data-gender="male"');
    expect(html).toContain("bg-[#3B9BFF]");
    expect(html).toContain('aria-label="Male, 31 years old"');
  });

  it("falls back to a gray age pill without a gender, and to nothing without either", () => {
    expect(render({ gender: null, age: 40, locale: "ko" })).toContain('data-gender="unknown"');
    expect(render({ gender: "female", locale: "ko" })).toContain('aria-label="여성"');
    expect(render({ gender: "other", age: undefined, locale: "ko" })).toBe("");
  });
});
