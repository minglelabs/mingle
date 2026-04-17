# iOS Regression Backlog

This document explains what is outside the explicit iOS regression inventory.

- Historical atoms in [docs/ui-ux-codex-thread-history.md](/Users/nam/.codex/worktrees/a92b/mingle/docs/ui-ux-codex-thread-history.md): `131`
- Atoms explicitly linked in [IOS_REGRESSION_INVENTORY.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/IOS_REGRESSION_INVENTORY.md): `69`
- Atoms not explicitly linked in the iOS inventory: `62`

## Summary

| Bucket | Atom count | Meaning |
| --- | --- | --- |
| Not automated on either mobile platform yet | `52` | See [ATOM_CLASSIFICATION.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ATOM_CLASSIFICATION.md). |
| Explicitly automated only on Android | `10` | Legitimate mobile coverage, but not part of the iOS inventory. |

## Automated Only On Android

These atoms are not missing from mobile automation overall. They are just Android-only today.

- `2026-android-real-device#1`
- `2026-dev-validation#3`
- `019d18f2#1`
- `019d19a3#1`
- `019d4cae#4`
- `019d4cae#78`
- `019d4eba#1`
- `019d4f37#1`
- `019d6d6d#1`
- `019d6d99#1`

## Union-Level Backlog

For the `52` atoms that are not yet automated on either mobile platform, use:

- [ATOM_CLASSIFICATION.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ATOM_CLASSIFICATION.md)

That document is the source of truth for:

- `44` current-mobile-surface atoms still waiting for automation
- `2` oracle-unclear atoms
- `1` reproduction-rule-unclear atom
- `3` deferred atoms
- `2` web-only or non-mobile atoms
