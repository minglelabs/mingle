-- The 2nd to 10th photo of a post; the first stays on app_posts.image_object_key.
CREATE TABLE "app"."app_post_images" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "image_object_key" TEXT NOT NULL,
    "image_width" INTEGER,
    "image_height" INTEGER,

    CONSTRAINT "app_post_images_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "app_post_images_post_position_key" ON "app"."app_post_images"("post_id", "position");

ALTER TABLE "app"."app_post_images" ADD CONSTRAINT "app_post_images_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "app"."app_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
