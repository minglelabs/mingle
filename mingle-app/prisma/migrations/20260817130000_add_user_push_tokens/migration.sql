-- CreateTable
CREATE TABLE "app_user_push_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "installation_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "app_version" TEXT,
    "api_namespace" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_user_push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_push_tokens_token_key" ON "app_user_push_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_push_tokens_installation_platform_uidx" ON "app_user_push_tokens"("installation_id", "platform");

-- CreateIndex
CREATE INDEX "app_user_push_tokens_user_platform_idx" ON "app_user_push_tokens"("user_id", "platform");

-- AddForeignKey
ALTER TABLE "app_user_push_tokens" ADD CONSTRAINT "app_user_push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
