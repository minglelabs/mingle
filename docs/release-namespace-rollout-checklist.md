# Release Namespace Rollout Checklist

## 0) 현재 지원 범위 (2026-10-30~)

- 라우트 트리: `ios/v2.2.0`, `android/v2.2.0` 만 존재. `v2.2.1`, `v2.3.0`은 rewrite alias.
- 2.2.0 미만 앱: `client/version-policy` 만 v2.2.0으로 rewrite(강제 업데이트 응답), 나머지는 404.
- 새 패치 버전 출시: `next.config.mjs`에 v2.2.0 alias 추가.
- 새 계약 버전 출시: 새 트리를 만들 때 이전 트리를 re-export 하지 말고 무버전 핸들러/컨트롤러를 직접 연결.
- 어떤 버전을 지원 종료할 때: 먼저 운영 `*_CLIENT_MIN_SUPPORTED_VERSION`을 올리고 force_update 응답을 확인한 뒤
  라우트를 지웁니다. env만 되돌리고 코드를 그대로 두면 구버전 앱이 404를 받습니다.

## 1) Environment Matrix

| Target | API prefix | Required Env |
|---|---|---|
| Web App (legacy) | `/api/{path}` | `NEXT_PUBLIC_API_NAMESPACE=` |
| iOS App (versioned) | `/api/ios/v1.0.3/{path}` | `NEXT_PUBLIC_API_NAMESPACE=ios/v1.0.3` |
| Android App (versioned) | `/api/android/v1.0.3/{path}` | `NEXT_PUBLIC_API_NAMESPACE=android/v1.0.3` |

Server version policy env:

- `IOS_CLIENT_MIN_SUPPORTED_VERSION`
- `IOS_CLIENT_RECOMMENDED_BELOW_VERSION`
- `IOS_CLIENT_LATEST_VERSION`
- `IOS_APPSTORE_URL` (`https://apps.apple.com/app/id6759795134`)
- `ANDROID_CLIENT_MIN_SUPPORTED_VERSION`
- `ANDROID_CLIENT_RECOMMENDED_BELOW_VERSION`
- `ANDROID_CLIENT_LATEST_VERSION`
- `ANDROID_PLAYSTORE_URL` (`https://play.google.com/store/apps/details?id=com.minglelabs.mingle.rn`)

## 2) Build Commands

```bash
pnpm --dir mingle-app build:release:web
pnpm --dir mingle-app build:release:ios
pnpm --dir mingle-app build:release:android
```

## 3) Runtime URL Contract

- 클라이언트는 `/api/{namespace?}/{path}` 형식으로 호출합니다.
- URL query override:
  - `apiNamespace` 또는 `apiNs`
  - allow-list: `''`, `ios/v1.0.0`, `android/v1.0.0`, `ios/v1.0.3`, `android/v1.0.3`
  - 예: `?apiNamespace=android/v1.0.3`

## 4) Legacy + Mobile v1.0.3 Policy

- legacy 무버전 경로는 현재 유지합니다.
- iOS versioned 경로(`/api/ios/v1.0.3/*`)는 legacy와 동일 로직을 사용합니다.
- Android versioned 경로(`/api/android/v1.0.3/*`)도 legacy와 동일 로직을 사용합니다.

## 5) Contract Test Coverage

- `src/lib/api-contract.test.ts`
- `src/lib/rn-api-namespace.test.ts`
- `src/app/api/namespace-routing.contract.test.ts`
- `src/app/api/client/version-policy/route.test.ts`
