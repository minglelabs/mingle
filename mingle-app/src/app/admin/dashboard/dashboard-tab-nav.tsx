import {
  ADMIN_DASHBOARD_TAB_OPTIONS,
  buildAdminDashboardHref,
  type AdminDashboardPlatform,
  type AdminDashboardTab,
} from "@/lib/admin-dashboard-metrics";
import { AdminFilterLink } from "../_components/ui";
import { LinkPendingSpinner } from "./link-pending-spinner";

/**
 * Dashboard tabs as links: switching is a server navigation, so a request runs only the
 * new tab's queries. The range and OS carry over.
 */
export function DashboardTabNav({
  activeTab,
  days,
  platform,
}: {
  activeTab: AdminDashboardTab;
  days: number;
  platform: AdminDashboardPlatform;
}) {
  return (
    <nav aria-label="대시보드 탭" className="mb-4 flex flex-wrap gap-2">
      {ADMIN_DASHBOARD_TAB_OPTIONS.map((option) => (
        <AdminFilterLink
          active={option.value === activeTab}
          href={buildAdminDashboardHref({ tab: option.value, days, platform })}
          key={option.value}
        >
          {option.label}
          <LinkPendingSpinner />
        </AdminFilterLink>
      ))}
    </nav>
  );
}
