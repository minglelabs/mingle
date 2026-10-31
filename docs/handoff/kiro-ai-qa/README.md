# AI QA 자동화 인수인계서 (Claude Code → Kiro)

작성: 2026-10-30. Claude Code에서 2026-10-15부터 진행한 "AI가 사람 대신 앱 QA를 해주는 체계" 작업을 Kiro에서 이어받기 위한 문서.
**이 문서만 읽고 바로 작업을 이어갈 수 있게 쓰는 것이 목표**다. 모르는 게 생기면 4장의 브랜치와 파일을 직접 열어 확인한다.

---

## 0. 30초 요약

| 작업 | 브랜치 / PR | 상태 | 다음 할 일 |
|---|---|---|---|
| A. AI QA 파일럿 (시나리오 카탈로그 + 취향 규칙 + `/qa` 스킬 + 실기기 드라이버) | `codex/zealous-satoshi-975fd5` (**PR 없음**, push 완료) | 도구는 완성. 시험 실행은 시나리오 1개만 하다 중단 | main 따라잡기(충돌 2개) → 시나리오 2~3 실행 → 리포트 → PR |
| B. QA 전용 STT 오디오 주입 + 정답 오디오 + 측정 스크립트 | `codex/busy-villani-ce2dfa` → [PR #279](https://github.com/minglelabs/mingle/pull/279) (OPEN) | 완성. 아이폰 측정까지 끝남 | main 따라잡기(충돌 1개, `rn/App.tsx`) → 리뷰·머지 |
| C. `updated_at`이 9시간 어긋나게 저장되는 버그 | `codex/updated-at-utc-trigger` → [PR #281](https://github.com/minglelabs/mingle/pull/281) (OPEN) | 완성. main과 충돌 없음 | 리뷰·머지 |
| D. 한국어만 STT 확정이 약 3초 늦는 원인 조사 | 커밋 없음. 실험 워크트리 `.claude/worktrees/korean-stt-devrun` | **원인 미확정**. 아이폰 1회 실행만 남음 | 6장 실행 계획대로 아이폰에서 캡처 → 오프라인 재생으로 원인 분리 |

**절대 규칙 (사용자 지시, 어기면 사용자가 화냄):**
1. **QA는 연결된 실제 아이폰이 1순위.** 폰이 없거나 다른 작업이 쓰고 있을 때만, 시뮬레이터로 되는 시나리오를 시뮬레이터에서 돌린다. 폰이 있는데 시뮬레이터를 켜면 안 된다.
2. **iOS 시뮬레이터 런타임은 절대 지우지 않는다.** 지우면 Xcode가 실기기용 빌드까지 거부한다("iOS 26.5 is not installed"). 복구하려면 `xcodebuild -downloadPlatform iOS`로 8GB를 다시 받아야 한다. 정리할 때는 시뮬레이터 *기기*만 지운다.
3. **dev 서버(devbox, Metro, `pnpm dev`)는 사용자 허락 없이 띄우지 않는다** (`CLAUDE.md`).
4. **아이폰은 공유 자원이다.** 앱 설치·삭제·실행 전에 다른 작업이 폰을 쓰고 있지 않은지 사용자에게 확인한다. 2026-10-15에 한 작업이 앱을 지우는 바람에, 로그인을 기다리던 다른 작업이 날아간 적이 있다. 앱을 다시 설치하면 사용자가 폰에서 "로컬 네트워크 허용 → 온보딩 → 로그인"을 매번 다시 해야 한다. 그러니 설치는 최소화한다.
5. 응답은 **한국어**, 간단명료하게. 끝에 100자 이내 요약과 사용자 액션을 적는다. 커밋·푸시는 하지 말라는 말이 없으면 바로 한다. 메인 폴더 `~/mingle`은 main에 두고, 작업은 워크트리에서 한다.

---

## 1. 배경: 왜 이걸 하는가

사용자(Mingle/HashChat 1인 개발자)는 변경할 때마다 아이폰으로 직접 UI/UX, 번역 품질, 음성인식, 버벅임을 확인하느라 시간과 에너지를 많이 쓴다. 원하는 것은 이렇다.

- 고전적 TDD가 아니라 **AI가 실제로 앱을 만지면서(mobile use) QA**하는 것
- **사람(사용자)의 취향 기준**으로 평가하는 것
- 사용자는 결과 리포트만 5분 보고 끝내는 것

과거 버그 이력은 `mingle-app/docs/ui-ux-codex-thread-history.md`에 쌓여 있다. 2026-10-15에 두 파일로 갈라져 있던 걸 이후 main에서 이 파일 하나로 합쳤고, 루트의 `docs/` 사본은 삭제됐다. 이력에 "실기기 검증 pending"이 100번 넘게 나온다. 병목은 기록이 아니라 **검증**이다.

### 설계: 3층 구조

1. **결정론 게이트 (이미 있음):** `mingle-app/scripts/mobile-ui-qa.mjs`, `ios-ui-regression-suite.mjs`, `android-ui-regression-suite.mjs` (Appium), `pnpm test:qa:ui:contracts` (vitest). 과거 이슈 131개 중 79개를 자동화했다. 문서는 `mingle-app/qa/mobile-ui/`. "안 깨졌나"를 싸게 본다.
2. **AI QA 에이전트 (작업 A):** 시나리오 카탈로그와 취향 규칙(`taste.md`)을 기준으로 AI가 폰을 직접 조작하고, 스크린샷·이벤트 로그·기기 로그를 보고 판정해 HTML 리포트를 만든다. "쓰기 좋은가"를 본다.
3. **측정 가능한 신호 (작업 B):** 음성인식은 사람이 말할 수 없으니 WAV를 마이크 대신 주입한다. 오인식률(CER/WER)과 "말 끝 → 번역 표시" 지연을 숫자로 잰다. 버벅임도 스크린샷으로는 판단할 수 없으니 수치(FPS 캡처 스크립트, 이벤트 타임스탬프)로 본다.

AI가 대신 못 하는 것은 수동 체크리스트로 남긴다: 블루투스·에어팟 오디오 경로, 실제 소음 환경, TestFlight 전용 AdMob, 햅틱 느낌.

---

## 2. 환경 정보

| 항목 | 값 |
|---|---|
| 맥 | Apple Silicon, macOS (Darwin 25.5) |
| Xcode iOS 플랫폼 | iOS 26.5 (23F77). 시뮬레이터 런타임 ID는 재설치 후 `E92ED57D-...`. **지우지 말 것** |
| 실기기 | "Royce의 iPhone", iPhone 14 (iPhone14,7), iOS 26.6.x. Xcode/Appium UDID `00008110-000668EA0EE1401E`, devicectl ID `99561FED-7D66-560E-81E1-A239CD308AB6` |
| 다른 기기 | iPhone 11 Pro (unavailable, 안 씀) |
| 서명 | Team `3RFBMN8TKZ`, WDA 번들 `com.minglelabs.mingle.rn.WebDriverAgentRunner` |
| 앱 번들 ID | `com.minglelabs.mingle.rn` (Mingle과 HashChat이 **같은 번들 ID**라서 설치하면 서로 덮어쓴다) |
| 앱 상태 (main) | **HashChat** 리브랜드 완료, `MARKETING_VERSION = 2.3.0`. 작업 A·B 브랜치는 리브랜드 전(2.1.1)에 갈라져 나왔다 |
| 맥 LAN IP | 수시로 바뀐다 (192.168.0.13 → 172.20.10.5 핫스팟 등). 매번 `ipconfig getifaddr en0`로 확인. QA 빌드는 빌드할 때 IP가 박히므로 IP가 바뀌면 다시 빌드해야 한다 |
| 로컬 DB | 로컬 Postgres, `TimeZone = Asia/Seoul` (작업 C 버그의 원인). 운영 DB는 Railway이고 **절대 건드리지 않는다** |
| devbox | `scripts/devbox up --profile local --host <LAN IP>`. 워크트리마다 포트가 따로라 동시에 여러 개를 띄울 수 있다. 문서는 `docs/worktree-devbox.md` |

---

## 3. 작업 A: AI QA 파일럿 (가장 중요)

### 3.1 브랜치

- 브랜치: `codex/zealous-satoshi-975fd5` (origin에 push 완료, 마지막 커밋 `29f40f02` "Fall back to an iOS Simulator when the phone is unavailable")
- 원래 워크트리: `~/mingle/.claude/worktrees/mingle-project-writing-20402a` (커밋 안 된 변경은 `Podfile.lock`, `project.pbxproj`뿐인데 둘 다 빌드 부산물이다)
- 커밋 순서:
  ```
  14159147 Add agent-driven UI/UX QA: taste rules, scenarios, simulator tooling and /qa skill
  810ee475 Run agent QA on the connected iPhone instead of the iOS Simulator
  1b1ea685 Pass the devbox LAN host explicitly when installing the QA build
  1d481d5a Generate agent QA reports from results.json
  c23a52ff Build the device QA app separately from installing it
  2224eaac Ask before touching a shared phone even when its other session looks idle
  86199dd1 Prebuild WebDriverAgent for device QA without touching the phone
  97ef5cae Time out the STT port check in qa-agent-device servers
  29f40f02 Fall back to an iOS Simulator when the phone is unavailable
  ```

### 3.2 만든 것

| 경로 | 내용 |
|---|---|
| `.claude/skills/qa/SKILL.md` | `/qa` 스킬 본문. **Kiro에서는 이 문서를 그대로 작업 절차서로 쓰면 된다** (7장 참고) |
| `mingle-app/qa/agent/README.md` | 에이전트 QA 개요 |
| `mingle-app/qa/agent/taste.md` | 사용자 취향 규칙 **T1~T23**. 과거 버그 리포트에서 뽑았고, 규칙마다 출처 이력 항목이 달려 있다. 예: 키보드가 멋대로 닫히면 안 됨, 오버레이가 컨트롤을 가리면 안 됨, 라벨이 잘리면 안 됨, 한 화면에 언어가 섞이면 안 됨 |
| `mingle-app/qa/agent/rubric.md` | 판정(pass/concern/fail/blocked/manual), 심각도 S0~S3, 번역 1~5점(정확성·자연스러움·톤·지연), 반응 속도 임계값 |
| `mingle-app/qa/agent/scenarios/*.md` | 시나리오 16개 (3.3) |
| `mingle-app/qa/agent/fixtures/text-messages.md` | 텍스트 번역 시나리오용 입력 문장 |
| `mingle-app/scripts/qa-agent-scenarios.mjs` (+ `.logic.mjs`, `.logic.test.mjs`) | `select --base origin/main`: diff에 맞는 시나리오 고르기. `list`: 전체 목록. `check`: 시나리오 frontmatter 검증 |
| `mingle-app/scripts/qa-agent-device.mjs` | 실기기·시뮬레이터 드라이버 CLI. 명령은 3.4 |
| `mingle-app/scripts/qa-agent-report.mjs` | `results.json` → `report.html` (스크린샷을 data URI로 넣은 단일 파일, 10MB 이하) |
| `mingle-app/qa/mobile-ui/*.md` | 깨져 있던 절대경로 링크(`/Users/nam/.codex/worktrees/...`) 수정 |
| `.gitignore` | `mingle-app/qa/agent/runs/`, `mingle-app/qa/agent/local/` 제외 |

### 3.3 시나리오 16개

| id | 우선순위 | 환경 |
|---|---|---|
| first-launch-and-login | P0 | device |
| text-message-translation | P0 | device |
| composer-photo-attach | P0 | device |
| stt-survives-navigation | P0 | device |
| live-voice-translation | P0 | assisted (사람이 말해야 하는 부분 있음 → 작업 B의 WAV 주입으로 대체 가능) |
| back-stack-nested-surfaces | P1 | device |
| bubble-display-modes | P1 | device |
| list-warm-tab-switch | P1 | device |
| long-chat-scroll | P1 | device |
| message-unsend | P1 | device |
| native-banner-overlays | P1 | device |
| photo-viewer-translation | P1 | device |
| room-language-selector | P1 | device |
| earphone-mode-tts | P2 | assisted (이어폰 필요, 사람이 해야 함) |
| explore-search-profile-back | P2 | device |
| locale-copy-sweep | P2 | device |

각 시나리오 파일의 frontmatter는 `id, priority, environment, tags, taste, paths`다. `paths`는 diff 기반 선택에 쓴다. 본문은 Preconditions / Steps / Oracle / Signals로 되어 있다.

> ⚠️ 이 시나리오들은 HashChat 리브랜드와 2.2.0/2.3.0 변경(피드, 코인, 온보딩 개편 등) **이전**에 썼다. main을 따라잡은 뒤 **화면 문구와 흐름이 지금 앱과 맞는지 하나씩 대조해서 고쳐야 한다**. 특히 first-launch-and-login(온보딩이 #361에서 바뀜)과 locale-copy-sweep.

### 3.4 드라이버 사용법 (`node mingle-app/scripts/qa-agent-device.mjs …`)

| 명령 | 하는 일 |
|---|---|
| `devices` | 연결된 아이폰 목록 |
| `servers` | 이 워크트리의 devbox가 떠 있고 폰이 닿는 LAN 호스트가 있는지 확인 (`ok: true` 필요) |
| `build [--sim]` | QA 브리지가 켜진 Release 빌드를 만든다. JS 번들이 들어가 있어 Metro가 필요 없다. WebView는 inspect할 수 있고, URL은 전부 이 워크트리의 devbox를 가리키며, 광고는 Google 테스트 유닛을 쓴다. 처음엔 약 10분 걸린다. 네이티브(`mingle-app/rn/**`)가 바뀌었을 때만 다시 빌드한다. 웹 변경은 devbox가 실시간으로 내보낸다 |
| `install [--fresh] [--sim]` | 폰에 설치. `--fresh`는 먼저 지운다(앱 데이터가 날아가므로 사용자 확인 필수) |
| `prepare-wda` | WebDriverAgent를 폰 없이 미리 컴파일·서명한다. 맥당 한 번 |
| `start [--sim]` | Appium 세션 시작(폰에 WDA를 설치·실행하고 화면 크기(pt)를 출력) |
| `screenshot <path>` | 스크린샷. 한 장에 0.3~1초 걸리니 프레임 단위 판정은 불가 |
| `tap x y` / `long-press x y [ms]` / `swipe x1 y1 x2 y2 [ms]` | 단위는 pt. iOS 뒤로가기는 `swipe 2 400 300 400` |
| `type <text>` | 포커스된 필드에 입력 |
| `alert text` / `alert accept` / `alert dismiss` | 시스템 알림 처리 |
| `snapshot` | `liveDemo`(방), `conversationList`, `activeElement`(작성창 포커스 여부), `alerts`, viewport |
| `eval '<js>'` | WebView에서 JS 실행 (예: `window.__MINGLE_QA__.seedScrollPerformanceHistory()`). **클릭 대용으로 쓰지 말 것** (로그인 폼 채우기만 예외) |
| `app terminate` / `app launch` | 앱 재시작 |
| `logs --grep STT` | 세션 시작 이후 앱의 기기 syslog |
| `stop` | 세션 종료, WDA 해제 |

클라이언트 이벤트는 로컬 DB에서 읽기 전용으로 조회한다:
```sql
BEGIN READ ONLY;
SELECT created_at, event_type, metadata FROM app.app_event_logs WHERE created_at > '<시작 UTC>' ORDER BY created_at;
ROLLBACK;
```
접속 호스트가 `localhost`/`127.0.0.1`인지 먼저 확인한다. 운영 pooler에는 세션 SET이 새어 나가므로 쓰지 않는다.

QA 계정: `mingle-app/qa/agent/local/account.json` (gitignore 대상). 없으면 로컬 `POST /api/auth/signup`으로 `qa-agent+<워크트리명>@mingle.test`와 랜덤 비밀번호 계정을 만든다. **비밀번호를 채팅이나 로그에 찍지 않는다.** 방 `QA A`(한·영·일)와 `QA B`를 한 번 만들어 두고 계속 재사용한다.

### 3.5 시험 실행 결과 (2026-10-15, 아이폰, 시나리오 1개만)

실행 폴더(gitignore 대상, 원래 워크트리에만 있음): `mingle-project-writing-20402a/mingle-app/qa/agent/runs/20261015-1953-dry-run-iphone/` (`notes.md` + `shots/`)

**first-launch-and-login** (거의 끝냄, S0/S1 없음). 발견:
- 언어 선택 화면에서 English로 바꾸면 헤더·버튼은 영어가 되는데 언어 목록은 한국어 이름(영어, 한국어, 일본어…)으로 남는다 → 한 화면에 언어가 섞임 (T17)
- 영어 헤더가 두 줄로 줄바꿈되면서 목록을 밀어낸다 (T13, minor)
- "Chinese Simplified / 中文 ( 中国…"가 잘리고, 괄호 안 공백이 이상하다 (T16)
- 로그인 화면이 약관 시트로 바로 열리고 필수 항목이 미리 체크돼 있다. "Agree and continue" 버튼이 반투명 회색이라 비활성처럼 보인다
- **사용자가 로그인 방법을 고르지도 않았는데, "Agree and continue"만 누르니 키체인에 남아 있던 기존 계정으로 조용히 로그인됐다.** 개인정보·기대 측면에서 사용자 판단이 필요하다
- My 탭: 첫 탭에 안 열리고 두 번째 탭에 열렸다 (1/2회)
- 로그아웃에 확인창이 없고 바로 약관 시트로 돌아간다

> 이 결과는 리브랜드 전 2.1.1 기준이다. 온보딩이 #361에서 바뀌었으니 지금 앱에서 다시 확인해야 한다.

중단 이유: 실행 도중 다른 작업(hashchat-rebrand 워크트리)이 같은 번들 ID로 HashChat 2.2.0을 덮어 설치했다. **text-message-translation, composer-photo-attach는 아직 안 돌렸다.**

### 3.6 남은 일 (순서대로)

1. **main 따라잡기.** 새 워크트리에서 브랜치를 체크아웃하고 `git merge origin/main`을 한다. 충돌 2개가 난다.
   - `docs/ui-ux-codex-thread-history.md`: main에서 삭제됨, 브랜치에서 수정됨 → **삭제를 받아들인다** (`git rm`). main은 `mingle-app/docs/` 사본을 유일한 원본으로 정했다.
   - `mingle-app/docs/ui-ux-codex-thread-history.md`: 내용 충돌 → **main 쪽을 기준으로** 하되, 브랜치가 합쳐 넣은 루트 사본 항목 중 main에 없는 것이 있으면 날짜 순서에 맞춰 살린다. 줄 수로 대조해서 빠진 항목이 없는지 확인한다.
   - `mingle-app/qa/mobile-ui/README.md`, `qa/agent/*`, 스킬에 있는 이력 파일 링크도 `mingle-app/docs/ui-ux-codex-thread-history.md`로 맞춘다.
   - Podfile.lock·pbxproj는 main 쪽을 받는다. 그다음 `pnpm rn:pods`.
2. **리브랜드 반영.** 스킬·README·시나리오에 나오는 "Mingle" 앱 이름, 화면 문구, 버전을 HashChat 2.3.0 기준으로 고친다. 번들 ID는 그대로다. 피드·코인 등 새 화면은 시나리오에서 빠져 있으니 `uncoveredAppFiles`로 확인하고 필요하면 시나리오를 추가한다.
3. `node mingle-app/scripts/qa-agent-scenarios.mjs check`와 `node --test mingle-app/scripts/qa-agent-scenarios.logic.test.mjs` 통과 확인.
4. **시험 실행:** first-launch-and-login(다시), text-message-translation, composer-photo-attach. 폰이 연결돼 있고 비어 있으면 폰에서, 아니면 `--sim`으로 돌린다. 리포트 카드마다 어디서 돌렸는지(`target: phone|simulator`) 적는다.
5. `results.json` → `node mingle-app/scripts/qa-agent-report.mjs <run-dir>` → `report.html`을 사용자에게 준다. 사용자가 판정에 동의하지 않는 부분이 있으면 `taste.md`/`rubric.md`를 고친다(보정 루프).
6. PR 생성. 제목 예: "Add agent-driven UI/UX QA on the connected iPhone". 본문에 시험 실행 결과 요약을 넣고, run 폴더는 커밋하지 않는다.

---

## 4. 작업 B: QA 전용 STT 오디오 주입 ([PR #279](https://github.com/minglelabs/mingle/pull/279))

### 4.1 브랜치

- `codex/busy-villani-ce2dfa`, 원래 워크트리 `~/mingle/.claude/worktrees/busy-villani-ce2dfa`
- 커밋: `7a7feddab` (본체) → `49248ff2f` → `202bdfd2d` → `0ec1cf6ed` (아이폰 실행 기록)

### 4.2 구조

- **네이티브 주입 (QA 빌드 전용):** iOS `MingleQaAudioInjector`(`rn/ios/mingle/NativeSTTModule.swift`), Android `NativeSttQaAudioInjector.kt`. 마이크 샘플을 WAV 픽스처로 바꿔 넣는다: 앞 무음 → 픽스처(캡처 레이트로 리샘플) → 뒤 무음 → 세션이 끝날 때까지 무음. 기존 iOS input tap / Android `AudioRecord` 읽기 루프 안에서 바꿔치기하므로 속도·청크 크기·WebSocket 포맷이 마이크 경로와 똑같다.
- **브리지:** `window.__MINGLE_QA__.qaInjectAudio({ fixtureId, url | base64, leadingSilenceMs, trailingSilenceMs })` → RN `native_qa_inject_audio` → `NativeSTTModule.qaInjectAudio`. 이벤트(`armed`, `started`, `speech_started`, `speech_ended`, `finished`, `cleared`, `error`)는 시각과 함께 `window.__MINGLE_QA_AUDIO_INJECTION_EVENTS__`에 쌓인다.
- **게이팅 (release에서 절대 열리면 안 됨):** 웹은 기존 `shouldExposeNativeQaBridge` 플래그(`?qa=1&nativeQa=1&sttDebug=1&ttsDebug=1`), RN은 `RUNTIME_QA_BRIDGE_ENABLED`, iOS는 `MingleQaBridgeEnabled == "1"`이면서 provisioning profile이 들어 있을 때(App Store/TestFlight 설치에서는 거부), Android는 `MINGLE_QA_BRIDGE_ENABLED == "1"`이면서 debuggable일 때.
- **정답 세트:** `mingle-app/test-fixtures/audio/golden/manifest.json`. ko/en/ja/zh/es 10문장, 전사 정답, 허용 대안, 참조 번역. `pnpm qa:audio:golden`이 macOS 음성으로 로컬에서 렌더링한다.
- **측정:** `pnpm test:qa:stt-audio -- --ios-udid <UDID> --fixture-host <LAN IP> --fixtures ko-greeting-01,...` (`scripts/qa-stt-audio-metrics.mjs`). CER/WER과 "말 끝 → STT 확정 → 번역(DB) → 번역(UI)" 지연을 낸다.
- 문서: `mingle-app/qa/mobile-ui/STT_AUDIO_INJECTION.md`, `mingle-app/test-fixtures/audio/README.md`

### 4.3 아이폰 측정 결과 (2026-10-15)

| 픽스처 | CER | WER | 말 끝 → STT 확정 | → 번역(DB) | → 번역(UI) |
|---|---|---|---|---|---|
| ko-greeting-01 | 0% | — | **3746 ms** | 5004 ms | 4910 ms |
| ko-directions-01 | 0% | — | **4007 ms** | 5763 ms | 5640 ms |
| en-restaurant-01 | 0% | 0% | 889 ms | 2788 ms | 2640 ms |
| en-meeting-01 | 0% | 0% | 920 ms | 1861 ms | 1682 ms |
| ja-shopping-01 | 0% | — | 905 ms | 2126 ms | 2045 ms |
| ja-hotel-01 | 0% | — | 609 ms | 1799 ms | 1773 ms |
| zh-taxi-01 | 0% | — | 1083 ms | 2182 ms | 1729 ms |
| zh-price-01 | 0% | — | 589 ms | 2040 ms | 1983 ms |
| es-airport-01 | 0% | 0% | 971 ms | 1876 ms | 1994 ms |
| es-weather-01 | 0% | 0% | 800 ms | 1629 ms | 1611 ms |
| **중간값** | | | **913 ms** | **2083 ms** | **1989 ms** |

- 오인식률 0%는 깨끗한 합성 음성이라 나온 기준값이다. 변별력을 가지려면 잡음 섞인 실제 녹음과 억양 있는 녹음을 정답 세트에 넣어야 한다 (후속 과제).
- 한국어만 약 3초 늦은 문제 → 작업 D.
- 9시간 어긋난 `updated_at` → 작업 C. 측정 스크립트는 이 값을 쓰지 않고 `TRANSLATION_FINAL` 내용 행의 시각으로 잰다.

### 4.4 검증 상태

- 통과: `pnpm test:scripts`(새 테스트 10개 포함 16개), vitest LivePhoneDemo + native QA bridge 924개, 앱 `tsc --noEmit`, 변경 파일 eslint, iOS Debug/Release 빌드(시뮬레이터·기기), Android `:app:compileDebugKotlin`.
- **미검증:** Android 주입 경로를 기기나 에뮬레이터에서 돌려보지 못했다 (Kotlin 컴파일만 확인).
- RN `tsc`에서 기존 `__tests__/universalLinkConfig.test.ts` 오류가 나는데, 이 PR과는 무관하다.

### 4.5 남은 일

1. `origin/main` 머지. 충돌은 `mingle-app/rn/App.tsx` 하나다. main의 HashChat/2.3.0 변경을 살리고, QA 브리지 `native_qa_inject_audio` 메시지 처리만 다시 넣는다.
2. 머지한 뒤 iOS Release 빌드와 위 테스트를 다시 돌린다. 가능하면 폰에서 `ko-greeting-01,en-meeting-01` 두 개만 짧게 재측정해서 회귀가 없는지 본다.
3. PR 본문을 업데이트하고 사용자에게 리뷰·머지를 요청한다.

---

## 5. 작업 C: `updated_at` UTC 트리거 ([PR #281](https://github.com/minglelabs/mingle/pull/281))

- 브랜치 `codex/updated-at-utc-trigger`, 제목 "Write trigger-managed updated_at in UTC regardless of DB TimeZone"
- 증상: 로컬/dev DB(`TimeZone = Asia/Seoul`)에서 raw SQL로 행을 다시 쓰면, `app_event_logs.updated_at`과 `app_messages.updated_at`이 `created_at`보다 9시간 앞서 기록된다. 트리거가 timestamp(without tz) 컬럼에 로컬 시각을 썼기 때문이다.
- 운영 데이터는 고칠 필요 없음 (세션 보고 기준. 머지 전에 운영 DB TimeZone이 UTC인지 `BEGIN READ ONLY`로 한 번 확인하면 좋다).
- main과 충돌 없음. 남은 일: 리뷰 → 머지 → 마이그레이션 배포 절차는 `docs/release-namespace-rollout-checklist.md`와 메모리의 mobile release procedure를 따른다.

---

## 6. 작업 D: 한국어 STT 확정이 약 3초 늦는 원인 (미해결)

### 6.1 지금까지 알아낸 것

**기기 데이터 (dev DB, 읽기 전용):**
- 아이폰 실행 두 번(2026-10-15 11:10Z, 11:13Z) 모두 한국어만 느리고 다른 언어는 빠르다.
- 모든 확정이 `reason=stt_server_final:soniox_endpoint`다. 즉 서버가 Soniox의 `<end>` 토큰을 받고 확정했다.
- 클라이언트 쪽 `sttDurationMs`(첫 부분 결과 → 확정)로 교차 확인: ko-greeting은 말 끝 후 약 3.5초, en-restaurant은 약 0.6초.
- QA 계정(`cmt39ogvc0002she3ko7ypy0v`) 설정은 기본값이다: silence 500, endpoint max delay **3000**, tuning step 2, segmentation mode null → 서버 `end` 모드, `max_endpoint_delay_ms=3000`, latency level 1, sensitivity 0.5. **한국어는 Soniox가 최대 대기 3000ms를 거의 다 채우고 있다.**

**오프라인에서 배제한 것 (재현 안 됨):**
- 음성 경로(mingle-stt, `use-realtime-stt.ts`, `nativeStt.ts`, `App.tsx`, `NativeSTTModule`)에 한국어/한글 전용 분기는 없다.
- 클라이언트는 서버 확정을 받는 즉시 동기적으로 확정하고, RN → WebView 전달도 즉시 일어난다.
- 같은 정답 WAV를 실시간 속도로 Soniox에 직접 보내봤다 (stt-rt-v5, 서버와 똑같은 설정, 48kHz, 2048프레임 청크, 무음 500/3000ms, 기기와 같은 픽스처 순서, 3회 반복). 한국어 `<end>`가 말 끝 후 55~390ms에 왔고, 다른 언어는 200~520ms였다.
- 이 조건들을 바꿔도 여전히 빨랐다: vault `secret/mingle/dev` Soniox 키(devbox는 루트 `.env.local`과 다른 키를 쓴다), 300ms 단위 몰아 보내기, 16kHz, Soniox 기본 튜닝, 선언/실제 샘플레이트 불일치, 첫 클립 앞의 잡음·음성.
- 실제 `createSttServer`를 프로세스 안에서 띄우고 iOS 네이티브 설정과 base64 `audio_chunk` 프레임으로 보내도, 한국어 확정은 88~293ms였다.

**곁가지 발견:** 한 Soniox 세션 안에서 한국어 클립 바로 다음에 `ja-hotel-01`을 보내면 `ko`로 인식되고 글자가 섞인다("젯아웃は何時までですか。"). 기기 실행에서는 ja-shopping이 앞에 있어서 피해 갔다. 언어 전환 직후의 인식 오류라서 별도 이슈로 볼 가치가 있다.

### 6.2 가설

기기에서 오는 오디오 자체(레벨, 무음 구간의 노이즈 플로어, 리샘플 결과)가 Soniox 엔드포인트 검출을 늦추거나, 전송 중 어딘가에서 지연이 생긴다. 이 둘을 가르는 게 다음 단계다. 기본 `max_endpoint_delay_ms=3000`이 상한이라서, 원인과 별개로 한국어 기본값을 낮추는 것도 완화책이 될 수 있다 (사용자 판단 필요).

### 6.3 실행 계획 (아이폰 1회)

1. **사용자에게 폰 사용을 확인받는다** (다른 작업이 쓰는지, 재설치로 로그인이 풀려도 되는지).
2. 실험 워크트리 `~/mingle/.claude/worktrees/korean-stt-devrun` (PR #279 tip `0ec1cf6e`, detached HEAD)를 쓴다. 이 워크트리의 `mingle-stt/stt-server.ts`에 진단 패치가 적용돼 있다. 같은 패치를 **`docs/handoff/kiro-ai-qa/stt-diag.patch`**로도 저장해 뒀다. 환경변수 `STT_DIAG_DIR`를 주면 받은 클라이언트 PCM, Soniox 토큰과 도착 시각, 클라이언트로 보낸 전사를 파일로 남긴다. **로컬 전용이고 커밋 금지.** (워크트리가 사라졌으면 `git worktree add --detach <경로> origin/codex/busy-villani-ce2dfa` 후 `git apply docs/handoff/kiro-ai-qa/stt-diag.patch`.)
3. 맥 LAN IP를 확인한다. 캐시된 PR #279 QA 빌드(`busy-villani-ce2dfa/.devbox-cache/ios/worktrees-6852/Build/Products/Release-iphoneos/mingle.app`)는 `192.168.0.13:20558`(web)과 `22558`(STT ws)을 가리킨다. IP가 다르면 다시 빌드해야 한다.
4. **사용자 허락을 받고** devbox를 띄운다: `DEVBOX_WEB_PORT=20558 DEVBOX_STT_PORT=22558 STT_DIAG_DIR=<경로> scripts/devbox up --profile local --host <LAN IP> --qa-bridge`
5. **사용자 허락을 받고** 앱을 설치한다 (`xcrun devicectl device install app --device 00008110-000668EA0EE1401E <mingle.app>`). 그다음 사용자에게 "로컬 네트워크 허용 → 온보딩 → QA 계정 로그인"을 부탁한다.
6. `pnpm test:qa:stt-audio -- --ios-udid 00008110-000668EA0EE1401E --fixture-host <LAN IP> --fixtures ko-greeting-01,ko-directions-01,en-meeting-01`
7. 캡처된 `client.pcm`을 같은 설정으로 Soniox에 오프라인 재생한다. 재생 스크립트(`replay-pcm.js`)는 이전 세션의 임시 폴더에 있다가 지워졌으니 새로 짠다. WebSocket으로 Soniox stt-rt-v5에 서버와 같은 config를 보내고, PCM을 2048프레임 단위로 실시간 속도로 보내면서 `<end>` 도착 시각을 기록하면 된다. 판별 기준:
   - 재생에서도 한국어가 약 3초 → **기기 오디오가 원인**. PCM 레벨과 무음 구간의 노이즈 플로어를 정답 WAV와 비교한다.
   - 재생에서는 빠름 → **전송/서버 경로가 원인**. Soniox 토큰 도착 시각과 서버 송신 시각의 차이를 본다.
8. 결과를 사용자에게 보고하고, 수정 브랜치를 새로 만든다.

---

## 7. Kiro에서 시작하는 법

Kiro에는 Claude Code 전용 기능(iOS Simulator MCP, 세션 간 메시지, Artifact 게시)이 없다. 대체 방법:

| Claude Code에서 쓰던 것 | Kiro 대체 |
|---|---|
| `/qa` 스킬 (`.claude/skills/qa/SKILL.md`) | 이 파일을 Kiro **steering** 파일로 복사해서(`.kiro/steering/qa.md`, `inclusion: manual`) 채팅에서 `#qa`로 불러 쓴다. 내용은 그대로 유효하다 |
| iOS Simulator MCP (탭·스크린샷) | `qa-agent-device.mjs start --sim` (Appium XCUITest가 시뮬레이터도 조작한다) |
| Artifact로 리포트 게시 | `report.html`을 로컬에서 열거나 사용자에게 파일 경로를 알려준다 |
| 다른 세션과 폰 사용 조율 | 사용자에게 직접 묻는다. Kiro가 아닌 다른 도구(Claude Code 세션 등)가 폰을 쓸 수 있다 |

추천 순서: **작업 C 머지 확인 → 작업 B main 따라잡기·머지 → 작업 A main 따라잡기·리브랜드 반영·시험 실행·PR → 작업 D 아이폰 실행.** 작업 D는 폰과 사용자 시간이 드니, 폰이 연결된 시간에 A의 폰 시나리오와 몰아서 한다.

Kiro 첫 프롬프트 예시:
> `docs/handoff/kiro-ai-qa/README.md`를 끝까지 읽고 0장의 절대 규칙을 지켜. 작업 B(PR #279)부터: 새 워크트리에서 `codex/busy-villani-ce2dfa`에 `origin/main`을 머지하고, `rn/App.tsx` 충돌을 4.5대로 해결한 다음 테스트를 돌려서 결과를 보고해.

---

## 8. 함정 모음 (실제로 밟은 것)

- **시뮬레이터 런타임 삭제 → 실기기 빌드 불가.** (0장 규칙 2)
- **같은 번들 ID 덮어쓰기:** HashChat 작업이 QA 빌드를 덮어쓰거나 그 반대가 일어난다. 설치 전에 `xcrun devicectl device info apps --device <id>`로 지금 무엇이 깔려 있는지 확인한다.
- **LAN IP 변경:** 맥이 핫스팟(172.20.10.x)으로 바뀌면 QA 빌드가 서버를 못 찾는다. 앱 화면에는 "일시적인 오류, 다시 시도"가 뜨고, devbox 로그에는 폰 요청이 하나도 안 찍힌다. IP를 확인하고 다시 빌드한다.
- **로컬 네트워크 권한:** 새로 설치할 때마다 iOS가 "로컬 네트워크" 팝업을 띄운다. 거부하면 앱이 서버에 못 닿는다.
- **ATS:** Info.plist가 `NSAllowsLocalNetworking = true`라서 LAN HTTP가 허용된다. 이 설정을 건드리지 말 것.
- **CocoaPods / Ruby 인코딩:** `pod install`이 Ruby 4.0.1 네이티브 확장 문제나 인코딩 문제로 실패하면, Homebrew CocoaPods를 UTF-8 로케일(`LANG=en_US.UTF-8`)로 직접 실행한다.
- **WDA 빌드 code 70:** 목적지를 못 찾는다는 뜻이다. `xcodebuild -showdestinations`로 폰이 "Ineligible"인지 확인한다(플랫폼 미설치, 잠금, 신뢰 안 함 등).
- **Appium 스크린샷 속도:** 한 장에 0.3~1초 걸린다. 깜빡임 판정은 반복 횟수(n/m)로만 하고, 프레임 단위 주장을 하지 않는다.
- **키체인 자동 로그인:** 앱을 지우고 다시 깔아도 키체인 때문에 이전 계정으로 자동 로그인될 수 있다 (3.5 발견). 깨끗한 첫 실행을 시험하려면 이걸 감안한다.
- **운영 DB:** Railway pooler에 세션 레벨 `SET`을 쓰면 앱 커넥션에 새어 나간다. 읽기는 `BEGIN READ ONLY; … ROLLBACK;`로만 한다.
- **사용량 한도·네트워크 끊김:** 긴 빌드나 측정 중에 세션이 끊기면 백그라운드 프로세스(Appium, WDA, devbox)가 남는다. 다시 시작하기 전에 `ps`로 확인하고 정리한다(다른 워크트리의 devbox는 건드리지 않는다).

---

## 9. 관련 파일 빠른 참조

- 버그 이력 (유일한 원본): `mingle-app/docs/ui-ux-codex-thread-history.md`
- 기존 결정론 QA: `mingle-app/qa/mobile-ui/README.md`, `COVERAGE.md`, `ATOM_CLASSIFICATION.md`, `*_REGRESSION_INVENTORY.md`, `IOS_SCROLL_FPS_CAPTURE.md`
- 기존 스크립트: `mingle-app/scripts/mobile-ui-qa.mjs` (실기기 Appium 경로 포함), `ios-live-demo-scroll-fps-capture.mjs`
- TTS/STT 회귀 체크리스트: `mingle-app/docs/tts-stt-regression-checklist.md`
- 라이브 E2E (STT 서버 직접): `mingle-app/src/integration/live/*.live.test.ts`, `pnpm test:live`
- devbox: `docs/worktree-devbox.md`, `scripts/devbox`
- 모바일 개발: `mingle-app/docs/mobile-development.md`
- HashChat 리브랜드: `docs/hashchat-rebrand-handoff.md`, `docs/hashchat-release-checklist.md`
- 이 문서의 진단 패치: `docs/handoff/kiro-ai-qa/stt-diag.patch`
