import { describe, expect, it } from "vitest";
import {
  getProfileLinkInstallCopy,
  resolveProfileLinkInstallLocale,
} from "@/components/profile-link-install-copy";

describe("profile link install copy", () => {
  it("uses Korean copy when Korean is the highest-priority supported browser language", () => {
    expect(resolveProfileLinkInstallLocale("ko-KR, en-US;q=0.9")).toBe("ko");
    expect(getProfileLinkInstallCopy("ko").openInApp).toBe("밍글 앱에서 열기");
  });

  it("uses English when English is the highest-priority supported browser language", () => {
    expect(resolveProfileLinkInstallLocale("en-US, ko;q=0.8")).toBe("en");
    expect(getProfileLinkInstallCopy("en").openInApp).toBe("Open in Mingle");
  });

  it("defaults to English without a supported browser language", () => {
    expect(resolveProfileLinkInstallLocale(undefined)).toBe("en");
    expect(resolveProfileLinkInstallLocale("fr-FR, de;q=0.8")).toBe("en");
  });
});
