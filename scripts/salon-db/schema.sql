-- 서울/부산 미용실 아웃리치 DB
CREATE TABLE IF NOT EXISTS salons (
  id                  serial PRIMARY KEY,
  mgt_no              text UNIQUE,            -- 인허가 관리번호 (공공데이터 원천 키)
  name                text NOT NULL,
  city                text NOT NULL,          -- 서울 | 부산
  district            text,                   -- 구
  road_address        text,
  jibun_address       text,
  biz_type            text,                   -- 일반미용업, 네일미용업 ...
  license_date        date,
  status              text,                   -- 영업/정상 | 폐업 ...
  tm_x                double precision,       -- EPSG:5174 원본 좌표
  tm_y                double precision,
  lat                 double precision,
  lng                 double precision,
  phone               text,
  kakao_place_id      text,
  kakao_url           text,
  google_place_id     text,
  google_url          text,
  google_rating       numeric(2,1),
  google_review_count int,
  website             text,
  instagram_handle    text,
  instagram_followers int,
  instagram_posts     int,
  naver_url           text,
  fresha_url          text,
  score               numeric,                -- rank.sql 기본값, 직접 덮어써도 됨
  contact_status      text DEFAULT 'todo',    -- todo | contacted | replied | partner | declined
  contact_notes       text,
  raw_public          jsonb,
  enriched_at         jsonb DEFAULT '{}'::jsonb, -- {"kakao": ts, "google": ts, ...}
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS salons_city_district ON salons(city, district);
CREATE INDEX IF NOT EXISTS salons_status ON salons(status);

CREATE TABLE IF NOT EXISTS salon_photos (
  id          serial PRIMARY KEY,
  salon_id    int NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  source      text NOT NULL,                  -- google | instagram | naver | manual
  url         text NOT NULL,
  permalink   text,                           -- 원본 게시물/장소 링크
  attribution text,                           -- 작성자 표기 (Google 약관상 표시 필요)
  taken_at    timestamptz,
  fetched_at  timestamptz DEFAULT now(),
  UNIQUE (salon_id, source, url)
);
