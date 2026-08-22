# Worktree Devbox Automation

브랜치/워크트리마다 로컬 테스트 환경을 분리해 쓰기 위한 자동화 가이드입니다.

## 목적

- 워크트리별 포트 충돌 방지
- `mingle-app` + `mingle-stt` + `mingle-messaging` 동시 실행 단일 명령 제공
- PC웹/iOS웹/안드웹/iOS앱/안드앱 테스트 URL/WS 자동 동기화
- 디바이스 테스트용 ngrok 상시 지원
- live 테스트(`pnpm test:live`) 포트 자동 주입 (`devbox test`는 기본 비활성)
> `mingle-ios` 프로젝트는 제거되었습니다. 현재 iOS 자동화는 RN 앱 기준으로만 동작합니다.

## 메인 루트 `.env.local`에 둘 값

아래 값은 워크트리마다 달라지지 않는 공통값입니다. `/Users/nam/mingle/.env.local`에 한 번만 두고,
`.devbox.env`에는 넣지 않습니다.

```dotenv
DEVBOX_CLOUDFLARE_TUNNEL_TOKEN=...
DEVBOX_CLOUDFLARE_WEB_HOSTNAME=mingle-app-devbox.photo-for-passport.com
DEVBOX_CLOUDFLARE_STT_HOSTNAME=mingle-stt-devbox.photo-for-passport.com
DEVBOX_CLOUDFLARE_MESSAGING_HOSTNAME=mingle-messaging-devbox.photo-for-passport.com
# Keep this only when Cloudflare should be the default device tunnel provider.
DEVBOX_TUNNEL_PROVIDER=cloudflare
DEVBOX_IOS_TEAM_ID=3RFBMN8TKZ
RN_ADMOB_APP_ID_IOS=ca-app-pub-7057041881494735~7844963551
RN_ADMOB_APP_ID_ANDROID=ca-app-pub-7057041881494735~1471126891
RN_ADMOB_BANNER_UNIT_ID_IOS=ca-app-pub-7057041881494735/3768106846
RN_ADMOB_BANNER_UNIT_ID_ANDROID=ca-app-pub-7057041881494735/6522262692
MINGLE_REALTIME_SECRET=...
```

Google OAuth redirect URI 자동 동기화를 사용할 때만 아래 두 값도 추가합니다.

```dotenv
DEVBOX_GOOGLE_CLOUD_PROJECT=mingle-486707
DEVBOX_GOOGLE_REDIRECT_SYNC_ENABLED=true
```

고정 ngrok 도메인을 계속 사용할 때만 `DEVBOX_NGROK_WEB_DOMAIN`도 이 목록에 추가합니다.
Cloudflare named tunnel만 사용한다면 추가하지 않습니다.

`VAULT_ADDR`는 현재처럼 `.zshrc`에서 export해도 됩니다. devbox는 이미 export된 값을 우선 사용합니다.
`VAULT_NAMESPACE`는 사용하는 Vault가 namespace를 요구할 때만 추가합니다. `VAULT_TOKEN`은 파일에
넣지 말고 `vault login`으로 로컬 Vault CLI 세션에 저장합니다. `MINGLE_REALTIME_SECRET`처럼
세 서비스가 공유하는 secret도 루트 env로 옮길 수 있으며, bootstrap이 같은 Vault path에 업로드합니다.

워크트리별 `DEVBOX_WORKTREE_NAME`, 포트, 현재 tunnel URL, `NEXT_PUBLIC_*`/`MINGLE_TEST_*` URL은
각 워크트리의 `.devbox.env`에만 남깁니다. 앱/STT/messaging 전용 API key와 DB/auth secret은
기존 서비스 env에 남겨도 bootstrap이 하나의 `secret/mingle/dev`에 합쳐 올립니다. 루트 env로
옮기기로 한 값은 원본 서비스 env에서 삭제해 중복을 없애면 됩니다.

