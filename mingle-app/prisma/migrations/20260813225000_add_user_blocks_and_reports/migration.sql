-- CreateTable
CREATE TABLE "app_user_blocks" (
    "id" TEXT NOT NULL,
    "blocker_id" TEXT NOT NULL,
    "blocked_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_user_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user_reports" (
    "id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "reported_user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_user_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user_report_replies" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "author_type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_user_report_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_user_blocks_blocker_created_at_idx" ON "app_user_blocks"("blocker_id", "created_at");

-- CreateIndex
CREATE INDEX "app_user_blocks_blocked_created_at_idx" ON "app_user_blocks"("blocked_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_blocks_blocker_blocked_uidx" ON "app_user_blocks"("blocker_id", "blocked_id");

-- CreateIndex
CREATE INDEX "app_user_reports_reporter_created_at_idx" ON "app_user_reports"("reporter_id", "created_at");

-- CreateIndex
CREATE INDEX "app_user_reports_reported_created_at_idx" ON "app_user_reports"("reported_user_id", "created_at");

-- CreateIndex
CREATE INDEX "app_user_reports_status_created_at_idx" ON "app_user_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "app_user_report_replies_report_created_at_idx" ON "app_user_report_replies"("report_id", "created_at");

-- AddForeignKey
ALTER TABLE "app_user_blocks" ADD CONSTRAINT "app_user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user_blocks" ADD CONSTRAINT "app_user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user_reports" ADD CONSTRAINT "app_user_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user_reports" ADD CONSTRAINT "app_user_reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user_report_replies" ADD CONSTRAINT "app_user_report_replies_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "app_user_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
