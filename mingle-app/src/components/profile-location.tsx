"use client";

import { getProfileLocationCopy } from "@/i18n/profile-location-copy";
import type { AppLocale } from "@/i18n";
import {
  getBrowserCurrentLocation,
  isNativeLocationBridgeAvailable,
  postNativeLocationPermissionCheck,
  postNativeLocationRequest,
  postNativeLocationSettings,
  readBrowserLocationPermission,
  subscribeNativeLocation,
  type NativeLocationEvent,
  type NativeLocationPermission,
} from "@/lib/native-location";
import {
  buildGoogleMapsEmbedUrl,
  normalizeProfileLocation,
  reverseGeocodeProfileLocation,
  type ProfileLocationRecord,
} from "@/lib/profile-location";
import SlideSurface from "@/components/slide-surface";
import { ArrowLeft, LocateFixed, Loader2, MapPin } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type ProfileLocationProps = {
  profileLocation: ProfileLocationRecord | null;
  locale: AppLocale;
  isOwnProfile: boolean;
  onSaveLocation?: (
    location: ProfileLocationRecord,
    context?: { requestId?: string },
  ) => Promise<void>;
  onClearLocation?: (context?: { requestId?: string }) => Promise<void>;
  onMapOpenChange?: (open: boolean) => void;
};

const PROFILE_LOCATION_SAVE_TIMEOUT_MS = 12_000;

function logProfileLocation(event: string, payload: Record<string, unknown>): void {
  console.info(`[ProfileLocation] ${event}`, payload);
}

async function withProfileLocationTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorCode: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(errorCode)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function locationLabel(
  location: Pick<ProfileLocationRecord, "city" | "country"> | null,
): string {
  if (!location) return "";
  return [location.city, location.country].filter(Boolean).join(", ");
}

