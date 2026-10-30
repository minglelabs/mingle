# 인수인계: 2.2.0 미만 앱 버전 API 라우트 제거

작성: 2026-10-30 (Claude Code 세션, 기준 커밋 `220dc7a3` / origin/main)
대상: 이 작업을 이어받는 에이전트(Kiro) 및 리뷰어

---

## 0. 한 줄 요약

`mingle-app/src/app/api/{ios,android}/` 아래에 있는 **2.2.0 미만 버전 라우트 트리(448개 route.ts)** 를 지운다.
단, **구버전 앱이 강제 업데이트 안내를 받는 `client/version-policy` 엔드포인트는 rewrite로 살려둔다.**
목적은 Railway 배포/CI 시간 단축(컴파일할 라우트 수 감소)과 코드 정리.

---

## 1. 배경과 결정 사항

### 1.1 왜 하는가

- Railway 배포 = Next 빌드가 가장 큰 비용. 2026-10-30에 아래 최적화를 이미 적용했다(머지 완료).
  - PR #347: Next `output: "standalone"` 런타임 이미지, Railway 빌드의 TypeScript 검사 생략(→ CI `Typecheck (tsc)` job으로 이전), vitest 4-shard.
  - PR #349: Turbopack 빌드 캐시(`turbopackFileSystemCacheForBuild`) + Railway 캐시 마운트.
  - 결과: 배포 3~7분 → **2분 14초**, CI 115초 → **58초**.
- 남은 빌드 비용(캐시 적중 기준): 대기/업로드 ~25s, Prisma generate + 캐시 로드 + 컴파일 ~40s, **Collecting page data ~20s**, export/기동/헬스체크 ~45s.
- 라우트 수에 비례하는 구간(콜드 컴파일, Collecting page data, 캐시 크기)은 라우트를 줄여야 더 줄어든다.

### 1.2 결정 (사용자 확정)

- **2.2.0 미만 앱은 전부 지원 종료, 강제 업데이트로 처리한다.**
- 사용자 설명: 구버전 사용자는 사실상 없음. 현재 프로덕션 HTTP 로그(살아있는 배포 기준)에서도 `/api/ios/v2.2.1/*` 만 관측됨.
  (주의: Railway는 REMOVED 된 과거 배포의 HTTP 로그를 반환하지 않아서 장기 통계는 확인 못 함.)

### 1.3 현재 프로덕션 버전 정책 env (Railway `mingle-2-0-0` / production)

| 키 | 현재 값 |
|---|---|
| `IOS_CLIENT_MIN_SUPPORTED_VERSION` | `2.0.4` |
| `ANDROID_CLIENT_MIN_SUPPORTED_VERSION` | `2.0.4` |
| `IOS_CLIENT_RECOMMENDED_BELOW_VERSION` | `2.2.0` |
| `ANDROID_CLIENT_RECOMMENDED_BELOW_VERSION` | `2.2.0` |
| `IOS_CLIENT_LATEST_VERSION` | `2.2.0` |
| `ANDROID_CLIENT_LATEST_VERSION` | `2.2.0` |

→ **지금은 2.0.4 ~ 2.1.x 가 아직 "지원" 상태다.** 라우트를 지우기 전에 반드시 min 을 `2.2.0` 으로 올려야 한다(§3).

---

## 2. 현재 구조 (조사 결과)

### 2.1 라우트 수

`find mingle-app/src/app/api -name route.ts` = **685개**

| 구분 | 개수 |
|---|---|
| 무버전 `/api/*` (웹·공용, **유지**) | 91 |
| `ios/v2.2.0` + `android/v2.2.0` (**유지**) | 73 + 73 = 146 |
| 2.2.0 미만 버전 트리 (**삭제 대상**) | 224 + 224 = **448** |

플랫폼별 삭제 대상 트리(ios/android 동일 구성):

| 버전 | route.ts 수 |
|---|---|
| v1.0.0, v1.0.2 ~ v1.0.6 | 각 5 |
| v1.0.7 ~ v1.0.11 | 각 6 |
| v1.1.0 ~ v1.1.4 | 각 15 |
| v2.0.0 | 42 |
| v2.1.0 | 47 |

