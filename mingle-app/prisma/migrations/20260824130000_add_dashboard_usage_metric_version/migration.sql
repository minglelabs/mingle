-- Keep old dashboard cache rows identifiable so a source-metric change can rebuild them.
ALTER TABLE "app"."admin_dashboard_daily_metrics"
  ADD COLUMN "usage_metric_version" INTEGER NOT NULL DEFAULT 0;
