# UI/UX 이슈 및 설계 결정 기록 (Codex 쓰레드 히스토리)

프로젝트 규칙: mingle 서비스의 UI/UX 관련 이슈·설계 결정은 이 문서에
날짜별 섹션으로 상세히(한국어 위주) 기록한다.

---

## 2026-10-31 — 그룹 보이스룸 RN UI (Phase 3)

### 배경
대화방 안에서 돌아가는 실시간 그룹 음성 대화(최대 8명) + 숨은 서버 통역
에이전트. 아키텍처는 self-host LiveKit SFU(`wss://voice.minglelabs.app`) +
통역 참가자. 앱의 나머지 화면은 WebView 호스트지만, 보이스룸은 WebRTC의
백그라운드/잠금화면 오디오·오디오 라우팅·AEC가 필요해서 **앱 최초의 네이티브
RN 화면**으로 만든다(계획서 §0 확정 사항).

### 화면 구성 (Clubhouse / HelloTalk 스타일)
- **VoiceRoomScreen**: 상단 헤더(뒤로/최소화, 제목, N/8 카운트), 스피커 그리드,
  라이브 캡션 리스트, 하단 컨트롤 바.
  - **스피커 그리드**: 최대 8타일 + 빈 자리 "초대" 타일. 아바타는 채팅과 동일
    소스(`User.image`). 말하는 사람은 `ActiveSpeakersChanged` 기반으로 아바타
    둘레에 **애니메이션 발광 링**(`Animated`, scale 1→1.12 / opacity 0→0.9 루프).
  - **라이브 캡션**: 원문 → 내 언어 번역. 최신순. partial은 흐리게(…) 표시,
    echo(자기 발화 되돌림)는 반투명.
  - **컨트롤 바**: 마이크, 스피커 라우트, 통역 ON/OFF, 원음/통역 볼륨 믹스,
    나가기(붉은색).
- **VoiceRoomBanner**: 대화방 메시지 리스트 상단 고정 배너. 방이 살아있으면
  "🎙 보이스톡 · N/8" + 아바타 3개 + [참여]. 없으면 "보이스톡 시작" 진입점.
- **VoiceMiniBar**: 방에 있으면서 채팅을 둘러볼 때 떠 있는 플로팅 알약(PiP 느낌).
  탭 = 방 다시 열기, ⎋ = 나가기.

### 설계 결정 (POC 재현)
- **구독 정책(`shouldSubscribe`)**: 사람 오디오는 항상 구독. 통역 참가자는
  `interpret ON`일 때만 **내 언어 레인 `tr:<myLang>`** 하나만 구독, 나머지
  레인은 미구독. OFF면 통역 레인 전부 해제. `autoSubscribe:false`로 연결.
- **볼륨 믹스(`originalVolume`)**:
  - 통역 OFF 또는 내 언어와 같은 화자 → 원음 100%.
  - 고정(static) 모드 → 원음 25%(`origVol` 슬라이더).
  - 동적(dynamic) 모드 → 레인 재생 중일 때만 15%, 아니면 100%.
  - 통역 트랙은 항상 `trVol`(기본 100%).
  - `lane` 데이터 메시지의 playing 값으로 동적 더킹 토글.
- **통역 토글**: `setAttributes({interpret:'on'|'off'})` + 재구독 + 재믹스,
  토글 시 `lanePlaying` 리셋.
- **캡션 프로토콜**: 토픽 `interpreter`, 타입 partial/final/echo/translation/
  play/lane/error. partial→final 전환 시 partialId→id 리맵으로 늦게 도착한
  translation도 올바른 줄에 붙도록 보관(`partialToId`). play 메트릭은 **내
  언어일 때만** 해당 줄에 부착.
