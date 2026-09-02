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
const REVERSE_GEOCODE_TIMEOUT_MS = 8_000;

export type ReverseGeocodeOptions = {
  requestId?: string;
};

function logReverseGeocode(event: string, payload: Record<string, unknown>): void {
  console.info(`[ProfileLocation] ${event}`, payload);
}

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
  options: ReverseGeocodeOptions = {},
): Promise<LocalizedProfileLocation> {
  const language = geocoderLanguage(locale);
  const key = `${location.latitude.toFixed(2)},${location.longitude.toFixed(2)}:${language}`;
  const cached = reverseGeocodeCache.get(key);
  if (cached) {
    logReverseGeocode("reverse_geocode_cache_hit", {
      requestId: options.requestId ?? "",
      language,
    });
    return cached;
  }

  const fallback = {
    city: location.city,
    country: location.country,
    countryCode: location.countryCode,
  } satisfies LocalizedProfileLocation;

  const startedAtMs = Date.now();
  const controller = typeof AbortController === "undefined" ? null : new AbortController();
  const timeoutId = setTimeout(() => controller?.abort(), REVERSE_GEOCODE_TIMEOUT_MS);
  logReverseGeocode("reverse_geocode_start", {
    requestId: options.requestId ?? "",
    language,
  });

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
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!response.ok) {
      logReverseGeocode("reverse_geocode_fallback", {
        requestId: options.requestId ?? "",
        durationMs: Date.now() - startedAtMs,
        reason: `http_${response.status}`,
      });
      return fallback;
    }
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
    logReverseGeocode("reverse_geocode_success", {
      requestId: options.requestId ?? "",
      durationMs: Date.now() - startedAtMs,
      language,
    });
    return result;
  } catch (error: unknown) {
    logReverseGeocode("reverse_geocode_fallback", {
      requestId: options.requestId ?? "",
      durationMs: Date.now() - startedAtMs,
      reason: controller?.signal.aborted
        ? "timeout"
        : error instanceof Error ? error.message : String(error),
    });
    return fallback;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function buildGoogleMapsEmbedUrl(location: ProfileLocationRecord, locale: AppLocale): string | null {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY?.trim();
  if (!apiKey) return null;

  const primary = resolvePrimaryUiLocale(locale);
  const params = new URLSearchParams({
    key: apiKey,
    q: `${location.latitude},${location.longitude}`,
    center: `${location.latitude},${location.longitude}`,
    zoom: "12",
    maptype: "roadmap",
    language: primary,
  });
  return `https://www.google.com/maps/embed/v1/place?${params.toString()}`;
}
