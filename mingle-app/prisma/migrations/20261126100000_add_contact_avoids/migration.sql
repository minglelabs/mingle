-- Hiding from people in the address book (owner, 2026-11-26;
-- src/server/contact-avoid.ts). Syncing contacts keeps the sha256 hash of each
-- contact's number (never the number, the name or anything else), so the two
-- do not see each other on the explore tab; `allowed` is the per-person
-- "show me to them after all". Additive only: one boolean column with a
-- default (no rewrite) and one new table.
ALTER TABLE "app"."app_users" ADD COLUMN IF NOT EXISTS "contact_hide_off" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "app"."app_contact_avoids" (
    "owner_id" TEXT NOT NULL,
    "contact_hash" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_contact_avoids_pkey" PRIMARY KEY ("owner_id","contact_hash")
);

CREATE INDEX "app_contact_avoids_contact_hash_idx" ON "app"."app_contact_avoids"("contact_hash");

ALTER TABLE "app"."app_contact_avoids" ADD CONSTRAINT "app_contact_avoids_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "app"."app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
