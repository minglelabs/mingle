-- One row per "X invited Y into this room" event, written the moment the
-- invite happens (inviteMembersToConversationChannel / room creation with
-- inviteeUserIds) — independent of app_conversation_channel_members, which
-- only gets a row for the invitee once materializePendingConversationInvitees
-- runs. Drives the in-timeline "{inviter} invited {invitee}" notice, so it
-- has to exist immediately, not deferred to materialization.
-- invitee_user_id/invited_by_user_id are plain ids with no FK, same as
-- app_conversation_channels.pending_invitee_user_ids.
CREATE TABLE "app"."app_conversation_channel_invites" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "invitee_user_id" TEXT NOT NULL,
    "invited_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_conversation_channel_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "app_conversation_channel_invites_channel_invitee_uidx" ON "app"."app_conversation_channel_invites"("channel_id", "invitee_user_id");

CREATE INDEX "app_conversation_channel_invites_channel_idx" ON "app"."app_conversation_channel_invites"("channel_id");

ALTER TABLE "app"."app_conversation_channel_invites" ADD CONSTRAINT "app_conversation_channel_invites_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "app"."app_conversation_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
