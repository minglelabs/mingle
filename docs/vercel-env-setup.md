# Vercel Environment Setup (Namespace)

아래 값은 Vercel 대시보드 또는 CLI에서 프로젝트별로 등록합니다.

## mingle-app

- Preview/Production (legacy web app):
  - `NEXT_PUBLIC_API_NAMESPACE=`
- iOS client version policy:
  - `IOS_CLIENT_MIN_SUPPORTED_VERSION`
  - `IOS_CLIENT_RECOMMENDED_BELOW_VERSION`
  - `IOS_CLIENT_LATEST_VERSION`
  - `IOS_APPSTORE_URL`
- Android client version policy:
  - `ANDROID_CLIENT_MIN_SUPPORTED_VERSION`
  - `ANDROID_CLIENT_RECOMMENDED_BELOW_VERSION`
  - `ANDROID_CLIENT_LATEST_VERSION`
  - `ANDROID_PLAYSTORE_URL`

## mingle-landing

- Preview/Production:
  - `NEXT_PUBLIC_API_NAMESPACE=web/landing/v1`

## RN 앱 릴리즈

RN은 WebView URL에 query로 namespace를 주입합니다.

- iOS build env:
  - `NEXT_PUBLIC_API_NAMESPACE=ios/v1.0.3`
- Android build env:
  - `NEXT_PUBLIC_API_NAMESPACE=android/v1.0.3`

## Optional CLI pattern

```bash
# 프로젝트 연결 후
vercel env add NEXT_PUBLIC_API_NAMESPACE production
vercel env add NEXT_PUBLIC_API_NAMESPACE preview
```
