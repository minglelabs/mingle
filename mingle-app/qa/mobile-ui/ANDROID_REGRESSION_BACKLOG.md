# Android Regression Backlog

This document explains what is outside the explicit Android regression inventory.

- Historical atoms in [docs/ui-ux-codex-thread-history.md](/Users/nam/.codex/worktrees/a92b/mingle/docs/ui-ux-codex-thread-history.md): `131`
- Atoms explicitly linked in [ANDROID_REGRESSION_INVENTORY.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ANDROID_REGRESSION_INVENTORY.md): `70`
- Atoms not explicitly linked in the Android inventory: `61`

## Summary

| Bucket | Atom count | Meaning |
| --- | --- | --- |
| Not automated on either mobile platform yet | `52` | See [ATOM_CLASSIFICATION.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ATOM_CLASSIFICATION.md). |
| Explicitly automated only on iOS | `9` | Legitimate mobile coverage, but not part of the Android inventory. |

## Automated Only On iOS

These atoms are not missing from mobile automation overall. They are just iOS-only today.

- `019d4cae#5`
- `019d4cae#8`
- `019d4cae#41`
- `019d4cae#42`
- `019d4cae#43`
- `019d4cae#45`
- `019d4cae#48`
- `019d4cae#49`
- `019d4caf#1`

## Union-Level Backlog

For the `52` atoms that are not yet automated on either mobile platform, use:

- [ATOM_CLASSIFICATION.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ATOM_CLASSIFICATION.md)

That document is the source of truth for:

- `44` current-mobile-surface atoms still waiting for automation
- `2` oracle-unclear atoms
- `1` reproduction-rule-unclear atom
- `3` deferred atoms
- `2` web-only or non-mobile atoms
