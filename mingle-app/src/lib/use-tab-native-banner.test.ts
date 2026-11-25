import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isNativeBannerAllowedPathname, isNativeBannerTabPathname, NATIVE_BANNER_TAB_ROUTES } from "@/lib/native-banner-zone";
import { estimateTabBannerHeightPx, TAB_BANNER_TOP_BAR_HEIGHT_PX } from "@/lib/use-tab-native-banner";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("the ad banner under the top bar of a tab", () => {
  it("is allowed on the voice-room and explore tabs, not on their sub-routes or other tabs", () => {
    expect(isNativeBannerAllowedPathname("/ko/voice")).toBe(true);
    expect(isNativeBannerAllowedPathname("/en/explore/")).toBe(true);
    expect(isNativeBannerTabPathname("/ko/explore")).toBe(true);
    expect(isNativeBannerTabPathname("/ko/conversations")).toBe(false);
    for (const pathname of ["/ko/feed", "/ko/mypage", "/ko/explore/people", "/ko/voice/room-1", "/ko"]) {
      expect(isNativeBannerAllowedPathname(pathname)).toBe(false);
    }
  });

  it("keeps the top bar as tall as the app draws the banner below (56 px), on both tabs", () => {
    expect(TAB_BANNER_TOP_BAR_HEIGHT_PX).toBe(56);
    expect(read("rn/App.tsx")).toContain("const NATIVE_CONVERSATION_LIST_HEADER_HEIGHT_PX = 56;");
    for (const file of ["src/components/voice-rooms/voice-rooms-page.tsx", "src/components/explore/explore-people-page.tsx"]) {
      const page = read(file);
      expect(page).toContain("style={{ height: TAB_BANNER_TOP_BAR_HEIGHT_PX }}");
      expect(page).toContain('useTabNativeBanner(sessionStatus === "authenticated")');
      // The strip the banner sits in comes before the scrolling area.
      expect(page.indexOf('data-qa="tab-banner-slot"')).toBeGreaterThan(0);
      expect(page.indexOf('data-qa="tab-banner-slot"')).toBeLessThan(page.indexOf("overflow-y-auto overscroll-contain"));
    }
  });

  it("guesses the banner height until the app says it (the page is scaled down on narrow phones)", () => {
    expect(estimateTabBannerHeightPx(400)).toBe(50);
    expect(estimateTabBannerHeightPx(430)).toBe(50);
    expect(estimateTabBannerHeightPx(320)).toBe(63);
    expect(estimateTabBannerHeightPx(0)).toBe(50);
  });

  it("names the same tabs in the app shell, which leaves the banner to the web there", () => {
    const shell = read("rn/src/nativeBannerZone.ts");
    for (const route of NATIVE_BANNER_TAB_ROUTES) expect(shell).toContain(`'${route}'`);
    expect(shell).toContain("NATIVE_BANNER_TAB_ROUTES.includes(pathSegments[1])) return null;");
  });

  it("is hidden under the sheets and screens that open over those tabs", () => {
    expect(read("src/components/explore/explore-filter-sheet.tsx")).toContain("useNativeBannerSuppression();");
    expect(read("src/components/dormant-account-gate.tsx")).toContain("useNativeBannerSuppression(");
  });
});
