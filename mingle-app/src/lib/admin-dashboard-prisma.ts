import { PrismaClient } from "@prisma/client/index";
import { ensureDatabaseSchemaParam } from "./database-url";

/**
 * Dedicated client for the admin dashboard's aggregate queries and daily snapshots.
 *
 * Deliberately separate from `@/lib/prisma`: this reads and writes
 * ADMIN_DASHBOARD_DATABASE_URL instead of DATABASE_URL, so pointing the
 * dashboard at production doesn't also point conversation/auth/etc. reads/writes
 * from the rest of the local dev app at production. Falls back to the
 * regular app DB when the dashboard-specific URL isn't set.
 */
const globalForAdminDashboardPrisma = globalThis as unknown as {
  adminDashboardPrisma: PrismaClient | undefined;
};

function adminDashboardPrismaSingleton() {
  const rawUrl = process.env.ADMIN_DASHBOARD_DATABASE_URL || process.env.DATABASE_URL;
  const databaseUrl = ensureDatabaseSchemaParam(rawUrl, "app");
  if (databaseUrl) {
    return new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
  }
  return new PrismaClient();
}

export const adminDashboardPrisma = globalForAdminDashboardPrisma.adminDashboardPrisma ?? adminDashboardPrismaSingleton();

if (process.env.NODE_ENV !== "production") {
  globalForAdminDashboardPrisma.adminDashboardPrisma = adminDashboardPrisma;
}
