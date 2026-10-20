-- Posting / feed feature: tie a report_resolved notification to its report.
--
-- Before this, report_resolved rows were deduped on (recipient, actor, type)
-- only, so a reporter got a notification for their FIRST closed report and
-- none for any later one. report_id lets the notifier dedupe per report: each
-- closed report notifies its reporter exactly once.
--
-- Generated with `prisma migrate diff` and pruned of the same two pre-existing
-- drifts documented in 20260925170000_add_posting_feed (app_users TIMESTAMPTZ
-- columns and the partial app_event_logs indexes).

-- AlterTable
ALTER TABLE "app_user_notifications" ADD COLUMN     "report_id" TEXT;

-- CreateIndex
CREATE INDEX "app_user_notifications_report_id_idx" ON "app_user_notifications"("report_id");

-- AddForeignKey
ALTER TABLE "app_user_notifications" ADD CONSTRAINT "app_user_notifications_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "app_user_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
