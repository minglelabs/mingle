-- Store city-level profile locations without retaining a precise home address.
ALTER TABLE "app"."app_users"
ADD COLUMN "location_latitude" DOUBLE PRECISION,
ADD COLUMN "location_longitude" DOUBLE PRECISION,
ADD COLUMN "location_city" TEXT,
ADD COLUMN "location_country" TEXT,
ADD COLUMN "location_country_code" TEXT,
ADD COLUMN "location_updated_at" TIMESTAMP(3),
ADD COLUMN "location_permission_verified_at" TIMESTAMP(3);
