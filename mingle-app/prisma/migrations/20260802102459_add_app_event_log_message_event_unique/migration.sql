-- Remove pre-existing duplicate (message_id, event_type) rows before enforcing uniqueness,
-- keeping only the most recently updated row per group (ties broken by id).
DELETE FROM "app_event_logs" a
USING "app_event_logs" b
WHERE a."message_id" IS NOT NULL
  AND a."message_id" = b."message_id"
  AND a."event_type" = b."event_type"
  AND (a."created_at" < b."created_at" OR (a."created_at" = b."created_at" AND a."id" < b."id"));

-- CreateIndex
CREATE UNIQUE INDEX "app_event_logs_message_event_uidx" ON "app_event_logs"("message_id", "event_type");
