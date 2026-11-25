import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { clampAgeRange } from "@/components/explore/age-range-slider";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const limits = { min: 18, max: 60 };

describe("the age range slider", () => {
  it("keeps both handles inside the range and never lets them cross", () => {
    expect(clampAgeRange({ min: 25, max: 34 }, "min", limits)).toEqual({ min: 25, max: 34 });
    expect(clampAgeRange({ min: 5, max: 99 }, "min", limits)).toEqual({ min: 18, max: 60 });
    // The handle being moved stops at the other one.
    expect(clampAgeRange({ min: 40, max: 30 }, "min", limits)).toEqual({ min: 30, max: 30 });
    expect(clampAgeRange({ min: 40, max: 30 }, "max", limits)).toEqual({ min: 40, max: 40 });
  });

  it("is what the explore filter sheet uses for age, with the ends meaning no limit", () => {
    const sheet = read("src/components/explore/explore-filter-sheet.tsx");
    expect(sheet).toContain("<AgeRangeSlider");
    expect(sheet).not.toContain("<select\n            data-qa=\"explore-filter-age-min\"");
    expect(sheet).toContain("if (filters.ageMin > EXPLORE_AGE_MIN) params.ageMin = String(filters.ageMin);");
    const slider = read("src/components/explore/age-range-slider.tsx");
    expect(slider).toContain('data-qa="explore-filter-age-min"');
    expect(slider).toContain('data-qa="explore-filter-age-max"');
  });

  it("shows a live talk with level bars on the lounge, the room rows and the stage", () => {
    expect(read("src/components/voice-rooms/voice-rooms-page.tsx")).toContain('<LiveBars size={12} className="text-emerald-500" />');
    expect(read("src/components/search/open-rooms.tsx")).toContain("<LiveBars size={10} />");
    expect(read("src/components/LivePhoneDemo/VoiceRoomStage.tsx")).toContain("<LiveBars");
    const css = read("src/app/globals.css");
    expect(css).toContain("@keyframes mingle-live-bar");
    // Still when the phone asks for less motion.
    expect(css).toContain("@media (prefers-reduced-motion: reduce) {\n  .mingle-live-bar {\n    animation: none;");
  });
});
