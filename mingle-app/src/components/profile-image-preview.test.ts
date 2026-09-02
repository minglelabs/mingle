import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ProfileImagePreview from "./profile-image-preview";

describe("ProfileImagePreview", () => {
  it("shows identity details together with the primary language", () => {
    const html = renderToStaticMarkup(
      createElement(ProfileImagePreview, {
        open: true,
        image: null,
        alt: "Mina",
        name: "Mina Song",
        handle: "mina.song",
        bio: "Seamless conversations.",
        language: "ko",
        languageLabel: "Primary language",
        languageName: "Korean",
        closeLabel: "Close",
        onClose: () => {},
      }),
    );

    expect(html).toContain("Mina Song");
    expect(html).toContain("@mina.song");
    expect(html).toContain("Seamless conversations.");
    expect(html).toContain("Primary language");
    expect(html).toContain("Korean");
    expect(html).toContain("rounded-[24px]");
  });
});
