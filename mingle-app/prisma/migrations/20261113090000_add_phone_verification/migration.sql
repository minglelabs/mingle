-- Phone verification and contact matching: a user's own number (set only
-- after an SMS code check) and its sha256, which friends' apps match their
-- hashed contacts against. Plus a log of codes sent, for daily caps.
-- Additive only: three nullable columns, two unique indexes, one new table.

-- AlterTable
ALTER TABLE "app"."app_users"
  ADD COLUMN "phone_e164" TEXT,
  ADD COLUMN "phone_hash" TEXT,
  ADD COLUMN "phone_verified_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "app_users_phone_e164_key" ON "app"."app_users"("phone_e164");

-- CreateIndex
CREATE UNIQUE INDEX "app_users_phone_hash_key" ON "app"."app_users"("phone_hash");

-- CreateTable
CREATE TABLE "app"."app_phone_verification_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_phone_verification_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_phone_verification_requests_user_created_idx" ON "app"."app_phone_verification_requests"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "app_phone_verification_requests_phone_created_idx" ON "app"."app_phone_verification_requests"("phone_e164", "created_at");

-- AddForeignKey
ALTER TABLE "app"."app_phone_verification_requests" ADD CONSTRAINT "app_phone_verification_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
