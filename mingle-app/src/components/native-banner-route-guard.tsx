"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { syncNativeBannerZone } from "@/lib/native-banner-zone";

/**
 * Re-syncs the native banner zone on every route change. The zone resolver
 * hides the banner on any route other than the conversation list, so a newly
 * added screen is banner-free without posting anything itself, and returning to
 * the conversation list restores whatever the list/room last requested.
 */
export default function NativeBannerRouteGuard() {
  const pathname = usePathname();

  useEffect(() => {
    syncNativeBannerZone();
  }, [pathname]);

  return null;
}
