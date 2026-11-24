# HashChat 에이전트 루프·그래프 재사용 인벤토리

작성 2026-10-31 (UTC). 읽기만 했다. 편집·커밋·서버·devbox·빌드·Appium·설치는 하지 않았다.

## 기준

- 파일: `/Users/nam/mingle/.claude/worktrees/agent-loop-graph` (HEAD `26319829` = main #413 위에 설계 문서 커밋 1개).
- git 이력 수치: 조사 중에 `origin/main`이 계속 움직여서 `1e033d8c`(#419, 2026-11-01)에 고정했다. HEAD와 이 커밋은 72파일이 다르지만 `.github/`, `scripts/`, `mingle-app/scripts/`, `mingle-app/qa/`, `mingle-app/rn/`, `mingle-stt/`, `mingle-messaging/`, `mingle-landing/`, `mingle-app/package.json`, 마이그레이션은 같다. 차이는 앱 소스와 Vitest 파일 2개(444 → 446)다.
- 대조 문서: `docs/agent-loop-graph-design.md` (분할기·워커·코드 노드·게이트, L0~L3, 수정 경로, 학습 경로).
- 경로는 레포 루트 기준이며 모두 존재를 확인했다. `[브랜치]` 표시는 `origin/codex/zealous-satoshi-975fd5`에만 있고 main에는 없는 파일이다 (main보다 26커밋 앞, 90커밋 뒤, tip `799ad79d` 2026-11-01).
- 시간은 워크플로 설정·timeout과 커밋 `9fedda59` 메시지("Threads alone did not help on the 4-vCPU runner (75s -> 74s)")로 잡은 추정치다. 실측하지 않았다.

범례
- 역할: check(결정적 검사), isolation(워커 격리), code node(모델 없이 비교·병합·측정), evidence(게이트 입력), learning(학습 경로 재료)
- 레인: 그 항목이 막아 주는 변경의 레인 (설계 3장 표 기준)
- CI: 예(PR마다 자동), dispatch(수동 실행 때만), 아니오
- 폰: 없음, Mac, 시뮬레이터, 실기기

## 0. 숫자 요약

| 항목 | 값 |
|---|---|
| CI 워크플로 | 2개: `.github/workflows/mingle-app-tdd.yml`, `.github/workflows/namespace-contract-tests.yml` |
| Vitest 단위 테스트 | 446파일 (main 기준, CI 4 shard). live 15파일은 제외 |
| RN Jest / Android JVM / STT / messaging | 27파일 / 4파일 13개 `@Test` / 5파일 / 4파일 (messaging은 CI 없음) |
| 과거 UI/UX 이슈 atom | 131개 중 79개 자동화, 44개는 현재 화면인데 미자동화 |
| UI 이력 항목 | 371개. 2026-10-01 이후 11개 중 10개가 "기기·브라우저에서 확인 안 함"이라고 적음 |
| `^Revert` 커밋 | 31건: L1 8, L2 13, L3 7, 미분류 3 (설계 표로 이번에 분류) |
| 2026-08-01 이후 | 머지 PR 175건, Revert 8건 (L1 2, L2 5, L3 1) |
| 설계 레인 표 적용 (최근 머지 PR 20개) | 8개가 표에 없는 경로를 건드림. 4개는 바뀐 파일 전부가 미분류 |
| 문서 링크 | 절대경로 `/Users/...` 링크 34개(7파일, 모두 `mingle-app/qa/mobile-ui/`)가 전부 깨짐 |

## 1. 결정적 검사 (check)

### 1.1 CI에서 도는 것

| ID | 경로 | 하는 일 | 역할 | 레인 | CI | 무게 · 폰 |
|---|---|---|---|---|---|---|
| C1 | `.github/workflows/mingle-app-tdd.yml` job `unit-tests` | `pnpm test:unit --shard=N/4`, Vitest 446파일 | check | L1·L2 (+L3 정적 계약) | 예 | shard당 테스트 수십 초 + 설치 1분 안팎(추정) · 없음 |
| C2 | 같은 파일 job `typecheck` | `next typegen` 후 `tsc --noEmit`. Railway 빌드가 타입 검사를 건너뛰므로(`Dockerfile.railway`의 `MINGLE_SKIP_BUILD_TYPECHECK=1`) 유일한 타입 게이트 | check | L1·L2 | 예 | 1~3분(추정) · 없음 |
| C3 | 같은 파일 job `stt-tests` | `mingle-stt` node --test 5파일 + `pnpm build` | check | L2 | 예 | 1분 안팎(추정) · 없음 |
| C4 | 같은 파일 job `rn-tests` | `mingle-app/rn` Jest 27파일 (babel 변환이라 타입 검사는 없음) | check | L3 | 예 | 수 분(timeout 15분) · 없음 |
| C5 | 같은 파일 job `android-unit-tests` | `./gradlew :app:testDebugUnitTest`. 실패하면 테스트 리포트를 artifact로 올림 | check | L3 | 예 | 5~15분(추정, timeout 30분) · 없음 |
| C6 | 같은 파일 shard 1 단계 `rn:ios:env-check` | `mingle-app/scripts/require-rn-ios-namespace.mjs`가 namespace = `ios/v2.3.1`인지 확인 (기대값은 `mingle-app/scripts/rn-api-namespaces.mjs`) | check | L3 | 예 | 초 · 없음 |
| C7 | 같은 파일 shard 1 단계 devbox 계약 | `scripts/devbox-ngrok-parse.test.mjs`, `scripts/devbox-runtime-config.test.mjs`: iOS 설치 대상 1대 선택, 닿지 않는 폰이면 빌드 전 중단, Vault 경로, AdMob 값 | check | L1 | 예 | 초 · 없음 |
| C8 | `.github/workflows/namespace-contract-tests.yml` | namespace 3종(빈 값, `ios/v2.2.0`, `android/v2.2.0`) × 계약 테스트 3파일, landing 계약 2파일. PR base 제한 없음 | check | L2·L3 | 예 | job당 1~2분(추정) · 없음 |
| C9 | `mingle-app/src/lib/api-contract.test.ts`, `mingle-app/src/app/api/namespace-routing.contract.test.ts`, `mingle-app/src/lib/rn-api-namespace.test.ts` | namespace 라우팅과 alias(`v2.2.1`, `v2.3.0`, `v2.3.1` → `v2.2.0`), RN 런타임과 스크립트의 namespace 값 일치 | check | L2·L3 | 예 (C1, C8) | 초 |
| C10 | `mingle-app/src/app/api/namespace-reexport.v2_2_0.guard.test.ts` | v2.2.0 라우트가 구버전 트리를 re-export 하지 않는지. 주석에 "so the rule lives in code, not folklore" | check (학습→검사 선례) | L2 | 예 | 초 |
| C11 | `mingle-app/rn/__tests__/runtimeContract.test.ts` | iOS 모든 타깃(app, broadcast)의 `MARKETING_VERSION` = API namespace 버전, WebView 호스트 고정, 로드 실패 처리 | check | L3 | 예 (C4) | 초 |
| C12 | `mingle-app/src/integration/google-play-console-info.contract.test.ts`, `mingle-app/src/integration/appstore-connect-info.contract.test.ts`, `mingle-app/src/integration/google-play-console-media-snapshots.test.ts` | Android `versionName`·`versionCode` ↔ Play 메타데이터, 스토어 메타데이터 locale 완결성, 업로드 이미지 sha256 스냅샷 | check | L3 | 예 | 초 |
| C13 | `mingle-app/src/integration/set-updated-at-trigger.contract.test.ts`, `mingle-app/src/server/reports/posting-feed-migration.test.ts` | 마이그레이션 SQL을 텍스트로 읽어 트리거 정의, "dedupe 다음 unique index" 순서를 확인 | check | L3 | 예 | 초 |
| C14 | `mingle-app/scripts/release-target-config.mjs` (`mingle-app/scripts/build-app.mjs`가 호출), `mingle-app/src/lib/release-target-config.test.ts` | release 빌드가 loopback·devbox 터널 URL을 가리키면 빌드를 멈춤 | check | L3 | 테스트는 예, 검사 자체는 Railway 빌드 때 | 초 |
| C15 | `mingle-app/src/i18n/*.test.ts` (25파일) | 15개 UI locale 문구 누락 | check | L1 | 예 | 초 |
| C16 | `mingle-app/src/lib/native-qa-bridge.test.ts` | QA 브리지가 `qa=1&nativeQa=1&sttDebug=1&ttsDebug=1`와 네이티브 권한 플래그가 모두 있을 때만 열림 (릴리스 누출 방지) | check | L2 | 예 | 초 |
| C17 | `pnpm test:qa:ui:contracts` (`mingle-app/package.json`) | UI·브리지 계약 Vitest 10파일만 실행. 워커 루프 안쪽에서 돌릴 빠른 묶음 | check | L1·L2 | 내용은 C1에 포함, 단독 실행은 로컬 | 10~30초(추정) · 없음 |
| C18 | `mingle-app/rn/android/app/src/test/java/com/minglelabs/mingle/rn/` (`NativeSttAudioMixerTest.kt`, `DeviceAudioJitterBufferTest.kt`, `NativeSttCapturePolicyTest.kt`, `ForegroundRoutePollerTest.kt`) | 기기 오디오 믹서, 지터 버퍼, 캡처 정책 결정 로직 | check | L3 | 예 (C5) | C5에 포함 |

### 1.2 있는데 CI에서 안 도는 것

| ID | 경로 | 하는 일 | 역할 | 레인 | CI | 무게 · 폰 |
|---|---|---|---|---|---|---|
| C19 | `pnpm lint` (`mingle-app/eslint.config.mjs`) | ESLint (next core-web-vitals + TypeScript) | check | L1·L2 | 아니오 | ~1분(추정) · 없음 |
| C20 | `pnpm test:scripts` → `mingle-app/scripts/qa-stt-audio-metrics.logic.test.mjs`, `mingle-app/scripts/ios-live-demo-scroll-fps-capture.logic.test.mjs` | QA 측정 로직 단위 테스트 | check | L1 (QA 도구) | 아니오. CI는 `test:unit`만 부른다 | 초 · 없음 |
| C21 | `scripts/devbox-tunnel-slots.test.mjs` | 터널 슬롯·폰 점유 7개 테스트 | check | L1 | 아니오. CI는 나머지 devbox 테스트 2개만 지정 | 초 · 없음 |
| C22 | `mingle-app/rn/ios/NativeLogicTests/MingleBackgroundAudioPolicyTests.swift` | `mingle-app/rn/ios/mingle/MingleBackgroundAudioPolicy.swift`와 함께 `swiftc`로 빌드해 실행 (테스트 함수 6개) | check | L3 | 아니오 (macOS 러너 없음) | 10~30초(추정) · Mac |
| C23 | `mingle-app/scripts/require-rn-android-namespace.mjs` (`pnpm rn:android:env-check`) | Android namespace = `android/v2.3.1` | check | L3 | 아니오 (iOS만 CI) | 초 · 없음 |
| C24 | `mingle-messaging/test/*.test.ts` 4파일 (`pnpm test`) | 대화 이벤트, 실시간 토큰, 라이브 전달, 화자 배지 | check | L2 | 아니오. 어느 워크플로 `paths`에도 없음 | 초 · 없음 |
| C25 | `mingle-landing/lib/i18n.test.ts`, `mingle-landing/app/download/route.test.ts` | 랜딩 i18n, 다운로드 라우트 | check | 미분류 | 아니오 (CI는 landing 계약 2파일만) | 초 · 없음 |
| C26 | `mingle-app/src/integration/live/coins-ledger.live.test.ts`, `operator-inbox.test.ts`, `operator-posts.test.ts`, `profile-bio.test.ts`, `set-updated-at-trigger.live.test.ts` | 로컬 Postgres에서 코인 원장, 운영 인박스·글, 프로필 잠금, `updated_at` 트리거 | check | L3 (코인)·L2 | 아니오. DB URL이 없으면 `describe.skipIf`이고 dispatch job에도 DB가 없다 | 수십 초~분 · 로컬 DB |
| C27 | `mingle-app/src/integration/live/e2e.*.live.test.ts` 9파일, `mingle-app/src/integration/live/stt-finalize.live.test.ts` | STT 정지·확정 fallback, 언어 매트릭스, Soniox 호환, TTS 이벤트 순서 | check | L2 | dispatch (`live-tests` job). 로컬은 `scripts/devbox test --with-live` | 수 분 · Gemini·Soniox 키 필요. `e2e.ios-launch-healthcheck`만 실기기 |
| C28 | `pnpm seed:check` (`mingle-app/scripts/seed-data.mjs --check`) | `mingle-app/data/seed/mingle-seed.json` 구조 | check | L2 | 아니오 | 초 · 없음 |

### 1.3 게이트가 CI 결과를 읽을 때 주의할 점

- `paths` 필터: `mingle-app-tdd.yml`은 `mingle-app/**`, `mingle-stt/**`, `scripts/**`, `data/**`만 본다. `namespace-contract-tests.yml`은 `mingle-app/**`, `mingle-landing/**`만 본다.
- PR base 필터: `mingle-app-tdd.yml`은 base가 `main` 또는 `codex/messenger-tabs-device-test`인 PR에서만 돈다. base가 다른 기능 브랜치인 쌓인 PR에는 TDD job이 없다.
- `concurrency.cancel-in-progress: true`: 새 푸시가 이전 실행을 `cancelled`로 만든다.
- `push-context` job: main에 들어온 표준 PR 머지 푸시는 테스트를 다시 돌리지 않는다. main의 머지 커밋에는 단위 테스트 결과가 없는 것이 정상이다.
- 그래서 게이트는 `skipped`, `cancelled`, "실행 없음"을 초록으로 읽으면 안 된다.

## 2. 실기기·자동 QA

| ID | 경로 | 하는 일 | 역할 | 레인 | CI | 무게 · 폰 |
|---|---|---|---|---|---|---|
| Q1 | `mingle-app/scripts/mobile-ui-qa.mjs` (`pnpm test:qa:ui`, `test:qa:ui:android`, `test:qa:ui:ios`) | Appium(UiAutomator2, XCUITest) 케이스 13개: QA 브리지 hydrate, 배너 inset, 하단 고정 복원, 작성창 왕복, 하드웨어 뒤로가기, 리마운트 뒤 마이크 상태 복원, 권한 거부 복구 등. 케이스마다 스크린샷, `mingle-app/qa/mobile-ui/reports/<시각>/report.json`과 `report.md`. 세션이 안 열리면 adb `dumpsys`와 iOS 실기기 진단을 모음. stdout에 JSON 요약, 실패 시 exit 1 | check + evidence | L1·L2 | 아니오 | 플랫폼당 수 분(추정) · Android 기기/에뮬레이터, iOS 시뮬레이터/실기기, devbox + Metro |
| Q2 | `mingle-app/scripts/android-ui-regression-suite.mjs` (`test:qa:ui:android:regressions`) | 이슈 atom id가 달린 Vitest 대상과 Q1 Android 실행을 합쳐 atom별 리포트. 실패 시 exit 1 | check + code node | L1·L2 | 아니오 | 수 분 · Android 기기 |
| Q3 | `mingle-app/scripts/ios-ui-regression-suite.mjs` (`test:qa:ui:ios:regressions`) | 같은 구조. 실기기와 시뮬레이터를 따로 돌리고 이력 문서의 atom 수를 직접 센다 | check + code node | L1·L2 | 아니오 | 수 분 · iPhone + 시뮬레이터 |
| Q4 | `mingle-app/scripts/ios-live-demo-scroll-fps-capture.mjs` (+ `.logic.mjs`), 절차 `mingle-app/qa/mobile-ui/IOS_SCROLL_FPS_CAPTURE.md` | 500발화 대화에서 Appium 터치 스크롤, WebView `requestAnimationFrame` 간격으로 FPS·jank 측정. 판정: 평균 55fps 이상, 프레임 간격 120개 이상, 기본 3회 | check + evidence | L1·L2 (스크롤 성능) | 아니오 | 5~10분(추정) · iPhone 12급 실기기 필수 (시뮬레이터는 사전 점검만) |
| Q5 | `mingle-app/scripts/qa-stt-audio-metrics.mjs` (+ `.logic.mjs`), `mingle-app/scripts/qa-audio-golden.mjs`, `mingle-app/test-fixtures/audio/golden/manifest.json`, 절차 `mingle-app/qa/mobile-ui/STT_AUDIO_INJECTION.md` | 정답 WAV 10개(ko, en, ja, zh, es)를 마이크 대신 주입. CER/WER, 말 끝 → STT 확정 → 번역(DB) → 번역(UI) 지연. `--evaluate-run`으로 저장된 run을 기기 없이 다시 채점. 실패는 "전사 없음"과 "주입 오류"뿐이고 나머지 문제는 warning | check + evidence | L2 (STT·번역) | 아니오 | 2~5분(추정), QA 브리지 빌드는 처음 약 10분 · iOS 시뮬레이터 가능, Android 기기, 로컬 DB 읽기 |
| Q6 | `mingle-app/src/lib/native-qa-bridge.ts`, `window.__MINGLE_QA__` (`mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`) | 함수 16개: `getLiveDemoSnapshot`, `seedPersistedHistory`, `seedScrollPerformanceHistory`, `resetUiState`, `remountWebView`, `setNativeSttStatusForQa`, `getRecentUtterances`, `qaInjectAudio`, `getQaAudioInjectionEvents` 등. 스크린샷 대신 값으로 판정하는 오라클 | check 지원 | L1·L2 | 해당 없음 | 즉시 · QA 브리지 빌드 |
| Q7 | `scripts/devbox qa` (`scripts/devbox.sh`의 `cmd_qa`) | `--contracts`, `--ios-regressions`, `--android-regressions`, `--ios-scroll-fps`. 이 워크트리의 포트·URL을 QA 러너에 넘김 | 실행기 | L1·L2 | 아니오 | 모드에 따름 |
| Q8 | `mingle-app/scripts/e2e-ios-launch-healthcheck.sh` | `devicectl`로 설치·실행, 실패하면 `xctrace` fallback | check | L3 | 아니오 | 초~1분 · 실기기 |
| Q9 | `mingle-app/rn/store-screenshots/capture.mjs` | devbox 웹을 headless Chrome(puppeteer-core)으로 iPhone 크기(390×797pt, @3x)에서 locale별로 캡처 | evidence (폰 없는 화면 증거) | L1 | 아니오 | 수 분 · 폰 없음 (devbox 웹, 로컬 테스트 계정) |
| Q10 | `scripts/ios-appstore-media.sh` | 시뮬레이터 캡처로 스토어 스크린샷·프리뷰 영상 생성 | evidence | L3 (스토어) | 아니오 | 수 분 · 시뮬레이터 |
| Q11 | `mingle-app/qa/mobile-ui/CONVERSATION_STATUS_RACE_QA.md`, `mingle-app/docs/tts-stt-regression-checklist.md` | 수동 체크리스트. 후자에는 경로별 오디오 세션 비활성화 지연(320/180/220ms)과 기대 네이티브 로그 문구가 있어 로그 단언으로 바꿀 수 있다 | check 후보 | L2·L3 | 아니오 | 수동 · 실기기 |
| Q12 | [브랜치] `mingle-app/scripts/qa-agent-device.mjs` | AI QA 드라이버 CLI (iOS, Android): `devices`, `servers`, `build`, `install`, `start`, `screenshot`, `tap`, `long-press`, `swipe`, `double-tap`, `pinch`, `type`, `alert`, `snapshot`, `eval`, `app`, `logs`, `stop` | 워커 도구 | L1·L2 | 아니오 | 명령당 초 · 실기기/시뮬레이터 |
| Q13 | [브랜치] `mingle-app/qa/agent/scenarios/*.md` (17개), `mingle-app/scripts/qa-agent-report.mjs`, `.claude/skills/qa/SKILL.md` | 시나리오 frontmatter `id, priority, environment, tags, taste, paths`, 본문 Steps·Oracle·Signals. `results.json` → 단일 `report.html` | check 정의 + evidence | L1·L2 | 아니오 | 시나리오당 수 분 · 실기기 |

## 3. 워커 격리 (devbox, 워크트리, 터널, 폰)

| ID | 경로 | 하는 일 | 역할 | 레인 | CI | 무게 · 폰 |
|---|---|---|---|---|---|---|
| W1 | `scripts/devbox` → `scripts/devbox.sh` (함수 219개) | `init`, `up`, `down`, `status`, `test`, `qa`, `mobile`. 워크트리 경로 cksum으로 포트 슬롯을 고르고(web 3518 + 슬롯 × 20 식), 다른 워크트리 `.devbox.env`의 포트를 피함 | isolation | L1 (자체) | 일부 (C7) | `up` 수 분 · 폰은 `mobile`만 |
| W2 | `scripts/devbox.sh`의 `claim_tunnel_slot`, `release_own_tunnel_slots`, `describe_tunnel_slots` | `<git common dir>/devbox-shared/tunnel-slots/slot-N`에 owner·pid 기록, mkdir 락, 슬롯 4개, 슬롯별 호스트 `mingle-*-devbox-N.minglelabs.app` | isolation | — | 테스트 C21 (CI 아님) | 초 |
| W3 | `scripts/devbox.sh`의 `claim_device`, `device_claimed_by_other_session`, `release_own_device_claims` | `devbox-shared/devices/<platform>-<id>`. 주인 슬롯이 살아 있는 동안, 또는 설치 후 3시간(`DEVBOX_DEVICE_CLAIM_TTL_SEC`). 남의 폰은 `ACTION REQUIRED: skipped`로 건너뜀 | isolation | — | 같음 | 초 |
| W4 | `scripts/devbox-port-bridge.py` | 슬롯 고정 포트(1910N, 1920N, 1930N) → 워크트리 포트 TCP 프록시 | isolation | — | 아니오 | 상주 |
| W5 | `scripts/devbox --log-file auto` | `.devbox-logs/devbox-<worktree>-<시각>.log` (gitignore) | evidence | — | — | — |
| W6 | `scripts/devbox test` (`cmd_test`) | 이 워크트리 URL로 `pnpm test` 또는 `test:live` | 실행기 | — | 아니오 | 분 |
| W7 | `docs/worktree-devbox.md` "동시 세션", `CLAUDE.md` | 세션마다 자기 터널, Cloudflare 기본, 폰은 사용자가 지정, 남의 서버·터널 건드리지 않기, "Appium QA도 같은 규칙" | learning (규칙) | — | — | — |

워커 격리로 쓸 때 걸리는 점
- Appium 러너(Q1~Q5, Q12)는 W3 점유 파일을 읽지 않는다. 문서의 "Appium QA도 같은 규칙"은 코드로 강제되지 않는다.
- Appium 포트 기본값이 모든 세션에서 4723이고 `devbox qa`가 워크트리별로 바꾸지 않는다. Android `systemPort`는 설정하지 않고 iOS `wdaLocalPort`는 환경변수로만 받는다. 같은 Mac에서 워커 둘이 동시에 QA를 돌리면 포트가 겹칠 수 있다.
- 번들 ID가 `com.minglelabs.mingle.rn` 하나라서 다른 워크트리의 빌드를 같은 폰에 깔면 서로 덮어쓴다 (`docs/handoff/kiro-ai-qa/README.md` 8장, `docs/feed-login-redirect-handoff.md` "주의").
- `--device-app-env prod`는 Vault `secret/mingle/prod`를 읽는다. `docs/qa/pr-211-device-local-first-2026-09-05.md`는 로컬 서버를 운영 DB에 붙여 QA했다고 적는다. 에이전트 워커가 같은 일을 하지 못하게 막는 장치는 없다.
- `scripts/devbox status`는 사람용 텍스트다. 코드 노드가 읽을 JSON 출력이 없다.
- `.agent/`가 `.gitignore`에 없다 (설계는 `.agent/plan.json`을 커밋하지 않는다고 함).

## 4. 코드 노드 후보

| ID | 경로 | 하는 일 | 역할 | 레인 | CI | 무게 |
|---|---|---|---|---|---|---|
| N1 | `.github/workflows/mingle-app-tdd.yml` job `push-context` (인라인 `node -e`) | GitHub API로 커밋의 PR 연결, 부모 수, 머지 제목을 보고 "테스트 재실행 필요"를 판정 | code node | — | 예 | 초 |
| N2 | `mingle-app/scripts/qa-stt-audio-metrics.logic.mjs` | `levenshteinDistance`, `errorRate`, `scoreTranscript`(ko·ja·zh·th·yue는 글자, 나머지는 단어 단위), `evaluateFixtureRun`, `summarizeRun`(중앙값), `trimPcm16WavSilence`, WAV 파싱·인코딩 | code node | L2 | 테스트 C20 (CI 아님) | 초 |
| N3 | `mingle-app/scripts/ios-live-demo-scroll-fps-capture.logic.mjs` | `summarizeFrameIntervals`, `evaluateFpsRun`, `summarizeCaptureRuns`, `isIphone12ClassViewport` | code node | L1·L2 | 같음 | 초 |
| N4 | Q2·Q3의 `VITEST_TARGETS[].issueAtoms`, `summarizeTargets` | Vitest·Appium 결과를 이슈 atom 단위로 병합 | code node | L1·L2 | 아니오 | 초 |
| N5 | `mingle-app/scripts/mobile-ui-qa.mjs`의 `summarizeReport`, `renderMarkdownReport` | 플랫폼별 결과 병합 → JSON·마크다운 | code node | — | 아니오 | 초 |
| N6 | `scripts/devbox-ngrok-parse.mjs` `parseNgrokTunnels` | 기대 포트·https에 맞는 터널 선택, 없으면 실패 | code node | L1 | 예 (C7) | 초 |
| N7 | `scripts/google-play-console-media-snapshots.mjs`, `scripts/google-play-console-sync.logic.mjs` | 파일 sha256 스냅샷으로 바뀐 이미지만 업로드 (중복 제거) | code node | L3 | 테스트 예 | 초 |
| N8 | `mingle-app/scripts/release-target-config.mjs` | URL을 loopback, devbox 터널, legacy 운영 주소로 분류 | code node (env 판정 재료) | L3 | 테스트 예 | 초 |
| N9 | [브랜치] `mingle-app/scripts/qa-agent-scenarios.logic.mjs` (+ `.logic.test.mjs`, CLI `qa-agent-scenarios.mjs select --base origin/main`) | `globToRegExp`, `matchingFiles`, `selectScenarios(scenarios, changedFiles)`(diff → 기기 시나리오 + 시나리오가 없는 변경 파일), `validateScenario`(glob이 tracked 파일과 맞는지, 이력 제목·taste id가 실제로 있는지) | code node | 전 레인 | 아니오 | 초 |
| N10 | `mingle-app/src/app/api/namespace-reexport.v2_2_0.guard.test.ts`의 `reexportSpecifiers` | re-export 체인 추적 | code node 재료 | L2 | 예 | 초 |
| N11 | `docs/hashchat-release-checklist.md`(체크 21개), `docs/release-namespace-rollout-checklist.md`, `mingle-app/rn/IOS_APPSTORE_SUBMISSION_CHECKLIST.md`(체크 17개) | 검사로 옮길 수 있는 항목: 메타데이터 dry-run(`scripts/devbox ios-appstore-sync-metadata --dry-run`, `node scripts/google-play-console-sync.mjs --dry-run`), 업로드 뒤 `mediaSnapshots` 커밋 여부(C12가 실패로 알려 줌), "라우트를 지우기 전에 `*_CLIENT_MIN_SUPPORTED_VERSION`부터 올린다" | check 후보 | L3 | 아니오 | 초~분 |

`scripts/agent-gate.mjs`가 바로 가져다 쓸 것: 레인·범위 판정은 N9의 glob 함수, CI 수집은 N1처럼 GitHub API(또는 `gh pr checks`), 롤백 집계는 E1.

## 5. 게이트 증거 소스

| ID | 소스 | 내용 | 역할 | 레인 | 비고 |
|---|---|---|---|---|---|
| E1 | `git log --oneline --grep '^Revert' origin/main` | 31건. 레인별 L1 8, L2 13, L3 7, 미분류 3. 2026-08-01 이후 8건 / 머지 PR 175건 | evidence (설계 3순위) | 전 레인 | 초 |
| E2 | `git log --merges --first-parent origin/main` | "Merge pull request" 252건. 2026-10-01 이후 main 직접 푸시 0건 (2026-08~09월은 124건) | evidence | — | 10월 이후는 PR 단위 집계가 깨끗하다 |
| E3 | GitHub Actions job 결과 | job 이름: `Push Context Gate`, `Unit Tests (Vitest N/4)`, `Typecheck (tsc)`, `STT Transport and Segmentation Tests`, `RN Unit Tests (Jest)`, `Android JVM Unit Tests`, `App Namespace Contracts (...)`, `Landing Namespace Contracts`. Android 실패 시 리포트 artifact | evidence (1순위) | — | 1.3절 주의 |
| E4 | `app_event_logs` (`AppEventLog`, `mingle-app/prisma/schema.prisma`), 수집 라우트 `mingle-app/src/app/api/log/client-event`, 처리 `mingle-app/src/server/api/handlers/v1/log-client-event-handler.ts` | 클라이언트 허용 이벤트: `stt_session_started`, `stt_session_stopped`, `stt_turn_started`, `stt_turn_finalized`, `conversation_hydration_order_preserved`, `ui_diagnostic`(`mingle-app/src/lib/ui-diagnostics.ts`). 서버 이벤트 `tts_generated`, `tts_failed` 등. 로컬 DB는 `BEGIN READ ONLY`로 읽음 (Q5가 이미 씀) | evidence | L2 | 오류 이벤트 종류는 없다 |
| E5 | PostHog (`docs/posthog.md`, `mingle-app/src/lib/posthog-server.ts`, `mingle-app/src/lib/posthog-client.ts`) | pageview, autocapture, rage·dead click, Web Vitals, session replay | evidence (배포 후) | L1·L2 | `capture_exceptions: false`. 조회용 키는 레포에 없음 |
| E6 | `/admin/dashboard` (`mingle-app/src/app/admin/dashboard`, `mingle-app/src/lib/admin-dashboard-usage.ts`) | 일별 STT 지연·번역 지연(p95 포함), 글자당·토큰당 지연, DAU, 메시지수 | evidence (배포 후 회귀) | L2 | 운영 DB 읽기, 관리자 세션 필요 |
| E7 | `AdminAuditLog`, `AppFeedback` (`mingle-app/prisma/schema.prisma`) | 관리자 작업 기록, 앱 안 사용자 피드백 | evidence | — | — |
| E8 | `/railway/health` (`railway/start-single-service.mjs`, `railway.json` healthcheck 300초) | 앱·STT·messaging 세 포트가 모두 떠야 200. main은 자동 배포 (`docs/railway-single-service.md`) | evidence (배포) | L2·L3 | — |
| E9 | QA 산출물 (gitignore): `mingle-app/qa/mobile-ui/reports/<시각>/`, `mingle-app/qa/mobile-ui/reports/stt-audio/`, `.devbox-logs/` | 워커가 게이트에 넘길 실기기 증거. 지금은 로컬에만 남는다 | evidence | L1·L2 | — |
| E10 | UI 이력의 "확인/Verification" 줄 (`mingle-app/docs/ui-ux-codex-thread-history.md`) | 자기 보고. "lint" 통과 언급 68회 (lint는 CI에 없음) | evidence (설계 4순위, 참고만) | — | — |

### 5.1 2026-08-01 이후 Revert 8건

| 날짜 | 커밋 | 되돌린 것 | 레인 |
|---|---|---|---|
| 2026-10-30 | `af615d7a` | 이어폰 모드가 항상 마이크+기기 오디오를 캡처하던 변경 | L2 |
| 2026-10-19 | `e4f2d718` | 관리자 피드 미리보기의 앱 폰 카드 | L1 |
| 2026-10-18 | `ade635be`, `e50c7ba6`, `c90707ea` | 사진 생성 프롬프트 변경 3건 (같은 날, 같은 기능) | L2 |
| 2026-09-28 | `a239b380` | 네이티브 STT 중단 가드 | L3 |
| 2026-09-28 | `9f9659f9` | 사진 선택기가 열린 동안 음성 STT 유지 | L1 |
| 2026-08-26 | `6405fb55` | 가입 환영 메시지·언어 자동 선택 수정 | L2 |

설계 7장의 "L2 롤백 0건이 한 달 이어지면 자동 머지 검토" 기준으로 보면, 마지막 L2 Revert가 2026-10-30이라 아직 성립하지 않는다.

### 5.2 레인 표 dry-run (origin/main `1e033d8c` 기준 최근 머지 PR 20개)

설계 3장 표의 경로를 그대로 정규식으로 옮겨 `git diff <merge>^1 <merge>`에 적용했다. 이번 조사에서 인라인으로 돌렸고 레포에 커밋된 스크립트는 아니다.

| 날짜 | PR | 최고 레인 | 파일 | 표에 없는 경로 |
|---|---|---|---|---|
| 11-01 | #419 | L3 (coin) | 4 | |
| 11-01 | #418 | L2 | 7 | |
| 11-01 | #417 | L2 | 62 | `mingle-app/package.json`, `pnpm-lock.yaml`, `public/flags/*`, `public/fonts/…woff2`, `src/app/globals.css`, `src/app/layout.tsx` |
| 11-01 | #416 | L1 | 7 | `mingle-app/package.json`, `pnpm-lock.yaml`, `public/fonts/…woff2`, `src/app/globals.css`, `src/app/layout.tsx` |
| 11-01 | #415 | L2 | 2 | |
| 11-01 | #413 | 미분류 | 2 | `scripts/chatgpt-pool-extension/*` |
| 11-01 | #412 | L2 | 4 | |
| 11-01 | #411 | L1 | 3 | |
| 11-01 | #410 | L2 | 24 | |
| 11-01 | #409 | L2 | 4 | |
| 11-01 | #408 | L2 | 23 | `mingle-app/src/integration/live/operator-inbox.test.ts` |
| 11-01 | #407 | 미분류 | 1 | `mingle-app/scripts/seed-starter-engagement.mts` |
| 11-01 | #405 | L3 (`railway/start-single-service.mjs`) | 3 | |
| 11-01 | #406 | 미분류 | 1 | `mingle-app/scripts/seed-starter-engagement.mts` |
| 11-01 | #404 | L2 | 6 | |
| 10-31 | #403 | L2 | 3 | |
| 10-31 | #402 | L2 | 12 | |
| 10-31 | #401 | L2 | 3 | `mingle-app/src/instrumentation.ts` |
| 10-31 | #400 | L1 | 2 | |
| 10-31 | #399 | 미분류 | 1 | `mingle-app/scripts/seed-starter-engagement.mts` |

읽을 점
- `mingle-app/scripts/seed-starter-engagement.mts`는 머리 주석이 `railway run -- npx tsx scripts/seed-starter-engagement.mts`이고 운영 DB에 좋아요·댓글·스타터 피드를 쓴다. 레인 표에는 없지만 성격은 L3(데이터 변경)다. 같은 성격의 파일이 `mingle-app/scripts/`에 더 있다: `backfill-operator-interest-languages.mjs`, `draw-pending-photos.mts`, `import-operator-review.mjs`, `repair-royce-welcome.sql`, `starter-feed-candidates.mts`.
- `mingle-app/package.json`은 표에 "version"만 L3로 있다. 의존성 추가(#416, #417)는 어느 레인인지 정해져 있지 않다.
- `src/app/layout.tsx`, `src/app/globals.css`, `src/instrumentation.ts`, `public/**`처럼 앱 전체에 걸리는 파일이 표에 없다.
- 설계 1단계 완료 기준("최근 머지 PR 20개에서 Nam의 실제 판단과 레인 일치")에 쓰려면 미분류의 기본 레인부터 정해야 한다.

## 6. 학습 경로 재료

### 6.1 재료 목록

| ID | 경로 | 내용 | 역할 | 제약으로 바꾸는 방법 |
|---|---|---|---|---|
| L1 | `mingle-app/docs/ui-ux-codex-thread-history.md` | 5,065줄, 날짜 항목 371개(최신순, "This is the only copy"). 항목 형식: 화면, 문제, 변경, 그대로, 확인. 131개 atom으로 쪼개져 Q2·Q3가 atom id로 참조 | learning + evidence | 같은 문제가 반복되면 규칙 한 줄(근거: 항목 제목들). "확인" 줄에 기기 미확인이 있으면 다음 plan.json에서 그 경로의 `device_qa`를 필수로 |
| L2 | `mingle-app/qa/mobile-ui/ATOM_CLASSIFICATION.md`, `COVERAGE.md`, `IOS_REGRESSION_INVENTORY.md`, `ANDROID_REGRESSION_INVENTORY.md`, `IOS_REGRESSION_BACKLOG.md`, `ANDROID_REGRESSION_BACKLOG.md` | 79 자동, 44 미자동(테마별 표), 2 오라클 불명, 1 재현 불명, 3 보류, 2 웹 전용 | learning + 백로그 | 미자동 44개는 "검사 추가" 워커 단위 목록. 오라클 불명 2개는 사람 판단 대기 |
| L3 | [브랜치] `mingle-app/qa/agent/taste.md`, `mingle-app/qa/agent/rubric.md` (`14159147b`) | 취향 규칙 T1~T23, 규칙마다 출처 이력 제목. 판정 pass/concern/fail/blocked/manual, 심각도 S0~S3, 번역 1~5점, "증거 없는 발견은 최대 S3", 사용자가 판정을 뒤집으면 규칙을 고치는 보정 루프 | learning | 설계의 "한 줄 = 한 규칙, 근거 필수"에 가장 가까운 형식. 그대로 `docs/agent-constraints.md`의 UI 절이 될 수 있다 |
| L4 | `docs/handoff/kiro-ai-qa/README.md` (`c72f6322`) | 0장 절대 규칙 5개(실기기 우선, 시뮬레이터 런타임 삭제 금지, dev 서버는 허락 후, 공유 폰은 먼저 묻기), 8장 함정 11개 | learning | 규칙 줄로 옮기고, 폰 관련은 W3 점유 확인으로 코드화 |
| L5 | `docs/mingle-codex-thread-handoff-2026-09-01.md` (`5fbdb3bcd`) §13.4, §17 | migration 금지 사항, 금지 목록 21개 (예: "build/archive 성공을 실제 기기 기능 검증 완료로 표현") | learning | migration 디렉터리 불변은 코드 검사로. 나머지는 규칙 줄 |
| L6 | `docs/mingle-2.0.0-pr-203-206-thread-handoff.md` (`602d69fca`) §7 | Prisma·DB 금지 사항 (디렉터리 삭제·이름 변경·재정렬 금지, generate만으로 적용 완료 판단 금지) | learning | L5와 같은 검사 |
| L7 | `docs/handoff-remove-pre-2.2.0-routes.md` (`ef6fb466`) §2.3 | v2.2.0 트리가 구버전 트리를 re-export 하는 함정 | learning | 이미 C10이 막는다. C10은 이 문서보다 먼저(`9012f36dd`, 2026-09-26) 추가됐다 |
| L8 | `docs/feed-login-redirect-handoff.md` "주의", `docs/chatgpt-pool-handoff.md` "Hard rules" | 폰 공유, 번들 ID 덮어쓰기, `VAULT_ADDR` 없으면 DB URL이 빔, 이름으로 `pkill` 금지, API 키 출력 금지 | learning | 규칙 줄 |
| L9 | `docs/qa/pr-211-device-local-first-2026-09-05.md`, `docs/qa/pr-211-message-recovery-2026-09-05.md`, `docs/qa/pr-211-service-integration-2026-09-05.md`, `docs/photo-translation-verification.md` | 시나리오 × 플랫폼 Pass/Fail 표와 증거 열, 환경·주입 방식·제외 범위를 먼저 적는 형식 | learning + 형식 견본 | L2 게이트의 "실기기 QA 결과 첨부" 형식으로 그대로 쓸 수 있다 |
| L10 | `CLAUDE.md` | devbox 동시 세션 규칙 | learning 진입점 | Claude만 읽는다. Codex용 `AGENTS.md`는 없고 `.kiro/`는 gitignore다. `docs/agent-constraints.md`를 만들면 진입점마다 "먼저 읽기"를 걸어야 한다 |

### 6.2 제약 줄 예시 (설계 형식: 한 줄 = 한 규칙, 근거 필수)

```
- migration 디렉터리는 추가만 한다. 삭제·이름 변경·재정렬은 빨강.
  근거: 5fbdb3bcd docs/mingle-codex-thread-handoff-2026-09-01.md §13.4, 602d69fca docs/mingle-2.0.0-pr-203-206-thread-handoff.md §7.1
  검사: git diff --name-status origin/main -- mingle-app/prisma/migrations 에 D 또는 R이 있으면 빨강
- 빌드·아카이브 성공을 기기 검증으로 보고하지 않는다.
  근거: 5fbdb3bcd 같은 문서 §17
  검사: plan.json에 device_qa가 있는 단위에 report.json이 없으면 빨강
- v2.2.0 라우트는 구버전 트리를 re-export 하지 않는다.
  근거: 9012f36dd (C10), ef6fb466 docs/handoff-remove-pre-2.2.0-routes.md §2.3
  검사: 이미 C10
- 작성창·키보드 경로를 바꾸는 단위는 text-message-translation 시나리오를 돌린다.
  근거: [브랜치] 14159147b taste.md T1 (이력 항목 4개)
  검사: N9 selectScenarios가 plan.json의 device_qa를 채움
- 남의 세션이 쓰는 폰은 Appium으로 잡지 않는다.
  근거: c72f6322 docs/handoff/kiro-ai-qa/README.md 0장 4 (2026-10-15 앱 삭제 사고), docs/worktree-devbox.md "폰은 사용자가 지정"
  검사: QA 러너 시작 전에 devbox-shared/devices 점유 확인 (지금은 없음)
```

## 7. 빈틈 (자동 검사 없이 "괜찮아 보임"에 기대는 곳)

| ID | 빈틈 | 근거 | 지금 기대는 것 | 바꾸는 방법 (짧게) |
|---|---|---|---|---|
| G1 | CI가 안 도는 변경 | `paths`에 없는 경로: `docs/**`, `shared/**`(설계상 L2), `mingle-messaging/**`(테스트 4개, Railway `watchPatterns`에는 있어 머지하면 배포됨), `railway/**`·`Dockerfile.railway`·`railway.json`(L3, main 자동 배포), `mingle-landing/**`(계약 2파일만), `mingle-model-test/**`. PR base 필터 때문에 쌓인 PR은 TDD job 없음 | "CI 초록" 표시 | 게이트가 L1 이상에서 "실행 없음"을 빨강으로 보고, 해당 경로를 직접 검사 |
| G2 | 로컬에서만 도는 검사 | C19 lint(이력에 "lint 통과" 68회), RN TypeScript(`mingle-app/tsconfig.json`이 `rn/**/*`를 빼고 `mingle-app/rn/App.tsx`는 222KB. handoff 4.4가 기존 RN tsc 오류를 언급), `next build`(CI 없음, Railway Docker 빌드가 처음 실행), C20, C21, C22, C23, C28 | 에이전트 자기 보고 | CI job 추가 또는 게이트가 워커 산출물로 요구. RN tsc는 기존 오류 기준선이 먼저 필요 |
| G3 | DB·마이그레이션·env | CI에 Postgres가 없어 마이그레이션 99개를 빈 DB에 적용해 보는 검사가 없다. C26(코인 원장 포함)은 늘 skip. migration 불변 규칙은 문서 두 곳에만 있다. `.env.example`과 코드의 env 키를 비교하는 검사가 없다. 운영 DB에 쓰는 `mingle-app/scripts/*` 6개가 레인 표에 없다 | Nam 확인 (L3) | Postgres 서비스 컨테이너 + `prisma migrate deploy` + C26 실행, 6.2 첫 줄 검사, env 키 diff. 게이트의 `migration`·`env_change`가 경로 매칭 말고도 근거를 갖게 됨 |
| G4 | 실기기 확인 | 2026-10-01 이후 UI 이력 11개 중 10개가 기기·브라우저 미확인. QA 결과는 gitignore된 로컬 폴더에만. atom 44개 미자동화. Q5는 CER·지연 임계값과 기준선이 없고 합성 음성이라 CER 0%가 기본값(handoff 4.3). Android 주입 경로는 기기 미검증(handoff 4.4) | "Not tried on a device" 문장 | 게이트가 L2 단위의 `report.json`을 요구. Q5에 임계값과 저장된 기준 run(`--evaluate-run`) 비교 추가 |
| G5 | TTS·에코 시뮬레이션 | 설계 학습 예시는 "시뮬레이션 수치 + 실기기"를 요구하지만, `mingle-app/rn/ios/mingle/MingleTranslationEchoCanceller.swift`에는 테스트도 시뮬레이션도 없다. 조정 커밋 6개(`e7cebf58`, `54b445e3`, `e8a7e67d`, `a60088c0`, `7fc95c79`, `e6327151`)는 기기 로그로만 확인했다. C22와 같은 `swiftc` 방식을 쓸 수 있다 | 기기 로그를 사람이 읽음 | 정답 WAV + TTS 클립을 섞어 잔여 에코 dB를 재는 Swift CLI 테스트 |
| G6 | 병렬 워커의 기기 격리 | 3장 "걸리는 점": Appium 포트 4723 고정, 점유 파일 무시, 같은 번들 ID, `--device-app-env prod` | 사람이 폰을 배정 | QA 러너가 W3 점유를 확인하고, 워크트리별 Appium·systemPort·wdaLocalPort를 W1처럼 계산, 에이전트 워커는 prod env 거부 |
| G7 | 레인 판정 입력 | 5.2: 최근 PR 20개 중 8개가 표에 없는 경로, 4개는 전부 미분류. PR 템플릿 없음(`.github/`에 workflows만). `.agent/` gitignore 없음 | 메모리 속 머지 규칙 | 미분류 기본 레인 정하기(예: 묻기 또는 L2), `mingle-app/scripts/*` 중 운영 데이터 스크립트는 L3 |
| G8 | 배포 후 오류 관측 | PostHog `capture_exceptions: false`, 크래시 리포터 의존성 없음, client-event 허용 목록에 오류 종류 없음, RN WebView 로드 오류는 서버에 안 보냄 | Revert와 사용자 피드백(E7) | 오류 이벤트 1종 추가 또는 PostHog 예외 수집. 그 전까지 게이트 3순위 증거는 Revert뿐 |
| G9 | L0 문서 게이트 기준선 | 절대경로 링크 34개가 전부 깨짐(7파일, `mingle-app/qa/mobile-ui/`, 브랜치에서는 고쳐져 있음). 문서의 backtick 경로 359개 중 31개가 없는데 대부분 gitignore 파일(`.env.local`), 계획 파일(`scripts/agent-gate.mjs`), 브랜치 전용 파일 | 없음 | L0 검사는 허용 목록(gitignore, "계획" 표시)이 있어야 오탐이 안 난다 |
| G10 | 복사본 일치 | `shared/i18n/mingle-version-policy.ts`(234줄)와 `mingle-app/src/i18n/mingle-version-policy.ts`(330줄)가 이미 다르다. `mingle-locales.ts` 두 벌은 지금 같다. 비교 검사 없음 | 없음 | 두 파일 diff 검사 (code node) |
| G11 | AI QA 파일럿 미머지 | Q12, Q13, N9, L3이 `origin/codex/zealous-satoshi-975fd5`에만 있다(90커밋 뒤). handoff 3.3은 시나리오가 리브랜드 전 화면 기준이라고 경고 | 없음 | 머지하면 기기 단위 선택(N9)과 취향 규칙(L3)이 생긴다 |

## 8. 설계 요소별로 지금 쓸 수 있는 것

| 설계 요소 | 지금 있는 것 | 비어 있는 것 |
|---|---|---|
| 분할기 입력 `docs/agent-constraints.md` | L1~L10, L3 형식 | 파일 없음. 진입점은 `CLAUDE.md`뿐 |
| 워커 루프의 단위 검사 | C17, `pnpm --dir mingle-app test:unit <경로>`, `tsc`, C19, C20, C21, `mingle-stt`·`mingle-messaging`의 `pnpm test` | RN tsc 기준선 |
| 워커 격리 | W1~W5 | G6 |
| 실기기 QA 노드 | Q1~Q5, Q6 오라클, [브랜치] Q12·Q13 | 결과를 PR에 붙이는 길 (E9는 로컬 전용) |
| 코드 노드 `scripts/agent-gate.mjs` | N9 glob, N1 GitHub API 방식, E1, 5.2 정규식 | 미분류 기본 레인, migration·env 판정(G3) |
| 게이트 1순위 증거 | E3, C1~C18 | `skipped`·`cancelled`·실행 없음 처리(1.3) |
| 게이트 3순위 증거 | E1, 5.1 | 경로별 롤백 집계는 이번 분류가 처음 |
| 수정 경로 반환 JSON | Q1·Q2·Q5·Q4의 stdout JSON + exit code + 리포트 경로 | — |
| 학습 경로 | L3 형식, C10 선례 | — |
