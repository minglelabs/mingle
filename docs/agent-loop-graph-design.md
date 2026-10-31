# 에이전트 루프·그래프 설계 (HashChat)

목표: Nam이 단계마다 확인하지 않고, 되돌리기 어려운 마지막 한 단계만 승인한다.
참고 글: Hanako, "Loops and Graphs" (2026-10).

- 루프 = 노드 하나 안에서 `만들기 → 검사 → 고치기`를 초록불이 될 때까지 반복.
- 그래프 = 노드 사이. 무엇을 병렬로 돌리고, 무엇이 기다리고, 실패하면 어디로 돌려보낼지.

## 1. 현재 상태

| 이미 있는 것 | 빠진 것 |
|---|---|
| CI: `mingle-app-tdd.yml` (vitest 4 shard, tsc, RN Jest, Android JVM), `namespace-contract-tests.yml` | 작업마다 "어떤 파일만 바꿔도 되는지" 적는 계획 파일 |
| 실기기 QA: `test:qa:ui:android`, `test:qa:ui:ios`, regression suite, devbox | diff가 계획 범위 안인지 판정하는 코드 |
| 머지 규칙(메모리에만 있음): 웹 UI·운영툴·devbox 변경은 CI 후 바로 머지, 마이그레이션·env는 보고 | 변경 경로로 레인을 자동 분류하는 코드 |
| 서브에이전트 + 워크트리 | 실패 반환 형식, 재시도 상한, 확정된 원인을 규칙으로 남기는 곳 |

CI 주의점: `paths` 필터 때문에 `docs/**`만 바뀐 PR에는 CI가 돌지 않는다. "CI 없음"을 초록불로 읽으면 안 된다.

## 2. 그래프

```
Nam 요청
  │
  ▼
[분할기] 메인 에이전트 ── 읽음: docs/agent-constraints.md (학습 경로가 쌓는 곳)
  │  출력: .agent/plan.json (단위 목록)
  ├──────────────┬──────────────┐        ← 서로의 출력을 읽지 않는 단위는 병렬
  ▼              ▼              ▼
[워커 A]       [워커 B]       [워커 C]   서브에이전트, 단위마다 워크트리 1개
 루프: 수정 → 단위 검사 → 수정 (최대 3회)
  │              │              │
  ▼              ▼              ▼
[코드 노드] scripts/agent-gate.mjs : 레인 분류 + 범위 검사 + CI 결과 수집
  │
  ▼
[게이트] 레인별 규칙 ──빨강──▶ 해당 단위만 워커에게 반환 (수정 경로)
  │ 초록
  ▼
L0~L2: 자동 머지 / L3: Nam 승인 1회
  │
  ▼
확정된 원인 → docs/agent-constraints.md (학습 경로) → 다음 분할기
```

### 노드 4종

| 노드 | 맡는 것 | 모델 사용 |
|---|---|---|
| 분할기 | 요청을 단위로 자른다. 기준은 폴더가 아니라 영향 범위(레인)와 실제 데이터 의존성 | 예 |
| 워커 | 단위 1개, 관점 1개, 자기 워크트리·컨텍스트. 다른 워커 결과를 보지 않는다 | 예 |
| 코드 노드 | 레인 분류, diff 범위 비교, CI 상태 수집, 중복 제거, 병합 순서 | 아니오 |
| 게이트 | 증거를 순서대로 읽고 초록/빨강을 낸다 | 아니오 (판정 규칙은 코드) |

### 엣지 판정 규칙

"다음 단계가 이전 단계의 출력 중 무엇을 읽는가?"에 변수 이름을 댈 수 없으면 엣지가 없다. 순서대로 기다리지 않는다.

| 지금 직렬로 하는 것 | 엣지 | 처리 |
|---|---|---|
| iOS 설치 → Android 설치 | 없음 | 병렬 (폰은 세션별 배정 규칙 그대로) |
| 단위 테스트 → 실기기 QA | 없음 | 병렬. 둘 다 게이트 입력 |
| 서버 API 변경 → 그 API를 쓰는 웹 UI | 있음 (응답 형태) | 직렬 |
| QA에서 찾은 버그 3개 수정 | 보통 없음 | 버그마다 워커 1개 |

## 3. 레인 (되돌리기 비용 기준)

판정 변수는 모델 확신도가 아니라 "틀리면 되돌리는 데 드는 비용"이다. PR의 레인 = 바뀐 파일 중 가장 높은 레인.

