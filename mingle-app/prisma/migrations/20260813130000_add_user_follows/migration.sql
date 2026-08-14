-- Add the 2.0.0 user-follow graph in the app schema.
-- This migration is safe to run after the equivalent Supabase SQL was applied manually.

CREATE TABLE IF NOT EXISTS app.app_user_follows (
    id TEXT NOT NULL,
    follower_id TEXT NOT NULL,
    following_id TEXT NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE c.conname = 'app_user_follows_pkey'
          AND n.nspname = 'app'
          AND t.relname = 'app_user_follows'
    ) THEN
        ALTER TABLE app.app_user_follows
            ADD CONSTRAINT app_user_follows_pkey PRIMARY KEY (id);
    END IF;
END
$$;

-- The follow graph is accessed through the trusted Railway API, not directly
-- from browser clients. Keep direct anon/authenticated table access closed.
ALTER TABLE app.app_user_follows
    ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS app.app_user_follows_follower_created_at_idx
    ON app.app_user_follows (follower_id, created_at);

CREATE INDEX IF NOT EXISTS app.app_user_follows_following_created_at_idx
    ON app.app_user_follows (following_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS app.app_user_follows_follower_following_uidx
    ON app.app_user_follows (follower_id, following_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE c.conname = 'app_user_follows_follower_id_fkey'
          AND n.nspname = 'app'
          AND t.relname = 'app_user_follows'
    ) THEN
        ALTER TABLE app.app_user_follows
            ADD CONSTRAINT app_user_follows_follower_id_fkey
            FOREIGN KEY (follower_id)
            REFERENCES app.app_users(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE c.conname = 'app_user_follows_following_id_fkey'
          AND n.nspname = 'app'
          AND t.relname = 'app_user_follows'
    ) THEN
        ALTER TABLE app.app_user_follows
            ADD CONSTRAINT app_user_follows_following_id_fkey
            FOREIGN KEY (following_id)
            REFERENCES app.app_users(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE;
    END IF;
END
$$;