- **마이크 거부 폴백**: 마이크 권한 없으면 리스너로 입장(컨트롤 비활성 + "마이크
  없음" 표기), 방에서 쫓아내지 않음.

### i18n
- 한국어 우선. 첫 네이티브 화면이라 웹 i18n 카탈로그를 끌어오지 않고 보이스룸
  전용 ko+en 문자열 테이블(`voiceStrings.ts`)을 둠. primary locale이 ko*면 한국어,
  그 외 en 폴백. 추후 언어 확장은 이 테이블에 추가.

### 브리지 / 통합
- RN↔WebView 브리지 규약: 웹이 `native_voice_open|close|status_request`
  커맨드로 네이티브 오버레이를 제어, 네이티브는 `mingle:native-voice`
  CustomEvent로 방 상태(state)와 배너용 status(GET /voice 폴링)를 웹에 전달.
- 오버레이는 기존 WebView 위에 절대배치. 통역 배너/엔트리는 채팅 UI가 웹이므로
  웹이 띄우고, "참여/시작" 탭 시 open 커맨드로 현재 conversationId의 네이티브
  방을 연다.
- 배너 상태는 채팅 열려 있는 동안 GET /voice를 약 10초 간격 폴링.

### 미해결/후속
- 실기기 2대 통화·발화 링·배경 오디오는 Mac 빌드에서만 검증 가능(이 호스트는
  Windows). pod install / 네이티브 빌드 명령은 최종 보고 참조.
- iOS Live Activity("번역 중")는 MVP에서 CallKit 대신 사용 예정(후속 네이티브 작업).
- 스피커 라우트 토글은 기존 `nativeAudioRoute` 개념과 연동 예정(현재는 콜백 훅만
  노출).

## 2026-10-31 — 그룹 보이스톡 UI를 채팅방 안 판으로 변경, Hash Rush 채팅방 시트

### 문제
- 처음 만든 보이스톡은 클럽하우스식 검은 전체 화면(네이티브 RN)이었다.
- 기존 채팅방 UI와 모양이 달랐고, 통화 중에는 채팅을 볼 수 없었다.
- 사용자 지적: "채팅방이 이미 있는데 왜 다른 화면으로 만들었냐."

### 결정
- 보이스톡은 새 방 종류가 아니다. 기존 채팅방에서 켜고 끄는 기능이다 (카톡 방식).
- 화면은 웹 채팅방(`LivePhoneDemo`)이 그린다. 상단바 바로 아래에서 판이 내려온다.
  - 판: 최대 8명 동그라미(4×2), 말하는 사람은 앰버색 링, 빈 자리는 점선.
  - 위로 끌거나 화살표를 누르면 한 줄 바로 부드럽게 접힌다 (framer-motion spring).
  - 접힌 바: 초록 점, "보이스톡 · N/8", 얼굴 4개, 참여 버튼.
  - 말한 내용은 상자 없이 글 한 줄로 뜬다: 이름 + 번역 (원문).
  - 버튼: 마이크, 통역 ON/OFF, 나가기.
- 상단바에 전화 아이콘. 누르면 통화를 시작하거나 참여한다. 통화 중이면 초록 점.
- 소리(LiveKit, 마이크, 에코 제거)는 계속 네이티브가 맡는다. 네이티브 화면은 없앴다.
  - 브리지: 웹 → `native_voice_open/close/set/status_request`, 네이티브 → `state/status/room`.
- Hash Rush: 채팅방 메뉴 "🌻 Hash Rush 같이 하기" → 채팅 위로 올라오는 시트(iframe).
  - 아래로 끌거나 X를 누르면 채팅으로 돌아간다. 보이스톡은 끊기지 않는다.
  - 앱이 입장권을 준다 → 멤버만, 채팅 이름으로 들어간다. 게임 방 = `mingle-<채팅방 id>`.

### 남은 것
- 실기기에서 판 애니메이션, 링 반응 속도 확인.
- 채팅에 대기 카드/결과 카드, 통화 종료 메시지 표시.
- 판이 메시지 첫 줄을 가리는지 확인 (필요하면 위 여백 추가).

## 2026-10-31 — Hash Rush 시트: 광고 배너 가림, 끌기·뒤로 가기로 방에서 나감, 보이스톡 마이크 회색

요구사항 전체는 `docs/hash-rush-in-app-uiux.md`(A1~A10)에 있다. 아래는 iPhone 11 Pro 실기기에서 본 문제와 이번에 바꾼 것.

### 문제
- **광고 배너가 대기실을 가림**: 시트가 열려 있어도 네이티브 광고 배너가 그대로 떠서 Hash Rush 대기실의 자리 목록을 가렸다.
  네이티브 배너는 WebView 위에 그려지므로 웹 시트의 z-index로는 덮을 수 없다.
- **시트 안에서 끌었더니 채팅 목록으로 나감**: 시트만 내려가야 하는데 채팅방까지 닫혔다. 원인 후보:
  - 메뉴의 "🌻 Hash Rush 같이 하기"가 `setMenuOpen(false)`로 메뉴만 숨기고 메뉴의 history 항목을 남겼다.
    다음 뒤로 가기(Android 뒤로, iOS 뒤로 제스처)가 남은 항목이나 채팅방 항목에 떨어질 수 있었다.
  - 시트 머리줄을 화면 왼쪽 끝(32px 안)에서 잡으면 채팅방 `SlideSurface`의 가장자리 스와이프(방 닫기)도 같이 시작됐다.
    그리고 머리줄만 끌리고 시트 몸통은 따라오지 않았다.
  - 시트에는 Android 뒤로 처리와 가장자리 스와이프 막기가 없었다.
- **보이스톡 마이크 버튼이 이유 없이 회색**: iOS 마이크 권한이 거부된 상태면 보이스톡 판의 마이크 버튼이
  `disabled`(흐린 회색)로만 보이고 왜 못 누르는지, 어디서 켜는지 알려주지 않는다.
  (`room.micAvailable === false`일 때 `disabled:opacity-40`만 적용됨.) **이번에는 고치지 않고 기록만 한다.**

### 결정 (바꾼 것)
- **시트 모양(A1)**: 화면 위 safe area 바로 아래부터 끝까지 덮는다. 머리줄은 44px로 얇게: 손잡이, "🌻 Hash Rush",
  보이스톡이 연결돼 있으면 초록 점, 닫기 버튼. 채팅방 안 다른 떠 있는 것들보다 위(z-[90]).
- **끌기·뒤로 가기(A2)**:
  - 끌어 내리기는 머리줄에서만 시작한다(`dragControls`, `dragListener={false}`). 시트 전체가 손가락을 따라 내려간다.
  - 시트 위에서 시작한 터치는 채팅방의 가장자리 스와이프로 넘어가지 않는다(시트에서 pointerdown/touchstart 전파를 막음).
    iframe 안 스와이프는 원래 부모 문서로 오지 않으므로 게임 조작은 앱이 가로채지 않는다.
  - 시트가 열린 동안 iOS 가장자리 뒤로 가기·WebView back/forward 제스처를 끈다(`registerNativeEdgeSwipeSuppression`, 기존 `suppressEdgeSwipe`).
  - Android 뒤로는 시트를 먼저 닫는다(`registerNativeBackHandler`, 우선순위 15: 입력창·메뉴 10, 채팅방 4~5보다 먼저).
  - 메뉴 항목은 `requestCloseMenuPanel()`로 메뉴 history를 정리한 뒤 시트를 연다.
- **광고 배너(A3)**: 시트가 열린 동안 `useNativeBannerSuppression(open)`으로 숨기고, 내리면 원래 zone으로 돌아온다.
- **z 순서(A4)**: 시트가 열린 동안 앱 토스트(sonner)를 숨긴다(`html[data-hash-rush-open="true"] [data-sonner-toaster]`).
  보이스톡 판은 시트가 열리면 접힌 막대가 되고(시트 밑에 가려짐), 시트를 내린 뒤에도 접힌 채로 있다.
- **키보드(A5)**:
  - 시트가 열린 동안 채팅 입력창의 키보드 여백 처리(`activeKeyboardInsetPx`)를 끈다.
  - iframe 안의 페이지는 키보드를 볼 수 없다(자기 `visualViewport`가 iframe 크기 그대로). 그래서 게임이 `keyboard: open`을 보내면
    게임 영역의 아래 끝만 키보드 윗변에 맞춘다. 시트 자체의 크기·위치는 그대로이고, 게임은 타이핑 중 자기 높이를 붙잡아 둔다(맵 크기 유지).
    WebView가 페이지를 밀어 올리면 맨 위로 되돌린다.
  - iOS 키보드 위 ⌃⌄✓ 막대는 채팅방 경로(`/{locale}/conversations`)에서 이미 `hideKeyboardAccessoryView`가 켜져 있고,
    iframe 입력도 같은 WebView 입력 뷰를 쓰므로 함께 숨겨진다. RN 코드는 바꾸지 않고 이 규칙에 테스트만 추가했다.
- **내려도 유지(A6)**: 시트를 내려도 iframe은 그대로 둔다(같은 채팅방 안). 게임에 `visibility: false/true`를 보낸다.
  채팅방을 떠나면(목록으로, 다른 방이 위로) iframe을 버린다. 입장권은 사용자·채팅방별로 기억해 두고 만료 10분 전까지 다시 쓴다.
  서버 응답에 `expiresIn`(초)을 더해 폰 시계와 상관없이 판단한다.
- **보이스톡(A7)**: 이 방 보이스톡의 연결 상태가 바뀌면 `voice: { active }`를 보낸다. iframe `load`, 게임의 `ready` 때도 현재 값을 다시 보낸다.
- **소리(A8)**: iframe `allow="autoplay; fullscreen"` 유지.
- **실패(A9)**: 게임이 `ready`를 보낼 때까지 로딩 표시. 입장권을 못 받으면 "게임에 들어가지 못했어요",
  20초 안에 `ready`가 없으면 "게임 서버에 연결하지 못했어요" + "다시 시도". 다시 시도는 쓸 수 있는 입장권이면 그대로 쓴다.
- **문구(A10)**: 한 줄짜리 짧은 문구. 한국어·영어·일본어, 나머지 언어는 영어.
- 메시지 규격 검사: `event.source === iframe.contentWindow`, `event.origin === 게임 주소의 origin`, `data.source === 'hash-rush'`,
  표에 있는 type·값만 받는다. 앱이 보낼 때 targetOrigin도 게임 origin으로 고정.

### 남은 것
- `docs/hash-rush-in-app-uiux.md`의 실기기 확인 목록 전체(시트·스와이프·배너·키보드·소리).
- 게임 쪽이 아직 `ready`를 보내지 않는 빌드면 20초 뒤 연결 실패 문구가 뜬다. 게임 G4~G7과 함께 확인.
- 다른 채팅방에서 보이스톡 중에 이 방 게임을 열면 `voice: false`로 간다(웹 판은 자기 방 통화만 안다).
- 보이스톡 마이크 권한이 거부됐을 때 이유와 설정 방법을 알려주는 안내.
