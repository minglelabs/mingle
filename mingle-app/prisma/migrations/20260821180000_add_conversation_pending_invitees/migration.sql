-- Invitees who haven't received a first message yet get no membership row
-- at all (see AppConversationChannel.pendingInviteeUserIds doc comment) --
-- they're tracked here on the channel until the inviter's first message
-- materializes them into real AppConversationChannelMember rows.
ALTER TABLE "app_conversation_channels" ADD COLUMN "pending_invitee_user_ids" TEXT[] NOT NULL DEFAULT '{}';
