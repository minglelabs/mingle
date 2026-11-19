-- The first-message gate asks for a profile photo with a face in it; the phone
-- checks the photo and the result is kept here. Additive only: one nullable column.
ALTER TABLE "app"."app_users" ADD COLUMN "image_face_check" TEXT;
