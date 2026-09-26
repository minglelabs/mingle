# 포스팅/피드 기능 구현 계획

브랜치: `feat/posting-feed` · 작성일: 2026-09-25

기획 원문(노션)의 체크리스트를 구현 순서로 재배열한 문서다. 각 Phase는 독립 PR 단위로
나눌 수 있게 경계를 잡았고, 선행 Phase의 산출물에만 의존한다.

## 진행 상황

| Phase | 상태 | 커밋 |
|---|---|---|
| 1 DB 스키마 | 완료 | `e96d714c` |
| 2 번역 서비스 추출 | 완료 | `70735f40` |
| 3 게시물 CRUD API · 5a 피드 셸 | 완료 | `0e552236` |
| 4 랭킹 · 5b 피드 상호작용 · 6 반응 API | 완료 | `beaf51ee` |
| W0 계약·스키마(모더레이션·알림 토글) | 완료 | 이 문서와 같은 커밋 |
| W3 병렬 8건 (아래 표) | 진행 | |

Phase 1 주의: 마이그레이션 `20260925170000_add_posting_feed`는 기존 drift 2건
(`app_users` TIMESTAMPTZ, `app_event_logs` partial index)을 의도적으로 제외했다.
`prisma migrate diff`를 다시 돌리면 그 2건이 계속 잔여 drift로 보이는 것이 정상이며,
새 마이그레이션에 섞어 넣으면 운영 데이터가 손상된다. 근거는 마이그레이션 헤더에 있다.
`20260926034500_add_feed_moderation_and_notification_prefs`도 같은 방식으로 생성했다.

### W3 — 병렬 작업 분할 (각자 `/Users/nam/workspaces/mingle-pf-*` 워크트리·브랜치)

이음새는 코드로 먼저 고정했다. 아래 파일의 **시그니처는 변경 금지**, 본문만 담당자가 구현한다.

| 계약 파일 | 내용 | 구현 담당 |
|---|---|---|
| `src/lib/feed-post-dto.ts` | 피드·프로필·검색 공통 게시물 wire shape | S1(서버가 이 모양으로 응답) |
| `src/lib/feed-routes.ts` | 모든 화면 경로·목록 endpoint 빌더 (경로 문자열 직접 작성 금지) | 완성본 |
| `components/comments/comment-sheet.tsx` | 댓글 시트 props | C3 |
| `components/posts/post-action-sheet.tsx` · `components/reports/report-sheet.tsx` | ⋯ 메뉴·신고 시트 props | R |
| `components/compose/publish-status-banner.tsx` | 백그라운드 게시 상태 배너 | C2 |
| `components/feed/feed-post-preview.tsx` | 작성 미리보기(피드 카드와 동일 렌더) | C1 |
| `components/notifications/use-unread-notifications.ts` | 종 아이콘 빨간 점 | N |
| `server/notifications/create-post-notification.ts` | 모든 게시물 알림의 단일 진입점 | N (R은 호출만) |
| `server/posts/{block,post,comment}-visibility.ts` | 비로그인·운영자 비노출 반영 완료. 시그니처 고정 | 내부 수정은 R만 |

| 담당 | 범위 |
|---|---|
| S1 서버 피드 | DTO 직렬화기, 비로그인 피드, `GET /users/{id}/posts`, `GET /search/posts` |
| C1 피드 UI | 목 데이터 제거·API 연결, 뷰어 라우트, 딥링크, 로그인 유도·복귀, 오류·로딩, 접근성 |
| C2 글쓰기 | 작성·초안·첨부·미리보기·게시·수정·보관함·휴지통·숨긴 글 화면 |
| C3 댓글 | 댓글 시트 UI 전체 |
| N 알림 | Phase 7 전체 (서버 트리거·푸시·통합 목록·읽음·빨간 점·토글) |
| P 검색·프로필 | Phase 8 (프로필 3열 그리드, 사람 검색, 최근 검색어, 검색 UI) |
| R 신고·운영 | Phase 9 (신고 API·시트, ⋯ 메뉴, 어드민, 운영자 비노출, rate limit) |
| V 버전 | 앱·API 네임스페이스 2.1.0 동시 상향 |