| 레인 | 경로 예시 | 게이트 | 머지 |
|---|---|---|---|
| L0 문서 | `docs/**`, `*.md` (README 제외 규칙 없음) | 링크·경로 존재 확인 | 자동 |
| L1 되돌리기 쉬움·좁음 | `mingle-app/src/app/admin/**`, `mingle-app/src/server/admin/**`, `mingle-app/src/server/operator*/**`, `mingle-app/src/lib/admin-*`, `mingle-app/src/components/**`, `mingle-app/src/app/[locale]/**`, `mingle-app/src/i18n/**`, `scripts/devbox*` | CI 초록 + diff ⊆ plan | 자동. "실기기 미확인" 보고 |
| L2 되돌리기 쉬움·넓음 | `mingle-app/src/lib/**`, `mingle-app/src/server/**`(admin 제외), `mingle-app/src/app/api/**`, `shared/**`, `mingle-stt/**`, `mingle-messaging/**` | CI 초록 + diff ⊆ plan + namespace contract 초록 + 실기기 QA 결과 첨부 | 처음엔 Nam 승인. 롤백 기록이 쌓이면 자동으로 전환 검토 |
| L3 닫힌 레인 | `mingle-app/prisma/**`, env·배포 설정(`railway*`, `Dockerfile*`, `vercel.json`, `.env*.example`), `mingle-app/rn/**`(앱 릴리스 필요), 버전·namespace(`package.json` version, `build:release:*`), 결제(`coin`, `iap` 경로), 운영 DB에 쓰는 스크립트(`mingle-app/scripts/seed*`, `backfill*`), 스토어 업로드 스크립트, `.github/**`, 게이트 자체(`scripts/agent-gate*`) | 위 검사 전부 | 항상 Nam 승인. 점수로 열리지 않음 |

L3은 "높은 문턱"이 아니라 열리지 않는 레인이다. 문턱은 조정되지만 닫힌 레인은 조정되지 않는다.
PR 본문에는 레인과 함께 마이그레이션·env 변경 여부를 항상 적는다 (기존 규칙 유지).

### 게이트가 증거를 읽는 순서

1. 결정적 결과: CI 각 job, `agent-gate.mjs` 범위 검사, contract 테스트
2. 이번 실행의 궤적: 재시도 횟수, 수정 범위가 커졌는지
3. 이 레인·경로의 과거 롤백 횟수 (`git log --grep '^Revert'`로 계산)
4. 모델 자기 평가 (마지막, 참고만)

검사가 아닌 것: "괜찮아 보임", "확신함", "에러 없음", "CI가 안 돌았음".

## 4. 반환 경로

### 수정 경로 (이번 실행을 고친다)

실패한 단위만 돌려보낸다. 배치 전체를 돌려보내면 맞던 단위가 다시 쓰이고 다시 검증해야 한다.

```json
{
  "unit": "chat-bubble-align",
  "verdict": "red",
  "reason": "conversation-list.logic.test.ts failed",
  "evidence": "expected 'right', got 'left' at src/components/ChatBubble.tsx:88",
  "scope": ["mingle-app/src/components/ChatBubble.tsx"],
  "attempt": 2
}
```

- `scope` 밖 파일을 고치면 게이트가 빨강을 낸다 (옆 이슈를 같이 고치는 것 방지).
- 3회 실패하면 워커가 아니라 계획 문제다. 분할기(메인)로 올리고, 필요하면 Nam에게 보고한다.

### 학습 경로 (다음 실행을 고친다)

승인된 결과에서 규칙을 뽑아 분할기가 읽는 곳에 쌓는다. 출력이 아니라 제약을 쌓는다.

```
ACCEPTED   TTS 에코 수정, iPhone 14에서 확인 (e6327151)
DERIVED    TTS 관련 단위는 시뮬레이션 수치 + 실기기 확인 둘 다 게이트에 넣는다
LANDS IN   docs/agent-constraints.md → 분할기가 plan.json 만들 때 읽음
```

- 위치: `docs/agent-constraints.md` (레포 안, 리뷰 가능). Kiro Crew `learn_add`는 Nam 개인 선호용으로 계속 쓴다.
- 한 줄 = 한 규칙. 근거 커밋/PR 번호 필수. 근거 없는 줄은 추가하지 않는다.

## 5. 파일 형식

### `.agent/plan.json` (워크트리별, 커밋하지 않음)

```json
{
  "request": "내 메시지 오른쪽 정렬",
  "units": [
    {
      "id": "chat-bubble-align",
      "allowed": ["mingle-app/src/components/ChatBubble.tsx", "mingle-app/src/components/*.test.ts"],
      "check": ["pnpm --dir mingle-app test:unit src/components"],
      "depends_on": [],
      "device_qa": "android"
    }
  ]
}
```

### `scripts/agent-gate.mjs` 출력

```json
{
  "lane": "L1",
  "lane_reasons": ["mingle-app/src/components/ChatBubble.tsx → L1"],
  "scope": { "ok": true, "outside": [] },
  "ci": { "state": "success", "skipped_by_paths": false },
  "migration": false,
  "env_change": false,
  "verdict": "green",
  "merge": "auto"
}
```

## 6. 도입 순서

글의 순서(게이트 → 레인 → 학습 경로)를 따른다. 무언가 결과를 승인하기 전에는 학습 경로에 쌓을 것이 없다.