`page.tsx` 는 49개(별도, §6 참고).

### 2.2 next.config.mjs 의 버전 alias rewrite (`mingle-app/next.config.mjs`, `rewrites()`)

| source | destination | 처리 |
|---|---|---|
| `/api/android/v2.0.1~v2.0.4(/*)` | `/api/android/v2.0.0(/*)` | **삭제** |
| `/api/ios/v2.0.1~v2.0.4(/*)` | `/api/ios/v2.0.0(/*)` | **삭제** |
| `/api/{ios,android}/v2.1.1(/*)` | `.../v2.1.0(/*)` | **삭제** |
| `/api/{ios,android}/v2.2.1(/*)` | `.../v2.2.0(/*)` | 유지 |
| `/api/{ios,android}/v2.3.0(/*)` | `.../v2.2.0(/*)` | 유지 (2.3.0 출시분이 v2.2.0 트리 사용) |
| `/.well-known/*` | `/api/well-known/*` | 유지 |

### 2.3 ⚠️ v2.2.0 트리가 구버전 트리를 re-export 하고 있음 (가장 중요한 함정)

v2.2.0 의 route.ts 146개를 import 체인으로 따라간 결과:

| 체인 | 개수 | 의미 |
|---|---|---|
| `v2.2.0 → 무버전 /api/*` | 62 | 안전 (무버전 라우트는 유지) |
| `v2.2.0 → v2.0.0 → 무버전` | 36 | **v2.0.0 파일 삭제 시 깨짐** |
| `v2.2.0 → v2.0.0` (v2.0.0 파일에 실제 구현) | 24 | **v2.0.0 파일 삭제 시 깨짐** |
| `v2.2.0 → v2.0.0 → v1.1.4` | 22 | **깨짐** |
| `v2.2.0 → v2.0.0 → v1.1.4 → 무버전` | 2 | **깨짐** |

예: `src/app/api/ios/v2.2.0/client/version-policy/route.ts`
```ts
export const runtime = "nodejs";
export { POST } from "@/app/api/ios/v2.0.0/client/version-policy/route";
```
→ `v2.0.0/.../route.ts` 는 다시 `v1.1.4/.../route.ts` 를 re-export.

**따라서 삭제 전에 v2.2.0 route.ts 84개를 "체인의 최종 파일 내용"으로 평탄화(inline)해야 한다.**
최종 파일은 대부분 `@/server/api/controllers/...` 또는 `@/app/api/<무버전>/...` 를 import 하는 2~4줄짜리 파일이다. 모든 import 가 `@/` alias 라서 내용을 그대로 복사해도 경로가 깨지지 않는다(상대경로 import 가 있는지는 확인할 것).

체인 분석 스크립트(재현용, `mingle-app/` 에서 실행):
```python
import os,re,glob,collections
imp=re.compile(r"""from\s+['"](@/[^'"]+)['"]""")
def resolve(p):
    p='src/'+p[2:]
    for c in [p+'.ts',p+'/route.ts',p+'.tsx',p+'/index.ts']:
        if os.path.isfile(c): return c
def chain(f,seen=None):
    seen=(seen or [])+[f]
    s=open(f).read()
    nxt=[m for m in imp.findall(s) if m.startswith('@/app/api/')]
    if nxt:
        r=resolve(nxt[0])
        if r and r not in seen: return chain(r,seen)
    return seen
for f in glob.glob('src/app/api/*/v2.2.0/**/route.ts',recursive=True):
    c=chain(f)
    if any(re.search(r'/api/(ios|android)/v(1\.|2\.[01]\.)',x) for x in c[1:]):
        print(f,'->',c[-1])
```

### 2.4 컨트롤러 (`src/server/api/controllers/`)

- `ios/`, `android/` 아래 v1.0.0 ~ v2.0.0 디렉터리가 있고, `legacy/`, `shared/` 가 별도로 있다.
- **v2.2.0 의 최종 체인이 import 하는 컨트롤러**: `ios/v1.1.4`(11), `android/v1.1.4`(11), `ios/v2.0.0`(3), `android/v2.0.0`(3), 그 외 `@/server/api/controllers/...`(30).
  컨트롤러 파일도 버전끼리 서로 re-export 체인이 있다(예: `ios/v1.1.4/client-version-policy-controller.ts` → `ios/v1.1.0/...`, `ios/v1.0.10` → `ios/v1.0.9`).
