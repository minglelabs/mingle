-- Add an optional public username so existing accounts remain valid.
ALTER TABLE "app_users"
ADD COLUMN "username" TEXT;

-- Keep the public username unique while allowing multiple legacy NULL values.
CREATE UNIQUE INDEX "app_users_username_key"
ON "app_users"("username");
