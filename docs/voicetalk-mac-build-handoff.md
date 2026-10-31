# 그룹 보이스톡 + Hash Rush 채팅방 기능: Mac 빌드·실기기 확인 인수인계

작성: 2026-10-31 (Windows PC의 Kiro). 받는 사람: Mac에서 일하는 AI.
이 문서만 읽고 빌드부터 실기기 확인, 보고까지 할 수 있게 썼다.

## 0. 지켜야 할 규칙

- 답은 한국어로, 짧게. 끝에 100자 이내 요약과 사용자가 할 일을 쓴다.
- 커밋 메시지, README는 영어. 일이 한 덩어리 끝날 때마다 내가 한 것만 커밋하고 푸시한다.
- `main`에 직접 푸시하지 않는다. 아래 브랜치에 푸시한다.
- mingle 서버는 가능하면 devbox로 띄운다 (`docs/worktree-devbox.md`).
- prod DB(Railway)는 절대 건드리지 않는다. 로컬 DB만 쓴다.
- 비밀값(API secret, 토큰)은 화면, 로그, 커밋 어디에도 출력하지 않는다.
- UI/UX 문제를 찾으면 `docs/ui-ux-codex-thread-history.md`에 날짜별로 자세히 적는다.
- 앱 버전과 API namespace 버전은 같아야 한다 (지금 `ios/v2.3.0`, `android/v2.3.0`).

## 1. 무엇을 만들었나

| 부분 | 내용 | 위치 |
|---|---|---|
| 보이스톡 화면 | 기존 채팅방 상단바 아래로 내려오는 판. 8자리(4×2), 말하는 사람은 노란 링, 위로 밀어 접기, 대화 내용은 글 한 줄 | `mingle-app/src/components/LivePhoneDemo/VoiceTalkPanel.tsx` |
| 시작 버튼 | 채팅방 상단바 📞. 통화 중이면 초록 점 | `LivePhoneDemo.tsx` 상단바 |
| 소리 | 앱 네이티브(`@livekit/react-native`). 화면은 없음, 웹 판이 브리지로 조종 | `mingle-app/rn/src/voice/VoiceRoomHost.tsx`, `voiceBridge.ts`, `rn/src/nativeVoice.ts` |
| 서버 API | 방 상태 / 입장 토큰 / 나가기 / LiveKit 웹훅 | `mingle-app/src/server/voice/*`, `src/app/api/conversations/[conversationId]/voice/**`, `src/app/api/webhooks/livekit` |
| DB | `app_voice_calls`, `app_voice_call_participants` | 마이그레이션 `20261031082517_add_voice_calls` |
| 통역 에이전트 | `voice-*` 방에 숨은 통역 참가자를 넣음 (Soniox → GPT/Gemini → Gemini TTS) | `mingle-voice-agent/service.ts` |
| Hash Rush 입구 | 채팅방 메뉴 "🌻 Hash Rush 같이 하기" → 채팅 위 시트(iframe), 아래로 내리면 채팅 | `LivePhoneDemo/HashRushSheet.tsx` |
| Hash Rush 입장권 | 멤버만, 채팅 이름으로 입장 | `src/server/hash-rush/ticket.ts`, `POST /api/conversations/{id}/hash-rush/ticket` |
| Hash Rush 서버(G2) | 서버가 방장 대신 게임을 돌림 | hash-rush 저장소 `server/` |

브리지 메시지 (웹 ↔ 네이티브):
- 웹 → 앱: `native_voice_open {conversationId, lang, interpret}`, `native_voice_close`, `native_voice_status_request {conversationId}`, `native_voice_set {mic?, interpret?, mode?, origVol?}`
- 앱 → 웹 (`mingle:native-voice` CustomEvent): `state {phase}`, `status {call}`, `room {snapshot}`
- 판은 `window.ReactNativeWebView`가 있을 때만 보인다. 일반 브라우저에서는 안 보인다.

