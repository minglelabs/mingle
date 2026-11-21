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
