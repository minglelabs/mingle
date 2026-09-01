# Mingle Codex Thread Handoff — 2026-09-01

이 문서는 다음 Codex 쓰레드가 현재 상태를 정확히 이어받기 위한 통합 인수인계입니다. 과거의 초기 handoff, 이 쓰레드에서 진행한 코드·UI·운영·배포 작업, 사용자가 보고한 증상, 아직 검증하지 않은 항목을 함께 기록합니다.

## 0. 최우선 작업 위치와 브랜치

개발, 코드 수정, 서버 확인, 모바일 빌드, Devbox 실행은 반드시 아래 워크트리에서 진행합니다.

~~~
WORKTREE=/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test
BRANCH=codex/messenger-tabs-device-test
~~~

`/Users/nam/mingle`은 `main`의 별도 워크트리입니다. 이 프로젝트에서 서버를 실행하거나 모바일 빌드·테스트를 할 때 `/Users/nam/mingle`을 사용하면 안 됩니다. main의 코드·환경·생성물을 현재 브랜치의 결과로 착각할 수 있습니다.

다음 쓰레드 시작 시 가장 먼저 실행할 확인:

~~~
cd /Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test
git status --short --branch
git log -10 --oneline --decorate
git branch -vv
scripts/devbox status
~~~

운영 원칙:

- 현재 브랜치에서만 작업합니다.
- 사용자가 명시하기 전에는 main에 merge하거나 main으로 push하지 않습니다.
- `origin/main` 변경을 가져올 때도 먼저 차이와 충돌·삭제 목록을 검토합니다.
- 커밋 메시지와 README는 영어로 작성합니다.
- UI/UX 변경은 `docs/ui-ux-codex-thread-history.md`에 기록합니다.
- Prisma schema 변경은 현재 워크트리에서 migration 파일을 만들고 적용 상태를 별도로 확인합니다.
- 새 SQL에서 테이블을 사용할 때는 `app` schema를 명시합니다.
- migration 파일을 삭제·이름 변경·재정렬하지 않습니다.
- Mingle 서버는 일반 실행보다 현재 워크트리의 `scripts/devbox`를 우선 사용합니다.
- 실제 작업이 끝난 변경은 작업한 범위만 영어 커밋으로 만들고 원격 브랜치에 push합니다.
- 이 handoff 직전 사용자의 테스트 방침은 “자동화 테스트와 기기 테스트는 직접 하므로 실행하지 말 것”이었습니다. 새 쓰레드에서 사용자가 바꾸기 전까지 유지합니다.

## 1. 현재 확인된 Git·릴리스 상태

### 1.1 현재 HEAD와 원격

2026-09-01 현재 확인값:

| 항목 | 값 |
| --- | --- |
| 현재 워크트리 | `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test` |
| 현재 브랜치 | `codex/messenger-tabs-device-test` |
| HEAD | `b367ae9341d6ee3b9eccfa88a8836790e86a5577` |
| 짧은 HEAD | `b367ae93` |
| HEAD 메시지 | `fix: stabilize native STT session handoff` |
| 원격 브랜치 | `origin/codex/messenger-tabs-device-test` |
| 원격과 HEAD | 같은 커밋 |
| 워크트리 상태 | clean |

최신 관련 커밋 흐름은 다음과 같습니다.

~~~
b367ae93 fix: stabilize native STT session handoff
cff142f4 chore: bump Android internal test build
ea572569 fix: resync Android STT after room re-entry
467906c3 fix: use supported route-open diagnostic label
dc37b64a fix: preserve live STT across room navigation
f0c66726 fix: stop shared-room language toggle from flashing checked before removal
c15de020 fix: resync Android native STT status after start
d050cc02 fix: make Android native STT session lifecycle recoverable
fad521b3 fix: make Android native STT restartable
~~~

현재 다른 워크트리인 `codex/messenger-client-sot-2.0.1`이 별도로 존재하지만, 그곳으로 이동하거나 그 브랜치의 상태를 현재 작업 결과로 간주하지 않습니다.

### 1.2 현재 origin/main 관계

현재 확인값:

| 항목 | 값 |
| --- | --- |
| `origin/main` | `333807f70f0819ee926419a5c4d2a062890288bb` (`333807f7`) |
| 공통 조상 | `f65fa334772397583342e2fcf316d173d3d9ee98` (`f65fa334`) |
| `HEAD..origin/main` 고유 커밋 | 3개 |
| `origin/main` 고유 커밋 | `3c23931f`, `35a554b7`, `333807f7` |
| 단순 diff 규모 | 약 681 files, 3,799 additions, 54,722 deletions |

`origin/main`의 고유 커밋은 다음입니다.

- `3c23931f Add account and data deletion instructions`
- `35a554b7 Add localized account deletion instructions`
- `333807f7 fix: restore AI wrapper presentation assets`

중요한 점은 “main에 고유한 커밋이 3개”라는 숫자만 보고 안전한 소규모 merge라고 판단하면 안 된다는 것입니다. 현재 main과 이 장기 통합 브랜치는 소스 구조와 기능 범위가 크게 갈라져 있어 diff에는 이 브랜치의 2.0.0 기능 파일이 대량 삭제되는 형태도 보입니다. `schema.prisma`, 2.0.0 API namespace, messenger UI, native STT, push, PostHog, Royce onboarding, migration, Devbox, Railway를 한쪽 전체 선택으로 해결하면 안 됩니다.

초기 handoff 시점의 역사적 상태는 다음과 같았습니다.

- HEAD: `8809cf35`
- `origin/main`: `f65fa334`
- 공통 조상: `07871633`
- 당시 main에만 있던 커밋: 12개
- 당시 브랜치에만 있던 커밋: 296개
- 당시 주요 main 변경: 사용자별 STT segmentation mode, Fin/End UI, Fin silence window, End 기본값, 잘못된 client turn duration 방어, dashboard usage metric source, admin conversation navigation, mobile fallback Railway routing, live demo preference localization

이후 이 브랜치에는 `b8aa5e99 Merge origin/main into 2.0.0 integration branch` 등으로 당시 main 변경이 이미 일부 통합되었습니다. 최신 main 3개 커밋은 별도 검토 대상입니다.

### 1.3 현재 모바일 버전·namespace·업로드 기록

현재 소스 기준 모바일 버전은 2.0.1입니다.

| 플랫폼 | 앱 버전 | 빌드 | API namespace | 상태 |
| --- | --- | ---: | --- | --- |
| Android | 2.0.1 | 93 | `android/v2.0.1` | AAB를 Play Internal track에 업로드 완료, 내부 release 초안 기준 |
| iOS | 2.0.1 | 88 | `ios/v2.0.1` | IPA를 TestFlight에 업로드 완료 |

관련 소스:

- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/rn/android/app/build.gradle`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/rn/ios/mingle.xcodeproj/project.pbxproj`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/rn/src/apiNamespace.ts`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/scripts/devbox.sh`

Android는 `2.0.1 (93)` AAB 업로드 결과가 다음과 같이 확인되었습니다.

- AAB versionCode: 93
- track: `internal`
- Play edit commit: 성공
- 현재 metadata 기본값: `defaultTrack: internal`, `defaultReleaseStatus: draft`
- production 공개·검토 제출 완료로 간주하면 안 됩니다.

iOS는 기존 2.0.0 pre-release train이 닫혀서 같은 2.0.0 train에 새 빌드를 올릴 수 없었습니다. 그래서 2.0.1로 올리고 namespace도 `ios/v2.0.1`로 함께 변경한 뒤 build 88을 TestFlight에 업로드했습니다. TestFlight 업로드와 App Store 심사 제출은 별개이며, 심사 제출은 완료하지 않았습니다.

이번 최신 STT 작업 뒤에는 자동화 테스트나 실물 기기 테스트를 실행하지 않았습니다. 빌드·archive·업로드 과정에서 컴파일은 수행되었지만, 이를 STT 기능 검증 완료로 표현하지 않습니다.

## 2. 브랜치의 본래 성격과 전체 기능 범위

브랜치 이름은 `messenger-tabs-device-test`이지만 단순 디바이스 테스트 브랜치가 아닙니다. Mingle 2.0.0의 장기 통합 브랜치입니다.

포함된 주요 범위:

- messenger tabs와 대화목록·대화방 전환
- 2.0.0 mobile client/API 통합
- My Page, profile edit, public profile
- follow/follower/following, block/report
- profile image upload/crop/preview
- profile share, QR code, deep link
- 멀티멤버 conversation channel과 membership 권한
- 방별·사용자별 언어 선택 및 언어 attribution
- 기본 표시 언어와 사용자 기본 대화 언어
- WebSocket 실시간 메시징 및 polling fallback
- Soniox RT v5 STT, Fin/End segmentation
- iOS/Android native STT continuity
- APNs/FCM native push
- room unread count와 read cursor
- 위치 저장, reverse geocoding, Google Maps Embed
- Android hardware back, iOS edge-swipe back
- signup language·birth date onboarding
- account deactivation/withdrawal 및 grace period
- admin dashboard, usage metrics, conversation review
- Railway single-service, Devbox/Vault/Cloudflare tunnel
- PostHog WebView/server analytics

