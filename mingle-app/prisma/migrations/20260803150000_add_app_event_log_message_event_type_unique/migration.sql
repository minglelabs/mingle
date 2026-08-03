-- Dedupe existing app_event_logs rows for the same message + event type before
-- enforcing uniqueness, keeping the most recently updated row.
DELETE FROM "app"."app_event_logs" AS logs
USING "app"."app_event_logs" AS newer
WHERE logs.message_id = newer.message_id
  AND logs.event_type = newer.event_type
  AND logs.message_id IS NOT NULL
  AND (logs.updated_at, logs.id) < (newer.updated_at, newer.id);

-- CONCURRENTLY avoids blocking writes while the production index is built.
-- Enforces at the DB level that a message can have only one row per event type,
-- so concurrent retries/reconciles upsert into the same row instead of racing a create.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "app_event_logs_message_id_event_type_uidx"
ON "app"."app_event_logs"("message_id", "event_type");
