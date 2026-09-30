-- Photo text translation overlay: OCR result per photo message plus one
-- translation row per (message, language). Additive only: two new tables,
-- one index and two foreign keys; no existing table changes.
--
-- NOTE ON AUTHORING: `prisma migrate dev` cannot build its shadow database in
-- this repo (20260803150000_add_app_event_log_message_event_type_unique uses
-- CREATE INDEX CONCURRENTLY -> P3006). This SQL is the output of
-- `prisma migrate diff --from-schema-datamodel <schema.prisma before this change>
-- --to-schema-datamodel prisma/schema.prisma --script`, with table names
-- qualified by the "app" schema like the latest migrations.

-- CreateTable
CREATE TABLE "app"."app_message_image_texts" (
    "message_id" TEXT NOT NULL,
    "image_sha256" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempt_id" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "deadline_at" TIMESTAMP(3) NOT NULL,
    "source_language" TEXT,
    "blocks" JSONB,
    "provider" TEXT,
    "model" TEXT,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_message_image_texts_pkey" PRIMARY KEY ("message_id")
);

-- CreateTable
CREATE TABLE "app"."app_message_image_text_translations" (
    "message_id" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "attempt_id" TEXT NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "deadline_at" TIMESTAMP(3) NOT NULL,
    "texts" JSONB,
    "derived_from" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_message_image_text_translations_pkey" PRIMARY KEY ("message_id","language")
);

-- CreateIndex
CREATE INDEX "app_message_image_texts_status_deadline_idx" ON "app"."app_message_image_texts"("status", "deadline_at");

-- AddForeignKey
ALTER TABLE "app"."app_message_image_texts" ADD CONSTRAINT "app_message_image_texts_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "app"."app_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."app_message_image_text_translations" ADD CONSTRAINT "app_message_image_text_translations_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "app"."app_message_image_texts"("message_id") ON DELETE CASCADE ON UPDATE CASCADE;
