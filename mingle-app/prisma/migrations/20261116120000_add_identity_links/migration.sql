-- One account per person (docs/one-account-per-person.md): devices, extra
-- phone numbers, a log of sign-in methods per account, and what a permanent
-- ban closed. Additive only: four nullable columns and six new tables.

-- AlterTable
ALTER TABLE "app"."app_users"
  ADD COLUMN "banned_at" TIMESTAMP(3),
  ADD COLUMN "banned_reason" TEXT,
  ADD COLUMN "merged_into_user_id" TEXT,
  ADD COLUMN "merged_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "app"."app_devices" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "device_key_hash" TEXT NOT NULL,
    "key_kind" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blocked_at" TIMESTAMP(3),
    "blocked_reason" TEXT,
    "exempt_at" TIMESTAMP(3),

    CONSTRAINT "app_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."app_device_users" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_device_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."app_device_phones" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "phone_key_hash" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_device_phones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."app_user_phones" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "phone_key_hash" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "attached_via_device_id" TEXT,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_user_phones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."app_identity_links" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT,
    "method" TEXT NOT NULL,
    "method_key_hash" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "ip" TEXT,
    "app_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_identity_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."app_identity_blocks" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "source_user_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_identity_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_devices_device_key_hash_key" ON "app"."app_devices"("device_key_hash");
CREATE UNIQUE INDEX "app_device_users_device_user_key" ON "app"."app_device_users"("device_id", "user_id");
CREATE INDEX "app_device_users_user_id_idx" ON "app"."app_device_users"("user_id");
CREATE UNIQUE INDEX "app_device_phones_device_phone_key" ON "app"."app_device_phones"("device_id", "phone_key_hash");
CREATE INDEX "app_device_phones_phone_key_hash_idx" ON "app"."app_device_phones"("phone_key_hash");
CREATE UNIQUE INDEX "app_user_phones_phone_key_hash_key" ON "app"."app_user_phones"("phone_key_hash");
CREATE INDEX "app_user_phones_user_id_idx" ON "app"."app_user_phones"("user_id");
CREATE INDEX "app_identity_links_user_created_idx" ON "app"."app_identity_links"("user_id", "created_at");
CREATE INDEX "app_identity_links_method_key_idx" ON "app"."app_identity_links"("method", "method_key_hash");
CREATE UNIQUE INDEX "app_identity_blocks_kind_key_hash_key" ON "app"."app_identity_blocks"("kind", "key_hash");

-- AddForeignKey
ALTER TABLE "app"."app_device_users" ADD CONSTRAINT "app_device_users_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "app"."app_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."app_device_phones" ADD CONSTRAINT "app_device_phones_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "app"."app_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
