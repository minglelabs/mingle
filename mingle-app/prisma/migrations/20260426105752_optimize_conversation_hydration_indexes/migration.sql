-- CreateIndex
CREATE INDEX "app_event_logs_session_created_at_desc_idx" ON "app_event_logs"("session_key", "created_at" DESC);

-- CreateIndex
CREATE INDEX "app_messages_session_created_at_desc_idx" ON "app_messages"("session_key", "created_at" DESC);
