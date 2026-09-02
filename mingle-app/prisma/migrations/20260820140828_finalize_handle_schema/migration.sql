-- Remove the obsolete username column after the public identifier migration
-- finalized the app user schema around handle.
ALTER TABLE app.app_users
DROP COLUMN IF EXISTS username;
