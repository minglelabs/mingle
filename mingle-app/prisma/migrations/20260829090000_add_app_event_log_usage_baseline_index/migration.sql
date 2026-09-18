-- Speed up the per-user usage baseline lookup used by daily analytics.
-- Keep this partial because rows without a user or cumulative usage are not
-- candidates for the baseline query.
-- CONCURRENTLY avoids blocking event-log writes while the production index is built.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "app_event_logs_user_usage_created_desc_idx"
ON "app"."app_event_logs"("user_id", "created_at" DESC, "id" DESC)
WHERE "user_id" IS NOT NULL
  AND "usage_sec" IS NOT NULL;
