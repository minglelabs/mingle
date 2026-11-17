"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

/**
 * Staff-only link to the operator tool at the bottom of My Page settings, in
 * Korean like the tool itself. Shown when the signed-in app account is a staff
 * notification target or this web view already holds an admin session;
 * `/admin/inbox` sends a signed-out visitor to the admin login and back.
 */
export default function StaffAdminEntry({ enabled }: { enabled: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch("/admin/api/app-viewer", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { admin?: boolean; staff?: boolean } | null) => setVisible(Boolean(body?.admin || body?.staff)))
      .catch(() => {});
    return () => controller.abort();
  }, [enabled]);

  if (!visible) return null;
  return (
    <button
      type="button"
      data-testid="menu-staff-admin"
      onClick={() => { window.location.assign("/admin/inbox"); }}
      className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-transparent px-4 py-2 text-[13px] font-medium text-gray-400 transition hover:text-gray-600 active:bg-gray-50"
    >
      <ShieldCheck size={15} strokeWidth={2} aria-hidden="true" />
      운영툴
    </button>
  );
}
