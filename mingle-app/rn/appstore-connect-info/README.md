# App Store Connect Info Workspace

`mingle-app/rn/appstore-connect-info` is the local workspace for iOS App Store Connect assets and localized copy.

## Directory layout

- `generated/`: output from `scripts/ios-appstore-media.sh`
  - `final/iphone-69`
  - `final/ipad-13`
  - `preview`
- `upload/<locale>/`: files prepared for `scripts/ios-appstore-upload.sh`
- `appstore-connect-info.i18n.json`: single source of truth
  - `ios.assets`: screenshot upload directory
  - `ios.submission.screenshots`: screenshot copy for "iOS App > Preparing Submission for 1.0.0"
  - `ios.submission.appStoreInfo`: version metadata (promo text, what's new, description, keywords, URLs)
  - `ios.generalInfo.appInfo`: app info metadata (title, subtitle)
- `RUNBOOK.appstore-preview-localization.md`: appstore-preview API localization workflow

## Default behavior

- `scripts/ios-appstore-media.sh` writes to `generated/` by default.
- `scripts/ios-appstore-upload.sh` reads from `upload/` by default.
- `scripts/ios-appstore-sync-upload-assets.sh` removes local preview videos and downloads the preferred ASC iPhone screenshot set into `upload/`.
- `scripts/devbox ios-appstore-sync-metadata` reads `appstore-connect-info.i18n.json` by default.
- App Store Connect credentials default to `.credentials/appstore-connect/api-key.json`.
## Quick commands

```bash
scripts/ios-appstore-media.sh --no-build
scripts/ios-appstore-upload.sh --locale en-US
scripts/ios-appstore-sync-upload-assets.sh
scripts/devbox ios-appstore-sync-metadata --dry-run
scripts/devbox ios-appstore-sync-metadata
scripts/devbox ios-appstore-sync-metadata --only-version-urls
pnpm dlx tsx scripts/ios-appstore-preview-clone-locale.ts --locale ja --target-project-name "Mingle Japanese"
```