관련 기존 문서:

- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/docs/mingle-2.0.0-pr-203-206-thread-handoff.md` — 8월 22일 기준 역사적 handoff
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/docs/feat-multi-member-rooms-context.md`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/docs/ui-ux-codex-thread-history.md`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/docs/push-notifications.md`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/docs/worktree-devbox.md`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/docs/railway-single-service.md`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/docs/posthog.md`

## 3. Android native STT 문제의 전체 경과

### 3.1 최초에 파악한 구조적 문제

처음 보고된 Android 문제는 단일 버그가 아니라 다음 세 층이 겹친 현상이었습니다.

1. Android native가 실제 서버 준비 전 `running`을 먼저 보냅니다. WebView는 이를 `connecting`으로 표시하므로 `running`을 무조건 `ready`로 바꾸면 안 됩니다.
2. native 이벤트는 전역 큐에 들어가고, WebView는 conversation ID와 owner 검사를 통과해야 큐에서 제거합니다. owner 불일치, WebView remount, 이벤트 리스너 공백이 있으면 큐가 남았다가 방 재진입 시 한꺼번에 소비될 수 있습니다.
3. 방을 닫거나 hook이 unmount될 때 Web owner만 해제되고 native STT가 계속 살아 있을 수 있습니다. 그 상태에서 화면의 Start/Stop과 실제 native recorder가 서로 다른 상태가 됩니다.
4. keyboard mode microphone은 textarea blur, WebView resize, Framer Motion layout 이동과 같은 시점에 눌려 Android에서 클릭이 유실될 수 있습니다.

`running → connecting` 매핑 자체는 실제 코드에 존재했지만, 핵심은 서버의 `ready`를 확인한 뒤에만 UI가 확정적으로 ready가 되어야 한다는 점입니다.

### 3.2 사용자에게 관찰된 증상

아래 증상들은 모두 Start/Stop 표시와 실제 native STT 상태가 엇갈릴 때 나타났습니다.

- Start를 눌러도 아무 반응이 없는 경우
- Start를 누르면 connecting에 오래 고착되는 경우
- connecting이 오래 유지되다가 Start로 되돌아가는 경우
- 권한 허용 직후 connecting에 멈추지만 실제 녹음은 시작되는 경우
- 한 번 실행·중지한 뒤 대화목록으로 나갔다 들어오면 Stop인데 실제 인식이 안 되는 경우
- STT는 멈췄는데 버튼만 Stop으로 남고 목록에서도 실행 중처럼 보이는 경우
- 대화목록에서는 음성이 실시간으로 메시지화되지만 방 안에서는 새 말풍선이 안 보이는 경우
- 방을 나갔다 들어오면 그동안 누적된 메시지가 한꺼번에 보이는 경우
- 방에 재진입하면 기존 말풍선은 보이지만 추가 STT가 실시간으로 쌓이지 않는 경우
- Stop을 눌러 실제로 중지했는데 Stop 표시가 남는 경우
- 목록과 방을 반복 왕복하면 버튼 상태와 실제 상태가 점점 달라지는 경우
- 앱을 완전히 종료했다 다시 켜야 Start/Stop이 정상화되는 경우
- Android에서 같은 조작을 반복해도 성공·실패가 불규칙한 경우
- 목록에서 방을 빠르게 한 번 눌렀을 때 열리지 않고 두 번 눌러야 열리는 경우
- 대화목록으로 나가면 Android와 iOS 모두 STT가 꺼졌던 시기
- iOS에서 목록 이동 시 `새 대화 시작` 버튼이 깜빡였던 시기
- iOS 첫 STT는 매우 느리지만 두 번째부터 빨라졌던 시기
- 서버 로그가 없어도 클라이언트에는 연결 실패처럼 보였던 경우

중간 상태에서 일부는 해결되었습니다. 하지만 사용자가 마지막으로 보고한 핵심은 다음 두 가지였습니다.

- 목록에서 live STT를 유지하고 방에 재진입하면, 버튼은 Stop인데 visible room이 transcript 이벤트를 받지 못하는 현상
- 앱 재시작이나 다른 navigation을 거쳐야 stale state가 우연히 정리되는 현상

### 3.3 외부 자문과 반론을 합쳐 최종적으로 채택한 판단

자문에서 제안된 일부 구체적 수정은 현재 코드 맥락과 맞지 않아 채택하지 않았습니다.

- `nativeSttConversationIdRef`에 start 직후 한 줄을 무조건 복원하는 것은 requested conversation과 active conversation을 한 ref로 섞을 수 있으므로 정답이 아닙니다. requested/active/session generation을 분리하는 쪽이 맞습니다.
- recovery stop에 conversation ID를 넣으면 Android Kotlin의 stale-stop 필터가 오래된 stop으로 판단해 무시할 수 있습니다. 강제 recovery stop은 ID 없이 native singleton을 정리하는 경로가 필요합니다.
- Native EventEmitter를 command queue 안으로 넣으면 ready 이벤트가 더 늦어질 수 있습니다. 이벤트 큐와 command 직렬화는 분리하고 session generation·conversation ID로 검증해야 합니다.

반대로 자문의 구조적 진단은 유효했습니다.

- `running`과 서버 confirmed `ready`를 구별해야 합니다.
- connecting watchdog이 필요합니다.
- visible room과 hidden room의 native event consumer를 분리해야 합니다.
- stale status cache만으로 Stop을 확정하면 안 됩니다.

추가로 확인된 중요한 원인은 `handleLoadEnd`의 status replay에 conversation ID가 빠질 수 있다는 점이었습니다. 이 경우 `emitToWeb`이 이전 방 ID를 fallback으로 사용해 새 방 WebView가 자신의 상태로 인정하지 않을 수 있습니다. 최신 작업에서는 replay 대상 방과 session 정보를 함께 보냅니다.

### 3.4 최종 작업 방향

최종 방향은 다음 순서입니다.

1. visible room의 native event listener를 먼저 설치합니다.
2. listener 설치가 끝난 뒤 room-scoped native status request를 보냅니다.
3. native 응답에서 실제 `conversationId`, `sessionGeneration`, `running`, `serverReady`, `stopping`, event sequence를 확인합니다.
4. visible room이 현재 session을 adopt하고 owner lease를 가져옵니다.
5. authoritative session identity가 확인된 뒤 해당 room의 queued messages를 drain합니다.
6. session ID가 provisional인 동안 tagged message를 버리지 않고 짧게 보류합니다.
7. hidden room은 native transcript queue를 drain하지 않습니다.
8. 서로 다른 conversation은 process-wide native singleton을 임의로 훔치지 않습니다.
9. status cache는 참고용 replay일 뿐 Stop을 확정하는 근거가 아닙니다.
10. connecting watchdog은 native status probe를 먼저 시도하고, reconcile되지 않을 때만 recovery stop을 수행합니다.
11. `stopping`과 `idle`을 구별해 UI가 “정지 중”과 “완전히 정지”를 혼동하지 않게 합니다.
12. 모든 callback과 delayed audio recovery는 session generation을 확인합니다.

### 3.5 최신 커밋에서 반영한 내용

최신 커밋은 `b367ae93 fix: stabilize native STT session handoff`입니다.

주요 반영:

- visible room의 native event consumer ownership과 lease takeover
- hidden room이 native transcript를 소비하지 않도록 분리
- requested/active/provisional/authoritative conversation·session identity 분리
- room 재진입 시 listener 설치 후 authoritative native status snapshot 요청
- session-tagged queued message를 session 확인 전 삭제하지 않음
- 이전 room의 callback과 status가 새 room에 적용되지 않도록 generation 필터
- Android native status event에 monotonic sequence 추가
- Android `getStatus()`가 `running`, `serverReady`, `stopping`, event sequence를 노출
- graceful stop 중에는 `stopping`, cleanup 완료 후 `idle` 전달
- native WebSocket을 열기 전에 running guard와 session 정보를 먼저 설정
- 이미 진행 중인 graceful stop을 강제 recovery stop이 supersede할 수 있도록 변경
- same-room reuse는 conversation ID뿐 아니라 session generation도 일치해야 허용
- `handleLoadEnd` status replay에 올바른 conversation ID 전달
- 20초 connecting watchdog이 native status를 한 번 probe한 뒤 짧은 grace period 후 recovery
- Android callback, audio route recovery, queue drain에 bounded metadata diagnostics 추가
- diagnostics에 transcript·audio·token·session key를 기록하지 않음

관련 파일:

- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/rn/App.tsx`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/rn/android/app/src/main/java/com/minglelabs/mingle/rn/NativeSTTModule.kt`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/rn/src/nativeStt.ts`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/src/components/LivePhoneDemo/use-realtime-stt.ts`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/src/components/conversation-list.tsx`

