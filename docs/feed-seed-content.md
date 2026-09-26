# 포스팅 피드 초기 콘텐츠 (운영자용)

출시 첫날 피드가 비어 보이지 않도록 Mingle 팀 계정으로 올릴 초기 게시물 42개와 투입 스크립트입니다. 체크리스트 83(초기 콘텐츠), 84(운영 계정·반응 조작 금지), 85(신뢰 원칙)에 해당합니다.

- 데이터: `mingle-app/content/feed-seed/posts.v1.json`
- 스크립트: `mingle-app/scripts/seed-feed-content.ts` (실행은 `seed-feed-content.mjs` 런처로)
- 규칙 검사·안전장치: `mingle-app/scripts/seed-feed-content.logic.ts`
- 테스트: `mingle-app/src/server/posts/feed-seed-content.test.ts`

## 실행 방법

모든 명령은 `mingle-app`에서 실행합니다.

```bash
# 1) DB 없이 콘텐츠 규칙 검사 + 목록 확인
node scripts/seed-feed-content.mjs --no-db

# 2) dry-run (기본값). DB는 읽기만 합니다: 작성자 계정 조회, 이미 있는 게시물 확인
node scripts/run-with-env-local.mjs node scripts/seed-feed-content.mjs

# 3) 작성자 계정이 없으면 만들면서 게시
node scripts/run-with-env-local.mjs node scripts/seed-feed-content.mjs --apply --create-author

# 이미 있는 운영 계정을 쓸 때
node scripts/run-with-env-local.mjs node scripts/seed-feed-content.mjs --apply --author-user-id <userId>

# 이미 있는 계정을 공식 계정으로 지정 (게시물은 올리지 않고 종료)
node scripts/run-with-env-local.mjs node scripts/seed-feed-content.mjs --mark-official --author-user-id <userId>          # dry-run
node scripts/run-with-env-local.mjs node scripts/seed-feed-content.mjs --mark-official --author-user-id <userId> --apply  # 실제 지정
```

| 플래그 | 의미 |
| --- | --- |
| `--apply` | 실제로 씁니다. 없으면 항상 dry-run입니다. |
| `--author-user-id <id>` | 작성자 계정 id. 없으면 handle `mingle_team` 계정을 찾습니다. |
| `--create-author` | `mingle_team` 계정이 없을 때만 만듭니다(표시 이름 "Mingle 팀", 공식 계정으로 생성). 이 플래그가 없으면 계정을 만들지 않습니다. |
| `--mark-official` | 이미 있는 작성자 계정(`--author-user-id` 또는 handle `mingle_team`)을 공식 계정(`User.isOfficial = true`)으로 지정하고 종료합니다. 게시물은 올리지 않습니다. `--apply`가 없으면 dry-run입니다. `--no-db`, `--create-author`와 함께 쓸 수 없습니다. |
| `--i-know-this-is-production` | DATABASE_URL 호스트가 localhost/127.0.0.1이 아닐 때 필요합니다. 없으면 DB에 연결하기 전에 종료합니다(종료 코드 2). |
| `--no-db` | DB에 연결하지 않고 검사와 목록만 보여 줍니다. `--apply`와 함께 쓸 수 없습니다. |
| `--content <path>` | 다른 콘텐츠 파일을 씁니다. |

## 동작

- 앱 게시와 같은 흐름입니다: 서버 언어 감지(`detectSourceLanguage`) → 기본 4개 언어 번역(`resolveDefaultPostTranslationLanguages` + `translatePostBodySettled`) → 무작위 배경(`randomBackgroundKey`) → 게시물과 번역을 한 트랜잭션으로 저장. 번역이 실패한 언어는 앱 게시와 똑같이 `status=failed`로 저장됩니다.
- 멱등입니다. 항목마다 고정 id(`mingleseed-v1-001` …)를 게시물 id로 씁니다. 이미 있으면 건너뜁니다. 다른 사용자가 가진 id면 건드리지 않고 `skip-conflict`로 표시합니다.
- 파일의 첫 항목(환영 글)이 피드 맨 위에 오도록 역순으로 한 개씩 올립니다. 게시 시각은 실제 시각이며 과거로 꾸미지 않습니다.
- 게시물만 만듭니다. 좋아요·댓글·조회 수는 만들지 않으며 모두 0에서 시작합니다.
- 이미지 없이 텍스트만 올립니다.
- 작성자 계정이 삭제되었거나 운영 제한 상태면 거부합니다.

## 주의사항