- 컨트롤러는 route entry 가 아니라 공유 모듈이라 **빌드 시간에 미치는 영향은 작다.**
  → **Phase 1 에서는 컨트롤러를 지우지 말 것.** 라우트만 지우고, 고아가 된 컨트롤러 정리는 Phase 2(선택)로.

### 2.5 version-policy 동작 (강제 업데이트 신호)

- 모든 버전의 `client/version-policy` 는 결국 `src/server/api/controllers/legacy/ios-client-version-policy-controller.ts` (android 는 대응 파일) → `handleClientVersionPolicy(request, { platformOverride: 'ios' | 'android' })` 로 모인다.
- 판정 로직: `src/server/api/handlers/client-version-policy-handler.ts`
  - 요청 body 의 `clientVersion` (semver) 을 env 의 `*_CLIENT_MIN_SUPPORTED_VERSION` 과 비교 → 미만이면 `force_update`.
  - `clientVersion` 이 없거나 파싱 불가여도 `force_update`.
  - platform 은 URL(라우트 위치)로 결정(`platformOverride`).
- 즉 **URL 의 버전은 판정에 쓰이지 않는다.** 구버전 경로를 v2.2.0 의 version-policy 로 rewrite 해도 응답은 동일하다.

### 2.6 구버전 namespace 를 참조하는 그 외 코드

| 위치 | 내용 | Phase 1 처리 |
|---|---|---|
| `src/lib/api-contract.ts` | `DEFAULT_API_NAMESPACE_BY_RELEASE_TARGET`(v1_1_0~v2_2_0), `VERSIONED_API_NAMESPACE_RULES`(android/ios v1.0.0 ~ v2.x 목록, `enablesFinalizeSourceRedetection` 플래그) | 2.2.0 미만 항목 제거 가능. 단 `namespaceSupportsPostingFeed`, `shouldRedetectFinalizeSourceLanguage` 등 소비 함수 동작 확인 후. 확신 없으면 Phase 2 로 미룸 |
| `src/lib/client-behavior-profile.ts` | 웹 UI release variant(`ios_v1_1_3` 등). **버전 ≥1.1.3 이면 전부 `*_v1_1_3` variant** → 2.x 앱도 이 이름의 variant 를 씀 | **건드리지 말 것** (§6) |
| `src/app/page.tsx`, `src/app/[locale]/page.tsx`, `src/app/[locale]/translator/page.tsx` | variant 별 `@/web/{ios,android,default,legacy}/v1.x/home-entry` 분기 | **건드리지 말 것** (§6) |
| `scripts/release-target-config.mjs` | `DEDICATED_RELEASE_TARGETS` 에 v1_1_0 ~ v2_1_0 | Phase 2 |
| `mingle-app/package.json` | `build:release:*:v1_1_0 ~ v2_1_0` 스크립트 | Phase 2 (지워도 무방) |
| `src/server/api/controllers/shared/coins-controller.ts:46` | 주석에 `/api/ios/v2.1.0/...` 예시 | 주석만, 무시 가능 |
| `src/server/posts/feed-post-serializer.ts:175` | 주석에 `ios/v2.0.0` | 주석만 |

### 2.7 테스트

- 구버전 namespace 문자열을 참조하는 테스트 파일 **42개**. 대표:
  - 라우팅 전용: `src/app/api/v1-1-1.namespace-routing.test.ts`, `v1-1-2.*`, `v1-1-3.*`, `v1-1-4.*`, `v2-1.namespace-routing.test.ts`, `namespace-routing.v1_0_9.contract.test.ts`, `namespace-routing.contract.test.ts`, `feedback.namespace-routing.test.ts`, `messages.namespace-routing.test.ts`, `v2-0.namespace-routing.test.ts`, `v2-1-0.namespace-parity.test.ts`, `v2-2.namespace-routing.test.ts`, `namespace-reexport.v2_2_0.guard.test.ts`
  - 기타(컴포넌트/lib 테스트가 namespace 문자열을 fixture 로 사용): `src/components/LivePhoneDemo/*.test.ts`, `src/lib/api-contract.test.ts`, `src/lib/client-behavior-profile.test.ts` 등
