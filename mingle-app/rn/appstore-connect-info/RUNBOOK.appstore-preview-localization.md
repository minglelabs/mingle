# App Store Preview Localization Runbook

This document summarizes the current `mingle-app` workflow for cloning an App Store Preview
(local server) project and applying locale-specific screenshot copy.

## 1) Scope

- Target server: `http://localhost:4318` (`appstore-preview` API)
- Source projects: `Mingle 한국어` or `Mingle 영어`
- Source text: `rn/appstore-connect-info/appstore-connect-info.i18n.json`
- Automation script: `scripts/ios-appstore-preview-clone-locale.ts`

## 2) Key Work Completed So Far

1. Organized App Store Connect metadata into the `appstore-connect-info.i18n.json` structure.
2. Standardized screenshot copy management as locale-specific arrays (`line1`, `line2`).
3. Verified a workflow that can manipulate App Store Preview projects and canvases directly through the API.
4. Repeated the clone, text replacement, and alignment correction flow using the Korean and English source projects.
5. Verified end-to-end creation and copy replacement for a Japanese project (`Mingle 일본어`).

## 3) Automation Script Flow

`ios-appstore-preview-clone-locale.ts` runs in the following order:

1. Read screenshot copy for the target locale from the i18n JSON.
2. Clone the source project (default: `Mingle 한국어`) and create the target project.
3. Replace each canvas name and text with the locale-specific copy.
4. Copy media assets (images/videos) from the source project by canvas index.
5. Shrink text boxes to match text width and center them on the X axis.

## 4) How to Run

Run the command from the `mingle-app` project root.

```bash
pnpm dlx tsx scripts/ios-appstore-preview-clone-locale.ts \
  --locale ja \
  --target-project-name "Mingle Japanese"
```

Options:

- `--source-project-name` default: `Mingle 한국어`
- `--api-base` default: `http://localhost:4318`
- `--i18n-json` default: `rn/appstore-connect-info/appstore-connect-info.i18n.json`
- `--dry-run`: validate inputs only without creating anything

Example (French):

```bash
pnpm dlx tsx scripts/ios-appstore-preview-clone-locale.ts \
  --locale fr \
  --target-project-name "Mingle French"
```

## 5) Notes

1. If the appstore-preview web UI (5173) is open and you are editing manually, autosave can overwrite API results.
2. Multiple projects with the same name can accumulate, so keep only the final version.
3. Long-copy languages may wrap unexpectedly, so the output canvases should be checked after generation.

## 6) Review Checklist

1. Confirm that the target project was created.
2. Confirm that the canvas count and order match expectations.
3. Confirm that `line1` and `line2` were applied to each canvas.
4. Confirm that the text is centered and does not wrap.
5. Confirm that the media assets are valid, especially the first video canvas.
