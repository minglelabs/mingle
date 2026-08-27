-- Read-only diagnostic for signup accounts that should have received Royce's
-- deterministic welcome conversation. Adjust signup_cutoff when investigating
-- a different deployment window.
WITH params AS (
  SELECT
    TIMESTAMPTZ '2026-08-27 15:07:00+09' AS signup_cutoff,
    'cmsrqesom0000mx1hn62ce6r9'::text AS royce_user_id,
    'mingle-welcome-royce-v1'::text AS welcome_client_message_id
),
eligible_users AS (
  SELECT
    u.id,
    u.external_user_id,
    u.email,
    u.name,
    u.handle,
    u.created_at,
    u.is_active,
    u.is_deleted,
    u.default_conversation_languages,
    u.default_display_language
  FROM app.app_users AS u
  CROSS JOIN params
  WHERE u.id <> params.royce_user_id
    AND u.created_at >= params.signup_cutoff
    AND u.is_deleted IS NOT TRUE
),
channel_state AS (
  SELECT
    c.id AS channel_id,
    c.owner_user_id,
    c.session_key,
    c.status,
    c.is_deleted,
    c.created_at,
    c.pending_invitee_user_ids,
    COALESCE(
      ARRAY_AGG(m.user_id ORDER BY m.user_id) FILTER (WHERE m.left_at IS NULL),
      ARRAY[]::text[]
    ) AS active_member_ids,
    COALESCE(
      ARRAY_AGG(m.user_id ORDER BY m.user_id) FILTER (WHERE m.user_id IS NOT NULL),
      ARRAY[]::text[]
    ) AS all_member_ids
  FROM app.app_conversation_channels AS c
  LEFT JOIN app.app_conversation_channel_members AS m
    ON m.channel_id = c.id
  GROUP BY
    c.id,
    c.owner_user_id,
    c.session_key,
    c.status,
    c.is_deleted,
    c.created_at,
    c.pending_invitee_user_ids
),
related_room_counts AS (
  SELECT
    eu.id AS user_id,
    COUNT(cs.channel_id)::integer AS related_room_count,
    COUNT(cs.channel_id) FILTER (WHERE cs.is_deleted IS NOT TRUE)::integer AS visible_related_room_count
  FROM eligible_users AS eu
  CROSS JOIN params
  LEFT JOIN channel_state AS cs
    ON (
     cs.owner_user_id = eu.id
     OR cs.active_member_ids @> ARRAY[eu.id]::text[]
     OR cs.pending_invitee_user_ids @> ARRAY[eu.id]::text[]
   )
   AND (
     cs.owner_user_id = params.royce_user_id
     OR cs.active_member_ids @> ARRAY[params.royce_user_id]::text[]
     OR cs.pending_invitee_user_ids @> ARRAY[params.royce_user_id]::text[]
   )
  GROUP BY eu.id
),
direct_room_candidates AS (
  SELECT
    eu.id AS user_id,
    cs.channel_id,
    cs.session_key,
    cs.owner_user_id,
    cs.status,
    cs.created_at,
    cs.active_member_ids,
    cs.pending_invitee_user_ids,
    EXISTS (
      SELECT 1
      FROM app.app_messages AS wm
      WHERE wm.session_key = cs.session_key
        AND wm.user_id = params.royce_user_id
        AND wm.client_message_id = params.welcome_client_message_id
        AND wm.is_deleted IS NOT TRUE
        AND EXISTS (
          SELECT 1
          FROM app.app_message_contents AS wc
          WHERE wc.message_id = wm.id
            AND wc.content_type = 'SOURCE'
            AND wc.language = 'en'
            AND wc.is_deleted IS NOT TRUE
            AND NULLIF(BTRIM(wc.text), '') IS NOT NULL
        )
    ) AS has_welcome
  FROM eligible_users AS eu
  CROSS JOIN params
  JOIN channel_state AS cs
    ON cs.is_deleted IS NOT TRUE
   AND (
     (
       CARDINALITY(cs.active_member_ids) = 2
       AND cs.active_member_ids @> ARRAY[eu.id, params.royce_user_id]::text[]
       AND CARDINALITY(cs.pending_invitee_user_ids) = 0
     )
     OR (
       CARDINALITY(cs.active_member_ids) = 1
       AND CARDINALITY(cs.pending_invitee_user_ids) = 1
       AND (
         (
           cs.owner_user_id = eu.id
           AND cs.active_member_ids @> ARRAY[eu.id]::text[]
           AND cs.pending_invitee_user_ids @> ARRAY[params.royce_user_id]::text[]
         )
         OR (
           cs.owner_user_id = params.royce_user_id
           AND cs.active_member_ids @> ARRAY[params.royce_user_id]::text[]
           AND cs.pending_invitee_user_ids @> ARRAY[eu.id]::text[]
         )
       )
     )
   )
),
direct_room_counts AS (
  SELECT user_id, COUNT(*)::integer AS direct_room_count
  FROM direct_room_candidates
  GROUP BY user_id
),
ranked_direct_rooms AS (
  SELECT
    drc.*,
    ROW_NUMBER() OVER (
      PARTITION BY drc.user_id
      ORDER BY drc.has_welcome DESC, drc.created_at DESC, drc.channel_id DESC
    ) AS room_rank
  FROM direct_room_candidates AS drc
),
selected_direct_rooms AS (
  SELECT *
  FROM ranked_direct_rooms
  WHERE room_rank = 1
),
welcome_details AS (
  SELECT
    sdr.user_id,
    wm.id AS message_id,
    MAX(source_content.text) FILTER (WHERE source_content.id IS NOT NULL) AS source_text,
    COUNT(translation_content.id) FILTER (
      WHERE translation_content.content_type = 'TRANSLATION_FINAL'
        AND translation_content.is_deleted IS NOT TRUE
    )::integer AS active_translation_count,
    ARRAY_AGG(translation_content.language ORDER BY translation_content.language) FILTER (
      WHERE translation_content.content_type = 'TRANSLATION_FINAL'
        AND translation_content.is_deleted IS NOT TRUE
    ) AS active_translation_languages
  FROM selected_direct_rooms AS sdr
  CROSS JOIN params
  LEFT JOIN app.app_messages AS wm
    ON wm.session_key = sdr.session_key
   AND wm.user_id = params.royce_user_id
   AND wm.client_message_id = params.welcome_client_message_id
   AND wm.is_deleted IS NOT TRUE
  LEFT JOIN app.app_message_contents AS source_content
    ON source_content.message_id = wm.id
   AND source_content.content_type = 'SOURCE'
   AND source_content.language = 'en'
   AND source_content.is_deleted IS NOT TRUE
  LEFT JOIN app.app_message_contents AS translation_content
    ON translation_content.message_id = wm.id
  GROUP BY sdr.user_id, wm.id
)
SELECT
  eu.id AS user_id,
  eu.external_user_id,
  eu.email,
  eu.name,
  eu.handle,
  eu.created_at AS user_created_at,
  eu.is_active,
  eu.is_deleted,
  eu.default_conversation_languages,
  eu.default_display_language,
  COALESCE(rrc.related_room_count, 0) AS related_room_count,
  COALESCE(rrc.visible_related_room_count, 0) AS visible_related_room_count,
  COALESCE(drc.direct_room_count, 0) AS direct_room_count,
  sdr.channel_id,
  sdr.session_key,
  sdr.owner_user_id,
  sdr.status AS room_status,
  sdr.active_member_ids,
  sdr.pending_invitee_user_ids,
  wd.message_id AS welcome_message_id,
  wd.source_text AS welcome_source_text,
  COALESCE(wd.active_translation_count, 0) AS active_translation_count,
  COALESCE(wd.active_translation_languages, ARRAY[]::text[]) AS active_translation_languages,
  CASE
    WHEN sdr.channel_id IS NULL THEN 'missing_room'
    WHEN wd.message_id IS NULL THEN 'missing_welcome_message'
    WHEN wd.source_text IS NULL THEN 'missing_source_content'
    ELSE 'complete'
  END AS repair_status
FROM eligible_users AS eu
LEFT JOIN related_room_counts AS rrc ON rrc.user_id = eu.id
LEFT JOIN direct_room_counts AS drc ON drc.user_id = eu.id
LEFT JOIN selected_direct_rooms AS sdr ON sdr.user_id = eu.id
LEFT JOIN welcome_details AS wd ON wd.user_id = eu.id
WHERE sdr.channel_id IS NULL
   OR wd.message_id IS NULL
   OR wd.source_text IS NULL
ORDER BY eu.created_at, eu.id;
