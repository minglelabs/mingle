-- Marks a member as departed from a shared (2+-member) room without deleting
-- their membership row: remaining members' room title/avatar/message speaker
-- attribution still read from full membership history (see
-- resolveViewerFacingTitle and friends in app-conversations.ts), and this
-- timestamp also drives the in-room "X left" notice.
ALTER TABLE "app"."app_conversation_channel_members"
ADD COLUMN "left_at" TIMESTAMP(3);
