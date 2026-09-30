import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import type { ReactNode } from "react";
import { getAdminContext } from "@/server/admin/guard";
import { AdminShell } from "./_components/admin-shell";

export const metadata: Metadata = {
  title: { default: "Mingle Admin", template: "%s · Mingle Admin" },
  robots: { index: false, follow: false },
};

async function isSignedIn(): Promise<boolean> {
  try {
    return (await getAdminContext()) !== null;
  } catch (error) {
    unstable_rethrow(error);
    // Presentation only: a failed check hides the tabs; the page's own guard decides access.
    return false;
  }
}

/**
 * Admin frame. Never blocks: it only decides whether to show the tab bar
 * (`/admin` doubles as the login page). Access is enforced by `requireAdmin`
 * / `requireAdminApi` in every page, action and route handler.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell signedIn={await isSignedIn()}>{children}</AdminShell>;
}
