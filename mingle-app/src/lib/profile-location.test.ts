import { describe, expect, it } from "vitest";
import {
  buildOpenStreetMapEmbedUrl,
  normalizeProfileLocation,
} from "@/lib/profile-location";

describe("profile location helpers", () => {
  it("accepts valid coordinates and normalizes location labels", () => {
    expect(normalizeProfileLocation({
      latitude: 37.57,
      longitude: 126.98,
      city: " 서울 ",
      country: "대한민국",
      countryCode: "KR",
    })).toEqual({
      latitude: 37.57,
      longitude: 126.98,
      city: "서울",
      country: "대한민국",
      countryCode: "kr",
    });
  });

  it("rejects invalid coordinates", () => {
    expect(normalizeProfileLocation({ latitude: 91, longitude: 0 })).toBeNull();
    expect(normalizeProfileLocation({ latitude: 0, longitude: Number.NaN })).toBeNull();
  });

  it("builds a localized OpenStreetMap embed URL", () => {
    const url = buildOpenStreetMapEmbedUrl({
      latitude: 37.57,
      longitude: 126.98,
      city: "서울",
      country: "대한민국",
      countryCode: "kr",
    }, "ko");
    expect(url).toContain("openstreetmap.org/export/embed.html");
    expect(url).toContain("lang=ko");
    expect(url).toContain("marker=37.57%2C126.98");
  });
});