## Vault 초기 설정

개발용 세 서비스는 하나의 KV record를 사용합니다.

```bash
cd /Users/nam/.codex/worktrees/mingle/pr-206-device-test-rebased
vault login
scripts/devbox bootstrap --vault-path secret/mingle/dev
scripts/devbox status
```

`bootstrap`은 루트 공통 env와 세 서비스 env의 비관리 키를 읽어 `secret/mingle/dev`에
안전하게 patch합니다. record가 없으면 최초 1회만 `kv put`으로 만들고, 기존 record는 `kv patch`만
사용합니다. 운영 모바일 URL을 사용하는 경우에는 `secret/mingle/prod`를 별도로 준비합니다.
두 경로 모두 기본값이 내장되어 있으므로 `DEVBOX_VAULT_PATH`와
`DEVBOX_VAULT_PROD_PATH`를 env에 넣지 않아도 됩니다.

## 빠른 시작

```bash
# 1) 워크트리에서 1회 초기화
scripts/devbox init

# 2) 메인 워크트리 루트 공통값과 서비스 env를 Vault에 반영 + 의존성 설치
scripts/devbox bootstrap

# 2-b) (선택) 공통 Vault 경로 지정
scripts/devbox bootstrap \
  --vault-path secret/mingle/dev

# 2-c) `--vault-push`는 이전 호환성을 위해 남아 있지만 이제 생략해도 됩니다.

# 3) 현재 상태 확인
scripts/devbox status

# 4) 로컬 프로필로 서버 실행 (mingle-app + mingle-stt + mingle-messaging)
scripts/devbox up --profile local

# 5) 디바이스 프로필로 서버+ngrok 실행
scripts/devbox up --profile device

# 5-a) (선택) ngrok 한도 초과 시 cloudflare quick tunnel 사용
scripts/devbox up --profile device --tunnel-provider cloudflare

# 5-a-1) (선택) cloudflare named tunnel(고정 호스트) 사용
# 메인 워크트리 루트 .env.local에 token/hostname을 저장한 뒤
# `scripts/devbox bootstrap`으로 Vault에도 반영합니다.
scripts/devbox up --profile device --tunnel-provider cloudflare

# 5-b) 디바이스 앱 빌드 URL을 Vault dev/prod로 선택
scripts/devbox up --profile device --device-app-env dev
scripts/devbox up --profile device --device-app-env prod

# 6) (선택) 연결된 테스트폰 앱 빌드/설치
scripts/devbox mobile --platform all
# Appium QA용 앱이면 QA bridge까지 포함
scripts/devbox mobile --platform all --qa-bridge

# 7) (선택) 서버+모바일 설치를 한 번에
scripts/devbox up --profile device --with-mobile-install

# 8) (선택) iOS만 설치
scripts/devbox up --profile device --with-ios-install
# Appium QA용 iOS Debug 앱이면
scripts/devbox up --profile device --with-ios-install --qa-bridge

# 8-1) (선택) 기존 iOS 앱 삭제 후 재설치
scripts/devbox up --profile device --with-ios-install --with-ios-clean-install

# 9) (선택) RN iOS App Store/TestFlight용 ipa 생성
scripts/devbox ios-rn-ipa --device-app-env prod
scripts/devbox ios-rn-ipa-prod

# 10) (선택) 전체 로그를 파일로 저장
scripts/devbox --log-file auto up --profile device --with-ios-install

# 11) (선택) 테스트 실행
scripts/devbox test --target app
# live STT 통합테스트는 명시적으로만 실행
# scripts/devbox test --target app --with-live

# 11-a) (선택) 모바일 UI QA 실행
scripts/devbox qa --contracts
scripts/devbox qa --platform ios --ios-udid <IOS_UDID>
scripts/devbox qa --ios-regressions --ios-real-udid <IOS_REAL_UDID> --ios-sim-udid <IOS_SIM_UDID>
scripts/devbox qa --android-regressions --android-serial <ANDROID_SERIAL>

# 12) (권장) 로컬 서버 + RN iOS 클린 재설치 한 번에
scripts/devbox up --profile local --with-ios-install --with-ios-clean-install
```

