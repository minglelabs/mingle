-- CONCURRENTLY avoids blocking writes while the production index is built.
-- app_users had no created_at index; the admin dashboard's signup-by-day
-- query was forced into a full table scan on every load.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "app_users_created_at_idx"
ON "app"."app_users"("created_at");