신규 UI 문구는 공유 사전(`i18n/types.ts`, `dictionaries/*`)을 건드리지 않고 기능별 copy 모듈
(`src/i18n/<기능>-copy.ts`, `profile-bio-copy.ts` 패턴, 15개 언어)에 둔다.

---

## 0. 아키텍처 전제 (조사 결과)

| 항목 | 사실 |
|---|---|
| RN 앱 | `react-native-webview` 단일 WebView 래퍼. `react-navigation` 미설치, 네이티브 탭 없음 |
| **UI 구현 위치** | **Next.js 웹앱** `mingle-app/src/app/[locale]/`. 피드·제스처·스냅 전부 웹(CSS scroll-snap + Pointer Events) |
| 현재 탭 | `bottom-tab-bar.tsx` — 대화목록 · 탐색(connect) · 마이페이지 **3개** |
| 목표 탭 | 피드 · 대화목록 · 탐색 · 마이페이지 **4개** (피드가 첫 화면) |
| API | Next.js Route Handler + 버전 네임스페이스 `{ios,android}/vX.Y.Z` re-export |
| 현재 버전 | 앱 `2.0.4` / 네임스페이스 `ios,android/v2.0.4` |
| **목표 버전** | **`2.1.0`** — 앱 버전과 API 네임스페이스 동시 상향 (버전 정책) |
| DB | Postgres(`?schema=app`) + Prisma 단일 스키마, 마이그레이션 71개 |
| 소프트 삭제 관례 | `isDeleted Boolean?` (null=미삭제). `deletedAt`은 User에만 존재 → 게시물은 둘 다 사용(휴지통 30일 필요) |
| 검증 | zod 미사용. 인라인 수동 검증 + `{ error: "snake_case" }` |
| 페이지네이션 | `take: limit` + `orderBy` (cursor 미사용) → 피드는 cursor 필요하므로 신규 도입 |
| 테스트 | vitest, `src/**/*.test.ts` |
| 이미지 | `sharp` 리사이즈 + EXIF 제거 파이프라인 재사용 (`conversation-image-storage.ts`, private R2) |
| 번역 | `translate-finalize-handler.ts`의 provider 호출부가 `NextRequest`에 결합 → **순수 함수 추출 필요** |
| 알림 | `UserNotification.type`이 `"follow"`만. 타입 확장 + 렌더러 분기 필요 |
| 신고 | `UserReport`(사람만) + `/admin/reports`. `targetType` 확장으로 하나의 목록 유지 |

---

## 1. Phase 1 — DB 스키마 (선행, 전부가 여기에 의존)

신규 모델. 기존 관례(`@map` snake_case, `cuid()`, `isDeleted Boolean?`)를 따른다.

| 모델 | 목적 | 핵심 필드 |
|---|---|---|
| `Post` | 게시물 | `authorId`, `bodyVersion`, `sourceText`, `sourceLanguage`, `backgroundKey`, `imageObjectKey`, `visibility`(public/archived), `archivedAt`, `isDeleted`/`deletedAt`(휴지통 30일), `moderationHiddenAt`, `likeCount`, `commentCount`, `publishedAt` |
| `PostTranslation` | 게시물 번역 공유 캐시 | `@@id([postId, bodyVersion, language])`, `status`(pending/ready/failed), `text` |
| `PostComment` | 댓글·답글 | `postId`, `authorId`, `parentId`(1단계만), `replyToUserId`, `bodyVersion`, `sourceText`, `likeCount`, `isDeleted`/`deletedAt` |
| `PostCommentTranslation` | 댓글 번역 | `@@id([commentId, bodyVersion, language])` |
| `PostLike` / `PostCommentLike` | 좋아요 | `@@unique([postId, userId])` / `@@unique([commentId, userId])` |
| `PostView` | 본 글(기기 간 공유) | `@@unique([postId, userId])`, `viewedAt` |
| `PostHide` | 개별 숨김 | `@@unique([postId, userId])` |
| `PostDraft` | 계정별 다중 임시저장 | `authorId`, `sourceText`, `backgroundKey`, `imageObjectKey`, `updatedAt` |
| `RecentSearch` | 최근 검색어 30일 | `@@unique([userId, query])`, `searchedAt` |

