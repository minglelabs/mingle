-- Invite gate waitlist: an account without an invite can join the waitlist
-- (after verifying its phone), and an admin can let it in from the waitlist
-- tab. Additive only: two nullable columns and one index.

-- AlterTable
ALTER TABLE "app"."app_users"
  ADD COLUMN "waitlisted_at" TIMESTAMP(3),
  ADD COLUMN "access_granted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "app_users_waitlisted_at_idx" ON "app"."app_users"("waitlisted_at");
