-- Freeze the public "spectate" title at sharedAt. shared_title snapshots the
-- room's title whenever sharing is (re-)enabled or the snapshot is refreshed,
-- so renaming the room afterwards never leaks into the public share view. It
-- is nullable: rows shared before this column existed keep NULL and the app
-- degrades to the live title for them.
--
-- NOTE ON AUTHORING: this repo's history includes
-- 20260803150000_add_app_event_log_message_event_type_unique, which uses
-- CREATE INDEX CONCURRENTLY and therefore cannot be replayed inside Prisma's
-- shadow-database transaction (P3006 / SQLSTATE 25001). That makes
-- `prisma migrate dev --create-only` unable to build a shadow DB from scratch
-- in this local environment. The statement below is exactly what that command
-- would have generated: it was produced with `prisma migrate diff` between the
-- pre-change and post-change datamodels (an in-memory diff that needs no
-- shadow replay), so it contains ONLY this change and none of the local live-DB
-- drift (app_users TIMESTAMPTZ columns, the two partial app_event_logs
-- indexes) that a live-DB diff would otherwise include.

-- AlterTable
ALTER TABLE "app"."app_conversation_channels" ADD COLUMN "shared_title" TEXT;

-- Backfill: existing shared rooms get their current title frozen as the
-- snapshot so their live share links keep showing a title instead of NULL.
UPDATE "app"."app_conversation_channels"
SET "shared_title" = "title"
WHERE "shared_at" IS NOT NULL;