기존 모델 확장:

- `UserReport` — `targetType`(`user`/`post`/`comment`), `targetPostId?`, `targetCommentId?` 추가.
  `reportedUserId`는 콘텐츠 작성자로 계속 채워 어드민 단일 목록을 유지. 동일 대상 중복 신고
  방지용 `@@unique([reporterId, targetType, targetPostId, targetCommentId, reportedUserId])`는
  Postgres null 비교 문제가 있어 **정규화된 `targetKey` 문자열 컬럼 + unique** 로 처리.
- `UserNotification` — `type`에 `post_like`/`comment`/`comment_reply`/`comment_like`/`report_resolved`
  추가, 딥링크용 `postId?`·`commentId?` FK 추가. 묶음 표시는 **읽기 시점 그룹핑**(행은 actor별 유지).
- `User` — `posts`, `postComments`, `postLikes`, `postViews`, `postHides`, `postDrafts`, `recentSearches` relation.

인덱스: 피드 정렬용 `Post(publishedAt)`, `Post(authorId, publishedAt)`,
`PostView(userId, postId)`, `PostLike(postId)`, `PostComment(postId, createdAt)`.

마이그레이션: `npx prisma migrate dev --name add_posting_feed` (로컬 DB 동시 적용).

## 2. Phase 2 — 번역 서비스 추출

1. `translate-finalize-handler.ts`에서 provider 호출부를 `NextRequest` 비의존 순수 함수로 추출:
   `translateTexts({ text, sourceLanguage, targetLanguages, modelSelection }) → { translations, detectedSourceLanguage, usage }`.
   기존 대화 번역 경로는 이 함수를 호출하도록 바꿔 **동작 불변**을 테스트로 고정.
2. `post-translation-service.ts` 신규:
   - 게시 시 `en`, `zh-CN`, `ja`, `ko` 중 원문 언어를 제외한 나머지 생성.
   - 요청 시 번역: `(postId, bodyVersion, language)` upsert, in-flight 공유(프로세스 내 Promise map + DB unique).
   - 실패는 `status="failed"`로 저장하고 자동 재시도 없음. 다음 요청 시 재시도.
   - 수정 시 기본 4개 + 기존 번역 보유 언어 전체를 새 `bodyVersion`으로 재번역. 이전 버전의
     늦은 응답이 덮어쓰지 못하게 `bodyVersion` 가드.
   - `parseTranslations()`, `canonicalizeTranslationLanguageCode()`는 그대로 import.
   - 프롬프트에 **줄바꿈·문단 구조 보존** 명시 추가(현재 대화 프롬프트엔 없음).

## 3. Phase 3 — 게시물 CRUD API

`/api/posts` 계열. 전부 unversioned 루트에 구현 후 `{ios,android}/v2.1.0/`에서 re-export.

- `POST /api/posts` — 본문 최대 1,000자, 공백만 금지(텍스트 또는 이미지 필수), 배경 랜덤 배정,
  멱등키로 연속 탭 중복 생성 방지. 기본 4개 언어 번역 시도 후 게시.
- `GET /api/posts/{postId}` · `PATCH`(본문/이미지/배경 변경, 재번역 트리거) · `DELETE`(휴지통)
- `POST /api/posts/{postId}/archive` · `/restore` · `/trash/restore`
- `POST /api/posts/{postId}/image` — `sharp` 파이프라인 재사용, 1장 제한, 원본 비율 보존 메타 저장
- `POST /api/posts/{postId}/translate` — 요청 번역
- `GET/POST/PATCH/DELETE /api/posts/drafts` — 계정별 다중 초안
- `POST /api/posts/{postId}/hide` · `DELETE`
- `GET /api/account/hidden-posts`

