-- The first-message gate asks for a profile photo with a face in it; the phone
-- checks the photo and the result is kept here. Additive only: one nullable column.
ALTER TABLE "app"."app_users" ADD COLUMN "image_face_check" TEXT;

-- The optional selfie check: when it passed (the "verified" badge). Additive only.
ALTER TABLE "app"."app_users" ADD COLUMN "face_verified_at" TIMESTAMP(3);

-- Height in centimetres, typed by the user. Additive only.
ALTER TABLE "app"."app_users" ADD COLUMN "height_cm" INTEGER;
