"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

export default function MobileCanvasShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

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