### 3.6 목록에서도 live STT를 유지하도록 바꾼 이유

초기 수정에서는 room close 시 native STT를 끄는 흐름과 hidden room unmount가 재진입 문제를 만들었습니다. 이후 `dc37b64a`에서 room을 닫아도 live room을 유지하고, 목록을 보는 동안에도 STT가 계속 돌아가게 하는 방향을 채택했습니다.

현재 의도:

- room close는 시각적 navigation입니다.
- conversation list가 보여도 live room과 STT, translation, message persistence는 유지됩니다.
- 명시적 Stop, 다른 room으로의 session transfer, room 삭제/leave, sign-out, 앱 teardown만 실제 native session을 끝냅니다.
- 목록에서 말한 내용은 DB·preview에 반영되어야 합니다.
- 같은 방을 다시 열면 새 native session을 만드는 것이 아니라 visible room이 기존 session을 adopt해야 합니다.
- 다른 방을 열면 process-wide singleton을 이전 방에서 정리한 뒤 새 방으로 넘겨야 합니다.

목록 row를 빠르게 눌렀을 때 두 번 눌러야 열리던 문제는 history transition이 끝나기 전에 row click과 delayed popstate가 충돌한 것이었습니다. 최신 코드에는 history transition이 settle될 때까지 row open을 보류·재생하는 방어가 들어갔습니다. 단, 최신 커밋 이후 실물 기기 검증은 아직 하지 않았습니다.

### 3.7 Start/Stop 상태의 저장 위치

Start/Stop 실행 상태는 DB에서 관리하지 않습니다.

- 표시 상태: WebView React state
- native 실제 상태: Android/iOS native STT module의 process-level/session-level 상태
- 브리지 동기화: React Native ↔ WebView event/command bridge, owner lease, session generation, status replay
- DB에 저장되는 것: finalized message, translation, room/member/read cursor, usage event 등
- `AppEventLog`: 진단·사용량·제품 이벤트 기록이며 Start/Stop의 source of truth가 아님

따라서 “Stop으로 보이는데 실제 STT가 안 됨”은 DB 값을 고치는 문제가 아니라 native singleton, bridge replay, visible consumer, session ownership을 맞추는 문제입니다.

### 3.8 STT에서 아직 검증하지 않은 항목

다음 커밋이 원인을 해결하도록 설계되었지만, 사용자가 직접 테스트하기 전까지 완료로 표시하지 않습니다.

- 앱 cold start 후 permission grant → `connecting → ready`
- Android에서 실제 transcript가 visible room에 실시간 표시되는지
- STT 중 목록 이동 후 목록 preview가 실시간 갱신되는지
- 같은 room 재진입 후 Stop 표시와 실제 인식이 일치하는지
- 재진입 후 visible room에서 추가 transcript가 계속 표시되는지
- graceful stop 중 재Start가 들어왔을 때 command 순서가 안전한지
- Stop 후 목록 왕복 시 Start로 정확히 돌아오는지
- stale room callback이 새 room을 끄지 않는지
- session-tagged queued messages가 유실·중복되지 않는지
- 20초 watchdog이 실제 연결 실패 시 actionable Start 상태로 돌아가는지
- 다른 room 전환과 빠른 row tap이 한 번에 동작하는지
- iOS의 기존 정상 동작이 Android 수정으로 회귀하지 않는지

## 4. Soniox·segmentation·utterance order

### 4.1 Segmentation 정책

`mingle-stt/segmentation-strategy.ts` 기준 개념:

- `fin`: manual finalize snapshot과 carry 사용
- `end`: Soniox provider endpoint 기반, carry 없음
- llm 요청값이 있어도 effective strategy는 현재 fin/end로 정리
- unsolicited fin/end 처리 분리
- endpoint delay와 tuning step 지원

Fin의 carry를 End에서도 사용한다고 가정하면 안 됩니다. main에서 추가된 기본 정책과 이 브랜치의 기존 native STT 동작을 통합할 때 이 구분을 유지해야 합니다.

이전 main 통합에서 보존해야 하는 변경:

- 사용자별 `sttSegmentationMode`
- Fin/End mode-specific UI
- Fin silence window 조정
- End 기본값 유지
- invalid client turn duration 방어
- per-session endpoint tuning

### 4.2 네/yeah가 삽입되는 현상

코드에 `네`, `yeah`를 새로 발명해 넣는 하드코딩 경로는 확인되지 않았습니다. 가능한 경로는 provider가 한 번 반환한 token/text가 cache·merge·finalize·realtime hydration에서 유지되거나 중복 표시되는 것입니다.

- AEC, TTS echo, VAD/RMS는 사용자가 1차 원인에서 제외했습니다.
- language hint도 1.1.4와 같은 방식이라 1차 원인으로 보지 않았습니다.
- 특정 단어를 코드로 지워서 숨기는 수정은 하지 않았습니다.
- provider raw token, turn merge, finalization order를 로그로 확인해야 합니다.

### 4.3 Utterance ordering

`a9313245 Preserve utterance order during realtime hydration`에서 다음을 반영했습니다.

- WebSocket push와 polling fallback은 유지합니다.
- 이미 client에 있는 message ID가 hydration으로 다시 들어오면 서버의 텍스트·translation·speaker 등 권위 필드는 반영합니다.
- 단, client가 이미 정한 speech-start 기반 `createdAtMs`를 persistence timestamp로 덮지 않습니다.
- 새 message만 서버 timestamp를 사용합니다.
- server timestamp가 live utterance를 가로지를 때 `conversation_hydration_order_preserved` 진단 이벤트를 남깁니다.
- transcript text는 진단 로그에 넣지 않습니다.

이 문제는 사용자에게 `1, 2, 3, 5, 4`처럼 보이는 순서 뒤집힘을 만들 수 있었습니다. 이벤트는 `AppEventLog`와 PostHog 전송 경로를 통해 확인할 수 있습니다.

## 5. 멀티멤버 대화방·실시간 메시징

### 5.1 서비스 구조

| 서비스 | 책임 | 기본 포트 |
| --- | --- | ---: |
| `mingle-app` | 인증, API, 권한, room/member 조회, message DB 저장 | 3000 |
| `mingle-stt` | STT WebSocket | 3001 |
| `mingle-messaging` | conversation WebSocket fan-out, publish | 3002 |

경로:

- STT WebSocket: `/stt`
- messaging WebSocket: `/conversation-events`
- messaging publish: `/conversation-events/publish`
- aggregate health: `/railway/health`

DB가 source of truth입니다. WebSocket은 지연을 줄이는 fan-out 계층이고, WebSocket이 실패해도 message DB 저장은 성공할 수 있어야 합니다. 클라이언트는 polling fallback으로 누락을 복구합니다.

### 5.2 필수 realtime secret과 Railway routing

`MINGLE_REALTIME_SECRET`은 `mingle-app`과 `mingle-messaging`에서 같은 값이어야 합니다. 값 자체는 로그·문서·최종 답변에 출력하지 않습니다.

다르면 다음 문제가 생깁니다.

- realtime token invalid
- WebSocket `invalid_token`
- publish unauthorized
- client가 polling에만 의존
- 상대 메시지 지연

Railway single-service에서는 public `PORT`가 proxy 역할을 하고 내부 포트는 3000/3001/3002로 분리됩니다. 오래된 proxy가 모든 요청을 app 3000으로 보내면 messaging publish와 WebSocket이 망가집니다. 반드시 `/stt`, `/conversation-events`, `/conversation-events/publish`, `/railway/health` routing을 각각 확인합니다.

### 5.3 Membership 모델

핵심 테이블:

~~~
app.app_conversation_channel_members
~~~

member별 정보:

- role, status, paused_at, left_at
- display_language
- selected_languages
- last_read_at
- joined_at

channel 정보:

- owner_user_id
- selected_languages
- default_display_language
- pending_invitee_user_ids
- channel status

규칙:

- 기존 solo room owner는 migration에서 첫 member로 backfill됩니다.
- owner는 owner/admin 역할을 유지합니다.
- 1:1 room은 기존 동작을 최대한 유지합니다.
- group room에서 한 사람의 block 때문에 방 전체가 막히면 안 됩니다.
- 동일 멤버 구성 duplicate room은 자동 병합하지 않습니다.
- “이어하기” room 선택의 최신성은 channel created_at이 아니라 `app_messages.created_at` 기준입니다.
- pending invitee는 첫 메시지 시 membership row로 materialize될 수 있습니다.
- membership materialization과 first-message fan-out은 하나의 transaction 안에서 처리해야 합니다.

### 5.4 새 group room 첫 메시지 문제

초기 증상:

- 새 group room에 legacy UI와 최신 UI가 섞임
- creator의 첫 message가 상대에게 즉시 도착하지 않음
- 앱 재시작 후에야 room/message가 보임
- 재진입하면 첫 message가 사라진 것처럼 보임

원인은 세 가지가 겹쳤습니다.

