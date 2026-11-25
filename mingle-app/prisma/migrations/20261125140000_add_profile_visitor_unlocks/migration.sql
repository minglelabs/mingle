-- "Who viewed my profile": the visitors an account paid to see. Additive only: one new table.
CREATE TABLE "app"."app_profile_visitor_unlocks" (
    "user_id" TEXT NOT NULL,
    "visitor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_profile_visitor_unlocks_pkey" PRIMARY KEY ("user_id","visitor_id")
);

CREATE INDEX "app_profile_visitor_unlocks_visitor_id_idx" ON "app"."app_profile_visitor_unlocks"("visitor_id");

ALTER TABLE "app"."app_profile_visitor_unlocks" ADD CONSTRAINT "app_profile_visitor_unlocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."app_profile_visitor_unlocks" ADD CONSTRAINT "app_profile_visitor_unlocks_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "app"."app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
