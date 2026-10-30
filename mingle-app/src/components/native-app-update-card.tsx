"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import {
  DEFAULT_NATIVE_APP_UPDATE_DETAIL,
  NATIVE_APP_UPDATE_EVENT,
  parseNativeAppUpdateDetail,
  resolveNativeAppInstallSourceText,
  resolveNativeAppUpdateCopy,
  type NativeAppUpdateCopy,
  type NativeAppUpdateDetail,
} from "@/components/LivePhoneDemo/live-phone-demo.app-update.logic";

type NativeAppUpdateWindow = Window & {
  __MINGLE_NATIVE_APP_UPDATE_STATUS?: unknown;
  ReactNativeWebView?: {
    postMessage?: (message: string) => void;
  };
};

type NativeOpenUpdateStoreCommand = {
  type: "native_open_update_store";
  payload?: {
    updateUrl?: string;
  };
};

export type NativeAppUpdateCardProps = {
  copy: NativeAppUpdateCopy;
  installedVersion: string;
  // Display text for the install source; "" (unknown) hides the line.
  installSource: string;
  latestVersion: string;
  statusMessage: string;
  showUpdateAction: boolean;
  onUpdate: () => void;
};

export function NativeAppUpdateCard({
  copy,
  installedVersion,
  installSource,
  latestVersion,
  statusMessage,
  showUpdateAction,
  onUpdate,
}: NativeAppUpdateCardProps) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-amber-700">
            {copy.sectionLabel}
          </div>
          <div className="mt-2 text-sm font-semibold text-gray-900">
            {copy.installedLabel} {installedVersion}
          </div>
          {installSource ? (
            <div className="mt-1 text-xs font-medium text-gray-600">
              {copy.installSourceLabel} {installSource}
            </div>
          ) : null}
          {latestVersion ? (
            <div className="mt-1 text-xs font-medium text-gray-600">
              {copy.latestLabel} {latestVersion}
            </div>
          ) : null}
          <div className="mt-2 text-xs leading-5 text-gray-600">
            {statusMessage}
          </div>
        </div>
        {showUpdateAction ? (
          <button
            type="button"
            onClick={onUpdate}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <Download size={13} strokeWidth={2.2} />
            <span>{copy.updateButtonLabel}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

// Everything the card shows except the press handler, from the native
// update status (null before the first status arrives).
export function resolveNativeAppUpdateCardContent(
  detail: NativeAppUpdateDetail | null,
  copy: NativeAppUpdateCopy,
): Omit<NativeAppUpdateCardProps, "onUpdate"> {
  const status = detail ?? DEFAULT_NATIVE_APP_UPDATE_DETAIL;
  const statusMessage = status.status === "checking"
    ? copy.checkingMessage
    : status.status === "available"
      ? copy.availableMessage
      : status.status === "current"
        ? copy.currentMessage
        : copy.unknownMessage;

  return {
    copy,
    installedVersion: status.clientVersion || copy.unknownVersionLabel,
    installSource: resolveNativeAppInstallSourceText(copy, status.installSource),
    latestVersion: status.latestVersion || "",
    statusMessage,
    showUpdateAction: status.updateAvailable && Boolean(status.updateUrl),
  };
}

// The latest update status the native shell reported: the cached value from
// before this page mounted, then every later event.
export function useNativeAppUpdateDetail(): NativeAppUpdateDetail | null {
  const [detail, setDetail] = useState<NativeAppUpdateDetail | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const cachedDetail = parseNativeAppUpdateDetail(
      (window as NativeAppUpdateWindow).__MINGLE_NATIVE_APP_UPDATE_STATUS,
    );
    const cachedTimerId = window.setTimeout(() => {
      setDetail(cachedDetail || DEFAULT_NATIVE_APP_UPDATE_DETAIL);
    }, 0);

    const handleUpdate = (event: Event) => {
      const next = parseNativeAppUpdateDetail((event as CustomEvent<unknown>).detail);
      if (!next) return;
      setDetail(next);
    };

    window.addEventListener(NATIVE_APP_UPDATE_EVENT, handleUpdate as EventListener);
    return () => {
      window.clearTimeout(cachedTimerId);
      window.removeEventListener(NATIVE_APP_UPDATE_EVENT, handleUpdate as EventListener);
    };
  }, []);

  return detail;
}

export function useNativeAppUpdateCardContent(locale: string) {
  const detail = useNativeAppUpdateDetail();
  const copy = useMemo(() => resolveNativeAppUpdateCopy(locale), [locale]);
  const content = useMemo(() => resolveNativeAppUpdateCardContent(detail, copy), [copy, detail]);
  return { detail, content };
}

// Asks the native shell to open the store page; plain navigation when the
// bridge is missing or errors.
export function openNativeAppUpdateStore(updateUrl: string | null | undefined): boolean {
  const url = updateUrl?.trim() || "";
  if (!url || typeof window === "undefined") return false;

  const command: NativeOpenUpdateStoreCommand = {
    type: "native_open_update_store",
    payload: { updateUrl: url },
  };
  const nativeWindow = window as NativeAppUpdateWindow;
  if (nativeWindow.ReactNativeWebView?.postMessage) {
    try {
      nativeWindow.ReactNativeWebView.postMessage(JSON.stringify(command));
      return true;
    } catch {
      // Fall back to browser navigation if the bridge errors.
    }
  }

  window.location.href = url;
  return true;
}