1. new-group route에 native query/API namespace가 빠져 legacy entry로 fallback
2. room URL이 list snapshot보다 먼저 도착해 새 room이 missing으로 삭제됨
3. pending membership materialization, message 저장, realtime/push fan-out이 서로 다른 상태를 읽음

`e9ca017a`에서 다음을 반영했습니다.

- new-group route에 현재 native query 유지
- apiNamespace가 잠시 없어도 native platform/version으로 release variant 추론
- hydration 전 room URL을 삭제하지 않음
- 목록에 없으면 room ID 단일 summary hydration
- transaction에서 확정된 member IDs를 fan-out 대상에 사용
- publish/push를 await하되 transport 실패가 message 저장을 rollback하지 않음
- bounded logging, session key 비기록

이 기능은 코드상 반영되었지만, 두 계정 physical device 검증은 별개입니다.

## 6. Royce 가입 온보딩·웰컴 메시지 장애

### 6.1 제품 의도

신규 등록 계정은 자동으로 다음을 받습니다.

- `@royce` 사용자와 follow
- Royce 쪽에서도 신규 사용자를 follow하는 맞팔 관계
- follow notification
- Royce가 보내는 unread welcome message 1개
- 사용자의 대화 기본 언어에 맞는 translation records

Royce user ID:

~~~
cmsrqesom0000mx1hn62ce6r9
~~~

영어 source text:

~~~
Welcome! My name is Royce. I'm developer of Mingle. If you have any feedback or questions, feel free to message me anytime on Mingle. The cat in the photo is Somi, my cat.
~~~

source는 영어로 유지하고, 지원 언어 translation은 코드에 하드코딩합니다. 사용자의 default conversation languages에 해당하는 translation record가 message에 저장되어야 합니다.

### 6.2 기본 언어 결정

현재 signup 경로는 다음을 수행합니다.

- `primaryLanguages[0]`을 사용자의 최초 primary language로 사용합니다.
- 새 방의 `defaultConversationLanguages`를 primary/default 값으로 초기화합니다.
- `app_users.default_display_language`에도 `primaryLanguages[0]`을 가입 시 저장합니다.

JavaScript/TypeScript 배열은 `[0]`이 첫 번째입니다. PostgreSQL array SQL 표현은 1-based이므로 migration SQL의 `primary_languages[1]`은 JavaScript의 `primaryLanguages[0]`과 같은 첫 번째 값입니다.

### 6.3 실제 장애와 원인

오후 3시 7분까지는 welcome message가 정상 동작했고 이후 배포에서 실패한 것으로 추정했습니다. 실제 서버 로그에는 `P2021`과 missing relation 문제가 있었고, `app_conversation_channel_invites` migration이 운영 DB에 적용되지 않은 상태였습니다.

그 결과 가입 자체는 성공하지만 welcome onboarding의 room/message 처리 중 예외가 나서 다음과 같이 될 수 있었습니다.

- follow는 생성됨
- 가입은 성공 처리됨
- conversation channel과 welcome message는 생성되지 않음

이후 `20260827150000_add_conversation_channel_invites` migration을 수동 적용했고, 그 뒤 room이 생성되는 것은 확인했습니다. 이 migration은 현재 운영 DB에는 적용된 것으로 사용자가 확인했습니다.

### 6.4 안정성 개선의 판단

`6ad6eb80` 계열 수정에는 다음이 포함됩니다.

- room preview 계산과 welcome message 저장 분리
- DB 처리 최대 3회 재시도
- duplicate room/message 방지
- realtime/push 실패가 이미 저장된 message를 rollback하지 않음
- welcome repair의 session key를 사용자별로 분리
- registered user만 repair 대상으로 제한
- native OAuth 계정도 repair 대상에 포함

이 변경들은 유효한 안정성 개선입니다. migration 누락이 이번 장애의 직접 원인이라는 것을 확인한 뒤에도 이 변경들을 rollback하지 않습니다. 단, 앞으로는 P2021 같은 영구 schema 오류까지 3회 재시도하지 않고 일시적 conflict/connection error만 재시도하도록 개선할 여지는 있습니다.

### 6.5 welcome repair 조사 결과

장애 당시 등록 계정 중 확인된 대상:

- Eugene Zhu: welcome message까지 정상 생성된 것으로 확인
- `Наталья Чубаева`: repair target이지만 repair row 0
- Wen Li: repair target이지만 repair row 0
- 배민준E: repair 성공
- Ayrton Mavulule: repair 성공

repair 성공 결과에는 두 계정 모두 다음이 보였습니다.

- repair channel 존재
- candidate member와 Royce member 존재
- welcome message 존재
- declared/active translation languages 일치
- `repair_status: complete`

repair 결과의 room status가 `paused`로 보인 것은 STT session의 active 상태와 대화방 DB 상태를 혼동하지 말고 별도로 확인해야 합니다. welcome message 존재 여부와 unread/read cursor를 따로 확인합니다.

`mingle-app/scripts/royce-welcome-diagnostic.sql`은 전수 진단용이고, `mingle-app/scripts/repair-royce-welcome.sql`은 idempotent repair용입니다. repair SQL은 DB에 room/message/translation을 보충하지만 기존 realtime/push를 과거 시점에 소급해서 보내는 작업은 아닙니다. 사용자가 다시 hydration하면 DB 데이터가 보입니다.

repair 작업 중 발생한 주의점:

- 처음 제공한 SQL은 `royce_welcome_repair_translations` relation을 찾지 못하는 오류가 있었습니다.
- temp table/CTE가 실행 범위와 schema resolution에 의존하면서 한 페이지 실행에서도 relation 오류가 재현되었습니다.
- 최종적으로 CTE 기반 SQL을 다시 제공했고 사용자가 성공 실행했습니다.
- 실행 후 확인 SQL에서 배민준E·Ayrton 두 건만 나왔고 Natalia·Wen Li는 실제 room이 생기지 않은 것으로 확인되었습니다.
- 이후 두 사람은 `repair_target`이지만 repair 결과 0행임을 다시 확인했고, 추가 가입자가 없다고 판단해 추가 repair는 진행하지 않았습니다.
- 향후 repair를 다시 실행할 때는 signup cutoff와 candidate eligibility를 먼저 SELECT로 확인하고, 대상 수와 ID를 확인한 뒤 COMMIT해야 합니다. “네 명에게만 적용된다”고 가정하고 blind 실행하지 않습니다.

### 6.6 welcome 관련 운영 주의

- 가입 flow를 수정할 때 follow 성공과 welcome room/message 성공을 같은 성공 여부로 취급하지 않습니다.
- DB transaction 안에서 membership materialization과 message 저장을 보장합니다.
- publish/push 실패는 이미 DB에 저장된 welcome message를 실패 처리하지 않습니다.
- source text와 translation rows를 별도로 확인합니다.
- `translations`가 null로 보이는 SQL은 원문 row, translation row, `language`, `content`, finalized state를 각각 join해야 합니다.
- user-created-at만 보고 신규 계정을 판단하지 말고 registered/anonymous/account status를 구분합니다.
- anonymous account는 Royce registered welcome repair의 대상에서 제외됩니다.

## 7. 메시지 버블 UI 변경 이력과 현재 의도

UI 변경은 모두 `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/docs/ui-ux-codex-thread-history.md`에 누적 기록되어 있습니다. 다음은 이 쓰레드에서 사용자와 확정한 핵심입니다.

### 7.1 expanded bubble 구조

기존에는 원문과 번역이 여러 bubble처럼 보였습니다. 현재 의도는 다음과 같습니다.

- 하나의 발화는 하나의 큰 outer bubble입니다.
- 원문과 번역문을 bubble 안에서 위아래 영역으로 나눕니다.
- 언어별 영역 사이에는 1px 수준의 얇고 희미한 가로선을 넣습니다.
- divider 주변의 위아래 margin은 과하지 않게 합니다.
- 펼치기/접기는 즉시 교체하지 않고 짧은 ease-out animation으로 전환합니다.
- 펼친 상태에서도 언어 코드는 표시하지 않습니다.
- 펼친 상태의 language marker는 원형 배경 없이 아이콘만 사용합니다.
- 원문 marker에는 따옴표 badge를 유지합니다.
- 펼친 각 언어 아이콘 오른쪽에는 아이콘 폭의 약 30% 정도 여백을 두고 text를 시작합니다.
- expanded row 사이에는 collapsed 상태와 비슷한 소량의 상하 gap을 둡니다.

### 7.2 collapsed bubble 구조

- collapsed 상태에서 긴 문장을 불필요하게 일찍 줄바꿈하지 않습니다.
- `max-content`에서 시작해 실제 가용 width가 부족할 때만 줄어들도록 합니다.
- 문장이 한 줄에 들어오면 불필요한 line break를 하지 않습니다.
- 한 줄에 안 들어오면 safe maximum width까지 bubble을 늘린 뒤 자연스럽게 줄바꿈합니다.
- 줄바꿈이 끝난 뒤 줄바꿈 위치를 바꾸지 않는 범위에서만 폭을 줄입니다.
- source flag와 translation flag의 visible icon은 작게 유지하고 hit area는 넓게 유지합니다.
- selected language는 원형 ring보다 key-color underline을 사용합니다.
- 원문에는 quote badge를 둡니다.

