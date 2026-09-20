-- Daily usage is tracked independently for every user/session counter.
-- Keep this partial because rows without a user or cumulative usage are not
-- candidates for the dashboard baseline lookup.
-- CONCURRENTLY avoids blocking production event-log writes while the index builds.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "app_event_logs_user_session_usage_created_desc_idx"
ON "app"."app_event_logs"("user_id", "session_key", "created_at" DESC, "id" DESC)
WHERE "user_id" IS NOT NULL
  AND "usage_sec" IS NOT NULL;