## 4. Phase 4 — 피드 랭킹 API

`GET /api/feed?cursor=...&limit=...`

정렬: **안 본 글 → 팔로우 작성자 → 시간 티어 → 티어 내 반응 점수**.
시간 티어: `≤1h / ≤6h / ≤24h / ≤3d / ≤1w / ≤1M / >1M` (같은 티어는 동일 최신성 점수).
반응 점수 = `좋아요 수 × 1 + 고유 댓글 작성자 수 × 2` (작성자 본인 댓글 제외, 동일인 1명 집계).
같은 작성자 연속 노출 회피(다른 후보가 있을 때). 안 본 글 소진 후 본 글을 안내 없이 이어서,
전부 소진 시 동일 규칙으로 순환. 차단(양방향)·숨김·보관·삭제·운영자 비노출 제외.

`POST /api/posts/{postId}/view` — 전체화면 1초 이상 체류 또는 좋아요/댓글 시 즉시 기록.
프리페치·썸네일 노출·백그라운드는 제외.

## 5. Phase 5 — 피드 UI (핵심 난도)

`/{locale}/feed` 신규 라우트 + 탭 바에 피드(홈 아이콘) 1번째 추가, 첫 화면으로 지정.

- 게시물 1장 높이 = `100dvh − 하단탭 − 하단 안전영역` (상단 투명 헤더 뒤 포함)
- CSS `scroll-snap-type: y mandatory` + 게시물 단위 스냅. 짧은 오터치는 넘김 처리 안 함
- 상단 헤더 완전 투명(배경색/블러 없음), 좌 Mingle · 우 글쓰기+알림. 대화목록 헤더와 높이·여백 일치
- 짧은 글: 중앙 큰 글씨(약 20자 기준, 2~3줄·구절 단위로 조정). 긴 글: 본문 앞부분 사용
- 펼쳐보기: 같은 게시물 위에서 본문 영역만 위로 확장(새 페이지/모달 없음), 중앙 큰 글씨 숨김
- 제스처: 터치 시작 영역으로 본문 스크롤 vs 게시물 넘김을 구분하고 뗄 때까지 유지.
  본문 끝 경계에서 넘김으로 이어지지 않게 `overscroll-behavior: contain` + 수동 가드
- 더블탭 좋아요(하트 이펙트), 단탭 이미지 확대와 구분, 조작 요소 터치는 제외
- 배경 프리셋(단색/그라데이션/무늬) 카탈로그 + 각 배경별 대비 확보 토큰
- 첫 진입 스와이프 안내(다음 글 있을 때만, 1회)

## 6. Phase 6 — 좋아요 · 댓글 · 답글

API: `POST/DELETE /api/posts/{postId}/like`, `/api/posts/{postId}/comments`(CRUD),
`/api/comments/{commentId}/like`, `/api/comments/{commentId}/translate`.

- 댓글 500자, 1단계 답글만, `@이름` 표시, 오래된 순 정렬, 답글 기본 접힘(`답글 N개 보기`)
- 삭제는 소프트. 답글이 남아 있으면 원댓글 본문만 `삭제된 댓글입니다`로 대체
- 게시물 작성자도 해당 게시물의 댓글·답글 삭제 가능. 타인 댓글 수정 불가
- 낙관적 업데이트 + 실패 시 롤백·안내, 연타 중복 집계 방지
- 댓글 시트 열림 중 배경 피드 넘김 차단, 키보드에 입력창 가리지 않게

## 7. Phase 7 — 통합 알림 + 푸시

