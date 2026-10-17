# HashChat 리브랜딩 인수인계 (2026-10-15)

> 배포할 때 할 일은 `docs/hashchat-release-checklist.md`에 정리돼 있다.

Mingle → **HashChat** 으로 앱 이름·로고·스토어 정보를 전부 바꾸는 작업. PR #231(`feat/posting-feed`, 2.2.0) 배포와 같이 나간다.

## 브랜치

- 작업 브랜치: `feat/hashchat-rebrand` (PR #231 `feat/posting-feed`의 `25c9be2`에서 분기, push 됨)
- PR은 아직 안 만듦. #231이 머지되기 전이면 base를 `feat/posting-feed`로 두고 열면 된다.
- 로컬 시작:
  ```bash
  cd ~/mingle && git fetch origin feat/hashchat-rebrand
  git worktree add ../mingle-hashchat feat/hashchat-rebrand
  ```

## 끝난 것: 로고

`branding/hashchat/`

| 파일 | 내용 |
|---|---|
| `hashchat.png` / `hashchat.svg` | 최종 로고 1024×1024 (확정본) |
| `preview.png` | 원본 + 240/180/120/60px 축소본 |
| `hashrush-hamster.png` | Hash Rush 원본 햄스터 (게임 `src/client/render.js`의 `drawHamster` 그대로 렌더) |
| `gen.mjs` | 로고 생성 스크립트. 수정 후 다시 뽑을 때 사용 |

디자인
- 배경 = 기존 Mingle 키컬러 `#FCC140`, 글자 = 기존 먹색 `#474747` (흰 글자 시안은 사용자가 탈락시킴)
- 해시(#)를 H처럼: 가로선 두 개를 가깝게 붙이고 서로 반대로 살짝 기울임, 손글씨 느낌의 둥근 획
- 오른쪽 세로선은 기울어짐. 그 밑동을 Hash Rush 햄스터(기본 룩 `LOOKS[0]`: 털 `#f7b558`, 귀 `#e3963b`, 배 `#fff4dc`, 발 `#f3c9a0`)가 앞발로 잡고 **앞니로** 갉아먹는 중. 반대편 가장자리에 이빨 자국, 아래에 부스러기
- 햄스터는 게임 원본과 달리 테두리를 먹색으로, 얼굴은 왼쪽으로 돌린 3/4 시점

재생성
```bash
cd branding/hashchat
npm i --no-save playwright && npx playwright install chromium && node gen.mjs
```
위치·크기 조절은 `gen.mjs` 상단 상수(`S` 햄스터 배율, `C` 햄스터 중심, `ROT`)와 `bites`(이빨 자국 좌표), 맨 아래 `translate(-40 0)`(전체 좌우 위치).

참고: 60px에서는 햄스터가 점처럼 보인다. 실기기 홈 화면에서 한 번 확인할 것.

## 남은 것 1: 앱 아이콘 교체 (바로 다음 작업)

`branding/hashchat/hashchat.png`(1024)에서 리사이즈해서 덮어쓰기.

- iOS `mingle-app/rn/ios/mingle/Images.xcassets/AppIcon.appiconset/` — `icon-1024.png`, `icon-20/29/40@1x·2x·3x`, `icon-60@2x·3x`, `icon-76@1x·2x`, `icon-83.5@2x` (파일명에 pt 크기 × 배율)
  - 1024는 투명 픽셀 없이 RGB로 저장 (`hashchat.png`는 이미 RGB)
- iOS 실행 화면 `Images.xcassets/LaunchLogo.imageset/launch-logo.png` + `LaunchScreen.storyboard` 배경색 확인
- Android `mingle-app/rn/android/app/src/main/res/mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png`(48/72/96/144/192), `ic_launcher_round.png`(같은 크기, 원형 마스크)
  - 현재 adaptive icon(`mipmap-anydpi-v26`) 없음. 넣을 거면 전경=글리프+햄스터, 배경=`#FCC140`로 분리 필요
- Google Play `mingle-app/rn/google-play-console-info/assets/icon-512.png`
- 웹 `mingle-app/public/mingle-icon.png`, `mingle-app/src/app/favicon.ico`, `mingle-landing/public/favicon.ico`

## 남은 것 2: 이름 바꾸기

사용자에게 보이는 `Mingle`(단어 단독, `mingle-`/`mingle_` 같은 식별자 제외)이 약 1,600곳. 대부분 다국어 반복이라 일괄 치환 + 문맥 검토로 처리.
찾기: `git grep -P "\bMingle\b(?![-_./])" -- ':!docs' ':!*.md'`

| 영역 | 위치 | 규모 |
|---|---|---|
| 네이티브 앱 이름 | `rn/ios/mingle/Info.plist` (`CFBundleDisplayName`, `CFBundleName`), `rn/android/.../res/values/strings.xml` (`app_name`) | 3 |
| iOS 권한 문구 | `Info.plist` 마이크/카메라/위치/사진/저장 설명 5개 | 5 |
| Android 알림·포그라운드 | `MingleFirebaseMessagingService.kt` (채널 이름/설명), `NativeSTTForegroundService.kt` ("Mingle microphone active"), `NativeQrImageModule.kt` (사진 폴더 `Pictures/Mingle`) | ~6 |
| RN | `rn/src/nativeQrScanner.tsx` 카메라 권한 안내 | 2 |
| 앱 UI 다국어 | `mingle-app/src/i18n/` (`account-badge-copy.ts`, `primary-ui-copy.ts`, `signup-copy.ts`, `search-copy.ts`, `dictionaries/*`) | ~180 |
| 앱 컴포넌트/서버 | `mingle-app/src/components`, `src/lib`, `src/server`, `src/app` | ~250 |
| 로그인 | `api/native-auth/complete/route.ts` ("Return to Mingle"), `api/native-auth/apple/exchange/route.ts` 기본 이름 "Mingle User" | ~8 |
| 어드민 | `src/app/admin/**` "Mingle Admin" 등 (내부용, 우선순위 낮음) | ~30 |
| 운영 정책 | `admin/operators/_lib/copy.ts` 이름 금지어 — **"HashChat"도 금지어에 추가** (서버측 검증 로직도 같이) | 2+ |
| 법률 문서 | `mingle-app/public/legal/**` 약관·개인정보처리방침·블로그 (언어별). `scripts/generate-legal-i18n.mjs`, `scripts/privacy-photo-translation.mjs`로 생성되는 부분은 스크립트 쪽을 고치고 재생성 | ~730 |
| 랜딩 | `mingle-landing/locales/*.json` 16개 언어, `app/layout.tsx` 메타데이터, `components/` | ~250 |
| 피드 시드 | `mingle-app/content/feed-seed/` 운영자 게시물 본문 | 5 |
| 공식 계정 | 이름 "Mingle", 핸들 `@mingle_team` (`scripts/seed-feed-content.logic.ts`). prod DB 데이터도 별도로 변경 필요 | - |

테스트 파일(`*.test.ts`)에 픽스처로 들어간 "Mingle"은 바꾼 문구를 기대값으로 쓰는 것만 맞추면 됨.

### 바꾸지 않는 것 (권장)

- 번들 ID / 패키지 `com.minglelabs.mingle.rn` — 바꾸면 스토어상 다른 앱이 되어 기존 사용자·리뷰·다운로드가 끊김
- 도메인 `minglelabs.app`, `translator.minglelabs.app` — 회사명이라 유지
- 폴더명(`mingle-app` 등), npm 패키지명, DB 스키마/테이블, 환경변수, Kotlin 패키지·클래스명(`MingleFirebaseMessagingService`) — 사용자에게 안 보이고 깨질 위험만 큼

## 남은 것 3: 스토어 메타데이터

- `mingle-app/rn/appstore-connect-info/appstore-connect-info.i18n.json` (Mingle 43곳), `google-play-console-info/google-play-console-info.i18n.json` (36곳)
- **Mingle 검색 유지**: 앱 이름은 `HashChat`, 부제(iOS subtitle 30자)·키워드(iOS keywords 100자)·Play 짧은 설명/전체 설명에 `Mingle`을 남긴다 (예: "HashChat - formerly Mingle", 키워드에 `mingle,밍글`). iOS는 이름·부제·키워드가 검색 인덱스, Play는 제목·설명 전문이 인덱스.
- PR #231 열린 항목: 2.2.0 릴리스 노트 미작성 → 리브랜딩 안내를 같이 넣기
- 스토어 스크린샷에 옛 로고/이름이 있으면 재촬영 (`scripts/ios-appstore-media.sh`)

## 진행 상황 (2026-10-16)

- 로고: 사용자가 준 최종 일러스트(`branding/hashchat/hashchat-original.png`)로 교체. 이전에 스크립트로 그린 로고는 `branding/hashchat/legacy-drawn/`. 아이콘 전체는 `python3 branding/hashchat/make-icons.py`로 다시 뽑는다 (iOS AppIcon·LaunchLogo, Android mipmap(라운드는 82% 축소 후 원형), Play 512, 웹 아이콘·파비콘). 스플래시 배경은 로고 배경색 `#FCC12F`로 맞춤
- 이름: 사용자에게 보이는 Mingle/밍글/ミングル/Мингл/मिंगल → HashChat 일괄 치환 완료 (앱·서버·네이티브·랜딩·법률문서·피드 시드·테스트). 회사명 `Mingle Labs`/밍글랩스, `X-Mingle-*` 헤더, 식별자, `@mingle_team` 핸들은 유지
- 금지어: 운영자 이름·핸들·소개와 예약 게시물 필터에 HashChat/해시챗/ハッシュチャット 추가 (기존 Mingle 유지)
- 스토어: 제목 `HashChat: …`, 부제·설명 첫 줄·키워드에 Mingle 유지, 2.2.0 릴리스 노트(리브랜딩 + 피드) 15개 언어 작성
- 테스트: `google-play-console-media-snapshots.test.ts`는 Play 동기화로 새 아이콘을 올리기 전까지 실패하는 게 정상 (스냅샷을 손으로 고치면 업로드가 건너뛰어짐). 나머지 실패 62개는 리브랜딩 전 커밋에서도 동일하게 실패

남은 것
- 스토어 스크린샷: 언어별로 새로 만듦(2026-10-16). 7장 × 15개 언어: 사진 피드, 다른 언어 글 번역, 댓글 번역, 3개 언어 대화, 검색, Hash Rush 2장. 각 언어 UI와 그 언어로 번역된 글·댓글을 헤드리스 Chrome으로 devbox에서 캡처(대화방만 `chat.json`으로 그림). 방법은 `mingle-app/rn/store-screenshots/README.md`. Hash Rush를 넣기 전에 출시하면 06·07을 빼야 함
- Play 그래픽 이미지(1024×500)와 웹·랜딩 og-image: 새 로고로 교체 완료 (`branding/hashchat/banner.py`)
- 피드 로그인 버그: posting-feed에서 수정 완료 (`feed-login-sheet.tsx`)
- 번역 버그: 수정함. 모델이 원문을 그대로 돌려주면 `ready`로 저장되던 문제. 이제 다시 요청하고, 그래도 원문이면 `failed`로 둠. 이미 저장된 복사본은 읽을 때 번역 없음으로 보고 다음 요청 때 새로 번역함 (`src/server/translation/untranslated-copy.ts`)
- Android adaptive icon 없음 (최신 기기에서 레거시 아이콘이 축소돼 보일 수 있음)
- prod DB: 공식 계정 표시 이름, 이미 올라간 시드 게시물 본문의 "Mingle"
- 실기기 홈 화면에서 아이콘 확인

## 남은 것 4: 코드 밖 (콘솔 작업)

- App Store Connect 앱 이름, Google Play Console 앱 이름
- Google OAuth 동의 화면 앱 이름·로고, Apple 로그인(Services ID) 표시 이름
- Firebase 프로젝트 표시 이름 (푸시 알림)
- 이메일 발신자 이름(쓰는 경우), SNS 계정, 랜딩 도메인 SEO(구글 서치 콘솔)
