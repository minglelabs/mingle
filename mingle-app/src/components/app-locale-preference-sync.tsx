"use client";

import {
  resolveAppSupportedLocaleTag,
  type AppSupportedLocale,
} from "@/i18n/mingle-locales";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export const APP_LOCALE_STORAGE_KEY = "mingle.appLocale";

export function readStoredAppLocale(): AppSupportedLocale | null {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(APP_LOCALE_STORAGE_KEY) ?? "";
    return resolveAppSupportedLocaleTag(value);
  } catch {
    return null;
  }
}

export function storeAppLocale(locale: AppSupportedLocale): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, locale);
  } catch {
    // The current route still changes when storage is unavailable.
  }
}

function replaceLocaleSegment(pathname: string, locale: AppSupportedLocale): string | null {
  const segments = pathname.split("/").filter(Boolean);
  const currentSegment = segments[0] ?? "";
  const currentLocale = resolveAppSupportedLocaleTag(currentSegment);
  if (!currentLocale) return null;

  const rest = segments.slice(1).join("/");
  return `/${locale}${rest ? `/${rest}` : ""}`;
}

export default function AppLocalePreferenceSync() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined" || !pathname) return;

    const segments = pathname.split("/").filter(Boolean);
    const currentLocale = resolveAppSupportedLocaleTag(segments[0] ?? "");
    if (currentLocale) {
      document.documentElement.lang = currentLocale;
    }

    const storedLocale = readStoredAppLocale();
    if (!storedLocale || !currentLocale || storedLocale === currentLocale) return;

    const nextPathname = replaceLocaleSegment(pathname, storedLocale);
    if (!nextPathname) return;

    window.location.replace(`${nextPathname}${window.location.search}${window.location.hash}`);
  }, [pathname]);

  return null;
}
