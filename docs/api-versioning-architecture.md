# API/Frontend Versioning Architecture

## Rules

1. 플랫폼/버전 분기는 URL로만 합니다.
2. 컨트롤러는 URL 스코프별로 파일을 분리합니다.
3. 공통 로직은 handler 모듈을 공유합니다.
4. 현재 단계는 `legacy + iOS v1.0.3 + Android v1.0.3`를 운영합니다.

## Supported Namespaces (2026-10-30~)

아래 "Current Phase" 이하 섹션은 v1.0.3 시절 기록입니다. 현재 기준은 이 섹션이 우선합니다.

- 라우트 트리가 있는 버전 namespace는 `ios/v2.2.0`, `android/v2.2.0` 뿐입니다.
- `v2.2.1`, `v2.3.0`은 `mingle-app/next.config.mjs` rewrite로 v2.2.0 트리를 씁니다.
- 2.2.0 미만(`v1.x`, `v2.0.x`, `v2.1.x`) 앱은 강제 업데이트 대상입니다. 이 버전들의 라우트 트리는 삭제했고,
  `/api/{ios|android}/{v1.x.y|v2.0.x|v2.1.x}/client/version-policy` 만 rewrite로 v2.2.0 핸들러에 연결됩니다.
  - 판정은 URL이 아니라 요청 body의 `clientVersion`과 `*_CLIENT_MIN_SUPPORTED_VERSION`으로 하므로 응답은 `force_update`입니다.
  - 그 외 2.2.0 미만 경로는 의도적으로 404입니다. 무버전 경로로 fallback 하지 않습니다.
  - 전제: 운영 env `IOS_CLIENT_MIN_SUPPORTED_VERSION`, `ANDROID_CLIENT_MIN_SUPPORTED_VERSION` 이 `2.2.0` 이상이어야 합니다.
- v2.2.0 라우트는 다른 버전 namespace 라우트를 re-export 하지 않습니다. 무버전 핸들러를 re-export 하거나,
  예전부터 플랫폼 컨트롤러(`controllers/{ios,android}/v1.1.4/*`)에 고정된 라우트는 그 연결을 파일 안에 직접 둡니다.
  가드: `src/app/api/namespace-reexport.v2_2_0.guard.test.ts`, `src/app/api/v2-2.namespace-routing.test.ts`,
  rewrite 검증: `src/app/api/namespace-routing.contract.test.ts`.

## URL Contract (Current Phase)

- Legacy (무버전): `/api/{existing-path}`
- iOS versioned: `/api/ios/v1.0.3/{existing-path}`
- Android versioned: `/api/android/v1.0.3/{existing-path}`

현재 `existing-path`:

- `translate/finalize`
- `tts/inworld`
- `log/client-event`
- `client/version-policy` (iOS 앱 시작 시 버전 정책 확인)

## Controller Separation

- Legacy controllers:
  - `mingle-app/src/server/api/controllers/legacy/*`
- iOS v1.0.3 controllers:
  - `mingle-app/src/server/api/controllers/ios/v1.0.3/*`
- Android v1.0.3 controllers:
  - `mingle-app/src/server/api/controllers/android/v1.0.3/*`
- Shared handlers:
  - `mingle-app/src/server/api/handlers/v1/*`

iOS/Android v1.0.3 컨트롤러는 legacy 컨트롤러와 동일 코드를 사용합니다.

## Frontend Routing Strategy

- 기본값: `NEXT_PUBLIC_API_NAMESPACE=''` (legacy 경로 호출)
- iOS versioned 호출: `NEXT_PUBLIC_API_NAMESPACE=ios/v1.0.3`
- Android versioned 호출: `NEXT_PUBLIC_API_NAMESPACE=android/v1.0.3`
- URL query override: `apiNamespace` 또는 `apiNs`
  - 허용값: `''`, `ios/v1.0.0`, `android/v1.0.0`, `ios/v1.0.3`, `android/v1.0.3`
  - 그 외 값은 무시

클라이언트는 `buildClientApiPath`로만 API 경로를 생성합니다.

## iOS Client Version Policy

- iOS 앱 시작 시 `POST /api/ios/v1.0.3/client/version-policy` 호출
- 요청: `clientVersion`(`x.y.z`), `clientBuild`
- 응답 `action`:
  - `force_update`
  - `recommend_update`
  - `none`
- 서버 환경변수:
  - `IOS_CLIENT_MIN_SUPPORTED_VERSION`
  - `IOS_CLIENT_RECOMMENDED_BELOW_VERSION`
  - `IOS_CLIENT_LATEST_VERSION`
  - `IOS_APPSTORE_URL` (recommended: `https://apps.apple.com/app/id6759795134`)
- 안전 폴백:
  - `IOS_CLIENT_MIN_SUPPORTED_VERSION` 미설정 또는 invalid semver 시 `force_update`로 fail-closed

## Android Client Version Policy

- Android 앱 시작 시 `POST /api/android/v1.0.3/client/version-policy` 호출
- 요청: `clientVersion`(`x.y.z`), `clientBuild`, `platform='android'`
- 응답 `action`:
  - `force_update`
  - `recommend_update`
  - `none`
- 서버 환경변수:
  - `ANDROID_CLIENT_MIN_SUPPORTED_VERSION`
  - `ANDROID_CLIENT_RECOMMENDED_BELOW_VERSION`
  - `ANDROID_CLIENT_LATEST_VERSION`
  - `ANDROID_PLAYSTORE_URL` (recommended: `https://play.google.com/store/apps/details?id=com.minglelabs.mingle.rn`)
- 안전 폴백:
  - Android env가 비어 있으면 iOS env로 fallback
  - fallback 이후에도 min version env가 없거나 invalid semver면 `force_update`