## 재부팅 후 실행 순서 (Codex 전달용)

아래 순서대로 실행하면 됩니다. (`.devbox.env`가 이미 있는 기준)

### A) 로컬 개발(ngrok 없이)

```bash
cd /Users/nam/.codex/worktrees/5387/mingle
git checkout <브랜치>

# Vault 세션이 만료된 경우만
vault login

# 의존성/환경 복구 (안전하게 항상 실행 가능)
scripts/devbox bootstrap

# OpenClaw gateway가 필요하면 (별도 터미널)
scripts/devbox gateway --mode dev

# mingle-stt + mingle-messaging + mingle-app 실행
scripts/devbox up --profile local
```

### B) 실기기 전체(앱 재설치 + ngrok + 서버 3개)

```bash
cd /Users/nam/.codex/worktrees/5387/mingle
git checkout <브랜치>

# Vault 세션이 만료된 경우만
vault login

scripts/devbox bootstrap
scripts/devbox up --profile device --with-ios-install --with-ios-clean-install
# ngrok 한도 이슈가 있으면
# scripts/devbox up --profile device --tunnel-provider cloudflare --with-ios-install --with-ios-clean-install
# cloudflare named tunnel(고정 호스트)은 메인 워크트리 루트
# .env.local의 token/hostname을 사용합니다.
```

### C) 메인 워크트리 루트 `.env.local` 값을 Vault에 다시 반영해야 할 때

```bash
scripts/devbox vault-up --seed
scripts/devbox bootstrap
```

노트:
- `.devbox.env`가 없으면 `scripts/devbox up ...`이 `init`을 자동 실행합니다.
- Vault CLI 환경(`VAULT_ADDR`, `VAULT_NAMESPACE`)은 메인 워크트리 루트
  `.env.local`에 두면 자동 참조됩니다. 기존 서비스 env 파일도 fallback으로 읽습니다.

## 주요 명령

- `scripts/devbox init`
  - `.devbox.env` 생성
  - git worktree 목록 기준으로 다른 워크트리의 `.devbox.env`를 읽어 이미 할당된 포트를 회피해 기본 포트 자동 선택
    (`web/stt/messaging/metro` + `ngrok inspector`)
  - 현재 워크트리 경로 해시를 기준으로 기본 포트 슬롯을 안정적으로 선택하고, 충돌 시 다음 슬롯으로 이동
  - `.devbox.env`에는 현재 워크트리의 포트/URL/profile 같은 파생 실행값만 기록
  - Cloudflare token/hostname, 필요할 때만 지정하는 fallback URL override, AdMob ID, Vault 경로, Team ID 같은 공유값은
    메인 워크트리 루트 `.env.local`과 Vault에서 읽음
  - `ngrok.mobile.local.yml` 생성
  - RN 워크스페이스 의존성(`mingle-app/rn`) 자동 설치/점검
  - iOS Pods 상태(`Podfile.lock` vs `Pods/Manifest.lock`) 자동 점검 후
    불일치/누락 시 `pod install` 자동 동기화
  - 공통 Vault 경로 기본값은 `secret/mingle/dev`이며, 필요할 때만 메인 루트 `.env.local`의
    `DEVBOX_VAULT_PATH` 또는 `--vault-path`로 변경