export default function ProfileLocation({
  profileLocation,
  locale,
  isOwnProfile,
  onSaveLocation,
  onClearLocation,
  onMapOpenChange,
}: ProfileLocationProps) {
  const copy = useMemo(() => getProfileLocationCopy(locale), [locale]);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [permission, setPermission] = useState<NativeLocationPermission>("unknown");
  const [error, setError] = useState<string | null>(null);
  const [localizedLocation, setLocalizedLocation] = useState<ProfileLocationRecord | null>(profileLocation);
  const requestSequenceRef = useRef(0);

  const setMapOpen = useCallback((open: boolean) => {
    setIsMapOpen(open);
    onMapOpenChange?.(open);
  }, [onMapOpenChange]);

  useEffect(() => {
    let cancelled = false;
    if (!profileLocation) {
      return () => {
        cancelled = true;
      };
    }

    void reverseGeocodeProfileLocation(profileLocation, locale).then((localized) => {
      if (cancelled) return;
      setLocalizedLocation({ ...profileLocation, ...localized });
    });

    return () => {
      cancelled = true;
    };
  }, [locale, profileLocation]);

  const clearStoredLocation = useCallback(async (requestId?: string) => {
    if (!onClearLocation) return;
    const startedAtMs = Date.now();
    logProfileLocation("location_clear_start", { requestId: requestId ?? "" });
    try {
      await withProfileLocationTimeout(
        onClearLocation({ requestId }),
        PROFILE_LOCATION_SAVE_TIMEOUT_MS,
        "location_clear_timeout",
      );
      logProfileLocation("location_clear_success", {
        requestId: requestId ?? "",
        durationMs: Date.now() - startedAtMs,
      });
    } catch (error: unknown) {
      logProfileLocation("location_clear_failed", {
        requestId: requestId ?? "",
        durationMs: Date.now() - startedAtMs,
        error: error instanceof Error ? error.message : String(error),
      });
      // The caller keeps the last rendered value when a best-effort privacy cleanup fails.
    }
  }, [onClearLocation]);

  const finishLocationRequest = useCallback((nextError: string | null) => {
    setIsRequesting(false);
    setError(nextError);
  }, []);

  const saveCurrentLocation = useCallback(async (
    coordinates: {
      latitude: number;
      longitude: number;
      accuracy?: number | null;
      provider?: string;
      receivedAtMs?: number;
    },
    requestId: string,
  ) => {
    if (requestId !== String(requestSequenceRef.current)) return;
    logProfileLocation("location_received", {
      requestId,
      provider: coordinates.provider ?? "unknown",
      accuracy: coordinates.accuracy ?? null,
      receivedAtMs: coordinates.receivedAtMs ?? Date.now(),
    });
    const candidate = normalizeProfileLocation({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      city: null,
      country: null,
      countryCode: null,
    });
    if (!candidate) {
      finishLocationRequest(copy.locationError);
      return;
    }

    const localized = await reverseGeocodeProfileLocation(candidate, locale, { requestId });
    const nextLocation: ProfileLocationRecord = { ...candidate, ...localized };
    if (requestId !== String(requestSequenceRef.current)) return;
    const saveStartedAtMs = Date.now();
    logProfileLocation("location_save_start", { requestId });
    try {
      await withProfileLocationTimeout(
        onSaveLocation?.(nextLocation, { requestId }) ?? Promise.resolve(),
        PROFILE_LOCATION_SAVE_TIMEOUT_MS,
        "location_save_timeout",
      );
      logProfileLocation("location_save_success", {
        requestId,
        durationMs: Date.now() - saveStartedAtMs,
      });
      setLocalizedLocation(nextLocation);
      setPermission("granted");
      setMapOpen(true);
      finishLocationRequest(null);
      toast.success(copy.saveSuccess);
    } catch (error: unknown) {
      logProfileLocation("location_save_failed", {
        requestId,
        durationMs: Date.now() - saveStartedAtMs,
        error: error instanceof Error ? error.message : String(error),
      });
      finishLocationRequest(copy.locationError);
    }
  }, [copy.locationError, copy.saveSuccess, finishLocationRequest, locale, onSaveLocation, setMapOpen]);

  const requestCurrentLocation = useCallback(async () => {
    if (!isOwnProfile || !onSaveLocation || isRequesting) return;
    const requestId = String(++requestSequenceRef.current);
    const requestStartedAtMs = Date.now();
    logProfileLocation("location_request_start", { requestId });
    setMapOpen(true);
    setIsRequesting(true);
    setError(null);

    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe = () => {};
    const finish = () => {
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      unsubscribe();
    };

    const handlePermissionDenied = (nextPermission: NativeLocationPermission) => {
      if (settled) return;
      finish();
      setPermission(nextPermission);
      if (nextPermission === "denied" || nextPermission === "blocked") {
        void clearStoredLocation(requestId);
      }
      logProfileLocation("location_permission_denied", {
        requestId,
        permission: nextPermission,
        durationMs: Date.now() - requestStartedAtMs,
      });
      finishLocationRequest(copy.permissionDenied);
    };

    const handleEvent = (event: NativeLocationEvent) => {
      if (event.requestId && event.requestId !== requestId) return;
      if (event.type === "permission") {
        setPermission(event.permission);
        if (event.permission !== "granted") {
          handlePermissionDenied(event.permission);
        }
        return;
      }
      if (event.type === "error") {
        finish();
        logProfileLocation("location_error", {
          requestId,
          code: event.code,
          durationMs: Date.now() - requestStartedAtMs,
        });
        finishLocationRequest(copy.locationError);
        return;
      }
      finish();
      void saveCurrentLocation(event, requestId);
    };

    unsubscribe = subscribeNativeLocation(handleEvent);
    timeoutId = setTimeout(() => {
      if (settled) return;
      finish();
      logProfileLocation("location_request_timeout", {
        requestId,
        durationMs: Date.now() - requestStartedAtMs,
      });
      finishLocationRequest(copy.locationError);
    }, 15_000);

    if (isNativeLocationBridgeAvailable() && postNativeLocationRequest(requestId)) {
      logProfileLocation("location_request_sent_to_native", { requestId });
      return;
    }

    try {
      const browserLocation = await getBrowserCurrentLocation();
      await saveCurrentLocation(browserLocation, requestId);
      if (!settled) finish();
    } catch (error: unknown) {
      if (!settled) {
        finish();
        const isPermissionDenied = typeof error === "object"
          && error !== null
          && "code" in error
          && (error as { code?: unknown }).code === 1;
        if (isPermissionDenied) {
          setPermission("denied");
          await clearStoredLocation(requestId);
          finishLocationRequest(copy.permissionDenied);
        } else {
          logProfileLocation("location_browser_failed", {
            requestId,
            durationMs: Date.now() - requestStartedAtMs,
            error: error instanceof Error ? error.message : String(error),
          });
          finishLocationRequest(copy.locationError);
        }
      }
    }
  }, [clearStoredLocation, copy.locationError, copy.permissionDenied, finishLocationRequest, isOwnProfile, isRequesting, onSaveLocation, saveCurrentLocation, setMapOpen]);

  const openMap = useCallback(() => {
    setError(null);
    setMapOpen(true);
  }, [setMapOpen]);

  const displayLocation = profileLocation
    && localizedLocation
    && localizedLocation.latitude === profileLocation.latitude
    && localizedLocation.longitude === profileLocation.longitude
    ? localizedLocation
    : profileLocation;
  const displayLabel = locationLabel(displayLocation);
  const embedUrl = displayLocation ? buildGoogleMapsEmbedUrl(displayLocation, locale) : null;
  const canOpenSettings = isNativeLocationBridgeAvailable() && (permission === "denied" || permission === "blocked");

  return (
    <>
      {displayLocation ? (
        <button
          type="button"
          onClick={openMap}
          className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md text-left text-[13px] text-gray-500 transition hover:text-slate-800 active:opacity-70"
          aria-label={`${copy.viewAction}: ${displayLabel || copy.label}`}
        >
          <MapPin size={14} strokeWidth={2} aria-hidden="true" />
          <span className="truncate">{displayLabel || copy.label}</span>
        </button>
      ) : isOwnProfile ? (
        <button
          type="button"
          onClick={() => void requestCurrentLocation()}
          className="mt-1 inline-flex items-center gap-1 rounded-md text-[13px] font-medium text-slate-500 transition hover:text-slate-900 active:opacity-70"
        >
          <MapPin size={14} strokeWidth={2} aria-hidden="true" />
          <span>{copy.emptyOwn}</span>
        </button>
      ) : (
        <p className="mt-1 inline-flex items-center gap-1 text-[13px] text-gray-400">
          <MapPin size={14} strokeWidth={2} aria-hidden="true" />
          <span>{copy.emptyOther}</span>
        </p>
      )}

      <SlideSurface
        open={isMapOpen}
        onClose={() => setMapOpen(false)}
        ariaLabel={copy.mapTitle}
        nativeBackPriority={40}
        className="fixed inset-0 z-[110] flex min-h-0 w-full flex-col overflow-hidden bg-white text-slate-950 shadow-2xl"
        style={{ touchAction: "pan-y" }}
      >
            <header
              className="grid shrink-0 grid-cols-[44px_1fr_44px] items-center border-b border-gray-100 px-4"
              style={{
                height: "calc(56px + env(safe-area-inset-top, 44px))",
                paddingTop: "env(safe-area-inset-top, 44px)",
              }}
            >
              <button
                type="button"
                onClick={() => setMapOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 active:bg-gray-200"
                aria-label={copy.closeAction}
              >
                <ArrowLeft size={24} strokeWidth={2} aria-hidden="true" />
              </button>
              <div className="min-w-0 text-center">
                <h2 id="profile-location-title" className="truncate text-[18px] font-bold text-slate-950">{copy.mapTitle}</h2>
                {displayLabel ? <p className="mt-0.5 truncate text-[15px] text-gray-500">{displayLabel}</p> : null}
              </div>
              <div aria-hidden="true" />
            </header>

            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
              {embedUrl ? (
                <iframe
                  title={copy.mapTitle}
                  src={embedUrl}
                  className="h-[min(66vh,640px)] min-h-[360px] w-full shrink-0 border-0 bg-slate-100"
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              ) : (
                <div className="flex min-h-[300px] flex-col items-center justify-center gap-2 px-6 text-center text-[16px] text-gray-500">
                  {isRequesting ? (
                    <>
                      <Loader2 size={20} className="animate-spin" aria-hidden="true" />
                      <span>{copy.requestingLocation}</span>
                    </>
                  ) : (
                    <span>{displayLocation ? copy.mapUnavailable : copy.mapEmpty}</span>
                  )}
                </div>
              )}

              <div className="space-y-4 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-5">
                {isOwnProfile ? (
                  <>
                    <p className="text-[15px] leading-6 text-gray-500">{copy.permissionDescription}</p>
                    <button
                      type="button"
                      onClick={() => void requestCurrentLocation()}
                      disabled={isRequesting}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-[15px] font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
                    >
                      {isRequesting ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <LocateFixed size={18} aria-hidden="true" />}
                      <span>{isRequesting ? copy.requestingLocation : (displayLocation ? copy.updateAction : copy.addAction)}</span>
                    </button>
                    {error ? <p role="alert" className="text-[14px] text-red-500">{error}</p> : null}
                    {canOpenSettings ? (
                      <button
                        type="button"
                        onClick={() => { postNativeLocationSettings(); }}
                        className="w-full text-center text-[14px] font-medium text-slate-600 underline underline-offset-2"
                      >
                        {copy.openSettingsAction}
                      </button>
                    ) : null}
                  </>
                ) : null}
                <p className="text-center text-[12px] text-gray-400">{copy.attribution}</p>
              </div>
            </div>
      </SlideSurface>
    </>
  );
}

export async function checkProfileLocationPermission(): Promise<NativeLocationPermission> {
  if (isNativeLocationBridgeAvailable()) {
    return new Promise((resolve) => {
      const requestId = `check-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let resolved = false;
      let unsubscribe = () => {};
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const finish = (value: NativeLocationPermission) => {
        if (resolved) return;
        resolved = true;
        if (timeoutId) clearTimeout(timeoutId);
        unsubscribe();
        resolve(value);
      };
      unsubscribe = subscribeNativeLocation((event) => {
        if (event.requestId !== requestId || event.type !== "permission") return;
        finish(event.permission);
      });
      if (!postNativeLocationPermissionCheck(requestId)) {
        finish("unknown");
        return;
      }
      timeoutId = setTimeout(() => {
        finish("unknown");
      }, 4_000);
    });
  }
  return readBrowserLocationPermission();
}
