-- Store the R2 object key and the normalized crop state used for profile images.
ALTER TABLE "app_users"
ADD COLUMN "image_object_key" TEXT,
ADD COLUMN "image_crop_scale" DOUBLE PRECISION,
ADD COLUMN "image_crop_x" DOUBLE PRECISION,
ADD COLUMN "image_crop_y" DOUBLE PRECISION;