- `scripts/devbox bootstrap`
  - `.env.local`은 수정하지 않고, 메인 워크트리 루트 `.env.local`의 공통값과
    `mingle-app`/`mingle-stt`/`mingle-messaging` env의 서비스값을 하나의 Vault path에 업로드
  - `mingle-app`, `mingle-stt`, `mingle-messaging` 의존성(`pnpm install`) 자동 설치
  - `mingle-app/rn` 의존성(`pnpm install`) 자동 설치
  - iOS Pods 상태(`Podfile.lock` vs `Pods/Manifest.lock`) 자동 점검 후
    불일치/누락 시 `pod install` 자동 동기화
  - `mingle-app/node_modules/.prisma/client` 생성물이 없으면 `db:generate` 자동 실행
  - `--vault-path <path>`로 이번 실행에서 사용할 공통 Vault 경로를 지정
  - `--vault-push`는 이전 호환성을 위한 no-op이며, bootstrap이 항상 메인 루트 공통값과
    세 서비스 env의 비관리 키를 하나의 Vault 경로로 업로드
    - Vault 경로가 비어 있으면 안전하게 최초 1회 `kv put`으로 생성
    - Vault 경로가 이미 있으면 계속 `kv patch`만 사용하고 파괴적 fallback은 거부

- `scripts/devbox vault-up [--seed]`
  - Homebrew `vault` 서비스를 시작
  - `--seed`를 주면 메인 워크트리 루트 `.env.local` 공통값과 세 서비스 env의 비관리 키를
    `secret/mingle/dev`에 즉시 반영
  - 재부팅 후 로컬 Vault가 내려갔을 때 복구용으로 사용

- `scripts/devbox profile --profile local --host <LAN_IP>`
  - 같은 네트워크에서 실기기 직접 접속할 때 사용
  - `NEXT_PUBLIC_WS_URL`를 빈 값으로 두고 host+port 조합을 사용

- `scripts/devbox profile --profile device`
  - 현재 워크트리 ngrok inspector(`DEVBOX_NGROK_API_PORT`)에서 `devbox_web`, `devbox_stt`, `devbox_messaging` 터널 URL을 읽어
    `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_MESSAGING_WS_URL`에 반영
  - 현재 워크트리 포트와 `config.addr`가 일치하고 `https/wss`인 터널만 허용

- `scripts/devbox gateway --mode dev|run`
  - 기본 OpenClaw 루트(`/Users/nam/openclaw`)에서 gateway 실행
  - `--openclaw-root <PATH>`로 루트 변경 가능
  - `--mode dev`: `pnpm gateway:dev`
  - `--mode run -- --bind loopback --port 18789`: `openclaw gateway run` 인자 전달

- `scripts/devbox up --profile device --device-app-env dev|prod`
  - 모바일 앱 빌드 URL을
    `secret/mingle/dev` 또는 `secret/mingle/prod`에서 직접 읽어 주입
    - 기준 키: `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_WS_URL`
    - fallback(마이그레이션 호환): `MINGLE_API_BASE_URL`, `RN_WEB_APP_BASE_URL`, `MINGLE_WEB_APP_BASE_URL`, `MINGLE_WS_URL`, `RN_DEFAULT_WS_URL`, `MINGLE_DEFAULT_WS_URL`
    - 장애 fallback 키: `MINGLE_API_FALLBACK_SITE_URL`, `MINGLE_STT_FALLBACK_WS_URL`
  - `--device-app-env prod`면 ngrok 및 로컬 서버(mingle-app/mingle-stt/mingle-messaging) 기동을 생략
  - `--device-app-env dev`면 기존 device(ngrok) 흐름을 그대로 사용

