# 보이스톡(동시통역) + Hash Rush 인수인계서

작성: 2026-10-30. 받는 사람: Kiro. 이 문서만 읽고 바로 이어서 작업할 수 있게 썼다.

- 브랜치: `codex/voicetalk-hash-rush-planning-1db1e3`
- 워크트리: `~/mingle/.claude/worktrees/railway-region-singapore-5cdb09`
- PR: https://github.com/minglelabs/mingle/pull/313 (Draft, CI 통과, mergeable)
- 2026-10-30에 `origin/main`을 머지해 둠(merge commit `f9f58080`). 충돌 없음.
- 이 PR이 추가하는 건 `mingle-voice-agent/` 폴더 하나와 이 문서뿐이다. `mingle-app` 등 기존 코드는 건드리지 않았다.

---

## 0. 먼저 지켜야 할 규칙 (사용자 지침)

- 답변은 **한국어**로, 간단명료하게. 응답 맨 끝에 100자 이내로 요약과 사용자 액션 아이템을 적는다.
- 사용자가 "하지 마"라고 하지 않으면 커밋과 푸시는 바로 한다.
- `~/mingle` 메인 폴더는 main 브랜치로 둔다. 작업은 워크트리에서 한다.
- **개발 서버를 자동으로 띄우지 않는다.** 이 프로젝트의 CLAUDE.md 규칙이다. `pnpm livekit`, `pnpm server`, `ngrok`은 사용자가 직접 띄우거나 명시적으로 요청할 때만 실행한다. `pnpm bench`는 짧게 돌고 끝나는 스크립트지만, 실행 전에 로컬 LiveKit이 떠 있어야 하므로 마찬가지로 사용자 확인을 받는다.
- API 키 값은 출력하거나 커밋하지 않는다. 키는 `~/mingle/.env.local`에 있다.
- QA는 실제 아이폰("Royce의 iPhone", iPhone 14)으로 하는 게 원칙이다. 시뮬레이터는 보조로만 쓴다. 다른 세션이 그 폰을 쓰고 있을 수 있으니 확인한다.
- prod DB(Railway)에는 `_prisma_migrations`가 없다. `prisma migrate deploy`는 절대 실행하지 않는다. 필요하면 SQL을 한 트랜잭션으로 직접 적용한다(`psql -1 -v ON_ERROR_STOP=1`).

---

## 1. 사용자가 원한 것 (원문 요지)

1. 대화방 **안의 기능**으로 보이스톡을 만든다. 음성만 오가는 게 아니라 **동시통역**이 되어야 한다.
   - 파이프라인은 지금 이어폰모드와 같은 Soniox STT → GPT 번역 → Gemini TTS.
   - 통역이 켜져 있으면 통역 목소리는 크게, 상대 원음은 작게 들린다.
   - 통역을 끄면 상대 원음이 크게 들린다.
   - 사용자가 질문함: "P2P로 해야 하나? 서버에서 통역해야 할 텐데."
