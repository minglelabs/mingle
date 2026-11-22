# salon-db — 서울/부산 미용실 아웃리치 DB

로컬 Postgres `salon_db`에 서울·부산 미용실을 모으고, 연락 돌릴 순위를 매기는 스크립트.
모두 각 서비스의 **공식 API**만 쓴다 (지도/인스타 화면 자동 크롤링 없음).

| 단계 | 소스 | 얻는 것 | 필요한 키 |
|---|---|---|---|
| 1 `import:public` | 행정안전부 생활_미용업 (data.go.kr 15154918) | 인허가 받은 전 업소, 영업/폐업, 주소 | `DATA_GO_KR_KEY` |
| 2 `enrich:kakao` | 카카오 로컬 API | 전화, 좌표, 카카오맵 링크 | `KAKAO_REST_KEY` |
| 3 `enrich:naver` | 네이버 검색 API(지역) | 홈페이지 링크 → 인스타 핸들 | `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` |
| 4 `enrich:google` | Google Places API (New) | 평점, 리뷰 수, 매장 사진, 웹사이트 | `GOOGLE_MAPS_KEY` (유료, `LIMIT`/`GOOGLE_WHERE`로 대상 축소) |
| 5 `enrich:instagram` | Instagram Graph API Business Discovery | 팔로워, 게시물 수, 최근 사진 12장 | `IG_USER_ID`, `IG_ACCESS_TOKEN` |
| 6 `rank` | — | `score` 계산 + `outreach` 뷰 | — |

```bash
cd scripts/salon-db && pnpm install
createdb salon_db && pnpm migrate
DATA_GO_KR_KEY=... pnpm import:public
KAKAO_REST_KEY=... pnpm enrich:kakao
NAVER_CLIENT_ID=... NAVER_CLIENT_SECRET=... pnpm enrich:naver
GOOGLE_MAPS_KEY=... LIMIT=500 GOOGLE_WHERE="district IN ('강남구','마포구')" pnpm enrich:google
IG_USER_ID=... IG_ACCESS_TOKEN=... pnpm enrich:instagram
pnpm rank
psql salon_db -c "select * from outreach limit 50"
```

- 모든 enrich는 `enriched_at`에 소스별 시각을 남겨서 다시 돌리면 남은 곳만 처리한다.
- 영업 중(`status ~ '영업|정상'`)인 곳만 enrich 한다.
- 연락 기록은 `contact_status`(todo/contacted/replied/partner/declined), `contact_notes`에.
- 사진: `salon_photos`. Google 사진은 photo name만 저장 →
  `https://places.googleapis.com/v1/{url}/media?maxWidthPx=800&key=KEY` 로 보기, 작성자 표기(`attribution`) 필수.
  인스타 사진 URL은 만료되니 필요할 때 `enrich:instagram` 재실행.
- Fresha: 공개 API 없음. 한국 매장 수가 적어 수동으로 `fresha_url`에 기입.

## 카카오맵 브라우저 수집 (현재 주력)

API 키 없이 크롬(로그인된 프로필)에서 카카오맵을 직접 돌며 모은다. 네이버 지도는 Claude in Chrome 정책상 접근 불가.

1. `pnpm migrate` 후 `crawl_queries`에 `dong-queries.txt`(서울 426 + 부산 206 행정동 × "미용실") 적재
   `psql salon_db -c "\copy crawl_queries(query) FROM 'dong-queries.txt'"`
2. `node collector-server.mjs` (127.0.0.1:4777, 결과를 salon_db에 저장)
3. 크롬 탭 두 개에 스크립트 붙여넣기 (처음 한 번 "로컬 네트워크 접근" 허용 필요)
   - `map.kakao.com` 탭 → `browser/kakao-list.js`: 동별 검색, 목록 34페이지(최대 ~500곳)까지 넘기며 이름·주소·전화·평점·블로그 리뷰수
   - `place.map.kakao.com/<아무 id>` 탭 → `browser/kakao-details.js`: 블로그 리뷰 많은 순으로 상세 JSON → 인스타 링크, 전화, 사진 20장, 메뉴·가격, 태그
4. 진행 확인: `curl 127.0.0.1:4777/stats`
5. 멈추기: 탭 콘솔에서 `window.__salonListStop = true` / `window.__salonDetailStop = true`

카카오 목록의 "리뷰 N"은 블로그 리뷰 수 → `blog_review_count`. 카카오 자체 별점 리뷰는 `kakao_review_count`.

## 병원 (성형외과·피부과·미용의원)

같은 `salons` 테이블에 `kind`(`hair` | `plastic` | `derm`)로 구분해 넣는다. 미용의원은 카카오에서 대부분 피부과 카테고리라 `derm`.

1. `clinic-queries.txt`(행정동 × 성형외과/피부과)를 `crawl_queries`에 적재 (`kind` 지정)
2. `node kakao-pw.mjs list` / `node kakao-pw.mjs details` — 카카오 수집을 헤드리스 크롬에서 (내 크롬 탭 불필요)
3. `naver-place.mjs` — 병원은 `/hospital` 경로로 매칭, 병원 먼저 처리
4. `clinic-websites.mjs` — 병원 홈페이지에서 인스타·카카오톡 채널·이메일·전화·외국어 페이지 (robots.txt가 막은 사이트는 건너뜀)
5. 실행은 `./run-loop.sh <script>`로 (메모리 여유 확인 후 반복 실행)

강남언니(unni.app)와 성예사는 robots.txt가 자동 수집을 막고 있어(성예사는 Claude 계열 봇 명시 차단) 수집하지 않는다.
