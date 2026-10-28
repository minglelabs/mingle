# HashChat 리브랜딩 배포 체크리스트 (2.2.0과 함께)

`feat/posting-feed`(2.2.0)를 배포할 때 리브랜딩 때문에 추가로 해야 하는 일. 코드 작업은 모두 이 브랜치에 들어와 있다(PR #280, #282, #283, #284, #285). 아래는 코드 밖 작업과 확인 항목이다.
자세한 배경: `docs/hashchat-rebrand-handoff.md`, 스크린샷: `mingle-app/rn/store-screenshots/README.md`

## 1. 배포 전 결정·확인

- [ ] **Hash Rush가 앱에 들어갔는가?** 스토어 스크린샷 06·07이 Hash Rush 화면이다.
  - 못 넣고 배포하면: `mingle-app/rn/store-screenshots/captions.json`에서 `06-hash-rush`, `07-hash-rush-maps` 두 항목을 지우고 `python3 mingle-app/rn/store-screenshots/render.py` 실행(크롬 + `brew install pngquant` 필요). 업로드 폴더의 PNG가 5장으로 바뀐다.
- [ ] **실기기 홈 화면 아이콘 확인**: iPhone·Android에서 HashChat 이름과 햄스터 아이콘이 제대로 보이는지. 앱 이름이 홈 화면에 "HashChat"으로 나와야 한다.
- [ ] 릴리스 노트(2.2.0)는 이미 작성됨: 리브랜딩 안내 + 게시물 피드, 15개 언어(`appstore-connect-info.i18n.json` `whatsNew`, `google-play-console-info.i18n.json` `release.releaseNotes`). 2.2.0에 다른 기능이 더 들어가면 거기에 추가할 것.

## 2. 앱 빌드·제출 (평소 절차 + 리브랜딩 확인)

- [ ] iOS/Android 빌드는 평소 릴리스 절차대로. 아이콘·앱 이름·스플래시가 이미 코드에 들어 있으므로 따로 할 일 없음
  - iOS: `CFBundleDisplayName`/`CFBundleName` = HashChat, AppIcon, LaunchLogo(배경 `#FCC12F`)
  - Android: `app_name` = HashChat, `mipmap-*` 아이콘
- [ ] 번들 ID·패키지명(`com.minglelabs.mingle.rn`)은 **바꾸지 않는다**. 바꾸면 스토어에서 다른 앱이 된다.

## 3. 스토어 업로드

### App Store Connect
- [ ] 메타데이터(앱 이름 `HashChat: …`, 부제, 키워드, 설명, 홍보 문구, 릴리스 노트):
  ```bash
  scripts/devbox ios-appstore-sync-metadata --dry-run
  scripts/devbox ios-appstore-sync-metadata
  ```
- [ ] 스크린샷(언어별 7장, 1290×2796 = 6.9" 규격, iPhone 전용이라 iPad 불필요). 언어마다 실행, 기존 스크린샷은 덮어씀:
  ```bash
  for l in ar-SA de-DE en-US es-ES fr-CA fr-FR hi it ja ko pt-BR pt-PT ru th vi zh-Hans zh-Hant; do scripts/ios-appstore-upload.sh --locale "$l"; done
  ```
- [ ] 앱 아이콘은 빌드에 포함되어 올라감(별도 업로드 없음)

### Google Play Console
- [ ] 아이콘(512), 그래픽 이미지(1024×500), 스크린샷, 제목·짧은 설명·전체 설명, 릴리스 노트:
  ```bash
  node scripts/google-play-console-sync.mjs --dry-run
  node scripts/google-play-console-sync.mjs
  ```
  업로드하면 `google-play-console-info.i18n.json`의 `mediaSnapshots`가 갱신된다. 그 변경을 커밋할 것.
  그 전까지 `mingle-app/src/integration/google-play-console-media-snapshots.test.ts`는 **실패하는 게 정상**(손으로 스냅샷을 고치면 업로드가 건너뛰어진다).

## 4. 콘솔 작업 (코드로 못 하는 것)

- [ ] **Google OAuth 동의 화면**: 앱 이름 HashChat, 로고 교체(`branding/hashchat/hashchat.png`)
- [ ] **Apple 로그인**: Services ID 표시 이름 HashChat
- [ ] **Firebase** 프로젝트 표시 이름(푸시 알림에 보일 수 있음)
- [ ] (선택) SNS 계정, 이메일 발신자 이름, 랜딩 도메인 SEO(구글 서치 콘솔)

## 5. prod DB (Railway, `cd mingle-app && railway run …`)

주의: 공유 커넥션에 세션 단위 `SET`을 쓰지 말 것. 읽기는 `BEGIN READ ONLY`로 감싼다.

- [ ] **공식 계정 표시 이름**: `@mingle_team`의 이름 "Mingle 팀" → "HashChat 팀". 핸들은 그대로 둔다(바꾸면 시드 스크립트·기존 링크가 깨짐).
  ```sql
  -- 확인
  SELECT id, handle, name FROM app.app_users WHERE handle = 'mingle_team';
  -- 변경
  UPDATE app.app_users SET name = 'HashChat 팀', updated_at = now() WHERE handle = 'mingle_team';
  ```
- [ ] **이미 올라간 시드 게시물 2개의 본문**: 시드 스크립트는 이미 있는 게시물을 건너뛰므로(`skip-existing`) 자동으로 안 바뀐다. 본문 수정은 번역도 다시 만들어야 하므로 SQL 대신 **앱/어드민의 게시물 수정**으로 고칠 것(수정하면 번역이 다시 생성됨).
  - `mingleseed-v1-001` (ko): "안녕하세요, Mingle 팀입니다. …" → "안녕하세요, HashChat 팀입니다. …"
  - `mingleseed-v2-040` (en): "Mingle friends, which Korean expression …" → "HashChat friends, which Korean expression …"
  - 새 문구는 `mingle-app/content/feed-seed/posts.v1.json`, `posts.v2.json`에 있다.
  ```sql
  -- 대상 확인(읽기 전용). 시드 게시물은 id가 곧 clientPostId다.
  BEGIN READ ONLY;
  SELECT id, body_version, left(source_text, 60) FROM app.app_posts
   WHERE id IN ('mingleseed-v1-001', 'mingleseed-v2-040');
  COMMIT;
  ```
- [ ] 원문 그대로 저장된 잘못된 번역 행은 따로 정리할 필요 없음: PR #283 이후 읽을 때 "번역 없음"으로 보고 다음 요청 때 새로 번역한다.

## 6. 배포 후 확인

- [ ] App Store / Play 스토어 페이지에서 이름 "HashChat", 아이콘, 스크린샷이 언어별로 바뀌었는지
- [ ] "Mingle"로 검색해도 나오는지(부제·키워드·설명에 Mingle을 남겨 둠)
- [ ] 앱 첫 실행: 스플래시, 로그인 화면 "HashChat", 권한 안내 문구
- [ ] 웹: `translator.minglelabs.app` 탭 제목·파비콘·링크 미리보기(og-image)
- [ ] 푸시 알림 제목/채널 이름(Android "HashChat notifications")

## 바꾸지 않는 것 (실수로 바꾸지 말 것)

- 회사명 Mingle Labs / 밍글랩스, 도메인 `minglelabs.app`
- 번들 ID·패키지명, 폴더명, npm 패키지명, DB 스키마, 환경변수, Kotlin 클래스명, `X-Mingle-*` 헤더, `@mingle_team` 핸들
