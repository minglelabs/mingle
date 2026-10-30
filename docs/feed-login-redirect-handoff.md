# 피드 로그인 버그 인수인계 (2026-10-16)

`feat/posting-feed`(PR #231, 2.2.0)에서 고칠 버그. HashChat 스토어 스크린샷을 찍다가 실기기(iPhone 14, devbox, 2.2.0 Release 빌드)에서 발견했다.

## 증상

로그아웃 상태에서 피드의 **좋아요**, **글쓰기(연필)**, **댓글 쓰기/좋아요**를 누르면:

1. 웹뷰가 `/{locale}/auth/signin?callbackUrl=/{locale}/feed?postId=…`로 이동
2. 이 페이지가 바로 `/api/auth/signin/google`로 redirect
3. 앱 안 웹뷰에 **웹 Google OAuth 화면만** 뜸 (Apple 로그인 없음, 기존 로그인 화면 아님)

사용자 반응: "로그인 화면 이상한거 뜨는데? 기존에 밍글에서 내가 만들어왔던거 떠야지… 구글로그인밖에 안뜨네"

반면 **대화 탭**(`/{locale}/conversations`)에서는 기존 로그인 화면(로고 + 서비스 약관 시트 + Apple/Google 네이티브 로그인)이 정상으로 뜨고, 거기서 로그인하면 잘 된다.

devbox 서버 로그(재현 당시):
```
GET /ko/auth/signin?callbackUrl=%2Fko%2Ffeed%3FpostId%3Drs-… 200
[nextauth] method=GET action=signin provider=google callback=/ko/feed?postId=rs-… error=-
GET /api/auth/signin/google?callbackUrl=%2Fko%2Ffeed%3FpostId%3Drs-…&ngrok-skip-browser-warning=1 200
```

## 원인

- `mingle-app/src/components/feed/login-redirect.ts`: `loginHref()` / `composeLoginHref()`가 `/{locale}/auth/signin?callbackUrl=…`를 만든다.
  주석에는 "hands off to the native-aware OAuth flow"라고 돼 있지만 실제로는 그렇지 않다.
- `mingle-app/src/app/[locale]/auth/signin/page.tsx`: `provider` 쿼리가 없으면 `"google"`으로 정하고 `/api/auth/signin/google`로 바로 redirect. 네이티브 앱인지 보지 않는다.
- 호출하는 곳: `mingle-app/src/components/feed/feed-shell.tsx`
  - `goToLogin` (309행 근처): `router.push(loginHref(locale, postId))`
  - `openCompose` (318행 근처): 로그아웃이면 `router.push(composeLoginHref(locale))`
  - `onRequireLogin={goToLogin}` / `goToLogin(commentPostId)` / `goToLogin(actionPostId)`: 피드 카드, 댓글 시트(`src/components/comments/*`), 게시물 액션
- 기존 로그인 화면은 `mingle-app/src/components/mingle-home.tsx`의 auth gate (약관 시트, 제공자 선택, `startNativeAuthPoller`로 네이티브 Apple/Google 로그인). 관련 상태: `src/components/mingle-home.auth-contract.ts`, `src/components/email-auth-sheet-state.ts`, `src/components/native-oauth-launcher.tsx`, `src/lib/native-auth-bridge.ts`

## 기대 동작

- 앱(네이티브 클라이언트, `nativeAuth=1`)에서는 피드의 좋아요·글쓰기·댓글 로그인 요구가 **대화 탭과 같은 기존 로그인 화면**을 연다.
- 로그인이 끝나면 **원래 있던 게시물**(좋아요/댓글)이나 **글쓰기 화면**으로 돌아온다. ("like → login → back" 흐름은 지금 코드의 의도. `feedHref(locale, { postId })`, `composeHref(locale)` 그대로 쓰면 됨)
- 웹 브라우저(네이티브 아님)에서도 로그인이 되어야 한다. 웹에서 Apple이 빠지는 건 지금과 같아도 됨.

## 고치는 방향 (제안, 판단은 맡김)

1. 피드에서 로그인이 필요할 때 기존 auth gate로 보낸다. 예: 대화 탭(home) 라우트로 return-to 파라미터를 붙여 이동하고, 로그인 성공 후 그 경로로 돌려보내기. home에 이미 callback/return 처리가 있는지 먼저 확인.
2. 또는 auth gate(약관 시트 + 제공자 버튼 + 네이티브 poller)를 컴포넌트로 빼서 피드 위에 시트로 띄우기. 손이 더 가지만 피드를 떠나지 않음.
3. 최소 수정: `[locale]/auth/signin/page.tsx`가 네이티브 클라이언트면 Google로 직행하지 않고 기존 로그인 화면으로 보내기. 다만 이 페이지는 다른 곳(로그인 콜백, 오픈 리다이렉트 수정 등)에서도 쓰이니 영향 범위를 확인할 것.

어느 쪽이든 `login-redirect.ts`의 주석과 테스트(`login-redirect` 관련 테스트, `src/app/[locale]/auth/signin/` 아래 `callback-url` 테스트)를 맞춰 고칠 것.

## 확인 방법

- 단위 테스트: 리다이렉트 경로 생성 로직, signin 페이지의 분기
- 실기기: 로그아웃 → 피드에서 좋아요 → 기존 로그인 화면 → 로그인 → 같은 게시물로 복귀. 글쓰기, 댓글 쓰기도 같은 흐름
- 웹: 로그아웃 상태에서 `/{locale}/feed`의 좋아요 → 로그인 → 복귀

## 주의 (이번에 겪은 것)

- **아이폰 공유**: 같은 iPhone 14를 여러 세션이 쓴다. 이번에도 `korean-stt-devrun` 세션이 Mingle 2.1.1을 같은 번들 ID로 덮어 설치했고, 그 뒤 HashChat 빌드로 다시 덮었다. 설치·삭제 전에 사용자에게 먼저 물어볼 것.
- **devbox 환경변수**: `VAULT_ADDR=http://127.0.0.1:8200`가 없으면 Vault를 못 읽어 `DATABASE_URL`이 비고, 서버는 뜨지만 API가 `PrismaClientInitializationError`/500을 낸다.
- **pod install**: `LANG=en_US.UTF-8` 필요. 새 워크트리에서는 `.devbox-cache/bundle`이 Ruby 4.0으로 빌드돼 CocoaPods(Ruby 3.3)가 `bigdecimal` 로드에 실패할 수 있다. 그래도 devbox의 직접 `pod install` fallback으로 빌드는 됐다.
- **느림**: dev 서버(Turbopack)가 화면을 처음 열 때마다 컴파일해서 대화 탭·좋아요 첫 반응이 수 초 걸리고 흰 화면이 오래 보인다. 배포 빌드에서는 없는 현상.
- **devbox 터널**: named cloudflared 터널 호스트(`mingle-app-devbox.…`)를 워크트리끼리 공유한다. 한 워크트리에서 `devbox up`을 하면 다른 워크트리의 bridge가 내려간다.

## 브랜치 관계

`feat/hashchat-rebrand`는 `feat/posting-feed` 위에 쌓여 있다. 이 버그는 `feat/posting-feed`에서 고치고, 리브랜딩 브랜치는 나중에 posting-feed를 머지해 받는다. 리브랜딩 브랜치는 `login-redirect.ts`, `feed-shell.tsx`, `[locale]/auth/signin/page.tsx`를 건드리지 않았다. `mingle-home.tsx`는 문구 2줄("Mingle"→"HashChat")만 바뀌었으니, 그 근처를 고치면 머지할 때 충돌이 날 수 있다.