실제 문제가 된 사례:

- `Again` 한 단어가 앞에 아무 텍스트 없이 다음 줄로 내려감
- `What is it?`가 충분한 공간을 두고도 불필요하게 wrapping됨
- `また`, `네`, `또`와 같은 짧은 텍스트가 좁게 보임

원인은 `fit-content` flex item과 flag/controls가 함께 줄어들면서 WebKit이 min-content에 가까운 폭으로 먼저 계산한 것이었습니다. 현재 `ChatBubble.tsx`는 `w-fit`, `flexBasis: max-content`, `max-w-full`, `MESSAGE_BUBBLE_MAX_WIDTH = 100%` 방향으로 수정되어 있습니다.

### 7.3 incoming/outgoing 정렬

상대 메시지:

- bubble 위에 상대의 `name`을 표시합니다. handle이 아닙니다.
- avatar를 표시합니다.
- collapsed 상태에서는 최대 5개의 language icon을 name 오른쪽에 둡니다.
- name+flag header가 짧은 bubble 때문에 폭이 제한되지 않도록 자연스러운 폭을 허용합니다.
- bubble 좌측 상단은 둥글게 하지 않고 뾰족한 형태를 사용합니다.
- 상대 bubble은 흰색 계열입니다.
- 상대 bubble 옆의 Expand/Collapse는 bubble 바닥선에 맞춰 오른쪽에 붙입니다.

내 메시지:

- avatar와 name을 표시하지 않습니다.
- bubble은 메시지 영역 오른쪽 끝에 붙입니다.
- own bubble은 key color 계열입니다.
- 시간과 Expand/Collapse는 bubble 왼쪽에 둡니다.
- metadata column 안에서는 시간이 위, Expand/Collapse가 아래입니다.
- bubble과 metadata gap은 너무 붙지도 너무 벌어지지도 않게 유지합니다.

사용자가 첨부한 KakaoTalk 참고 이미지와 관련해 “시간이 놓일 위치에 Expand/Collapse를 두고 bubble 바닥선에 맞춰 달라”는 요구가 있었고, 이후 controls가 화면 양끝으로 밀리는 문제가 수정되었습니다. 현재 controls는 행 전체를 채우지 않고 bubble 자연 폭 바로 옆에 배치됩니다.

### 7.4 간격·hit area·텍스트

- 같은 speaker 연속 message gap은 거의 붙되 완전히 0은 아니며 최신 구현은 약 4px입니다.
- 다른 speaker 간 gap은 초기 12px에서 약 6px로 줄였습니다.
- expanded bubble outer padding은 기존보다 줄였습니다.
- collapsed/expanded text line-height는 1.15 방향으로 줄였습니다.
- flags는 visual size를 크게 키우지 않고 넓은 가로 touch area를 유지합니다.
- 현재 icon variant button은 가로 hit area를 넓게 유지하고 visual icon은 작게 보여줍니다.
- 3개 이상 language에서 가운데 flag를 빠르게 눌러도 다른 언어가 선택되지 않도록 합니다.
- Expand/Collapse 텍스트는 chevron이 아니라 15개 UI locale의 localized label입니다.
- timestamp는 relative time을 쓰고, 하루가 지나면 date line과 time line으로 나누되 최대 두 줄입니다.
- 현재 timestamp는 `Intl.DateTimeFormat` 기반이며, 24시간 이내에는 `5s ago`, `4m ago` 같은 relative 형식, 이후에는 `8/23` 또는 다른 연도의 `2024/8/23` + localized time 형식입니다.

15개 primary UI locale:

~~~
ko, en, ja, zh-CN, zh-TW, fr, de, es, pt, it, ru, ar, hi, th, vi
~~~

### 7.5 empty-room prompt

대화방이 처음 만들어졌을 때의 `Press Start, then Speak in any language!` 안내는 Start를 눌렀다는 이유만으로 사라지지 않습니다. 첫 실제 speech/message content가 들어올 때까지 빈 방 배경에 남아 있어야 합니다.

## 8. 기본 표시 언어·텍스트 크기·키보드 모드

### 8.1 default display language

사용자가 대화방 햄버거 메뉴에서 선택한 default display language는 다음 두 곳에 영향을 줍니다.

- 현재 room/member preference
- `app.app_users.default_display_language`

햄버거 메뉴에서는 conversation management 안이 아니라 가장 위, text size 위에 노출합니다. 사용자가 한 번 바꾼 값은 다음 대화방에도 적용되어야 합니다.

완전 최초 가입 시:

- primary language 선택값의 첫 번째 값 `primaryLanguages[0]`
- `defaultConversationLanguages`
- `default_display_language`

을 같은 초기 언어 계열로 설정합니다.

관련 migration:

~~~
20260825090000_add_user_default_display_language
20260825110000_backfill_user_default_display_language
~~~

첫 migration은 nullable column을 추가했고, 두 번째는 기존 사용자의 null 값을 PostgreSQL 배열 첫 항목 `primary_languages[1]`로 backfill했습니다. PostgreSQL array가 1부터 시작하는 것이므로 이 SQL은 의도상 primary language 첫 번째 값입니다.

### 8.2 text size

대화방 text size에 저장된 사용자 값이 없을 때 서버 기본값은 Level 3입니다. 과거 Level 2였던 fallback을 변경했습니다. 명시적으로 저장된 사용자 preference는 덮어쓰지 않습니다.

### 8.3 keyboard/voice mode

- keyboard mode에서 왼쪽 microphone을 눌러도 keyboard mode 자체는 유지합니다.
- microphone start 때문에 composer가 voice mode로 토글되거나 keyboard가 강제로 닫히지 않아야 합니다.
- voice mode의 우측 하단 keyboard toggle만 touch target을 약 30% 키웠습니다.
- keyboard mode의 해당 버튼은 디자인 회귀 우려 때문에 건드리지 않았습니다.
- Explore tab 진입 시 검색창 자동 focus·keyboard 자동 표시를 제거했습니다. 검색창을 직접 눌렀을 때만 focus됩니다.

## 9. Push·Firebase·광고 ID·스토어 배포

### 9.1 iOS foreground push

사용자 요구는 “Mingle이 foreground일 때 상대 message APNs banner/sound가 오지 않아야 한다”였습니다. `bcfee7d8 Suppress iOS foreground message alerts`에서 iOS `willPresent`가 빈 presentation option을 반환하도록 했습니다.

- background APNs delivery와 notification tap handling은 유지합니다.
- foreground에서 banner, sound, badge presentation을 억제합니다.
- Android에는 같은 foreground alert 현상이 관찰되지 않았습니다.

실기기에서 foreground/background/locked 상태별 APNs는 별도 검증해야 합니다. 자동 가입 follow notification과 incoming message push는 서로 다른 흐름입니다.

### 9.2 Android Firebase 주입

새 AAB에서 Firebase client 값이 비어 FCM token 등록이 안 되던 문제가 있었습니다. `2cdadcba fix: inject Firebase config into Android releases`에서 release build가 다음 네 값을 주입할 수 있도록 수정했습니다.

~~~
MINGLE_FIREBASE_PROJECT_ID
MINGLE_FIREBASE_APPLICATION_ID
MINGLE_FIREBASE_API_KEY
MINGLE_FIREBASE_MESSAGING_SENDER_ID
~~~

이 값들은 Firebase Android client configuration에서 얻는 공개 client config이며, 당시 확인한 원본은 다음이었습니다.

~~~
/Users/nam/Downloads/google-services.json
~~~

실제 release 빌드에서는 `scripts/devbox.sh`가 Vault/runtime에서 값을 읽어 Gradle build environment에 전달합니다. 값을 로그나 문서에 출력하지 않습니다. Firebase 값이 없는 build는 FCM token 등록이 실패할 수 있습니다.

관련 Android native 파일:

- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/rn/android/app/src/main/java/com/minglelabs/mingle/rn/NativePushNotificationModule.kt`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/rn/android/app/src/main/java/com/minglelabs/mingle/rn/MingleFirebaseMessagingService.kt`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/rn/android/app/src/main/AndroidManifest.xml`

### 9.3 AD_ID warning

Mingle은 iOS/Android RN AdMob banner 설정과 AdMob app/unit ID를 가지고 있으므로 Android Play Console에서 광고 ID 사용을 선언한 상태가 맞습니다. `97103e0f fix: declare Android advertising ID permission`에서 다음 manifest permission을 추가했습니다.

~~~xml
<uses-permission android:name="com.google.android.gms.permission.AD_ID" />
~~~

현재 `AndroidManifest.xml`에 있어야 합니다. Play Console이 오래된 활성 artifact를 계속 검사하면 새 artifact가 정상이어도 warning/error가 남을 수 있으므로, 활성 track의 모든 artifact를 확인해야 합니다.

지도용 `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY`, AdMob key, Firebase client config는 서로 다른 값입니다. 혼용하지 않습니다.

### 9.4 Play Console 내부테스트 문제

Play Console에서 다음 상태가 여러 번 있었습니다.

- 2.0.0 (88) 초안
- 2.0.0 (89) production/internal release 작업
- 2.0.0 (90) Android build
- 2.0.1 internal build 92
- 현재 2.0.1 (93) internal AAB

개발자 계정이 바뀐 뒤 service account CLI와 브라우저 Play Console 계정이 서로 다른 계정/프로젝트를 보는 것처럼 보이는 문제가 있었습니다. service account가 package의 관리자 권한을 가져도 Play Console 웹 로그인 계정·테스터 Google 계정·service account project가 모두 같은 앱/package를 가리키는지 확인해야 합니다.

내부테스터 경험:

- tester list의 `List` 체크가 빠져 있어 “account isn't currently eligible” 화면이 나온 적이 있습니다.
- `List`를 체크하고 저장한 뒤, opt-in 페이지에서 `Accept invite`를 눌렀습니다.
- 이후 내부테스터 링크에서 `You're a tester for Mingle` 페이지가 정상적으로 표시되었습니다.
- Play Store 앱 검색에서는 Mingle뿐 아니라 다른 검색어도 검색되지 않는 별도 문제를 겪었습니다.
- LTE에서도 검색이 되지 않아 Wi-Fi만의 문제로 보기는 어렵습니다.
- 캐시 삭제는 이미 해봤고 효과가 없었으므로 다음 안내에서 캐시 삭제를 반복하지 않습니다.
- 직접 내부테스트 링크를 열어 tester page가 보이면 링크를 통한 설치가 가능합니다.

주요 링크:

~~~
https://play.google.com/apps/testing/com.minglelabs.mingle.rn
https://play.google.com/store/apps/details?id=com.minglelabs.mingle.rn
~~~

첫 번째는 opt-in/internal tester 상태 확인용이고, 두 번째는 store detail 직접 접근용입니다. 내부테스트 artifact는 일반 Play Store 검색에 바로 노출된다고 보장할 수 없습니다.

### 9.5 현재 Play metadata

파일:

~~~
/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/rn/google-play-console-info/google-play-console-info.i18n.json
~~~

현재 release metadata는 2.0.1 (93)이고, 15개 primary locale 계열의 release notes를 포함합니다. 과거 notes에 있던 `more reliable iOS navigation`은 `more reliable navigation`으로 바꾸어 Play 문구에 iOS가 불필요하게 언급되지 않도록 했습니다.

Play Console에 이미 생성된 초안 문구는 Git push만으로 자동 변경되지 않습니다. Play API로 해당 release edit를 업데이트하거나 Console에서 version edit를 저장해야 합니다.

“출시 노트”는 Play release에 붙는 release notes/What's New 성격의 문구입니다. App Store Connect의 iOS What's New와 저장·제출 경로는 별개입니다.

### 9.6 IARC·콘텐츠 등급·데이터 보안

IARC에서 다음 Live Rating Notice를 받았습니다.

~~~
Global Rating ID: 19a93feb-db4b-8eae-83f0-3f820baaa02a
Product: Mingle: The Easiest Translator
Storefront: Google Play
Rating date: 2026-08-24
~~~

의미:

- questionnaire 기반 rating이 live 상태가 됐다는 뜻입니다.
- 해당 IARC를 허가한 digital storefront에서만 사용할 수 있습니다.
- questionnaire 응답과 실제 앱 콘텐츠가 바뀌어 rating 조건이 변하면 새 questionnaire가 필요할 수 있습니다.

Play Console의 data safety/content rating에서 다뤘던 항목:

- 이름, 사용자 ID, 기타 정보
- 대략적 위치
- 앱 내 메시지
- 사진
- 앱 상호작용
- 계정 관리, 앱 기능, 보안/규정 준수, 개발자 커뮤니케이션, analytics 등 목적

handle, name, bio는 서버 profile 데이터로 저장되므로 일반적으로 “임시 처리”가 아닙니다. 위치·사진·메시지·계정 데이터도 실제 저장·처리 경로와 삭제 정책을 기준으로 답해야 합니다. 화면에서 메모리에 잠깐만 쓰는 값이라는 이유로 임시 처리라고 선택하면 안 됩니다.

사용자가 설정한 target audience는 13세 이상입니다. 콘텐츠 등급의 “앱에 채팅 조정이 포함되어 있나요?”는 앱이 user-to-user chat을 제공하고 block/report 등 moderation 기능을 포함하는지 묻는 항목입니다. Console questionnaire에서 최종 답변은 실제 현재 moderation 기능과 정책을 기준으로 다시 확인해야 하며, 코드가 자동으로 바꾸는 값은 아닙니다.

로그인 세부정보는 Google Play 검토자가 제한된 기능을 볼 수 있는 테스트 계정/절차를 영어로 입력하는 설정입니다. 일반 사용자용 관리자 계정을 새로 만드는 코드 작업과는 별개입니다.

### 9.7 계정·데이터 삭제 URL

계정 삭제/데이터 삭제 안내 페이지는 main 쪽에서 추가·localized 처리된 작업입니다. 현재 브랜치와 최신 main의 legal 파일 차이를 merge 전에 확인해야 합니다. 문서에 실제 삭제 데이터 유형, 보관 기간, 요청 절차, 앱/개발자 이름이 있어야 Play Console 요구사항을 충족합니다.

현재 main 고유 커밋:

- `3c23931f Add account and data deletion instructions`
- `35a554b7 Add localized account deletion instructions`

main을 전체 merge하지 말고 legal 파일·generated translations·정적 자산만 안전하게 옮길지 검토합니다.

## 10. Profile·계정·OAuth·관리자 도구

### 10.1 Profile edit

문제:

- Handle과 Bio는 저장되는데 Name 변경이 local state에 반영되지 않아 다시 원래처럼 보임
- handle unique conflict가 일반 save error처럼 보여 사용자가 이유를 알 수 없음

`cb2a3828`에서 API PATCH 응답의 `name`과 nullable `bio`를 local profile state에 반영하고, unique handle conflict를 별도 안내하도록 수정했습니다. handle은 unique key가 있으므로 이미 사용 중인 값으로 저장할 수 없습니다.

### 10.2 다른 사용자 profile preview

다른 사람의 profile image를 눌렀을 때 언어 하나만 보이던 preview에 다음을 정돈된 card로 추가했습니다.

- name
- `@handle`
- Bio
- primary language/언어 정보

현재 사용자 자신의 preview도 같은 hierarchy를 사용합니다. optional field가 비어 있는 profile도 레이아웃이 무너지지 않아야 합니다.

### 10.3 Google/Apple 계정 중복처럼 보인 문제

Android에서 한 기기의 브라우저에 Google session cookie가 남아 있으면 여러 Google 계정으로 로그인 시도해도 기존 browser account가 재사용될 수 있습니다. email/password signup이 별도 계정으로 보인 것은 이 OAuth/browser session 경계 때문입니다.

이것은 동일한 Google 계정을 하나의 Mingle 계정에 연결하는 account-linking 정책과는 구분해야 합니다. 여러 test account를 만들 때는 browser account/session chooser와 실제 Google 계정 이메일을 확인해야 합니다. 기기·브라우저 session을 바꾸지 않고 DB만 비교하면 계정이 합쳐진 것으로 오해할 수 있습니다.

### 10.4 Admin conversation review

관리자 대화록 조회는 external user ID로 검색합니다.

~~~
/admin/conversations?userId=<external_user_id>
~~~

운영 호스트가 `https://translator.minglelabs.xyz`라면 예시는 다음과 같습니다.

~~~
https://translator.minglelabs.xyz/admin/conversations?userId=<external_user_id>
~~~

관리자 인증이 필요합니다. 현재 기능:

- user ID로 대화방 목록 조회
- room별 message drill-down
- pagination/infinite history
- deleted/active filter
- latest-message sorting
- cache-first browser hydration
- room back navigation
- 계정 상태 카드

계정 상태 카드에는 active/deactivated/withdrawal-pending/deleted 상태, handle, platform/version, namespace, signup/last-seen, deactivation/withdrawal/deletion 시각이 표시됩니다.

프로필/메시지 조사 시 `is_active`, `is_deleted`, `withdrawn_at`, `deactivated_at`, `external_user_id`, account type을 함께 봐야 합니다. profile이 조회되지 않는다고 곧바로 탈퇴로 단정하지 않습니다.

## 11. 위치·지도·navigation

### 11.1 Profile location

위치 기능은 다음 privacy invariant를 갖습니다.

