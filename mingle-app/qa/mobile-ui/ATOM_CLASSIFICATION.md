# Mobile UI/UX Atom Classification

This document is the source of truth for how the documented UI/UX issue atoms in [mingle-app/docs/ui-ux-codex-thread-history.md](../../docs/ui-ux-codex-thread-history.md) are currently classified for mobile QA work.

## Source Count

- Standalone session atoms in the history doc: `127`
- Ongoing validation-note atoms in the history doc: `4`
- Total documented UI/UX atoms in the history doc: `131`

## Historical Alias Notes

Some automated targets use compact aliases instead of the full history heading:

- `2026-real-device#1..#2` -> `2026-04-11-real-device-ui-qa-automation` atoms 1..2
- `2026-dev-validation#1..#4` -> the four bullets under `2026-04-11 Ongoing Dev Validation Notes`
- `2026-android-real-device#1` -> `2026-04-12-android-real-device-ui-qa` atom 1

## Coverage Snapshot

| Coverage view | Validation targets | Explicitly linked atoms |
| --- | --- | --- |
| iOS inventory | `28` | `69 / 131` |
| Android inventory | `27` | `70 / 131` |
| Either mobile platform | `55` | `79 / 131` |

Use [IOS_REGRESSION_INVENTORY.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/IOS_REGRESSION_INVENTORY.md) and [ANDROID_REGRESSION_INVENTORY.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ANDROID_REGRESSION_INVENTORY.md) for the exact automated mappings. The tables below only classify the remaining atoms at the union level.

## Classification Summary

| Category | Atom count | Meaning |
| --- | --- | --- |
| Automated by at least one current mobile suite | `79` | Explicitly linked in the iOS inventory, the Android inventory, or both. |
| Current mobile surface, but not automated yet | `44` | Still relevant to the current mobile product surface and should be the next automation backlog. |
| Oracle still unclear | `2` | The bug is known, but the pass/fail rule is still too fuzzy to automate safely. |
| Reproduction rule still unclear | `1` | The history entry still needs to be decomposed into a clean, reproducible bug. |
| Deferred or deprioritized | `3` | Known issue, intentionally out of the active mobile automation queue for now. |
| Web-only or non-mobile | `2` | Outside the mobile regression scope. |

## Automated By At Least One Current Mobile Suite

The `79` atoms already linked to at least one current mobile suite are maintained in:

- [IOS_REGRESSION_INVENTORY.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/IOS_REGRESSION_INVENTORY.md)
- [ANDROID_REGRESSION_INVENTORY.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ANDROID_REGRESSION_INVENTORY.md)
- [COVERAGE.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/COVERAGE.md)

## Current Mobile Surface, But Not Automated Yet

These `44` atoms still belong to the current mobile app surface, including the `1.1.0` conversations/list/room/navigation domain. They are the main backlog for future automation work.

| Theme | Atoms | Notes |
| --- | --- | --- |
| Dev validation follow-ups | `2026-dev-validation#1`, `2026-dev-validation#2`, `2026-04-12-android-bottom-banner-safe-area#1` | Legacy bottom mic hydration sizing, ngrok interstitial masking, and Android bottom banner safe-area behavior are documented but not yet explicitly automated. |
| List shell chrome and CTA | `019d4cae#1`, `019d4cae#2`, `019d4cae#3`, `019d4cae#6`, `019d4cae#7` | Conversation-list header/CTA chrome and room header sizing still need direct assertions. |
| Banner and transition flow | `019d4cae#16`, `019d4d16#1` | Hidden-zone/banner transition behavior is still only documented, not directly asserted. |
| Room/list gesture and drawer transitions | `019d4cae#17`, `019d4cae#18`, `019d4cae#19`, `019d4cae#20` | Swipe-back, forward restore, drawer exit, and whole-body swipe assistance are still backlog items. |
| Room auto-start lifecycle | `019d4cae#24`, `019d4cae#25`, `019d4cae#26` | Auto-start timing, ref readiness, and update-loop regressions are still unlinked to current automation. |
| Conversation summary and routing state | `019d4cae#29`, `019d4cae#30`, `019d4cae#31`, `019d4cae#33`, `019d4cae#37`, `019d4cae#38`, `019d4cae#39`, `019d4cae#40` | Live ownership, room backgrounding, same-room restore, hidden-room state, and room-to-room handoff still need direct mobile assertions. |
| Runtime and safety regressions | `019d4cae#44`, `019d4cae#46`, `019d4cae#47` | Runtime protection and reset/cleanup edge cases are still backlog items. |
| Running-state and permission follow-ups | `019d4cae#56`, `019d4cae#57` | Remaining room-action recovery follow-ups are still not explicitly encoded. |
| Conversation-list preview and route details | `019d4cae#58`, `019d4cae#59`, `019d4cae#62`, `019d4cae#63`, `019d4cae#64`, `019d4cae#65`, `019d4cae#66`, `019d4cae#68`, `019d4cae#70`, `019d4cae#71`, `019d4cae#72`, `019d4cae#73`, `019d4cae#74`, `019d4cae#75`, `019d4cae#76`, `019d4cae#77` | Current v1.1.0 list/route/menu/delete/search states still have documented atoms that are not yet linked to dedicated regression targets. |

## Oracle Still Unclear

An oracle is the rule that tells the test runner what counts as pass or fail.

- `019c6f40#4`
  Stopping STT while TTS is still active can leave playback state stuck. The bug is clear, but the suite still lacks a deterministic audio/event oracle for it.
- `019d43a0#1`
  Live-demo hydration mismatch around client-only initialization and `Date`/`Intl` rendering is understood historically, but the suite still needs a precise measurable failure signal instead of a vague visible-glitch description.

## Reproduction Rule Still Unclear

- `019d43ae#1`
  This entry is still closer to a branch/meta summary than a single reproducible regression. It needs decomposition into observable bugs before it should be automated.

## Deferred Or Deprioritized

- `019d10e1#1`
  Splash logo/background color mismatch.
- `019d18f0#1`
  iOS resume white-flash issue.
- `019d6f86#1`
  Voice-to-keyboard transition stutter.

## Web-Only Or Non-Mobile

- `019c5304#1`
  Web app shell max-width issue.
- `019c5c43#1`
  Browser/favicon activation crash issue.
