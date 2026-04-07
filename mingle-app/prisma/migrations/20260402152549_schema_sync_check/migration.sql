-- AlterTable
ALTER TABLE "app_client_version_policies" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "app_event_logs" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "app_message_contents" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "app_messages" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "app_password_reset_tokens" ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "used_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "app_users" ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "email_verified" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "auth_sessions" ALTER COLUMN "expires" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "auth_verification_tokens" ALTER COLUMN "expires" SET DATA TYPE TIMESTAMP(3);
