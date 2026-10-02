-- Pre-written ("latent") posts of operator accounts, released a few per day.
CREATE TABLE "app_operator_post_reserve" (
    "id" TEXT NOT NULL,
    "operator_user_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "topic" TEXT,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "release_at" TIMESTAMP(3),
    "post_id" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_operator_post_reserve_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "app_operator_post_reserve_state_release_at_idx" ON "app_operator_post_reserve"("state", "release_at");
CREATE INDEX "app_operator_post_reserve_operator_state_idx" ON "app_operator_post_reserve"("operator_user_id", "state", "created_at");

ALTER TABLE "app_operator_post_reserve" ADD CONSTRAINT "app_operator_post_reserve_operator_user_id_fkey" FOREIGN KEY ("operator_user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
