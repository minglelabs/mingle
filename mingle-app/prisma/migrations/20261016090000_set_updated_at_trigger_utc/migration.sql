-- updated_at is TIMESTAMP(3) WITHOUT TIME ZONE holding UTC wall-clock time (Prisma writes UTC).
-- Assigning CURRENT_TIMESTAMP (timestamptz) converts it to the session TimeZone, so on a DB whose
-- TimeZone is not UTC (e.g. a local Postgres on Asia/Seoul) every trigger-updated row read +9h.
-- Pin the conversion to UTC so the trigger no longer depends on the server/session TimeZone.
CREATE OR REPLACE FUNCTION "app"."set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
