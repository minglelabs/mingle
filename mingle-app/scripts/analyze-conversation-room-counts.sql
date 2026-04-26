-- Conversation room count distribution by user.
-- Run against the production/staging database with the app schema available.

WITH per_user AS (
  SELECT
    u.id AS user_id,
    COUNT(c.id) FILTER (
      WHERE c.id IS NOT NULL
        AND COALESCE(c.is_deleted, false) = false
    ) AS conversation_count
  FROM app.app_users u
  LEFT JOIN app.app_conversation_channels c
    ON c.owner_user_id = u.id
  GROUP BY u.id
),
summary AS (
  SELECT
    COUNT(*) AS total_users,
    COUNT(*) FILTER (WHERE conversation_count > 0) AS users_with_conversations,
    AVG(conversation_count)::numeric(10, 2) AS avg_conversations_per_user_all_users,
    AVG(conversation_count) FILTER (WHERE conversation_count > 0)::numeric(10, 2)
      AS avg_conversations_per_user_with_rooms,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY conversation_count)
      AS p50_conversations_per_user,
    PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY conversation_count)
      AS p90_conversations_per_user,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY conversation_count)
      AS p95_conversations_per_user,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY conversation_count)
      AS p99_conversations_per_user,
    MAX(conversation_count) AS max_conversations_per_user
  FROM per_user
),
bucketed AS (
  SELECT
    CASE
      WHEN conversation_count = 0 THEN '0'
      WHEN conversation_count = 1 THEN '1'
      WHEN conversation_count BETWEEN 2 AND 3 THEN '2-3'
      WHEN conversation_count BETWEEN 4 AND 10 THEN '4-10'
      WHEN conversation_count BETWEEN 11 AND 25 THEN '11-25'
      WHEN conversation_count BETWEEN 26 AND 50 THEN '26-50'
      ELSE '51+'
    END AS conversation_count_bucket,
    COUNT(*) AS users
  FROM per_user
  GROUP BY 1
),
result_rows AS (
  SELECT
    'summary' AS row_type,
    NULL AS conversation_count_bucket,
    summary.total_users,
    summary.users_with_conversations,
    summary.avg_conversations_per_user_all_users,
    summary.avg_conversations_per_user_with_rooms,
    summary.p50_conversations_per_user,
    summary.p90_conversations_per_user,
    summary.p95_conversations_per_user,
    summary.p99_conversations_per_user,
    summary.max_conversations_per_user,
    NULL::bigint AS bucket_users,
    -1 AS sort_key
  FROM summary

  UNION ALL

  SELECT
    'bucket' AS row_type,
    bucketed.conversation_count_bucket,
    NULL::bigint AS total_users,
    NULL::bigint AS users_with_conversations,
    NULL::numeric AS avg_conversations_per_user_all_users,
    NULL::numeric AS avg_conversations_per_user_with_rooms,
    NULL::double precision AS p50_conversations_per_user,
    NULL::double precision AS p90_conversations_per_user,
    NULL::double precision AS p95_conversations_per_user,
    NULL::double precision AS p99_conversations_per_user,
    NULL::bigint AS max_conversations_per_user,
    bucketed.users AS bucket_users,
    CASE bucketed.conversation_count_bucket
      WHEN '0' THEN 0
      WHEN '1' THEN 1
      WHEN '2-3' THEN 2
      WHEN '4-10' THEN 3
      WHEN '11-25' THEN 4
      WHEN '26-50' THEN 5
      WHEN '51+' THEN 6
      ELSE 7
    END AS sort_key
  FROM bucketed
)
SELECT
  row_type,
  conversation_count_bucket,
  total_users,
  users_with_conversations,
  avg_conversations_per_user_all_users,
  avg_conversations_per_user_with_rooms,
  p50_conversations_per_user,
  p90_conversations_per_user,
  p95_conversations_per_user,
  p99_conversations_per_user,
  max_conversations_per_user,
  bucket_users
FROM result_rows
ORDER BY
  sort_key;
