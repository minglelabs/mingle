-- Posts and comments whose body mixes languages (detection's
-- sourceLanguagesMixed). They are translated into every default language,
-- their own main language included, so a reader of that language also gets
-- the foreign parts translated. Additive only: existing rows stay false.

-- AlterTable
ALTER TABLE "app"."app_posts" ADD COLUMN "source_languages_mixed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "app"."app_post_comments" ADD COLUMN "source_languages_mixed" BOOLEAN NOT NULL DEFAULT false;
