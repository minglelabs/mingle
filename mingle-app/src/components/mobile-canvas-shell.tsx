"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type CanvasWindow = Window & { __MINGLE_SYNC_MOBILE_CANVAS__?: () => void };

export default function MobileCanvasShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  // The bootstrap script in the root layout sets the canvas scale as CSS variables on <html>.
  // When a hydration mismatch makes React re-create the tree on the client, <html> loses them
  // and a 400px canvas spills past a 375–393pt phone. Re-apply them whenever the shell mounts.
  useLayoutEffect(() => {
    (window as CanvasWindow).__MINGLE_SYNC_MOBILE_CANVAS__?.();
  }, []);

  if (isAdminRoute) {
    return <>{children}</>;
  }

  return (
    <div className="mobile-canvas-stage">
      <div className="mobile-canvas-shell">
        <div className="mobile-canvas-frame">
          {children}
        </div>
      </div>
    </div>
  );
}
