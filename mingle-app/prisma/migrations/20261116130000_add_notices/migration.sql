-- Service notices for the home tab (the "N permanently banned this week"
-- strip and the notice list). Additive only: one nullable column, one table.

-- AlterTable
ALTER TABLE "app"."app_users" ADD COLUMN "notices_seen_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "app"."app_notices" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "masked_name" TEXT,
    "category" TEXT,
    "texts" JSONB,
    "is_important" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_notices_published_at_idx" ON "app"."app_notices"("published_at");
