# Google Play Console Info Workspace

`mingle-app/rn/google-play-console-info` is the local workspace for Google Play Console metadata and localized copy.

## Directory layout

- `upload/<locale>/`: temporary Play asset workspace, currently mirrored from iOS upload assets
- `assets/`: Play-specific shared graphics
  - `icon-512.png`: Play hi-res icon used by the upload sync script
  - `feature-graphic.png`: 1024x500 Play feature graphic used by the upload sync script
- `google-play-console-info.i18n.json`: prepared source file for Play Console metadata
  - `googlePlay.release`: default release track, release status, notes, and screenshot copy
  - `googlePlay.appDetails`: package name, default language, and Play contact details
  - `googlePlay.assets`: relative paths for Play listing graphics
  - `googlePlay.storeListing`: localized title, short description, and full description
  - `googlePlay.manualOnly`: console-only items that must still be filled manually, including the foreground service disclosure copy for microphone capture

## Default behavior

- `upload/` is currently a direct copy of `rn/appstore-connect-info/upload/`.
- `scripts/google-play-console-sync.mjs` reads `google-play-console-info.i18n.json` and uploads Play app details, store listing text, icon, and phone screenshots from this workspace.
- Google Play credentials default to `.credentials/google-play/service-account.json`, and Android upload signing defaults to `.credentials/android/`.

## Quick commands

```bash
scripts/google-play-console-sync.mjs --dry-run
scripts/google-play-console-sync.mjs --service-account-json /path/to/service-account.json --validate-only
scripts/google-play-console-sync.mjs --service-account-json /path/to/service-account.json
scripts/google-play-console-deploy.mjs --dry-run
scripts/google-play-console-deploy.mjs --service-account-json /path/to/service-account.json --build --validate-only
scripts/google-play-console-deploy.mjs --service-account-json /path/to/service-account.json --build
```

## Prerequisites

- The Play app entry must already exist for the configured package name.
- Google only allows the Publishing API on an existing app that already has at least one APK uploaded through the Play Console once.
- A Google service account must be linked to Play Console with Android Publisher access.
- If you want the generated `release` AAB to be Play-ready, configure an upload keystore through `.credentials/android/keystore.properties` or the `ANDROID_UPLOAD_*` environment variables.
- Some Play Console sections remain manual-only even after API sync:
  - privacy policy
  - app category / app type
  - data safety
  - content rating
  - target audience
  - ads declaration
  - account deletion