## 2. 브랜치와 PR

| 저장소 | 브랜치 | PR |
|---|---|---|
| minglelabs/mingle | `feat/voicetalk-windows-livekit-mvp` | https://github.com/minglelabs/mingle/pull/377 (Draft) |
| minglelabs/hash-rush | `feat/g2-server-rooms` | https://github.com/minglelabs/hash-rush/pull/230 |

새 워크트리에서 작업한다:

```bash
cd ~/mingle && git fetch origin
git worktree add ../mingle-voicetalk-build feat/voicetalk-windows-livekit-mvp
cd ~/hash-rush && git fetch origin
git worktree add ../hash-rush-g2 feat/g2-server-rooms
```

## 3. 이미 돌고 있는 것 (Windows PC)

- LiveKit 서버: `wss://voice.minglelabs.app` (Caddy TLS, 자동 시작). 443, 7881/TCP, 50000-60000/UDP 열림. 외부 접속 200 확인됨.
- API key/secret은 Windows PC의 `C:\livekit\livekit.yaml` `keys:`에 있다. Mac에서는 못 읽는다.
  **사용자에게 key와 secret을 직접 받아 `.env.local`에 넣는다.** 채팅에 secret을 붙이라고 하지 말고, 사용자가 파일에 직접 넣게 안내한다.
- LiveKit 웹훅은 아직 꺼져 있다. 없어도 마지막 사람이 나가면 통화는 끝난다.

## 4. 환경 변수

`mingle-app/.env.local` (gitignore 확인):

```
LIVEKIT_URL=wss://voice.minglelabs.app
LIVEKIT_API_KEY=<사용자가 넣음>
LIVEKIT_API_SECRET=<사용자가 넣음>

# Hash Rush (없으면 메뉴가 숨겨짐)
NEXT_PUBLIC_HASH_RUSH_URL=<게임 페이지 https 주소>
NEXT_PUBLIC_HASH_RUSH_SERVER=<게임 서버 wss 주소>
HASH_RUSH_TICKET_SECRET=<아무 긴 랜덤 문자열, 게임 서버와 같게>
```

`mingle-voice-agent/.env.local`: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `SONIOX_API_KEY`, `GEMINI_API_KEY`, (선택) `OPENAI_API_KEY`.
SONIOX/GEMINI/OPENAI 키는 `~/mingle/.env.local`에 있을 수 있다. 값을 출력하지 말고 있는지만 확인한다.

## 5. 할 일 (순서대로)

1. **설치**
   - `cd mingle-app && pnpm install`
   - `cd rn && pnpm install && cd ios && pod install` (`@livekit/react-native`, `@livekit/react-native-webrtc` 포드가 들어와야 함)
2. **정적 검사** (Windows에서는 메모리 부족으로 못 했다)
   - `mingle-app/rn`에서 TypeScript 타입 검사와 `jest src/voice` 실행. `App.tsx`의 보이스 연결 부분 오류를 고친다.
   - `App.tsx`에서 `registerVoiceGlobals()`가 앱 시작 때 한 번 불리는지 확인한다. 안 불리면 LiveKit이 동작하지 않는다.
   - `mingle-app`에서 `pnpm typecheck`(또는 tsc)와 아래 테스트:
     `src/server/voice`, `src/server/hash-rush`, `src/app/api/conversations/[conversationId]/voice`, `src/app/api/namespace-reexport.v2_2_0.guard.test.ts`, `src/app/api/v2-2.namespace-routing.test.ts`
3. **로컬 DB**
   - devbox로 로컬 DB를 띄우고 `prisma migrate deploy`로 `20261031082517_add_voice_calls`까지 적용한다 (로컬만).
