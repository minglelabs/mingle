-- Superseded by an array column before displayLanguage (singular) was ever
-- written to by any code path; nothing to preserve.
ALTER TABLE "app_conversation_members" DROP COLUMN "display_language";
ALTER TABLE "app_conversation_members" ADD COLUMN "display_languages" TEXT[] NOT NULL DEFAULT '{}';
