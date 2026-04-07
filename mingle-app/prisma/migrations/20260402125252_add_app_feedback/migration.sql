-- CreateTable
CREATE TABLE "app_feedback" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "session_key" TEXT,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "contact_email" TEXT,
    "locale" TEXT,
    "client_platform" TEXT,
    "app_version" TEXT,
    "api_namespace" TEXT,
    "pathname" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_feedback_user_created_at_idx" ON "app_feedback"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "app_feedback_session_created_at_idx" ON "app_feedback"("session_key", "created_at");

-- CreateIndex
CREATE INDEX "app_feedback_category_created_at_idx" ON "app_feedback"("category", "created_at");

-- CreateIndex
CREATE INDEX "app_feedback_created_at_idx" ON "app_feedback"("created_at");

-- AddForeignKey
ALTER TABLE "app_feedback" ADD CONSTRAINT "app_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
