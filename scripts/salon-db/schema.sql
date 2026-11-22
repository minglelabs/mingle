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

-- 카카오맵 브라우저 수집 (collector-server.mjs)
ALTER TABLE salons ALTER COLUMN city DROP NOT NULL;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS kakao_rating numeric(2,1);
ALTER TABLE salons ADD COLUMN IF NOT EXISTS kakao_review_count int;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS blog_review_count int;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS photo_count int;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE salons ADD COLUMN IF NOT EXISTS raw_kakao jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS salons_kakao_place_id ON salons(kakao_place_id);

CREATE TABLE IF NOT EXISTS crawl_queries (
  query       text PRIMARY KEY,
  status      text DEFAULT 'todo',            -- todo | running | done
  total       int,
  collected   int,
  started_at  timestamptz,
  finished_at timestamptz
);

-- 네이버 플레이스 / 인스타 (playwright 수집)
ALTER TABLE salons ADD COLUMN IF NOT EXISTS naver_place_id text;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS naver_visitor_reviews int;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS naver_score numeric(3,2);
ALTER TABLE salons ADD COLUMN IF NOT EXISTS naver_blog_reviews int;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS naver_booking boolean;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS naver_talktalk text;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS stylist_instagrams text[];
ALTER TABLE salons ADD COLUMN IF NOT EXISTS raw_naver jsonb;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS instagram_full_name text;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS instagram_bio text;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS instagram_category text;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS instagram_external_url text;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS instagram_following int;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS instagram_is_business boolean;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS instagram_contact text;   -- business_contact_method (CALL/EMAIL/TEXT)
ALTER TABLE salons ADD COLUMN IF NOT EXISTS raw_instagram jsonb;
ALTER TABLE salon_photos ADD COLUMN IF NOT EXISTS local_path text;   -- ~/salon-db/photos/... (인스타 이미지 URL은 만료돼서 파일로 받음)
CREATE UNIQUE INDEX IF NOT EXISTS salons_naver_place_id ON salons(naver_place_id) WHERE naver_place_id IS NOT NULL;

-- 병원(성형외과·피부과·미용의원)도 같은 테이블에 kind로 구분
ALTER TABLE salons ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'hair';  -- hair | plastic | derm
CREATE INDEX IF NOT EXISTS salons_kind ON salons(kind);
ALTER TABLE crawl_queries ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'hair';
-- 병원 웹사이트에서 찾은 연락처/채널
ALTER TABLE salons ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS kakao_channel text;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS website_links jsonb;   -- 사이트에서 찾은 SNS·상담 링크
ALTER TABLE salons ADD COLUMN IF NOT EXISTS foreign_langs text[];  -- 사이트의 영어/중국어/일본어 페이지 여부
ALTER TABLE salons ADD COLUMN IF NOT EXISTS gangnamunni_url text;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS raw_gangnamunni jsonb;
