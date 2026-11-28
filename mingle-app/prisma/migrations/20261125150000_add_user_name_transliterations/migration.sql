-- Names written for readers of another language (the sound, not a translation). Additive only: one new table.
CREATE TABLE "app"."app_user_name_transliterations" (
    "user_id" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_user_name_transliterations_pkey" PRIMARY KEY ("user_id","language")
);

ALTER TABLE "app"."app_user_name_transliterations" ADD CONSTRAINT "app_user_name_transliterations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
