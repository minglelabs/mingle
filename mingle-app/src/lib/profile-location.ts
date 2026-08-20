import type { AppLocale } from "@/i18n/config";
import { resolvePrimaryUiLocale } from "@/i18n/mingle-locales";

export type ProfileLocationRecord = {
  latitude: number;
  longitude: number;
  city: string | null;
  country: string | null;
  countryCode: string | null;
};

export type LocalizedProfileLocation = Pick<ProfileLocationRecord, "city" | "country" | "countryCode">;

const reverseGeocodeCache = new Map<string, LocalizedProfileLocation>();
const REVERSE_GEOCODE_CACHE_LIMIT = 80;

export function normalizeProfileLocation(value: unknown): ProfileLocationRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const latitude = record.latitude;
  const longitude = record.longitude;
  if (
    typeof latitude !== "number"
    || !Number.isFinite(latitude)
    || latitude < -90
    || latitude > 90
    || typeof longitude !== "number"
    || !Number.isFinite(longitude)
    || longitude < -180
    || longitude > 180
  ) return null;

  const text = (candidate: unknown) => typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : null;
  const countryCode = text(record.countryCode)?.toLowerCase() ?? null;
  return {
    latitude,
    longitude,
    city: text(record.city),
    country: text(record.country),
    countryCode: countryCode && /^[a-z]{2,3}$/.test(countryCode) ? countryCode : null,
  };
}

function geocoderLanguage(locale: AppLocale): string {
  const primary = resolvePrimaryUiLocale(locale);
  return primary === "zh-CN" ? "zh-CN"
    : primary === "zh-TW" ? "zh-TW"
      : primary;
}

function boundedCacheSet(key: string, value: LocalizedProfileLocation): void {
  if (reverseGeocodeCache.size >= REVERSE_GEOCODE_CACHE_LIMIT) {
    const oldestKey = reverseGeocodeCache.keys().next().value;
    if (oldestKey) reverseGeocodeCache.delete(oldestKey);
  }
  reverseGeocodeCache.set(key, value);
}

export async function reverseGeocodeProfileLocation(
  location: ProfileLocationRecord,
  locale: AppLocale,
): Promise<LocalizedProfileLocation> {
  const language = geocoderLanguage(locale);
  const key = `${location.latitude.toFixed(2)},${location.longitude.toFixed(2)}:${language}`;
  const cached = reverseGeocodeCache.get(key);
  if (cached) return cached;

  const fallback = {
    city: location.city,
    country: location.country,
    countryCode: location.countryCode,
  } satisfies LocalizedProfileLocation;

  try {
    const query = new URLSearchParams({
      format: "jsonv2",
      lat: String(location.latitude),
      lon: String(location.longitude),
      zoom: "10",
      addressdetails: "1",
      "accept-language": language,
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${query.toString()}`, {
      headers: { Accept: "application/json" },
      cache: "force-cache",
    });
    if (!response.ok) return fallback;
    const payload = await response.json() as { address?: Record<string, unknown> };
    const address = payload.address ?? {};
    const text = (candidate: unknown) => typeof candidate === "string" && candidate.trim()
      ? candidate.trim()
      : null;
    const result = {
      city: text(address.city) ?? text(address.town) ?? text(address.village) ?? text(address.municipality) ?? fallback.city,
      country: text(address.country) ?? fallback.country,
      countryCode: text(address.country_code)?.toLowerCase() ?? fallback.countryCode,
    } satisfies LocalizedProfileLocation;
    boundedCacheSet(key, result);
    return result;
  } catch {
    return fallback;
  }
}

export function buildOpenStreetMapEmbedUrl(location: ProfileLocationRecord, locale: AppLocale): string {
  // Keep the map focused on the city area so labels remain readable in the full-screen panel.
  const latitudePadding = 0.035;
  const longitudePadding = 0.045;
  const minLatitude = Math.max(-90, location.latitude - latitudePadding);
  const maxLatitude = Math.min(90, location.latitude + latitudePadding);
  const minLongitude = Math.max(-180, location.longitude - longitudePadding);
  const maxLongitude = Math.min(180, location.longitude + longitudePadding);
  const primary = resolvePrimaryUiLocale(locale);
  const params = new URLSearchParams({
    bbox: `${minLongitude},${minLatitude},${maxLongitude},${maxLatitude}`,
    layer: "mapnik",
    marker: `${location.latitude},${location.longitude}`,
    lang: primary,
  });
  return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`;
}