- 원칙:
  - **삭제된 라우트를 import 하는 테스트** → 삭제하거나 v2.2.0 기준으로 수정.
  - 단순히 `'ios/v1.1.0'` 같은 문자열을 fixture 로 쓰는 lib/컴포넌트 테스트 → 해당 lib 코드를 안 바꿨으면 그대로 둬도 통과한다. 굳이 고치지 말 것.
  - `namespace-reexport.v2_2_0.guard.test.ts` 는 v2.2.0 이 특정 re-export 구조를 갖도록 강제하는 가드일 수 있음 → 내용 확인 후 평탄화 구조에 맞게 수정.
- 목록 재현: `grep -rlE "(ios|android)/v(1\.|2\.0\.|2\.1\.)" mingle-app/src | grep '\.test\.'`

### 2.8 CI 워크플로

- `.github/workflows/namespace-contract-tests.yml`: matrix `legacy-empty`, `ios-v1.0.0`, `ios-v1.0.2` 로 `NEXT_PUBLIC_API_NAMESPACE` 를 바꿔 3개 테스트 파일 실행.
  → `ios-v1.0.0`, `ios-v1.0.2` 를 `ios/v2.2.0`(또는 `ios/v2.3.0`, `android/v2.2.0`)로 교체.
- `.github/workflows/mingle-app-tdd.yml`
  - `Enforce RN iOS namespace contract` step 의 `RN_API_NAMESPACE: ios/v1.0.4` → 실제로는 package.json 의 `rn:ios:env-check` 가 `ios/v2.3.0` 으로 덮어쓰므로 무의미. `ios/v2.3.0` 으로 정리해도 됨.
  - live-tests job 의 `MINGLE_TEST_API_NAMESPACE: ios/v1.0.4` → `ios/v2.2.0` 으로 변경(옵트인 job 이라 평소엔 안 돎).
  - unit-tests 는 `--shard=N/4` 로 4개 러너 분산. 테스트 파일을 지우면 자동 반영됨.
- `scripts/devbox-runtime-config.test.mjs:57` 의 `ios/v2.0.2` 는 devbox 설정 파서 테스트 fixture → 그대로 둬도 됨.

---

## 3. 작업 순서 (반드시 이 순서)

### Step 0 — 사람(남형걸)이 할 일: 강제 업데이트 기준 상향 ⛔ 코드 머지 전 필수

Railway `powerful-victory` 프로젝트 / `production` / `mingle-2-0-0` 서비스 변수:

```
IOS_CLIENT_MIN_SUPPORTED_VERSION=2.2.0
ANDROID_CLIENT_MIN_SUPPORTED_VERSION=2.2.0
```

- `*_RECOMMENDED_BELOW_VERSION`, `*_LATEST_VERSION` 은 현재 출시 상황(2.3.0 스토어 반영 여부)에 맞춰 판단.
- 변경 후 검증:
  ```bash
  curl -s -X POST https://mingle-2-0-0-production.up.railway.app/api/ios/v2.1.0/client/version-policy \
    -H 'content-type: application/json' -d '{"clientVersion":"2.1.0","platform":"ios"}'
  ```
  → 응답에 `force_update` 가 나와야 함. `clientVersion":"2.2.1"` 로는 `force_update` 가 아니어야 함.
- **에이전트는 env 를 직접 바꾸지 말 것.** 사용자 확인 없이 프로덕션 설정 변경 금지.

### Step 1 — 브랜치

- 메인 체크아웃(`~/mingle`)은 main 유지. **워크트리를 새로 만들어 작업**한다(사용자 전역 규칙).
- 브랜치명 예: `chore/remove-pre-2.2.0-api-routes`

### Step 2 — v2.2.0 라우트 평탄화 (삭제 전에!)

