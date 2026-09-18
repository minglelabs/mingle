# PR 211 service integration and installed-client compatibility

## Integration scope

- Destination: `codex/messenger-client-sot-2.0.1`, previously `2fc127eb`.
- Source: `codex/messenger-tabs-device-test` at `4e8df995`.
- The merge direction is service to local-first only. No production deployment or service-branch mutation is part of this work.
- Two textual conflicts were resolved: UI/UX history and the Devbox iOS target-selection function.
- Six files changed on both sides of the merge base: the two conflicted files, the native app bridge, the conversation room, and the event handler plus its tests. Each overlapping source diff was inspected.
- Of 64 local-first-only files and 25 service-only files, all production code stayed byte-identical to its owning parent except the intentional native PiP capability guard. Other differences in those sets are regression tests. Both documentation history blocks were retained in full.

## Existing app support

Server deployment does not require users to reinstall or immediately update their installed app. An app loading the new remote WebView receives the local-first web changes; an already-open older document can continue using its existing API payloads until it reloads. Local caches initialize from the server under the existing authenticated account. Server records remain authoritative for authorization and shared persistence; this is not a destructive database-to-device migration.

| Installed namespace | Server endpoint | PiP controls in the new WebView |
| --- | --- | --- |
| `ios/v2.0.0` | Existing iOS 2.0.0 routes | Hidden; native module absent |
| `ios/v2.0.1` | Rewrite to iOS 2.0.0 routes | Hidden; native module absent |
| `ios/v2.0.2` | Rewrite to iOS 2.0.0 routes | Available in a native iOS runtime |
| `ios/v2.0.3` beta | Retained rewrite to iOS 2.0.0 routes | Available in a native iOS runtime |
| `android/v2.0.0` | Existing Android 2.0.0 routes | Hidden |
| `android/v2.0.1` | Rewrite to Android 2.0.0 routes | Hidden |

The service branch's current native targets are iOS 2.0.2 and Android 2.0.1. This integration preserves their matching mobile/API versions and the prior iOS beta alias; it does not silently version either mobile app as 2.0.3. No released Android 2.0.2 target is represented in the checked source configuration, so this report does not claim testing that binary or namespace.

## Compatibility evidence

- `api-contract.test.ts`: the installed namespace from the app URL wins even if the server defaults to iOS 2.0.3; conversation, preferences, event, and translation URLs keep the installed version.
- `v2-0.namespace-routing.test.ts`: real rewrite configuration retains root and nested aliases. Both platforms' 2.0.0 list, room, members, realtime-token, direct-conversation, preferences, event, translation, and TTS routes still export the existing handler functions.
- `request-user-identity.test.ts`: authenticated old namespaces resolve the same account ID despite a different tracking ID and do not create a tracking-owned user. Existing authentication-cookie and native-auth tests also pass.
- `log-client-event-handler.test.ts`: old finalized payloads lacking the new optional recovery flags still succeed, persist both content types, and produce the original realtime/push behavior. New source-first delivery and translation enrichment are tested separately.
- `native-pip.test.ts` and `live-phone-demo.native-pip-wiring.test.ts`: old shells cannot expose or start PiP; the actual room initializer and callback still enable it for supported iOS shells.
- Existing cache, shared settings, optimistic mutation ordering, owner-scoped recovery cancellation, delayed translation, room removal, hydration, native navigation, dashboard metrics, and API tests all pass in the merged tree.
- Devbox tests mock all device operations. They cover explicit/automatic selection, exact CoreDevice mapping, stale-list fallback, generic explicit-target builds, clean/non-clean installs, and rejection before any mutation when the chosen phone is unreachable.

## Verification result

- Web: 154 files / 1,416 tests passed; live integration tests excluded.
- React Native: 13 suites / 67 tests passed. The runner reported an open-handle warning after completion, then exited with status 0.
- App script tests: 6 passed.
- Devbox and tunnel-parser tests: 23 passed.
- Web and React Native TypeScript no-emit checking passed.
- Targeted web ESLint passed.
- Devbox shell syntax, the incoming Swift files' parser checks, and Xcode project syntax passed. These are not a signed native build or a PiP device test.
- Local Prisma client generation succeeded for the incoming schema.

## Deployment boundaries

The dashboard platform-cache migration is already present in the service branch; the user reported applying it. It was not executed again. No new environment variable or migration is required by the compatibility fix. Production DB contents, existing accounts, phones, local running servers, and deployment policy were not changed.

These results establish code and automated contract compatibility, not a fresh end-to-end certification of every historical App Store/Play Store binary. No old app was uninstalled or installed and no voice, PiP playback, or production request was exercised for this integration. The conclusion is that the checked installed versions have no identified blocker to using the new server; no additional user-facing migration decision is required.
