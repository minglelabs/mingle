-- Daily signup/message rollup excluding a known blocked IP.
--
-- Why this version is cheaper than the original:
-- 1. It filters candidate users up front from app_users.
-- 2. It avoids aggregating the entire app_event_logs table per user with ARRAY_AGG/BOOL_OR.
-- 3. It resolves first non-empty event IP with a single ordered lookup per candidate user.
-- 4. It excludes blocked users/messages with NOT EXISTS probes that can use targeted indexes.
-- 5. It materializes valid_users once and reuses it for both signup/message rollups.
--
-- Recommended if this becomes a recurring production query:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS app_event_logs_user_created_at_id_idx
--     ON app.app_event_logs (user_id, created_at, id);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS app_event_logs_user_ip_idx
--     ON app.app_event_logs (user_id, ip_address);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS app_event_logs_message_ip_idx
--     ON app.app_event_logs (message_id, ip_address)
--     WHERE message_id IS NOT NULL;
--
-- Example:
--   psql "$DATABASE_URL" -f scripts/analytics/daily-signups-and-messages-excluding-blocked-ip.sql

WITH params AS (
  SELECT '183.96.5.234'::text AS blocked_ip
),
candidate_users AS MATERIALIZED (
  SELECT
    u.id,
    u.created_at::date AS created_day,
    NULLIF(BTRIM(u.latest_ip_address), '') AS latest_ip
  FROM app.app_users u
  CROSS JOIN params p
  WHERE NULLIF(BTRIM(u.platform), '') IS NOT NULL
    AND COALESCE(NULLIF(BTRIM(u.latest_ip_address), ''), '') <> p.blocked_ip
),
valid_users AS MATERIALIZED (
  SELECT
    cu.id,
    cu.created_day,
    COALESCE(
      first_event_ip.first_ip,
      cu.latest_ip,
      'user:' || cu.id
    ) AS person_key
  FROM candidate_users cu
  LEFT JOIN LATERAL (
    SELECT NULLIF(BTRIM(el.ip_address), '') AS first_ip
    FROM app.app_event_logs el
    WHERE el.user_id = cu.id
      AND NULLIF(BTRIM(el.ip_address), '') IS NOT NULL
    ORDER BY
      el.created_at ASC,
      el.id ASC
    LIMIT 1
  ) first_event_ip
    ON TRUE
  CROSS JOIN params p
  WHERE NOT EXISTS (
    SELECT 1
    FROM app.app_event_logs el_block
    WHERE el_block.user_id = cu.id
      AND el_block.ip_address = p.blocked_ip
  )
),
daily_signup_counts AS (
  SELECT
    first_seen_day AS day,
    COUNT(*) AS signup_user_count
  FROM (
    SELECT
      MIN(vu.created_day) AS first_seen_day,
      vu.person_key
    FROM valid_users vu
    GROUP BY vu.person_key
  ) deduped_signups
  GROUP BY first_seen_day
),
daily_message_counts AS (
  SELECT
    m.created_at::date AS day,
    COUNT(*) AS message_count
  FROM app.app_messages m
  JOIN valid_users vu
    ON vu.id = m.user_id
  CROSS JOIN params p
  WHERE NOT EXISTS (
    SELECT 1
    FROM app.app_event_logs el_block
    WHERE el_block.message_id = m.id
      AND el_block.ip_address = p.blocked_ip
  )
  GROUP BY m.created_at::date
)
SELECT
  daily.day,
  SUM(daily.signup_user_count) AS signup_user_count,
  SUM(daily.message_count) AS message_count
FROM (
  SELECT
    dsc.day,
    dsc.signup_user_count,
    0::bigint AS message_count
  FROM daily_signup_counts dsc

  UNION ALL

  SELECT
    dmc.day,
    0::bigint AS signup_user_count,
    dmc.message_count
  FROM daily_message_counts dmc
) daily
GROUP BY daily.day
ORDER BY daily.day DESC;