1. §2.3 스크립트로 구버전 트리를 경유하는 v2.2.0 route.ts 84개 목록 추출.
2. 각 파일을 체인의 **최종 파일 내용**으로 교체.
   - 최종 파일이 `export const POST = xxx` 형태면 그 import/export 를 그대로 복사.
   - `runtime`, `dynamic`, `maxDuration` 등 route segment config export 가 중간 파일에만 있는 경우가 있다. **체인의 모든 파일에서 segment config export 를 모아** 최종 파일에 반영할 것. (re-export 된 `runtime` 은 Next 가 정적으로 못 읽을 수 있어서, 각 route.ts 에 `export const runtime = "nodejs"` 를 리터럴로 두는 현재 패턴 유지.)
   - 메서드(GET/POST/PATCH/DELETE…) 누락 주의: 중간 파일이 `export { GET, POST } from ...` 로 여러 개를 넘기는 경우 전부 옮길 것.
3. 평탄화 직후(아직 아무것도 안 지운 상태)에 `pnpm test:unit` + `tsc` 통과 확인 → 커밋. (동작 변화 0 인 커밋으로 분리하면 리뷰가 쉬움)

### Step 3 — 구버전 라우트 트리 삭제

```bash
cd mingle-app/src/app/api
for p in ios android; do
  for v in v1.0.0 v1.0.2 v1.0.3 v1.0.4 v1.0.5 v1.0.6 v1.0.7 v1.0.8 v1.0.9 v1.0.10 v1.0.11 \
           v1.1.0 v1.1.1 v1.1.2 v1.1.3 v1.1.4 v2.0.0 v2.1.0; do
    git rm -r -q "$p/$v"
  done
done
```
- 삭제 후 `grep -rn "@/app/api/\(ios\|android\)/v\(1\.\|2\.[01]\.\)" mingle-app/src` 결과가 **테스트 외에는 0** 이어야 한다.

### Step 4 — next.config.mjs rewrite 정리

1. §2.2 의 v2.0.x, v2.1.1 alias 삭제.
2. **구버전 version-policy 를 v2.2.0 으로 보내는 rewrite 추가** (강제 업데이트 신호 유지용). 다른 rewrite 보다 앞에 둔다:
   ```js
   // Apps below 2.2.0 are force-updated: their own route trees are gone, but
   // they still ask their namespaced version-policy endpoint on launch.
   {
     source: "/api/:platform(ios|android)/:version(v1\\.\\d+\\.\\d+|v2\\.[01]\\.\\d+)/client/version-policy",
     destination: "/api/:platform/v2.2.0/client/version-policy",
   },
   ```
   - `v1.0.1` 처럼 트리가 원래 없던 버전도 이 패턴에 걸리지만 응답이 force_update 라 무해.
3. 그 외 구버전 경로(`/api/ios/v1.1.0/conversations` 등)는 **404 로 두는 것이 의도**다. 무버전으로 fallback rewrite 하지 말 것(구버전 클라이언트가 바뀐 계약으로 동작하는 게 더 위험).

### Step 5 — 테스트/CI 정리

- §2.7 원칙대로 테스트 정리.
- `namespace-routing.contract.test.ts` 류에 **구버전 version-policy rewrite 를 검증하는 테스트를 추가**하면 좋다(예: next.config 의 rewrites() 결과에 위 rule 이 있고, 대표 경로 `ios/v1.0.0`, `android/v2.1.1` 이 매칭되는지).
- §2.8 워크플로 수정.

### Step 6 — 문서

- `docs/api-versioning-architecture.md`, `docs/release-namespace-rollout-checklist.md` 에 "2.2.0 미만은 version-policy rewrite 만 남김" 반영.
- 이 문서(`docs/handoff-remove-pre-2.2.0-routes.md`)는 작업 완료 후 삭제하거나 결과 섹션 추가.

---

## 4. 검증 체크리스트

로컬(`mingle-app/`):

```bash
pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm exec next typegen && pnpm exec tsc --noEmit -p tsconfig.json
pnpm test:unit
```

Railway 와 동일 조건 빌드 + standalone 기동:

