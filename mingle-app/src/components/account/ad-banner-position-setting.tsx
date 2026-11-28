"use client";

// The ad banner position (top or bottom of a chat room), on the My tab. It is an
// account preference shared with the room screens: the change goes through the
// same preferences cache the rooms use (only this one field is merged in, so a
// room never writes an older value back), then to the server. The banner moves
// the next time a room opens.

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildClientApiPath, clientApiNamespace } from "@/lib/api-contract";
import { isLegacySonioxSilenceSliderNamespace } from "@/lib/api-namespace-version";
import { EXPECTED_ACCOUNT_HEADER } from "@/lib/request-account-guard";
import { getOrCreateTrackingUserId } from "@/components/LivePhoneDemo/realtime-storage";
import {
  DEFAULT_AD_BANNER_POSITION,
  buildHydratedAccountPreferences,
  commitAccountPreferencesEdit,
  readCachedAccountPreferencesSnapshot,
  writeCachedAccountPreferences,
  type AccountPreferencesCacheIdentity,
  type AccountPreferencesResponse,
} from "@/components/LivePhoneDemo/live-phone-demo.account-preferences";
import { normalizeLivePhoneDemoAdBannerPosition, type LivePhoneDemoAdBannerPosition } from "@/components/LivePhoneDemo/live-phone-demo.preferences";

const PREFERENCES_PATH = buildClientApiPath("/account/preferences");

export default function AdBannerPositionSetting({ label, topLabel, bottomLabel }: { label: string; topLabel: string; bottomLabel: string }) {
  const { data: session } = useSession();
  const userId = typeof session?.user?.id === "string" ? session.user.id : null;
  const identity = useMemo<AccountPreferencesCacheIdentity>(() => ({
    apiNamespace: clientApiNamespace,
    userId,
    trackingUserId: getOrCreateTrackingUserId(),
  }), [userId]);
  const isLegacy = isLegacySonioxSilenceSliderNamespace(clientApiNamespace);
  const [position, setPosition] = useState<LivePhoneDemoAdBannerPosition | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const cached = readCachedAccountPreferencesSnapshot(identity, isLegacy);
    let cancelled = false;
    const first = window.setTimeout(() => {
      if (cached) setPosition(cached.preferences.adBannerPosition);
    }, 0);
    if (!cached) {
      void fetch(PREFERENCES_PATH, { cache: "no-store", headers: { [EXPECTED_ACCOUNT_HEADER]: userId } })
        .then((response) => (response.ok ? response.json() as Promise<AccountPreferencesResponse> : null))
        .then((body) => {
          if (!cancelled) setPosition(body ? buildHydratedAccountPreferences(body, isLegacy).adBannerPosition : DEFAULT_AD_BANNER_POSITION);
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
      window.clearTimeout(first);
    };
  }, [identity, isLegacy, userId]);

  const pick = useCallback(async (next: LivePhoneDemoAdBannerPosition) => {
    if (!userId || busy || next === position) return;
    const previous = position;
    setPosition(next);
    setBusy(true);
    const cached = readCachedAccountPreferencesSnapshot(identity, isLegacy);
    if (cached) {
      commitAccountPreferencesEdit(identity, cached.preferences, { ...cached.preferences, adBannerPosition: next }, isLegacy);
    }
    try {
      const response = await fetch(PREFERENCES_PATH, {
        method: "PATCH",
        headers: { "content-type": "application/json", [EXPECTED_ACCOUNT_HEADER]: userId },
        body: JSON.stringify({ adBannerPosition: next }),
      });
      if (!response.ok) throw new Error("ad_banner_position_failed");
      // Saved: the cache is no longer waiting on this field (other unsent edits keep it pending).
      const latest = readCachedAccountPreferencesSnapshot(identity, isLegacy);
      if (latest && cached && !cached.pendingSync) writeCachedAccountPreferences(identity, latest.preferences, { pendingSync: false });
    } catch {
      setPosition(previous);
      const latest = readCachedAccountPreferencesSnapshot(identity, isLegacy);
      if (latest && previous) writeCachedAccountPreferences(identity, { ...latest.preferences, adBannerPosition: previous }, { pendingSync: cached?.pendingSync ?? false });
    }
    setBusy(false);
  }, [busy, identity, isLegacy, position, userId]);

  if (!userId) return null;
  const shown = normalizeLivePhoneDemoAdBannerPosition(position);
  return (
    <div className="mt-4" data-qa="mypage-ad-banner-position">
      <p className="pb-2 text-[14px] font-semibold text-slate-900">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {([
          { value: "top", text: topLabel },
          { value: "bottom", text: bottomLabel },
        ] as const).map((option) => (
          <button
            key={option.value}
            type="button"
            data-qa={`mypage-ad-banner-${option.value}`}
            aria-pressed={shown === option.value}
            disabled={busy || shown === null}
            onClick={() => void pick(option.value)}
            className={`flex h-11 items-center justify-center rounded-xl border text-[14px] font-semibold transition disabled:opacity-60 ${
              shown === option.value ? "border-amber-300 bg-amber-50 text-amber-900" : "border-gray-200 bg-white text-slate-700 active:bg-gray-50"
            }`}
          >
            {option.text}
          </button>
        ))}
      </div>
    </div>
  );
}