2. Hash Rush 게임(https://github.com/minglelabs/hash-rush)을 대화방 안의 기능으로 넣는다. 아니면 "대화방 = 대기방, 게임 들어가기" 구조로 갈지 검토해 달라고 했다.

진행 경과:
1. 기획/설계를 먼저 했다(아래 2장).
2. "POC 시작" → 보이스톡 POC 구현, 커밋, 푸시.
3. "PR 올리기" → Draft PR #313.
4. "테스트하고 배포?" → 실제 폰 테스트 먼저 하고 prod 배포는 아직 하지 말자고 답함.
5. "너가 테스트 해봤어?" → 봇·헤드리스 테스트만 했다고 답함(5장).
6. main 머지 완료.

**Hash Rush는 기획만 했고 코드는 0줄이다.**

---

## 2. 확정 설계 (기획 답변 요약)

### 2.1 보이스톡: P2P가 아니라 SFU(LiveKit) + 서버 통역 에이전트

P2P를 버린 이유:
- 통역하려면 서버가 어차피 음성을 들어야 한다. P2P로 하면 폰이 업링크를 두 번 보낸다(상대에게, 통역 서버에).
  - 그러면 통화 엔진과 기존 STT 모듈이 마이크를 동시에 잡아 충돌하고, AEC도 꼬인다.
- **스피커폰 에코가 가장 큰 리스크다.** 통역 음성을 별도 플레이어(지금 TTS 플레이어)로 틀면 통화 엔진의 AEC가 그 소리를 모른다. 그러면 마이크로 다시 들어가 "통역의 통역" 피드백 루프가 생긴다.
  - 해결: 통역 음성도 WebRTC 트랙으로 받아 재생해서 AEC가 같이 지우게 한다. 이게 SFU를 고른 핵심 이유다.
- SFU 한 홉 지연은 한국↔싱가포르 왕복 약 70~90ms라 원음 실시간성에는 문제가 없다.
- Railway(싱가포르)는 공개 UDP를 받지 못한다. 그래서 **LiveKit Cloud**(TURN 포함)를 권장했다. 비용이 커지면 나중에 싱가포르 VM에 self-host로 옮긴다.

구조:
```
[A 폰] ──원음 트랙──▶ LiveKit ──원음──▶ [B 폰]
                      │                  ▲
                      ▼                  │ tr:<B언어> 트랙
              [통역 에이전트 mingle-voice-agent]
              화자별 Soniox → 번역 → Gemini TTS(스트리밍)
              → 언어별 통역 트랙 송출 + 자막 data message
```
- 에이전트는 방에 보이지 않는 참가자(role=interpreter)로 들어간다.
- 화자마다 STT를 돌리고, **듣는 언어별로 트랙을 하나씩** 내보낸다(`tr:ja`, `tr:en` …). 그룹콜에서는 언어 레인마다 줄을 순서대로 재생한다.
- 비용 절감: 다른 언어를 쓰면서 통역을 켠 청자가 있을 때만 그 화자 STT를 돌린다. 이건 아직 미구현이다. POC는 모든 화자에 대해 STT를 돌리고, 청자 필터링은 번역·TTS 단계에서만 한다.
- 내 말의 통역은 기본으로 안 들린다(POC도 그렇다).

볼륨(덕킹):

| 상태 | 원음 | 통역 |
|---|---|---|
| 통역 ON, 고정 덕킹 | 25% | 100% |
| 통역 ON, 동적 덕킹(2단계 후보) | 통역 재생 중에만 15%, 아니면 100% | 100% |
| 통역 OFF | 100% | 구독 해제 |
| 같은 언어끼리 | 100% | 없음 |

### 2.2 앱 통합 설계 (아직 미구현, MVP 범위)

- 대화방 상단 📞 → 멤버를 호출한다. 방에 "보이스톡 중 · N명 · 참여" 배너를 띄우고, 그룹방에서는 자유롭게 들어오고 나간다.
- 통화 중에도 대화방을 쓸 수 있게 **미니 통화바**를 둔다.
- 통화 화면: 음소거 / 스피커 / **통역 ON·OFF** / 원음 볼륨 / 종료 + 실시간 자막(원문+번역).
- 종료 후 "📞 보이스톡 12:34" 메시지와 자막 기록을 대화방에 남긴다(기존 메시지 저장 경로 재사용). 이게 차별점이다.
- **통화 오디오는 RN 네이티브(`@livekit/react-native`)에서 처리한다. WebView가 아니다.**
  - 이유: 잠금화면·백그라운드, 오디오 라우팅, AEC, CallKit.
  - UI는 웹에서 만들고, 기존 STT/TTS 브릿지처럼 네이티브에 명령을 보낸다.
  - PC 웹은 `livekit-client`를 그대로 쓴다.
- 통화 중에는 이어폰모드와 기존 STT를 끄고, 통화가 오디오 세션을 독점한다.
- 신규 항목:
  - DB: `AppVoiceCall`, `AppVoiceCallParticipant`
  - API: `POST /voice-calls`(토큰 발급, 방 멤버 검증)
  - LiveKit 웹훅(입장·퇴장·종료 기록과 과금)
- 그룹 최대 인원은 기존 대화방 제한(10명)을 따른다.
- 과금: 통역을 켠 시간만 분당 해씨(코인) 차감.
  - 코인 기능(PR #257)은 **2026-10-29 main 머지 완료**, prod는 `COIN_BILLING_ENABLED=shadow`다.
  - 확정 단가: 음성 8 해씨/분(번역 포함), TTS 켜면 약 13 해씨/분.
  - 상세: `docs/coin-iap-spec.md`, `docs/coin-iap-implementation.md`.

### 2.3 Hash Rush: "대화방 = 대기실, 게임 = 방 안에서 여는 세션"

- 친구, 초대, 알림, 번역 채팅이 모두 대화방에 있다. 게임방을 따로 만들면 다 중복된다.
- 대기 중·게임 후 채팅이 번역되고, 보이스톡을 켠 채로 하면 "통역 보이스챗 게임"이 된다.
- 흐름: 방 안 카드 "🌻 Hash Rush 대기 중 3/8 · 참가" → 참가자로 자리 채움 → 빈자리는 봇 → 시작 → 결과 카드("🏆 OO 우승 10:8") + 방별 랭킹.
- 낯선 사람 매칭 로비가 필요하면 대화방에 "게임 로비" 플래그를 붙여 같은 구조를 재사용한다.

hash-rush 레포 현재 문제(gh로 README 확인):
- 방장 브라우저가 권한을 가진 PeerJS/WebRTC P2P 구조다.
  - LTE에서는 직접 연결이 막혀 **파리 TURN**을 거치고, 왕복이 약 0.5초다.
  - 방장이 나가면 게임이 멈춘다.
- 방 목록·랭킹이 **공개 MQTT 브로커**에 있다. 유실과 조작 위험이 있다.
- 장점: 게임 로직 `src/sim`이 Node에서 돈다(테스트·봇 학습에 사용 중). 그래서 서버 권한 방식으로 옮기기 쉽다.

단계:
- **G1**: 우리 도메인에 호스팅하고, 대화방 위 전체화면 iframe으로 띄운다.
  - 브릿지: 로그인, 이름·사진, 햅틱, 결과 저장.
  - TURN을 아시아 거점이 있는 Cloudflare TURN으로 교체한다.
  - 게임 내 로비·방목록·채팅은 대화방으로 대체한다.
- **G2**: 신규 `mingle-game`(WebSocket, 싱가포르)이 서버 권한으로 시뮬레이션을 돌린다. 클라이언트는 입력만 보내고 `predict.js`는 그대로 쓴다.
  - 랭킹·Elo는 우리 DB로 옮긴다(`GameMatch`, `UserGameRating`).

### 2.4 진행 순서(제안)
1. 보이스톡 POC: 실제 아이폰으로 지연, 스피커폰 에코, 덕킹을 측정한다. ← **지금 여기.** 코드는 끝났고 실기기 테스트가 남았다.
2. 1:1 보이스톡 MVP: 방에서 시작·수락·종료, 통역 토글, 자막, 통화 기록, 일반 푸시 호출.
3. CallKit/ConnectionService, 그룹콜, 코인 과금, 지연 단축.
4. Hash Rush G1 → G2 → 공개 로비. G1은 1과 병렬로 진행할 수 있다.

### 2.5 사용자 결정 대기 (아직 답 없음)
- LiveKit Cloud 사용 여부(외부 의존과 비용). 계정은 사용자가 만들어야 한다.
- MVP를 1:1로 할지 그룹콜까지 할지. 권장은 1:1이고, 구조는 처음부터 그룹 가능하게 한다.
- CallKit을 MVP에 넣을지.
- 보이스톡 과금 시점.
- Hash Rush를 G1으로 먼저 낼지, 바로 G2로 갈지.

**결정 없이 MVP 구현에 들어가지 말 것.**

---

## 3. POC 코드 구조 (`mingle-voice-agent/`)

독립 패키지다(자체 `package.json`, `pnpm-lock.yaml`). 모노레포 워크스페이스에 묶여 있지 않다. 영어 README에 아키텍처, 실행법, 벤치 결과가 있다.

| 파일 | 역할 |
|---|---|
| `env.ts` | env 로딩 순서: `VOICE_POC_ENV_FILE` → `./.env.local` → `../.env.local` (override false). 설정값과 `isLocalLivekit()`, `missingProviderKeys()`(SONIOX/GEMINI만 필수) |
| `poc-server.ts` | `/` 테스트 페이지, `/livekit-client.umd.js`, `/api/token?room&name&lang`, `/health`. 로컬 LiveKit이면 `/rtc` HTTP와 WS 업그레이드를 7880으로 프록시해서, ngrok 하나(4100)로 페이지와 시그널링을 같이 처리 |
| `token.ts` | `createJoinToken()`: attributes `{lang, interpret, role}`, `canUpdateOwnMetadata`, agent grant. `INTERPRETER_ROLE='interpreter'` |
| `interpreter.ts` | 핵심 에이전트(388줄). 아래 3.1 |
| `soniox-stream.ts` | Soniox RT WebSocket(`stt-rt-v5`, endpoint detection, `max_endpoint_delay_ms`, 5초 keepalive, 끊기면 재연결). `partial`/`segment` 이벤트. `speechEndAt = audioStartedAt + 마지막 final 토큰 end_ms` |
| `translate.ts` | OpenAI chat completions(`gpt-6-luna`, `reasoning_effort:'none'`, `service_tier:'priority'`, 컨텍스트는 system 프롬프트에). 401이면 `AuthError` → 프로세스 동안 OpenAI 비활성 → Gemini `gemini-2.5-flash-lite`(`serviceTier:'priority'`, 컨텍스트 없음)로 폴백. 결과가 목표 언어 문자(ko/ja/zh/th/ru 정규식, 라틴 언어)가 아니면 컨텍스트 없이 1회 재시도 |
| `tts.ts` | Gemini Interactions API SSE 스트리밍(`gemini-3.8-flash-lite-tts`). `step.delta`의 audio(base64 L16 24kHz)를 청크로 받는다. 보이스: ko `ko-kr-csagent-8`, 그 외 `Kore`. 스타일 'speaking rapidly'(ja는 'slightly faster than normal pace'). 앞 무음을 잘라내고 40ms 패딩 |
| `audio.ts` | WAV 파싱·인코딩, 리샘플, 무음 트림, `isVoiced`, `textSimilarity`(Dice bigram) |
| `chunk-queue.ts` | `ChunkQueue<T>` async iterator. TTS 청크를 레인 재생과 이어 준다 |
| `agent.ts` | 방 하나에 대한 인터프리터만 단독 실행하는 CLI |
| `public/index.html` | 한국어 테스트 UI(309줄). 아래 3.2 |
| `scripts/bench.ts` | 헤드리스 E2E 벤치. 아래 3.3 |

### 3.1 `interpreter.ts` 동작
- identity `interpreter-<room>`, name '통역'. `ensureInterpreter(room)`이 레지스트리로 방마다 하나만 유지한다. 마지막 사람이 나가고 30초 뒤에 퇴장한다(`IDLE_LEAVE_MS`).
- 참가자가 바뀔 때마다 `refreshParticipants()` → 필요한 언어 레인 트랙(`tr:<lang>`, 24kHz `AudioSource`)을 publish한다.
- 화자마다 `AudioStream`(16kHz) → `SonioxStream`. `capture()`가 20ms 프레임으로 잘라 보낸다(carry 버퍼).
- `targetsFor(speaker)`: 화자를 제외하고, `interpret==='off'`인 청자와 화자와 같은 언어인 청자를 뺀 목표 언어 집합.
- 세그먼트 하나의 파이프라인은 레인별로 체인된다. 번역과 TTS는 미리 병렬로 돌리고, 재생만 순서대로 한다.
  1. 에코 가드: 직전 12초 안에 레인이 재생한 텍스트나 다른 화자의 텍스트와 유사도가 0.6 이상이면 `echo`를 보내고 버린다.
  2. `final` 전송 → 언어별 `translateUtterance`(최근 4턴 컨텍스트) → `translation` 전송.
  3. `synthesizeStream` → `ChunkQueue` → 레인 차례가 오면 재생. 그때 `play`(metrics 포함)와 `lane {playing:true}`를 보내고, 끝나면 `lane {playing:false, audioMs}`를 보낸다.
  4. 실패하면 `error`.
- data message는 topic `interpreter`(`CAPTION_TOPIC`)로, JSON이다.
  - 타입: `partial`(150ms throttle, lossy), `echo`, `final`, `translation`, `play`, `lane`, `error`.
  - `play.metrics`: `{endpointMs, translateMs, ttsFirstAudioMs, queueMs, speechEndToPlayMs, translator}`.
- `stats`: `{segments, interpreted, echoSuppressed, errors}`.

### 3.2 테스트 페이지 (`public/index.html`)
- 입장 화면: 이름, 언어, 방 이름, "WebAudio로 믹스" 체크(iOS는 `<audio>.volume`을 무시해서 기본 ON으로 둔다).
- 통화 화면:
  - 통역 ON/OFF(`setAttributes({interpret})`), 음소거, 나가기.
  - 덕킹 모드 select(고정/동적), 원음·통역 볼륨 슬라이더.
  - 자막 + 줄별 metrics, 지연 중앙값 요약, "에코 차단" 카운트.
- `autoSubscribe:false` + `syncSubscriptions()`/`applyVolumes()`로 구독과 볼륨을 직접 관리한다. `tr:<내 언어>`만 구독하고, OFF면 구독을 해제한다.
- 마이크 권한이 실패하면 듣기 전용으로 들어간다(내장 브라우저 테스트용).

### 3.3 벤치 (`scripts/bench.ts`)
- macOS `say -v Yuna`로 한국어 5문장을 만들고 → `afconvert`로 16k WAV로 바꿔 `.cache/`에 캐시한다.
- speaker 봇이 실시간 페이스로 송출한다(문장 사이 4.5초).
- listener 봇(`BENCH_LISTENER_LANG`, 기본 ja)이 `tr:ja`를 녹음하고 발화 시작점을 감지한다.
- 출력: 줄별 "말 끝 → 통역 들림" 지연 + metrics, 중앙값, 수신 오디오 `.cache/bench-ja.wav`.
- `BENCH_ROOM=<room>`: 서버가 이미 통역 중인 방에 들어간다(브라우저와 같이 확인할 때). 이때는 서버 프로세스의 인터프리터를 쓴다.
- 함정: TrackSubscribed 핸들러는 **connect 전에** 붙여야 한다(`join()`의 setup 콜백). 그렇지 않으면 기존 레인 트랙을 놓친다. 이걸로 0/5가 나온 적이 있다.

---

## 4. 실행 방법

```bash
brew install livekit                    # 최초 1회
cd mingle-voice-agent && pnpm install
pnpm livekit                            # 터미널1: livekit-server --dev (devkey/secret, 7880)
VOICE_POC_ENV_FILE=~/mingle/.env.local pnpm server   # 터미널2: http://localhost:4100
VOICE_POC_ENV_FILE=~/mingle/.env.local pnpm bench    # 헤드리스 벤치(LiveKit 필요)
pnpm typecheck
```

- 필요한 키: `SONIOX_API_KEY`, `GEMINI_API_KEY`. `OPENAI_API_KEY`는 선택이다(없거나 무효면 Gemini 번역).
- 포트는 `VOICE_POC_PORT`. `PORT`는 쓰지 말 것: 루트 `.env.local`의 `PORT`(5202)와 충돌해서 바꿨다.
- 기타 env:

| 변수 | 기본값 / 범위 |
|---|---|
| `VOICE_SONIOX_MAX_ENDPOINT_DELAY_MS` | 1500 (500~3000) |
| `VOICE_TRANSLATE_PROVIDER` | openai |
| `VOICE_TRANSLATE_MODEL` | - |
| `VOICE_GEMINI_TRANSLATE_MODEL` | - |
| `VOICE_TTS_MODEL` | - |
| `OPENAI_BASE_URL` | - |
| `LIVEKIT_URL` | - |
| `LIVEKIT_API_KEY` | - |
| `LIVEKIT_API_SECRET` | - |

- 아이폰 두 대(같은 Wi-Fi): `ngrok http 4100` → https URL을 두 폰에서 열고, 다른 언어를 고르고, 같은 방에 들어간다.
  - 시그널링은 터널로, 미디어는 Mac LAN IP로 UDP 직결된다.
  - macOS가 `livekit-server`의 수신 연결 허용을 물으면 허용한다.
- LTE·다른 네트워크: `LIVEKIT_URL=wss://<project>.livekit.cloud` + 키·시크릿을 설정한다. 그러면 `pnpm livekit`과 `/rtc` 프록시는 필요 없다.
- 작업 후 서버는 꼭 종료한다. `livekit-server`가 pkill 후에도 남은 적이 있으니 pid를 확인해서 kill한다.

---

## 5. 테스트 현황 (정직하게)

### 한 것
- 벤치 봇(개인 방과 공유 방 모두), ko→ja 5문장 모두 정확히 번역되고 들렸다.
  - 최종: 중앙값 **2411ms**, min 2131, max 3632. 비스트리밍 TTS일 때는 약 3.6초였다.
  - 구간별: Soniox endpoint 약 0.65초(가끔 약 1.9초), 번역 0.8~1.2초(Gemini), TTS 첫 오디오 0.7~0.9초, 큐 0.
- 내장 브라우저(데스크톱 Chromium) 듣기 전용 ja로 `webtest` 방에서 확인:
  - `tr:ja`만 구독됨.
  - 볼륨 실측: 고정 원음 0.25 / tr 1.00, 동적 0.15↔1.00, OFF면 원음 1.00이고 tr은 구독 해제.
  - 자막과 metrics 표시 정상.
- `pnpm typecheck` 통과, PR CI 2/2 통과.

### 안 한 것 (= 다음 할 일)
1. **실제 사람 목소리·실제 마이크.** 내장 브라우저가 마이크를 막아서 못 했다.
2. **스피커폰 에코.** 폰 2대에서 AEC가 tr 트랙을 지우는지, 에코 가드가 얼마나 발동하는지("에코 차단" 카운트) 봐야 한다.
3. **iOS Safari 트랙별 볼륨**(WebAudio 믹스): 고정·동적 덕킹이 실제로 적용되는지.
4. **통역 음질 청취.** `.cache/bench-ja.wav`는 저장만 했고 아무도 듣지 않았다.
5. **GPT 번역.** `~/mingle/.env.local`과 `mingle-model-test/.env`의 OpenAI 키가 둘 다 401이다. 사용자가 키를 교체해야 GPT와 Gemini의 지연·품질을 비교할 수 있다.
6. **LTE/TURN**(LiveKit Cloud). 사용자가 계정을 만들어야 한다.
7. Endpoint 튜닝: 일부 줄이 Soniox `<end>`를 약 1.9초 기다린다. `VOICE_SONIOX_MAX_ENDPOINT_DELAY_MS`를 낮춰 실험해 볼 것.

---

## 6. 겪은 함정과 해결 (반복하지 말 것)

- OpenAI 401 → Gemini 자동 폴백. `AuthError`가 나면 프로세스 동안 OpenAI를 끈다.
- Gemini에 컨텍스트를 user 메시지로 넣었더니 번역 대신 대화로 답하거나 한국어를 그대로 출력했다.
  - 조치: 컨텍스트를 system으로 옮기고, Gemini는 컨텍스트 없이 호출하고, 목표 언어 문자 검사 후 재시도한다.
- `pnpm server`를 백그라운드로 띄우면 조용히 죽었다. `node ./node_modules/ts-node/dist/bin.js --transpile-only poc-server.ts`로 직접 띄우면 된다(package.json 스크립트가 이미 이 형태다).
- 패키지 밖에서 ts-node 프로브를 실행하면 TS5109 에러가 난다. 프로브 스크립트는 `mingle-voice-agent/.cache/` 안에 둔다.
- iOS는 `<audio>.volume`을 무시한다. 트랙별 볼륨은 `webAudioMix` + `setVolume`으로만 된다.

---

## 7. 참고한 기존 코드 (MVP 구현 시 재사용 대상)

- `mingle-stt/stt-server.ts`: Soniox 설정. `mingle-stt/segmentation-strategy.ts`: 분할 로직.
- `mingle-app/src/server/translation/translate-texts.ts`: OpenAI 번역 payload(gpt-6-luna, priority tier).
- `mingle-app/src/server/api/shared/tts-provider.ts`: Gemini Interactions TTS, 보이스, 스타일, Inworld 폴백.
- `mingle-app/src/lib/tts-models.ts`, `translation-models.ts`: 앱 기본 모델.
- 이어폰모드 로직, conversation-limits(최대 10명), `docs/railway-single-service.md`(Railway 단일 서비스 구조).
- 인프라 리전은 Railway와 Supabase 모두 싱가포르다. 새 서비스를 us-west2 기본값으로 만들지 말 것.

---

## 8. Kiro가 이어서 할 일 (우선순위)

1. **사용자에게 결정 요청**: 2.5의 5개 항목, OpenAI 키 교체, LiveKit Cloud 계정 생성.
2. **아이폰 2대 실기기 테스트**(사용자 동의 후, 4장 절차). 측정 항목:
   - 말 끝 → 통역 들림 지연(페이지 요약)
   - 스피커폰 에코 / 에코 차단 횟수
   - iOS 덕킹 고정·동적
   - 통역 ON/OFF 전환
   - 같은 언어 참가자 처리
   - 결과는 PR #313 설명과 `mingle-voice-agent/README.md`의 "Still open"에 반영한다.
3. 키가 교체되면 GPT로 `pnpm bench`를 다시 돌려 Gemini와 비교한다. `VOICE_SONIOX_MAX_ENDPOINT_DELAY_MS` 800/1000/1500도 비교한다.
4. 결정이 나오면 MVP 착수:
   - DB 마이그레이션(`AppVoiceCall*`). prod에 적용하는 방식은 0장 규칙을 따른다.
   - `POST /voice-calls`, LiveKit 웹훅.
   - 에이전트를 Railway 서비스로 배포. 에이전트는 아웃바운드로만 연결하므로 UDP 인바운드가 필요 없다.
   - RN `@livekit/react-native` 네이티브 모듈 + 웹 UI(📞 버튼, 배너, 미니바, 통화 화면), 통화 자막을 메시지로 저장.
   - "통역 켠 청자가 있을 때만 STT" 최적화.
5. Hash Rush G1(병렬 진행 가능): hash-rush 레포 호스팅, iframe 오버레이, 브릿지, Cloudflare TURN.

PR #313은 POC라서 Draft로 둔다. prod 배포는 하지 않는다(사용자와 합의함). main에 머지할지는 사용자에게 묻는다.