- 위치 권한을 사용자가 실제 위치 기능을 쓸 때 요청합니다.
- 설정 앱에서 권한을 revoke하면 Mingle 복귀 시 다시 확인합니다.
- denied/blocked/unavailable이면 화면에서 즉시 숨깁니다.
- 서버에서도 latitude/longitude/city/country/country code와 verified/update 시각을 정리합니다.
- owner profile의 권한 상태를 기준으로 공개 위치를 표시하며 viewer의 권한과 혼동하지 않습니다.

Android 보완:

- fused location
- fresh last-known location
- network/GPS fallback
- 전체 12초 timeout
- reverse-geocode와 save/clear request timeout

지도:

- Nominatim은 reverse geocoding
- Google Maps Embed는 지도 표시
- `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY`는 browser-visible key이며 Maps Embed API/origin restriction 필요
- 이 key는 Firebase, Gemini, AdMob key와 다름

### 11.2 Android back/iOS edge swipe

WebView `SlideSurface/history`와 React Native native back handler가 topmost surface 우선권을 갖습니다.

Android back 대상:

- My Page/profile edit/profile image preview
- hamburger/menu/language/model/display language
- participant/profile/share/notification/QR
- account deactivation/withdrawal

원칙:

- 최상위 modal/panel부터 닫습니다.
- WebView/native 처리 가능 상태가 없을 때만 앱 종료입니다.
- QR scanner는 native layer가 먼저 닫힙니다.
- iOS edge swipe는 현재 topmost SlideSurface만 닫습니다.
- profile → message 이동 시 profile/participant/menu history가 중복으로 남지 않습니다.

tabs 전체를 전면 리팩토링하지 않습니다. 실제 재현되는 history/handler 문제만 최소 수정합니다.

## 12. PostHog analytics

PostHog는 다음 두 경로로 구성되어 있습니다.

- server: `posthog-node`
- WebView: `posthog-js`

`POSTHOG_TOKEN`은 PostHog Project Settings의 project token이며 개인 API key가 아닙니다. local Vault에는 기존 record를 보존하는 patch로 입력합니다.

~~~bash
cd /Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test
export VAULT_ADDR=http://127.0.0.1:8200
vault login
vault kv patch secret/mingle/dev POSTHOG_TOKEN='paste-project-token-here'
vault kv patch secret/mingle/dev POSTHOG_HOST='https://us.i.posthog.com'
~~~

토큰 자체는 commit/log/final 답변에 출력하지 않습니다.

### 12.1 이벤트 범위

자동으로 잡히는 범위:

- app open
- safe screen view
- pageview/history change
- pageleave
- click/change/submit autocapture
- heatmap
- rage/dead click
- Web Vitals
- session replay

server 쪽에는 기존 STT/TTS/hydration 이벤트와 message sent, conversation created/reused 같은 명시적 product event가 있습니다.

중요한 해석:

- 모든 버튼에 각각 수동 `capture`를 추가한 것은 아닙니다.
- 모든 스크롤·뒤로가기가 별도의 의미 있는 custom event로 저장된다고 보장하지 않습니다.
- click/change/submit은 autocapture로 볼 수 있고, pageview/history change는 navigation으로 볼 수 있습니다.
- scroll은 heatmap/replay나 PostHog 기본 기능 범위와 별도 custom event 여부를 구분해야 합니다.
- 화면·버튼별 업무 의미를 정확히 보고 싶으면 해당 product event를 추가로 정의해야 합니다.

privacy:

- source/translation text 제외
- full URL/query/fragment 제외
- IP/user-agent/session key/access token 제외
- name/handle/email을 distinct ID로 보내지 않음
- pseudonymous Mingle tracking ID 사용
- text/input/element attribute masking
- console/request body/header/canvas capture 비활성화
- server GeoIP enrichment 비활성화

PostHog WebView integration만으로는 native binary rebuild가 필요하지 않습니다. Railway web deploy가 필요합니다. 향후 React Native native SDK를 붙이면 별도 native build가 필요합니다.

## 13. Dashboard usage query·migration·SQL 운영

### 13.1 usage query가 28일부터 0으로 보였던 문제

사용한 일별 query는 대략 다음 필터를 갖습니다.

- start date: 2026-08-25
- end date: current date + 1
- platform/latest_client_platform이 비어 있지 않은 user
- latest_ip가 blocked IP와 다른 user
- blocked IP에서 event를 남긴 user 제외
- message는 valid user와 join
- usage는 user별 start 이전 마지막 cumulative snapshot을 baseline으로 사용

총합은 큰데 2026-08-28/29의 message/usage만 0으로 보인 경우, query가 데이터를 “없는 것”으로 만든 것이 아니라 신규 user가 `valid_users` join에서 빠졌을 가능성을 먼저 봐야 합니다. 특히 다음을 비교해야 합니다.

- 해당 날짜의 raw `app_messages` count
- `m.user_id`가 `app_users.id`와 일치하는지
- 신규 user의 `platform`/`latest_client_platform` 값
- `latest_ip_address`와 blocked event user 여부
- anonymous external ID와 registered account ID가 분리되었는지
- usage event의 `user_id`가 실제 registered user인지

날짜별 signup은 candidate_users의 다른 조건을 통과했지만 message/usage join은 실패할 수 있으므로 signup count가 0이 아닌 것만으로 valid user join이 정상이라고 판단하면 안 됩니다.

### 13.2 query가 오래 걸린 이유

기존 query는 다음을 넓게 스캔할 수 있습니다.

- 전체 app_users candidate 계산
- 기간 내 blocked event user DISTINCT
- valid users와 messages join
- usage-in-range 전체 수집
- usage가 있는 user별 start 이전 마지막 snapshot `DISTINCT ON`
- cumulative usage window `LAG`

start date부터만 보면 message는 해당 날짜 이후만 읽을 수 있지만 cumulative usage 차분을 정확히 계산하려면 user별 start 이전 마지막 usage snapshot 한 건이 필요합니다. baseline을 완전히 제거하면 첫 구간 usage가 틀릴 수 있습니다.

### 13.3 usage baseline index

`6024cdfb Add usage baseline lookup index`와 migration:

~~~
20260829090000_add_app_event_log_usage_baseline_index
~~~

생성되는 partial index:

~~~sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "app_event_logs_user_usage_created_desc_idx"
ON "app"."app_event_logs"("user_id", "created_at" DESC, "id" DESC)
WHERE "user_id" IS NOT NULL
  AND "usage_sec" IS NOT NULL;
~~~

`CONCURRENTLY`는 production write blocking을 줄이지만 migration transaction 방식과 충돌할 수 있으므로 manual apply 여부와 Prisma migration history를 별도로 확인합니다.

### 13.4 migration 절대 주의사항

- production에서 `prisma migrate reset` 금지
- DATABASE_URL host/database 확인 전 reset 금지
- migration directory 삭제/rename/reorder 금지
- `prisma generate`만 실행하고 적용 완료로 판단하지 않음
- SQL table reference에 `app` schema 명시
- 동일 timestamp `20260820100000` migration 두 개를 모두 보존
  - `add_conversation_member_status`
  - `add_user_discovery_source`
- `20260820140828_finalize_handle_schema`의 `DROP COLUMN IF EXISTS username`도 삭제하지 않음
- 현재 DB에 적용됐는지는 migration history와 실제 table/column을 함께 확인

주요 migration 목록:

~~~
20260817090000_add_user_language_preferences
20260817100000_add_conversation_default_display_language
20260817130000_add_user_push_tokens
20260817150000_add_user_birth_date
20260818130000_add_user_deactivation
20260818160000_add_user_withdrawal
20260819230000_add_conversation_channel_members
20260820100000_add_conversation_member_status
20260820100000_add_user_discovery_source
20260820140828_finalize_handle_schema
20260820150000_add_user_profile_location
20260821170000_add_conversation_member_selected_languages
20260821180000_add_conversation_pending_invitees
20260822125250_add_endpoint_max_delay_preference
20260823100000_add_user_bubble_display_mode
20260823104805_add_conversation_member_read_cursor
20260823120000_add_stt_segmentation_mode
20260823141840_add_conversation_member_left_at
20260824130000_add_dashboard_usage_metric_version
20260824141500_set_demo_silence_finalize_default_to_1000
20260825090000_add_user_default_display_language
20260825110000_backfill_user_default_display_language
20260827150000_add_conversation_channel_invites
20260829090000_add_app_event_log_usage_baseline_index
~~~

## 14. AI wrapper·legal static assets

사용자는 `/ai-wrapper`에서 사진이 엑박으로 나오는 문제를 제보했습니다.

- branch의 `7381758c feat(legal): add ai-wrapper presentation page`에서 HTML page를 추가했습니다.
- 원본은 `minglelabs/surfers`의 `presentation/surfers-3rd-ai-wrapper.html` 및 GitHub Pages입니다.
- branch 배포 HTML이 참조하는 이미지 상대 경로가 Vercel의 `public/legal` 구조와 맞지 않아 broken image가 많았습니다.
- 최신 `origin/main`의 `333807f7 fix: restore AI wrapper presentation assets`는 약 129개 legal asset을 `mingle-app/public/legal/assets`에 복원하고 HTML을 고친 커밋입니다.

