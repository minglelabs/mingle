# API/Frontend Versioning Architecture

## Rules

1. 플랫폼/버전 분기는 URL로만 합니다.
2. 컨트롤러는 URL 스코프별로 파일을 분리합니다.
3. 공통 로직은 handler 모듈을 공유합니다.
4. 현재 단계는 `legacy + iOS v1.0.3 + Android v1.0.3`를 운영합니다.

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
