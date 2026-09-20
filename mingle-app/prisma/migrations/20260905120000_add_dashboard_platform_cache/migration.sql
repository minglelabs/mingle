-- Split the daily dashboard cache by the selected platform while preserving
-- existing rows as the all-platform view.
ALTER TABLE "app"."admin_dashboard_daily_metrics"
  DROP CONSTRAINT "admin_dashboard_daily_metrics_pkey",
  ADD COLUMN "platform" TEXT NOT NULL DEFAULT 'all',
  ADD CONSTRAINT "admin_dashboard_daily_metrics_pkey" PRIMARY KEY ("day", "platform");

CREATE INDEX "admin_dashboard_daily_metrics_platform_day_idx"
  ON "app"."admin_dashboard_daily_metrics"("platform", "day");