- `scripts/devbox up --profile local|device`
  - `.devbox.env`가 없으면 `init`을 자동 실행(1커맨드 온보딩)
  - 의존성 설치를 자동 수행(Prisma client 누락 시 `db:generate` 포함)
  - `up`은 `.env.local` 자동 업로드/동기화를 수행하지 않음
  - 저장된 Vault 경로가 있으면 비관리 키(API key 등)를
    서버 프로세스 환경변수로 런타임 주입(파일 미기록)
  - `.env.local` 갱신은 devbox가 수행하지 않음(수동 편집 원칙)
  - `mingle-stt` + `mingle-messaging` + `mingle-app` 동시 실행
  - 기본 web dev server는 `next dev`(Turbopack)으로 실행
    - webpack 동작 확인이 필요하면 `DEVBOX_NEXT_DEV_BUNDLER=webpack`을 붙여 `next dev --webpack`으로 실행 가능
  - `device` 프로필에서 ngrok이 없으면 iTerm/Terminal에 별도 탭/패널로 ngrok 실행 시도
    (실패 시 기존 인라인 실행으로 폴백)
  - `--with-ios-install`, `--with-android-install`, `--with-mobile-install`, `--with-ios-clean-install` 옵션으로
    연결된 테스트폰 앱 빌드/설치를 함께 수행
  - Appium QA용 설치일 때는 `--qa-bridge`를 추가해 QA bridge가 켜진 Debug 앱을 설치
  - 연결된/설치 가능한 기기가 없으면 해당 플랫폼 설치 단계는 자동 스킵
  - `--with-ios-clean-install`은 기존 iOS 앱 번들을 삭제한 뒤 재설치합니다.
  - `--profile device`면 ngrok이 없을 경우 함께 기동 후 터널 URL을 자동 반영
  - 이미 떠 있는 ngrok 터널이 다른 포트/프로토콜이면 즉시 실패(오접속 방지)
  - `--with-metro`를 추가하면 RN Metro도 함께 실행
  - `scripts/devbox --log-file <path|auto> up ...` 형식으로 실행하면
    devbox 전체 stdout/stderr를 로그 파일로 저장
    - 상대 경로는 저장소 루트 기준
    - `auto`는 `.devbox-logs/devbox-<worktree>-<timestamp>.log` 자동 생성
    - ngrok이 별도 탭/패널에서 실행되면 ngrok 로그는 해당 탭/패널에서 확인

- `scripts/devbox mobile --platform ios|android|all`
  - 실행 시작 시 `.devbox.env`의 현재 프로필(local/device)을 다시 적용해
    최신 URL/WS 값을 먼저 재동기화한 뒤 빌드/설치를 수행
    (device 프로필은 ngrok inspector에서 최신 터널 URL 재조회)
  - `--device-app-env dev|prod`를 주면 앱 빌드 URL만 Vault 경로에서 덮어씁니다.
  - RN iOS/Android는 devbox URL(`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_WS_URL`) 기준으로
    빌드/설치를 수행
  - `--ios-udid`, `--android-serial`로 대상 기기 지정 가능
  - `--ios-configuration Debug|Release` (기본 Release)
  - `--android-variant debug|release` (기본 release)
  - `--qa-bridge`를 주면 Appium QA용 bridge/query param 경로가 켜진 앱을 설치
  - `--with-ios-clean-install`은 RN iOS 설치 전에 기존 앱을 먼저 삭제
  - 연결 기기 미탐지 시 자동 스킵

- `scripts/devbox ios-rn-ipa`
  - RN iOS 앱을 `.xcarchive`/`.ipa`로 생성 (App Store/TestFlight 업로드 준비)
  - `.devbox.env` 없이도 실행 가능 (권장: `--device-app-env prod` 또는 `--site-url/--ws-url` 명시)
  - URL 조회 우선순위: `--device-app-env/--site-url` > 워크트리 `.devbox.env` > 메인 `.env.local`/Vault
  - 기본값: `Release`, `export-method=app-store`
  - Team ID 우선순위: `--team-id` > `DEVBOX_IOS_TEAM_ID`(메인 `.env.local`/Vault) > `mingle.xcodeproj`의 `DEVELOPMENT_TEAM`
  - `--device-app-env prod`로 `secret/mingle/prod` URL/WS를 주입
  - `--site-url`, `--ws-url`로 런타임 URL 수동 오버라이드 가능
  - `--archive-path`, `--export-path`, `--export-options-plist` 커스텀 경로 지원
  - `--skip-export`는 archive까지만 생성, `--dry-run`은 명령만 출력
  - `scripts/devbox ios-rn-ipa-prod`는 `--device-app-env prod`를 기본 적용한 별칭

