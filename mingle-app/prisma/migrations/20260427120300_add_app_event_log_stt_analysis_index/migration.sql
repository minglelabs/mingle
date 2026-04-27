-- Speed up STT-finalized analytics by IP, period, and message lookup.
-- CONCURRENTLY avoids blocking writes while the production index is built.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "app_event_logs_event_ip_created_message_idx"
ON "app"."app_event_logs"("event_type", "ip_address", "created_at", "message_id");
