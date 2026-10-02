-- Admin operator accounts (Phase 0): the operator flag on app_users plus the
-- staff-only tables for operator records, admin sessions, the append-only
-- admin audit log (no foreign keys by design), scheduled operator posts and
-- staff notify targets.
--
-- Additive only. Generated with `prisma migrate diff --from-schema-datamodel`
-- (previous schema.prisma -> this one) without a database, so no unrelated
-- drift is included; the CHECK constraint at the end is added by hand.

-- AlterTable
ALTER TABLE "app_users" ADD COLUMN     "is_operator" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "app_operator_accounts" (
    "user_id" TEXT NOT NULL,
    "persona_country" TEXT,
    "notes" TEXT,
    "created_by_session_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_operator_accounts_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "app_admin_sessions" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "label" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "app_admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_admin_audit_logs" (
    "id" TEXT NOT NULL,
    "session_id" TEXT,
    "action" TEXT NOT NULL,
    "operator_user_id" TEXT,
    "target_type" TEXT,
    "target_id" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_operator_post_jobs" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "operator_user_id" TEXT NOT NULL,
    "client_post_id" TEXT NOT NULL,
    "text" TEXT,
    "image_object_key" TEXT,
    "image_width" INTEGER,
    "image_height" INTEGER,
    "background_key" TEXT,
    "publish_at" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "post_id" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_by_session_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_operator_post_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_admin_notify_targets" (
    "user_id" TEXT NOT NULL,
    "created_by_session_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_admin_notify_targets_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_admin_sessions_token_hash_key" ON "app_admin_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "app_admin_sessions_expires_at_idx" ON "app_admin_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "app_admin_audit_logs_created_at_idx" ON "app_admin_audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "app_admin_audit_logs_operator_user_id_created_at_idx" ON "app_admin_audit_logs"("operator_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "app_operator_post_jobs_client_post_id_key" ON "app_operator_post_jobs"("client_post_id");

-- CreateIndex
CREATE INDEX "app_operator_post_jobs_state_publish_at_idx" ON "app_operator_post_jobs"("state", "publish_at");

-- CreateIndex
CREATE INDEX "app_operator_post_jobs_batch_id_idx" ON "app_operator_post_jobs"("batch_id");

-- CreateIndex
CREATE INDEX "app_users_is_operator_idx" ON "app_users"("is_operator");

-- AddForeignKey
ALTER TABLE "app_operator_accounts" ADD CONSTRAINT "app_operator_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_operator_post_jobs" ADD CONSTRAINT "app_operator_post_jobs_operator_user_id_fkey" FOREIGN KEY ("operator_user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_admin_notify_targets" ADD CONSTRAINT "app_admin_notify_targets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddCheckConstraint
-- One badge per account: an operator account (run by Mingle staff) is never
-- also the official Mingle team account. Prisma does not model CHECK
-- constraints, so this line is maintained by hand.
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_operator_not_official_chk" CHECK (NOT ("is_operator" AND "is_official"));