```bash
env MINGLE_NEXT_STANDALONE=1 MINGLE_SKIP_BUILD_TYPECHECK=1 MINGLE_TURBOPACK_BUILD_CACHE=1 \
  MINGLE_RELEASE_TARGET=web_app NEXT_PUBLIC_WS_PATH=/stt \
  DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mingle?schema=app" \
  pnpm build
cp -R .next/static .next/standalone/.next/static && cp -R public .next/standalone/public
PORT=3919 HOSTNAME=127.0.0.1 NODE_ENV=production NEXTAUTH_SECRET=t AUTH_SECRET=t \
  DATABASE_URL="postgresql://p:p@127.0.0.1:59999/m?schema=app" \
  node .next/standalone/server.js &
```

| 요청 | 기대 |
|---|---|
| `POST /api/ios/v2.2.1/client/version-policy` body `{"clientVersion":"2.2.1"}` | 200 |
| `POST /api/ios/v2.3.0/client/version-policy` | 200 |
| `POST /api/ios/v1.0.0/client/version-policy` body `{"clientVersion":"1.0.0"}` | 200, 로컬 env 미설정이면 기본 min 1.0.0 이라 force 아님 → **`IOS_CLIENT_MIN_SUPPORTED_VERSION=2.2.0` 을 주고 띄워서 force_update 확인** |
| `POST /api/android/v2.1.1/client/version-policy` | 200 (rewrite 동작) |
| `GET /api/ios/v1.1.0/conversations` | 404 |
| `GET /api/ios/v2.2.1/...` 대표 엔드포인트 몇 개 (feed, conversations, account/preferences) | 기존과 동일 상태코드(인증 없으면 401 등) |
| `/ko` | 307 |

빌드 로그에서 Route 목록 개수가 약 685 → 약 240 으로 줄었는지 확인.

배포 후(머지 후, 사람 확인 하에):

```bash
railway deployment list --json --limit 3     # 새 배포 SUCCESS 확인
railway logs --build <deploymentId> --json -n 3000   # Compiled / Collecting page data 시간 비교
curl -s -o /dev/null -w "%{http_code}\n" https://mingle-2-0-0-production.up.railway.app/railway/health
```