| 단계 | 산출물 | 완료 기준 |
|---|---|---|
| 1 게이트 | `scripts/agent-gate.mjs` + `scripts/agent-gate.test.mjs` (레인 분류, 범위 검사, `gh pr checks` 수집). CI의 `node --test` 목록에 추가 | 최근 머지 PR 20개를 넣어 Nam이 실제로 한 판단(바로 머지/물어봄)과 레인이 일치 |
| 2 레인 | CLAUDE.md에 레인 표·머지 규칙 요약, PR 템플릿에 레인·마이그레이션·env 칸 | 에이전트 PR 본문에 gate 출력이 자동 첨부 |
| 3 반환 형식 | 서브에이전트 지시 템플릿에 plan.json·반환 JSON·3회 상한 | 실패 단위만 재작업되는 것을 1회 이상 확인 |
| 4 학습 경로 | `docs/agent-constraints.md` + 분할기 지시에 "먼저 읽기" | 규칙 1개가 다음 작업의 plan.json에 반영된 사례 |
| 5 L2 자동화 검토 | 레인별 롤백 횟수 집계 | Nam이 L2 자동 머지 여부 결정 |

### 구현 상태 (1~5단계)

| 단계 | 구현 | 확인한 것 |
|---|---|---|
| 1 게이트 | `scripts/agent-gate.logic.mjs`(판정 규칙, I/O 없음), `scripts/agent-gate.mjs`(CLI) | 최근 머지 PR 20개 백테스트: L1 10, L2 6, L3 4 (`--backtest 20`) |
| 2 레인 | `.github/workflows/agent-gate.yml`: 모든 PR(문서 PR 포함)에서 레인 보고서를 PR 댓글로 갱신, 빨강이면 실패. `.github/pull_request_template.md`: 레인·마이그레이션·env·앱 릴리스·실기기 칸. 문서 PR은 상대 링크 깨짐을 검사 | PR #414에서 댓글 자동 갱신 |
| 3 반환 형식 | `scripts/agent-plan.mjs validate / waves / brief`: 계획 검사, 병렬 웨이브, 같은 웨이브의 파일 겹침 거부, 워커 지시문 생성. `agent-gate.mjs --return`: 빨강이면 `.agent/returns/<unit>.json`, 3회째 exit 4 | 범위 밖 파일로 3회 반환 → 3회째 `escalate: true` |
| 4 학습 경로 | `docs/agent-constraints.md`(근거 커밋/PR 필수, CI에서 형식 검사). `brief`가 해당 규칙을 워커 지시에 넣고, 게이트 보고서에도 표시 | 규칙 C1~C3, 근거 커밋이 main에 있음을 확인 |
| 5 L2 자동화 검토 | `agent-gate.mjs --rollback-stats --days 30`: 레인별 머지·Revert 수와 추천. 자동 머지 레인은 `.github/agent-gate.json`(L3 파일이라 Nam 승인 필요, L3는 넣어도 무시) | 2026-10-31 기준 30일: L2 38건 중 Revert 1건 → 승인 유지 |

- 레인 규칙 표는 `LANE_RULES`가 단일 소스다. 이 문서의 표와 다르면 코드가 맞다.
- 결정한 기본값: L2와 `mingle-app/rn/**`는 항상 승인, 문서(L0)는 자동, 계획 파일 없이도 동작(`--require-plan`을 주면 계획 필수).
- CI 안의 게이트는 다른 CI job을 기다리지 않는다(`--no-ci-read`). 머지 판단은 CI가 끝난 뒤 `--pr <n>`으로 다시 돌린 결과로 한다.
- 실기기 QA는 게이트가 직접 돌리지 않는다. 워커가 `device_qa`에 맞춰 돌리고 요약 JSON을 보고에 붙인다.
- 재사용할 수 있는 기존 검사·QA 도구와 빈틈 목록: `docs/agent-graph-inventory.md`.

### 작업 한 번의 흐름

```bash
# 분할기
node scripts/agent-plan.mjs validate .agent/plan.json
node scripts/agent-plan.mjs waves .agent/plan.json        # 웨이브마다 워커를 병렬로
node scripts/agent-plan.mjs brief .agent/plan.json <unit> # 워커에게 줄 지시문
# 워커 PR이 올라오고 CI가 끝난 뒤
node scripts/agent-gate.mjs --pr <n> --plan .agent/plan.json --unit <unit> --return
#   exit 0 green → merge 값대로 / exit 1 red → .agent/returns/<unit>.json을 그 워커에게만
#   exit 3 pending → 기다림 / exit 4 → 계획을 다시 짠다
# 머지 후 확정된 원인 → docs/agent-constraints.md에 C<n> 추가
```

## 7. Nam이 정할 것

| 항목 | 선택지 | 추천 |
|---|---|---|
| L2(서버·공용 lib) 머지 | A 항상 승인 / B CI+실기기 QA 초록이면 자동 | A로 시작, 롤백 0건이 한 달 이어지면 B |
| `mingle-app/rn/**` | A L3(항상 승인) / B JS만 바뀐 경우 L2 | A. 앱 릴리스·namespace 버전 규칙과 묶여 있음 |
| 학습 경로 위치 | A 레포 `docs/agent-constraints.md` / B Kiro Crew 메모리만 | A. 다른 에이전트(Codex 등)도 읽을 수 있음 |
| 문서 PR(L0) | A 자동 머지 / B 기존대로 | A |