4. **서버 띄우기**
   - mingle 앱 서버: devbox로. 폰이 접속할 수 있게 ngrok/LAN 주소를 쓴다 (devbox 문서대로).
   - 통역 에이전트: `cd mingle-voice-agent && pnpm install && pnpm start` → `curl localhost:8080/health`가 200인지.
   - Hash Rush (선택): `cd hash-rush-g2/server && npm install && HASH_RUSH_TICKET_SECRET=... npm start` (8080이 겹치면 `PORT=8090`).
     게임 페이지는 `cd hash-rush-g2 && npm run dev` (5173). 폰에서 열려야 하니 둘 다 ngrok https/wss 주소로 열고 그 주소를 `NEXT_PUBLIC_HASH_RUSH_URL` / `NEXT_PUBLIC_HASH_RUSH_SERVER`에 넣는다.
5. **실기기 빌드**
   - 실제 iPhone("Royce의 iPhone" 등) 2대 이상에 설치한다. 다른 세션이 기기를 쓰고 있는지 먼저 확인한다.
   - 가능하면 한 대는 LTE로 (외부망에서 UDP가 되는지 보려고).

## 6. 확인할 것 (체크리스트)

보이스톡:
- [ ] 같은 채팅방 멤버 2명이 📞로 들어가면 서로 목소리가 들린다.
- [ ] 판이 상단바 바로 아래에서 부드럽게 내려오고, 위로 밀거나 화살표로 접히고 다시 펼쳐진다.
- [ ] 판이 채팅 첫 메시지를 가리는지. 가리면 위 여백 처리 방법을 제안/수정한다.
- [ ] 말하는 사람에게 노란 링이 바로 뜬다 (지연 체감).
- [ ] 마이크 끄기, 통역 ON/OFF, 나가기가 동작한다.
- [ ] 다른 언어로 말하면 판에 "이름 + 번역 (원문)" 글이 뜨고, 통역 음성이 들린다 (통역 에이전트가 켜져 있어야 함).
- [ ] 스피커폰에서 통역 음성이 다시 마이크로 들어가 되풀이(에코)되지 않는다.
- [ ] 9번째 사람은 "자리가 다 찼어요"가 뜬다 (기기 수가 모자라면 생략하고 적는다).
- [ ] 앱을 백그라운드로 보내거나 화면을 잠가도 소리가 이어진다.
- [ ] 멤버가 아닌 사람은 들어갈 수 없다 (API 403).
- [ ] 마지막 사람이 나가면 통화가 끝나고, 다시 📞을 누르면 새 통화가 열린다.

Hash Rush (환경 변수를 넣었다면):
- [ ] 메뉴 "🌻 Hash Rush 같이 하기" → 시트가 아래에서 올라오고 게임이 뜬다.
- [ ] 두 기기가 같은 게임 방에 채팅 이름으로 들어간다.
- [ ] 시트를 아래로 내리면 채팅으로 돌아가고, 보이스톡은 계속 이어진다.
- [ ] iframe 안에서 터치 조작, 소리가 된다 (iOS WebView 제약 확인).

## 7. 알려진 빈 곳

- RN 화면 코드는 타입 검사와 실기기 확인을 한 번도 못 했다. 빌드 오류가 나면 고친다.
- 채팅에 "🎙 Voice talk 12:34" 종료 메시지, Hash Rush 대기/결과 카드는 아직 없다.
- 통역 시간 코인 차감은 아직 없다 (`interpretedMs`만 모음).
- 통역 에이전트와 Hash Rush 서버는 Railway에 아직 안 올렸다 (설정 파일만 있음, 싱가포르 지역, replica 1).

## 8. 보고

- 결과를 체크리스트 표(통과/실패/못 함 + 이유)로 정리한다.
- 고친 코드는 같은 브랜치에 영어 커밋으로 푸시하고, PR #377 / #230 설명의 "Not done"을 갱신한다.
- 스크린샷이나 화면 녹화가 있으면 PR 댓글에 붙인다. **직접 찍은 것만 스크린샷이라고 부른다.**
- UI/UX 문제는 `docs/ui-ux-codex-thread-history.md`에 기록한다.
