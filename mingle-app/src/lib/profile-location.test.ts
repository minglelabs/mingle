import { afterEach, describe, expect, it } from "vitest";
import {
  buildGoogleMapsEmbedUrl,
  normalizeProfileLocation,
} from "@/lib/profile-location";

const originalGoogleMapsEmbedApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY;

afterEach(() => {
  if (originalGoogleMapsEmbedApiKey === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY;
  else process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY = originalGoogleMapsEmbedApiKey;
});

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

  it("builds a localized Google Maps Embed URL", () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY = "test-google-maps-key";
    const url = buildGoogleMapsEmbedUrl({
      latitude: 37.57,
      longitude: 126.98,
      city: "서울",
      country: "대한민국",
      countryCode: "kr",
    }, "ko");

    expect(url).toContain("google.com/maps/embed/v1/place");
    expect(url).toContain("language=ko");
    expect(url).toContain("q=37.57%2C126.98");
    expect(url).toContain("key=test-google-maps-key");
  });

  it("does not build a provider URL when the Google Maps key is missing", () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY;
    const url = buildGoogleMapsEmbedUrl({
      latitude: 37.57,
      longitude: 126.98,
      city: "서울",
      country: "대한민국",
      countryCode: "kr",
    }, "en");

    expect(url).toBeNull();
  });
});