현재 branch에는 그 main 커밋이 아직 merge되지 않았습니다. 나중에 가져올 때는 main 전체를 merge하지 말고 `ai-wrapper.html`과 필요한 정적 asset만 대상으로 검토합니다. 사용자가 제공한 원본은 오픈소스라고 했지만, asset/license/경로를 그대로 확인한 뒤 반영합니다.

## 15. 가입·대화·사용자 조사에서 확인했던 운영 사례

### 15.1 2.0.0 사용자와 1.1.4 구분

아직 iOS 2.0.0이 출시되지 않았을 때 Android 2.0.0 유저가 들어온 사례가 있었습니다. 이는 Android production release가 먼저 공개된 상태였기 때문이며, 1.1.4 사용자가 2.0.0 native code를 실행한 것으로 단정하면 안 됩니다.

새 user 조사 시 다음을 함께 봅니다.

- `external_user_id`
- `app_users.id`
- email/auth provider
- platform/client version
- API namespace
- created_at/last_seen
- account status
- event logs
- conversations/messages

### 15.2 5초 사용 후 이탈한 사용자

짧게 접속한 사용자 한 명에 대해 대화방·메시지·usage/event를 admin에서 확인하려 했습니다. “대화방이 없어 보인다”는 화면만으로 room이 없다고 단정하면 안 되고, 다음을 raw DB에서 확인해야 합니다.

- channel row가 있는지
- membership row가 있는지
- pending invitee만 남았는지
- message row가 있는지
- anonymous tracking user와 registered user가 다른지
- account가 active/deleted/deactivated인지

### 15.3 대화가 비어 보이는 유저

김근주·Christos Kampi 등 대화 로그를 비교할 때는 source text만 보지 말고 target language와 translation records를 함께 조회해야 합니다. `translations` JSON/column이 null이면 translation table row와 language key, finalized state를 별도로 join해야 합니다.

M 사용자처럼 profile 조회는 안 되지만 메시지는 보이는 상태는 deactivated/deleted/anonymized profile filtering과 message retention이 서로 다르게 동작할 수 있습니다. 프로필 불가=메시지 삭제로 연결하지 않습니다.

## 16. 미해결·미검증 우선순위

### P0 — Android native STT 실기기 검증

최신 `b367ae93`을 기준으로 사용자가 직접 확인해야 합니다.

- cold start/permission grant
- Start → connecting → ready
- list 이동 중 live STT 유지
- same-room re-entry 후 visible transcript
- explicit Stop 후 Start 상태
- repeated list/room cycles
- rapid row tap
- graceful stop overlap
- app restart

### P0 — 최신 main의 선택적 통합

- account/data deletion localized legal pages
- AI wrapper assets
- 최신 main이 삭제하는 2.0.0 branch feature를 보존하는지 검토
- schema/API/native/UI/Devbox/railway를 파일별로 3-way 검토

### P1 — Push

- Android 2.0.1 (93) FCM token registration
- Firebase values가 실제 artifact에 주입됐는지
- background/locked message push
- foreground iOS message alert suppression
- automatic Royce follow notification과 welcome message push의 대상 분리
- APNs production environment

### P1 — Room/membership/welcome

- 신규 signup에서 follow/followback + room + unread welcome message
- default language translation records
- transaction 실패 시 partial state가 남지 않는지
- migration history와 `app_conversation_channel_invites` 실제 적용 확인
- Natalia/Wen Li처럼 repair target인데 repair row가 없는 계정 재조사

### P1 — Bubble/UI

- short word wrapping (`Again`, `What is it?`, `また`, `네`, `또`)
- expanded one-outer-bubble divider/animation
- sender name/header fixed height
- flags hit area and selected underline
- incoming/outgoing control placement
- timestamp max two lines in all 15 locales
- same/different speaker spacing

### P1 — Profile/location/navigation

- name persistence and duplicate handle feedback
- other-user preview identity card
- Android location timeout/GPS fallback
- permission revoke cleanup
- iOS edge swipe
- Android hardware back
- profile → message history reset

### P1 — Analytics/dashboard

- PostHog token actually received after Railway deploy
- event list vs autocapture scope
- no transcript/PII leakage
- usage query raw join diagnosis for 8/28 onward
- baseline index applied and query plan improved
- dashboard usage metric source/version

## 17. 다음 쓰레드에서 지켜야 할 금지사항

- `/Users/nam/mingle` main 워크트리에서 서버·Devbox·모바일 build 실행
- `git reset --hard`, broad checkout, broad delete
- production DB reset
- migration 삭제·rename·reorder
- schema 적용 여부 확인 전 manual SQL 재실행
- `app` schema 없는 production SQL
- Vault 전체 record를 모르는 상태에서 `vault kv put`으로 덮어쓰기
- secret, Firebase values, PostHog token, realtime secret, session key를 로그에 출력
- quick tunnel URL을 permanent OAuth/mobile URL로 사용
- web/STT/messaging에 서로 다른 realtime secret 사용
- 2.0.0 앱에 1.1.4 namespace를 넣거나 1.1.4 fallback을 활성 route로 사용
- Android STT 문제를 tabs 전체 리팩토링으로 확대
- `running`을 무조건 `ready`로 매핑
- stale cached status만으로 Stop 확정
- native event를 command queue 안에 넣어 ready를 지연
- recovery stop에 stale conversation ID를 무조건 전달
- hidden room이 transcript queue를 소비하도록 방치
- welcome repair SQL 대상과 결과를 확인하지 않고 COMMIT
- PostHog가 모든 semantic scroll/back event를 자동으로 기록한다고 단정
- build/archive 성공을 실제 기기 기능 검증 완료로 표현
- Play Console draft가 Git push만으로 자동 수정된다고 가정

## 18. 다음 쓰레드 시작용 요약 지시문

~~~text
반드시 /Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test에서 작업하고,
codex/messenger-tabs-device-test 브랜치를 확인한다.

현재 HEAD는 b367ae93이며 origin과 같은 상태다. 현재 앱 버전은 Android 2.0.1 (93),
namespace android/v2.0.1이고, iOS는 2.0.1 build 88, namespace ios/v2.0.1이다.
Android 93 AAB는 Play internal track에 업로드됐고 iOS 2.0.1 build 88은 TestFlight에
업로드됐다. 최신 STT 커밋 이후 자동화 테스트·기기 테스트는 하지 않았다.

현재 가장 중요한 것은 Android native STT의 visible-room session adoption과
list-to-room re-entry가 실제 기기에서 안정적인지 확인하는 것이다. Start/Stop은
DB가 아니라 WebView/native bridge/session lease 상태다.

origin/main은 현재 333807f7이며 main에만 account/data deletion localized pages와
AI wrapper assets가 있다. 단순 merge하지 말고 2.0.0 branch 기능 삭제 여부를 먼저
검토한다.

Royce onboarding은 migration 누락으로 partial failure가 발생했던 적이 있다.
app_conversation_channel_invites는 운영 DB에 수동 적용됐지만 migration history와
welcome repair 대상은 다시 확인해야 한다. repair SQL은 idempotent지만 대상 SELECT와
결과 검증 없이 실행하지 않는다.

모든 서버 실행은 current worktree의 scripts/devbox를 사용하고, secret은 출력하지
않는다. 변경 시 UI/UX 문서를 갱신하고 영어 커밋·push를 수행한다.
~~~

## 19. 참고 파일 목록

STT/native:

- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/src/components/LivePhoneDemo/use-realtime-stt.ts`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/src/components/LivePhoneDemo/ChatBubble.tsx`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/rn/App.tsx`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/rn/android/app/src/main/java/com/minglelabs/mingle/rn/NativeSTTModule.kt`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/rn/ios/mingle/NativeSTTModule.swift`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/rn/src/nativeStt.ts`

Conversation/membership:

- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/src/lib/app-conversations.ts`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/src/server/conversation-realtime.ts`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/src/server/api/controllers/shared/conversations-controller.ts`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/src/components/conversation-list.tsx`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/src/components/conversation-list.logic.ts`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-messaging/messaging-server.ts`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-messaging/conversation-events.ts`

Signup/repair:

- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/src/lib/signup-welcome-onboarding.ts`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/src/lib/royce-welcome-translations.ts`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/scripts/royce-welcome-diagnostic.sql`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/scripts/repair-royce-welcome.sql`

DB/runtime:

- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/prisma/schema.prisma`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/mingle-app/prisma/migrations`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/scripts/devbox.sh`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/railway.json`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/railway/start-single-service.mjs`

Documentation:

- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/docs/mingle-2.0.0-pr-203-206-thread-handoff.md`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/docs/feat-multi-member-rooms-context.md`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/docs/ui-ux-codex-thread-history.md`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/docs/posthog.md`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/docs/push-notifications.md`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/docs/railway-single-service.md`
- `/Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test/docs/worktree-devbox.md`