- `scripts/devbox test --target app [--with-live]`
  - `app` 기본값: 현재 devbox 설정값으로 `mingle-app` unit test 실행
  - `app --with-live`: 현재 devbox 설정값으로 `mingle-app` live integration test 실행

- `scripts/devbox qa [--platform ios|android|all] [--contracts] [--ios-regressions] [--android-regressions]`
  - `pnpm test:qa:ui*`를 devbox 래퍼로 실행
  - 현재 devbox URL/WS/test endpoint와 QA용 UDID/serial env를 함께 주입
  - 예시
    - `scripts/devbox qa --contracts`
    - `scripts/devbox qa --platform ios --ios-udid <IOS_UDID>`
    - `scripts/devbox qa --ios-regressions --ios-real-udid <IOS_REAL_UDID> --ios-sim-udid <IOS_SIM_UDID>`
    - `scripts/devbox qa --android-regressions --android-serial <ANDROID_SERIAL>`
  - 주의: 이 명령은 서버/터널을 대신 띄우지 않으므로, 먼저 `scripts/devbox up ...` 또는 `scripts/devbox mobile ... --qa-bridge`로 환경을 준비해야 함

## ngrok 연동

`scripts/ngrok-start-mobile.sh`는 아래 우선순위로 설정 파일을 선택합니다.

1. `ngrok.mobile.local.yml` (devbox 생성 파일)
2. `ngrok.mobile.yml` (기본 저장소 파일)

즉 `scripts/devbox init` 후에는 워크트리별 포트 기준으로 ngrok이 바로 동작합니다.
또한 inspector 포트도 워크트리별로 분리되어(`DEVBOX_NGROK_API_PORT`) 충돌 가능성을 줄입니다.

## ngrok Free 플랜 참고

- `device` 프로필은 워크트리당 ngrok endpoint 3개(`devbox_web`, `devbox_stt`, `devbox_messaging`)를 사용합니다.
- ngrok Free 한도는 계정 생성 시점/플랜 정책에 따라 `online endpoint`가 1~3으로 다를 수 있습니다.
- 따라서 단일 계정 Free 플랜에서는 `device` 프로필 워크트리 2개 동시(총 endpoint 4개)가
  제한에 걸릴 가능성이 높습니다. (정확 한도는 ngrok 대시보드에서 확인)

## 생성/수정 파일

- `.devbox.env`
- 메인 워크트리 루트 `.env.local` (공통값, devbox는 읽기/참조만 함)
- 메인 워크트리의 `mingle-app/.env.local` / `mingle-stt/.env.local` /
  `mingle-messaging/.env.local` (서비스값, devbox는 읽기/참조만 함)
- `ngrok.mobile.local.yml`
- `.devbox-logs/` (`--log-file` 사용 시 생성, gitignore)

## Vault 사용 전제

- `vault` CLI와 `jq`가 로컬에 설치되어 있어야 합니다.
- `vault login` 등으로 인증이 선행되어야 합니다.
- `VAULT_ADDR`/`VAULT_NAMESPACE`는 메인 워크트리 루트 `.env.local`에 둘 수 있습니다.
- devbox는 Vault 값을 `.env.local`에 자동 반영하지 않습니다(런타임 주입만 수행).
- `scripts/devbox bootstrap`과 `scripts/devbox vault-up --seed`는 메인 워크트리 루트
  `.env.local`의 공통값과 서비스 env의 비관리 키를 읽어 Vault로 업로드합니다.
- `--vault-push`는 이전 호환성을 위한 no-op입니다.
- Homebrew 로컬 Vault를 다시 올릴 때는 `scripts/devbox vault-up` 또는
  `brew services start hashicorp/tap/vault`를 사용할 수 있습니다.