- `UserNotification.type` 확장, 렌더러를 타입별 분기로 리팩터, `notification-copy.ts` 문구 추가
- 댓글·답글은 앱 내 알림 + **푸시**, 좋아요는 앱 내 알림만(푸시 없음)
- 좋아요는 대상(게시물/댓글)별 1건으로 묶어 표시, 서로 다른 댓글은 합치지 않음
- 알림 목록 진입 시 진입 시점까지 도착한 알림 일괄 읽음, `모두 읽음` 버튼 없음
- 미확인 있으면 피드·대화목록 종 아이콘에 숫자 없는 빨간 점. 대화 메시지 읽음과 별도 관리
- 알림 클릭 → 해당 게시물/댓글로 이동, 접힌 답글 자동 펼침
- `resolvePushCopy()`에 신규 타입 추가

## 8. Phase 8 — 프로필 그리드 + 통합 검색

- 프로필 3열 그리드(내/타인). 사진 있으면 썸네일, 없으면 저장된 배경 + 첫 약 20자 큰 글씨
- 그리드 → 전체화면, 해당 작성자 글만 그리드 순서로 상하 넘김, 뒤로 가면 스크롤 위치 복원
- 탐색 탭 검색창 하나로 사람 + 게시물. 사람 상단 최대 3명 + 모두 보기(우측 슬라이딩 화면),
  게시물 3열 썸네일 + 추가 로딩
- 1글자부터, 마지막 입력 후 300ms 디바운스, 한글 조합 중 요청 금지
- 사람 정렬: 정확 일치 → 앞부분 일치 → 포함. `anon_` handle·차단 사용자 제외
- 게시물: 원문 + **이미 생성된 번역문**만 검색(검색용 추가 번역 생성 안 함), 중복 1회,
  반응 점수순 → 동점 시 최신순
- 최근 검색어 최대 10개·30일·기기 간 공유, 개별/전체 삭제
- 새 결과 로딩 중 기존 결과 유지, 스켈레톤 없음, 실패도 `검색 결과 없음`으로 표시

## 9. Phase 9 — 신고 · 숨김 · 차단 · 어드민

- 게시물 `⋯` 메뉴: 게시물 신고 / 작성자 신고 / 게시물 숨김 / 작성자 차단
- 신고 사유 고정 선택지(기타 포함) + 선택 자유서술 최대 500자. 중복 신고는 첫 건만 접수
- 신고 결과는 신고자에게만 통합 알림(`신고가 처리되었습니다`), 클릭 시 읽음 처리만
- 차단은 기존 `UserBlock` 재사용, 한쪽 차단 시 양방향으로 피드·프로필·직접 링크 모두 비노출
- `/admin/reports`를 사람·게시물·댓글 단일 목록으로 확장(대상 유형 표시·필터, 처리 메모,
  운영자 비노출/해제, 미처리→검토 중→처리 완료/반려)
- 악용 방지: 글·댓글·좋아요 연속 요청 제한 + 재시도 가능 시점 안내(현재 전역 rate limit 없음 → 신규)

## 10. Phase 10 — i18n · 접근성 · 측정 · QA

- 15개 Primary 언어에 피드/댓글/신고 문구 추가 (`types.ts` → `ko.ts` → `en.ts` → 수동 6개 → generated 재생성)
- 접근성: 터치 영역·간격, 스크린리더 이름/상태, 큰 글자·동작 줄이기, 스와이프 외 이동 수단
- PostHog: 실제 노출·빠른 넘김·펼침·본문 읽기·좋아요·댓글·글쓰기·프로필 이동·재방문 구분.
  백그라운드 시간 제외, 원문·사진 등 콘텐츠 미전송
- 앱 버전 2.1.0 + 네임스페이스 `v2.1.0` 동시 상향, `namespace-routing.contract.test.ts` 갱신
- iOS/Android 실기기 QA: 본문 안팎 스와이프·끝 경계·접기·댓글 키보드·뒤로가기·느린 네트워크

---

## 범위 밖 (후속)

콘텐츠 공급 어드민·자동화, 다중 이미지/동영상, 외부 공유, 저장(북마크),
별도 팔로잉 피드·주제별 탐색·개인화 추천, 게시물별 댓글 허용 범위 설정.