- 운영 DB에 넣을지는 사용자가 결정합니다. 넣기 전 로컬에서 dry-run과 `--apply`로 먼저 피드 모양을 확인하세요.
- `--apply`는 번역 API를 게시물당 4회(감지 1회 + 원문 언어를 뺀 3개 언어 번역) 호출합니다. 42개 기준 약 168회입니다.
- 사실 항목(`kind: "fact"`)은 공식 출처를 `sources`에 남겼습니다. 세금 환급 조건·전화번호·운영 시간은 바뀔 수 있으니 투입 직전에 출처를 다시 확인하고 `checkedAt`을 고치세요. 특히 1330 페이지(english1.visitkorea.or.kr)는 2021년에 마지막으로 갱신되었다고 적혀 있고, 운영 시간은 Seoul Safety Nuri 페이지로도 확인했습니다.
- 콘텐츠를 고칠 때 지킬 것: 1인칭 후기 금지("제가 받아봤는데" 등), 특정 병원·업체 추천·광고 금지, 의료 효과·안전 주장 금지, 확인할 수 없는 사실은 질문형으로. 테스트가 금지 표현·길이·언어·중복·출처를 검사하므로 고친 뒤 `npx vitest run src/server/posts/feed-seed-content.test.ts`를 돌리세요.
- 공식 계정 배지(체크리스트 84): `User.isOfficial`이 true인 계정은 게시물 카드·댓글·프로필·사람 검색에서 이름 옆에 "공식" 배지가 붙습니다. 배지는 표시만 하며 반응 수·랭킹은 바꾸지 않습니다. `--create-author`로 만든 계정은 처음부터 공식입니다. 기존 계정은 아래 절차로 지정합니다. 어드민 UI는 아직 없습니다.

## 운영자 절차: 계정을 공식 계정으로 지정

1. 스키마 마이그레이션 `20260926170000_add_user_official_flag`가 대상 DB에 적용됐는지 확인합니다(`npx prisma migrate deploy`).
2. 대상 계정 id를 확인합니다. handle이 `mingle_team`이면 id 없이 실행해도 됩니다.
3. dry-run으로 대상을 확인합니다: `node scripts/run-with-env-local.mjs node scripts/seed-feed-content.mjs --mark-official --author-user-id <userId>`. "would mark id=… as official"이 나오면 맞는 계정인지 봅니다. 이미 공식이면 "already official"로 끝납니다.
4. `--apply`를 붙여 다시 실행합니다. 운영 DB는 `--i-know-this-is-production`도 필요합니다.
5. 해제는 스크립트에 없습니다. 필요하면 DB에서 `is_official`을 false로 직접 바꿉니다.
- 이미 올린 게시물의 본문을 파일에서 고쳐도 다시 실행할 때 바뀌지 않습니다(건너뜀). 새 글은 새 id를 붙여 추가하세요.

## 콘텐츠 요약 (42개, ko 13 / en 12 / ja 10 / zh-CN 7)

| 종류 | 개수 | 내용 |
| --- | --- | --- |
| notice | 1 | Mingle 팀 환영 글 |
| fact | 11 | 사후면세 조건(15,000원 이상, 즉시 환급 한도, 6개월 이내 체류·3개월 내 반출, 제외 품목, 공항 환급 절차, 인천공항 T1 환급 창구 시간), 1330 관광통역안내(24시간 언어), 120 다산콜 외국어 상담, 1345 외국인종합안내, 관광불편신고 |
| tip | 4 | 피부과·시술 상담 때 물어볼 것, 견적·사후관리를 글로 받기, 복용 약·알레르기 메모 |
| phrase | 15 | 미용실·네일·약국·병원 접수·가게·길 묻기에서 쓰는 짧은 한국어 |
| question | 11 | 처음 온 사람이 궁금한 것, 현지인 추천을 구하는 질문 |

출처(모두 2026-09-26 확인):

- 한국관광공사 VISITKOREA, Comprehensive Tax Refund Guide: https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=248765
- 한국관광공사 VISITKOREA, 1330 Travel Hotline & Complaint Center: https://english1.visitkorea.or.kr/enu/TRV/TV_ENG_3_1.jsp , https://english.visitkorea.or.kr/svc/contents/contentsView.do?menuSn=454&vcontsId=140632
- 서울시 Seoul Safety Nuri, Phone Service: https://safecity.seoul.go.kr/global/emergencyContact/phoneServiceIndex.do

의도적으로 뺀 것: 외국인 환자 미용성형 부가세 환급 특례(2026년 시행 여부를 공식 출처로 확인하지 못함), 면세 한도 금액(제도 구분이 헷갈릴 수 있음), 시술 비용 범위(공식 출처 없음).
