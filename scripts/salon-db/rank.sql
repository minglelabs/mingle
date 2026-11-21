-- 기본 점수 (출발점일 뿐, score 컬럼은 직접 덮어써도 됨)
-- 인스타 팔로워(log) + 구글 리뷰 수(log) × 평점 + 사진 보유
UPDATE salons s SET score = round((
    coalesce(ln(1 + instagram_followers), 0) * 1.0
  + coalesce(ln(1 + google_review_count), 0) * coalesce(google_rating, 3.5) / 5 * 1.5
  + CASE WHEN EXISTS (SELECT 1 FROM salon_photos p WHERE p.salon_id = s.id) THEN 1 ELSE 0 END
)::numeric, 2)
WHERE status ~ '영업|정상';

-- 아웃리치 목록: 사진 있는 곳만, 점수 순
CREATE OR REPLACE VIEW outreach AS
SELECT s.id, s.score, s.city, s.district, s.name, s.phone, s.instagram_handle,
       s.instagram_followers, s.google_rating, s.google_review_count,
       s.kakao_url, s.google_url, s.naver_url, s.contact_status, s.contact_notes,
       (SELECT count(*) FROM salon_photos p WHERE p.salon_id = s.id) AS photos
FROM salons s
WHERE s.status ~ '영업|정상'
  AND EXISTS (SELECT 1 FROM salon_photos p WHERE p.salon_id = s.id)
ORDER BY s.score DESC NULLS LAST;