비교 기준(PR #350 배포, 캐시 적중): Compiled 8.5s, Collecting page data 약 20s, 머지→헬스체크 2분 14초.

---

## 5. 롤백

- 코드: 머지 커밋 revert → Railway 자동 재배포.
- env: `*_CLIENT_MIN_SUPPORTED_VERSION` 을 `2.0.4` 로 되돌림. (단, 코드 revert 없이 env 만 되돌리면 2.0.x/2.1.x 앱이 404 를 맞는다 — 반드시 코드와 함께.)

---

## 6. 범위 밖 (하지 말 것 / Phase 2)

1. **웹 UI variant(`src/web/*`, `src/lib/client-behavior-profile.ts`, `src/app/page.tsx`, `src/app/[locale]/page.tsx`, `src/app/[locale]/translator/page.tsx`)**
   - 이름이 `v1_1_3` 이지만 **버전 ≥ 1.1.3 이면 2.x 앱도 이 variant 를 쓴다.** 이름만 보고 지우면 현재 앱 화면이 깨진다.
   - 구버전 variant(`*_v1_0_11`, `*_v1_1_0` ~ `*_v1_1_2`, `legacy_default_v1_0_11`) 정리는 별도 작업으로, 웹(PC 브라우저, `MINGLE_RELEASE_TARGET=web_app`)의 기본 variant 경로까지 확인 후 진행.
2. 고아 컨트롤러(`src/server/api/controllers/{ios,android}/v1.*`) 삭제 — 빌드 시간 영향 작음. 하려면 `tsc` + `knip`/`ts-prune` 류로 미사용 확인 후.
3. `api-contract.ts` 의 `VERSIONED_API_NAMESPACE_RULES` 축소, `release-target-config.mjs`/`package.json` 의 구버전 release target 제거.
4. RN 앱(`mingle-app/rn`) 코드 — 이번 작업과 무관.
5. `mingle-landing`, `mingle-stt`, `mingle-messaging` — 무관.

---

## 7. 참고: 2026-10-30 에 바뀐 빌드 구조 (작업 시 알아야 할 것)

- `Dockerfile.railway`
  - app-build 에 `MINGLE_NEXT_STANDALONE=1`, `MINGLE_SKIP_BUILD_TYPECHECK=1`, `MINGLE_TURBOPACK_BUILD_CACHE=1`.
  - `pnpm build` 는 `--mount=type=cache,id=s/959e33f7-10af-4820-bb24-cd8b83d8b24c-next-cache,target=/app/mingle-app/.next/cache` 로 실행(id 의 uuid 는 Railway 서비스 `mingle-2-0-0` 의 id. 서비스 재생성 시 변경 필요).
  - 런타임 이미지에는 `.next/standalone`, `.next/static`, `public` 만 복사. `railway/start-single-service.mjs` 가 `node /app/mingle-app/server.js` 로 앱을 띄움.
  - **런타임에 `mingle-app` 의 다른 파일(scripts/, prisma/, data/ 등)은 이미지에 없다.** 런타임에 fs 로 파일을 읽는 코드를 추가하면 standalone tracing 에 안 잡힐 수 있으니 주의.
- `mingle-app/next.config.mjs`: 위 env 로 `output`, `typescript.ignoreBuildErrors`, `experimental.turbopackFileSystemCacheForBuild` 를 토글. 로컬 dev/build 는 env 미설정이라 영향 없음.
- **Railway 빌드는 타입 에러를 막지 않는다.** CI `Typecheck (tsc)` job 이 유일한 타입 게이트 → 머지 전 반드시 초록 확인.
- CI `mingle-app TDD`: `Unit Tests (Vitest 1/4 ~ 4/4)`, `Typecheck (tsc)`, `STT ...` 병렬. 필수 체크(branch protection)는 없음.
- 관련 PR: #347, #349 (minglelabs/mingle).

---

## 8. 완료 정의 (Definition of Done)

- [ ] (사람) Railway env `IOS/ANDROID_CLIENT_MIN_SUPPORTED_VERSION=2.2.0` 적용 및 force_update 응답 확인
- [ ] v2.2.0 route.ts 가 구버전 트리를 하나도 import 하지 않음
- [ ] `src/app/api/{ios,android}/` 아래에 `v2.2.0` 만 남음
- [ ] 구버전 version-policy rewrite 추가 + 테스트
- [ ] next.config 의 v2.0.x / v2.1.1 alias 제거, v2.2.1 / v2.3.0 alias 유지
- [ ] `tsc`, `pnpm test:unit`, namespace-contract-tests 전부 통과
- [ ] 로컬 standalone 기동 후 §4 표 전부 기대값
- [ ] PR 본문에 빌드 Route 수 전/후, (머지 후) Railway Compiled/Collecting page data 시간 전/후 기록

## 9. 결과 (2026-10-30, Kiro, 브랜치 chore/remove-pre-2.2.0-api-routes, 기준 origin/main 2afda6d4)

- 평탄화: v2.2.0 route.ts 84개 (무버전 re-export 38개, 플랫폼 컨트롤러 연결 직접 기록 46개). feedback 2개는 체인에 있던 `dynamic = "force-dynamic"`을 옮김. 평탄화 후 구버전 경유 v2.2.0 라우트 0개.
- 삭제: route.ts 448개. `src/app/api` route.ts 685 -> 237개. 빌드 Route 목록 776 -> 328개(API 685 -> 237).
- next.config: v2.0.x / v2.1.1 alias 제거, 구버전 version-policy rewrite를 첫 rule로 추가, v2.2.1 / v2.3.0 / .well-known 유지.
- 테스트: 구버전 전용 라우팅 테스트 10개 삭제, contract/v2-2/guard/finalize/image-text 테스트를 v2.2.0 또는 남긴 컨트롤러 기준으로 수정, rewrite 테스트 추가. CI namespace matrix를 ios/android v2.2.0으로 교체.
- 로컬 검증: tsc 통과, `pnpm test:unit` 419파일/4534개 통과, namespace contract 테스트 3개 namespace 모두 통과, Railway 조건 standalone 빌드(Compiled 8.4s) 후 §4 표 기대값 확인. `/api/ios/v2.2.1/feed`는 의도적으로 끊은 DB 때문에 500(무버전 `/api/feed`와 동일).
- 남은 일: Step 0(운영 env min 2.2.0) 사람 확인, 머지 후 Railway 빌드 시간 비교, Phase 2(고아 컨트롤러, api-contract 축소, 구버전 release target).
