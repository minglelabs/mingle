# Hash Rush 웹 UI/UX 이슈 → 앱 QA 대응표

원본: [minglelabs/hash-rush `docs/UIUX-ISSUES.md`](https://github.com/minglelabs/hash-rush/blob/main/docs/UIUX-ISSUES.md) (2026-10-31 기준, 170행).
앱(HashChat) 안 해시러시는 같은 엔진(`mingle-app/src/features/hash-rush/engine`)을 쓰므로, 웹에서 나온 이슈를 모두 앱 QA 시나리오의 단계에 연결했다.
앱에 없는 화면(PC 키보드, 웹 방 목록·게시판, 홈 화면 추가)이거나 대체·철회된 것은 이유를 적었다.

웹 문서가 바뀌면 이 표에 새 행을 붙이고, 시나리오 단계를 추가한 뒤 `node mingle-app/scripts/qa-agent-scenarios.mjs check`를 돌린다.


## 조작 (이동·꿀밤·던지기)

| # | 날짜 | 웹 이슈 | 웹 조치 (PR) | 웹 상태 | 앱 QA |
| --- | --- | --- | --- | --- | --- |
| 1 | 10-10 | 길 안에서는 앞뒤로만 움직여야 하고, 햄스터끼리 겹치면 안 됨 | 한 줄 길·단단한 몸 (#2) | 해결 | [`hash-rush-field-cues-and-maps`](scenarios/hash-rush-field-cues-and-maps.md) 2단계 |
| 2 | 10-10 | 두 마리가 동시에 서로 죽는 "러브샷" | 같은 틱 동시 기절 금지 (#5) | 해결 | [`hash-rush-field-cues-and-maps`](scenarios/hash-rush-field-cues-and-maps.md) 2단계 · [`hash-rush-field-cues-and-maps`](scenarios/hash-rush-field-cues-and-maps.md) 4단계 |
| 3 | 10-10 | 모바일 햄스터·글씨가 너무 작음 | 맵 축소·컨트롤 맵 아래로 (#17, #18) | 해결 | [`hash-rush-field-cues-and-maps`](scenarios/hash-rush-field-cues-and-maps.md) 1단계 |
| 4 | 10-10 | 터치 스틱이 화면 끝에 붙어 바깥으로 못 밀음 | 스틱을 가장자리에서 띄움 (#19) | 해결 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 7단계 |
| 5 | 10-11 | "조작감이 별로", 일방적으로 5연속 당함 (폰 조이스틱) | 폰 조작을 키보드·마우스처럼 (#29) | 부분 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 1단계 |
| 6 | 10-11 | 꿀밤 선딜·범위가 비직관적, 봇끼리 비비며 사방으로 꿀밤 | 봇 비비기 수정 (#47, #105) | 해결 | 게임 밸런스: 사람과 몇 판 해 보고 판단(수동) |
| 7 | 10-12 | 스틱 엄지 이동폭이 큼 | 이동폭 절반 + 길 도움 (#115) | 대체됨 | 해당 없음: 다음 방식으로 대체됨 |
| 8 | 10-12 | 폰에서 PC와 같은 실력을 낼 수 있어야 함 (리서치 요청) | 다음 여러 PR로 이어짐 | 부분 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 수동 확인 |
| 9 | 10-13 | 조이스틱이 여전히 어려움 → 누른 자리에 고정, 각도만 | 고정 스틱 (#130) | 대체됨 | 해당 없음: 다음 방식으로 대체됨 |
| 10 | 10-13 | 고정 스틱은 각도 바꾸려면 너무 멀리 움직여야 함 | 연한 방향키로 교체 (#132) | 대체됨 | 해당 없음: 다음 방식으로 대체됨 |
| 11 | 10-13 | 방향키 간격이 멀고 작음 → 속 빈 도넛 모양 4분할 | 도넛형 방향키 (#133) | 해결 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 1단계 |
| 12 | 10-13 | 맵 터치로 최단거리 이동(1초 10번 터치) | 맵 탭 이동 (#133) | 철회 | 해당 없음: 철회된 기능 |
| 13 | 10-13 | 꿀밤 버튼 차징하면 던지기가 나가서 헷갈림, 폰에 던지기 버튼 없음 | 던지기 전용 F·K 키 (#129) | 해결 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 5단계 |
| 14 | 10-14 | 클릭하면 최단거리로 가는 기능 때문에 폰에서 더 힘듦 | 클릭 이동 제거, 맵 스와이프로 조작 (#151) | 해결 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 2단계 |
| 15 | 10-14 | 스와이프가 상하좌우뿐, 너무 민감 | 16방향, 32px 이상 (#154) | 해결 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 2단계 |
| 16 | 10-14 | "아직 16방향 아닌 것 같음" (길 도움이 대각선을 펴버림) | 길 안에서도 빗금 유지 (#158) | 해결 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 2단계 |
| 17 | 10-14 | 스와이프 아닌 터치는 멈춤으로 | 터치 = 멈춤 (#154) | 해결 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 2단계 |
| 18 | 10-15 | 16방향 방향키, 스와이프할 때도 방향키가 빛남, 가장자리 스와이프 뒤로가기 막기 | mobile-input-polish 머지 | 머지 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 2단계 · [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 3단계 |
| 19 | 10-16 | 방향키를 한 번도 안 떼면 계속 눌려 있어야 함 (후기 2-(4)) | 터치 캡처 유지 (#181) | 미검증 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 1단계 |
| 20 | 10-12 | 사람은 꿀밤을 보고 피할 수 있는가 | 반응 0.15초 기준 통일 (#177) | 머지 | 게임 밸런스: 사람과 몇 판 해 보고 판단(수동) |

## 채팅·키보드·대화록

| # | 날짜 | 웹 이슈 | 웹 조치 (PR) | 웹 상태 | 앱 QA |
| --- | --- | --- | --- | --- | --- |
| 21 | 10-11 | 모바일에서 키보드가 올라오면 화면이 밀리고, iOS는 입력창을 누르면 확대됨 | 빠른 채팅 (#23), 입력창 16px | 해결 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 3단계 |
| 22 | 10-11 | 대기실에서 게스트가 한글 이름을 치면 두 번째 글자부터 모음이 안 써짐 (햄ㅌ) | 입력 중 이름칸 유지 (#30) | 해결 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 3단계 · 해당 없음: 앱은 대화방 이름을 그대로 씀(이름 바꾸기 없음) |
| 23 | 10-13 | iOS에서 채팅 누르면 화면이 찌그러짐. 카톡처럼 입력창과 보내기 버튼만 키보드 바로 위에 | 키보드 위 바 (#136), 화면 밀림 막기 (#139) | 부분 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 1단계 |
| 24 | 10-13 | 입력하려고 누르면 위 화면이 왜 바뀌냐 | 타이핑 중 페이지 높이 고정 (#145) | 부분 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 1단계 |
| 25 | 10-14 | 상태는 "기본"과 "키보드 올라온 상태" 둘뿐이어야 하는데, 포커스 빠진 반쯤 상태가 남음 | 바를 입력 포커스에 묶음 (#146) | 해결 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 2단계 |
| 26 | 10-16 | "전체 높이 그대로 두고 키보드만 올라오라고 몇 번 말해" (세로가 가로 레이아웃으로 바뀌던 것) | 세로 레이아웃 고정 (#181) | 해결 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 1단계 |
| 27 | 10-16 | 키보드 위 ⌃⌄✓ 막대와 주소 표시를 없애고 싶음 | 웹페이지로는 불가, 홈 화면 추가로 우회 (#184) | 불가 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 수동 확인 |
| 28 | 10-16 | 채팅을 누르면 입력창이 화면 위쪽에 떴다가 내려옴 | 키보드에 붙기 전엔 안 보이게 (#185) | 해결 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 1단계 |
| 29 | 10-16 | 채팅을 켜고 끌 때 맵이 순간 작아졌다 커짐, 화면이 위아래로 밀림 | 높이 줄임 지연 + 스크롤 고정 (#187) | 해결 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 1단계 |
| 30 | 10-17 | 키보드가 올라온 상태에서 스크롤하면 화면이 걸리고 채팅 바가 떨림 | #187의 스크롤 고정과 손가락이 싸우던 것. 페이지 스크롤 막음 (#200) | 머지 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 4단계 |
| 31 | 10-17 | PC에서 보낸 뒤 엔터를 한 번 더 쳐야 움직임 | 보내면 바 닫기 (#203) | 머지 | 해당 없음: PC 키보드 전용 |
| 32 | 10-19 | PC 일시정지 중 엔터를 누르면 재개됨 | 엔터 = 채팅 (#215) | 머지 | 해당 없음: PC 키보드 전용 |
| 33 | 10-19 | PC에서 버튼을 클릭한 뒤엔 엔터로 채팅이 안 열림 | (#211) | 머지 | 해당 없음: PC 키보드 전용 |
| 34 | 10-11 | 채팅은 기본 꺼짐, 버튼에 "채팅" 글자 | (#22, #26) | 해결 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 1단계 |
| 35 | 10-11 | 채팅을 치면 햄스터 위에 "이름: 메시지" 말풍선 | (#41) | 해결 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 6단계 |
| 36 | 10-13 | 채팅을 더 오래 띄워줘 | (#136) | 해결 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 8단계 |
| 37 | 10-13 | 점수판이 떠 있을 때는 버튼 없이도 채팅 UI, 세로로 긴 채팅창 금지 | (#139) | 대체됨 | 해당 없음: 다음 방식으로 대체됨 |
| 38 | 10-15 | 채팅 줄마다 시간, 남의 말에 작은 알림음, 들어오고 나간 줄 | (main 직접 커밋) | 머지 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 6단계 · [`hash-rush-sound-and-haptics`](scenarios/hash-rush-sound-and-haptics.md) 6단계 |
| 39 | 10-15 | 대기실 채팅도 떠 있는 방식으로, 치던 글은 화면이 바뀌어도 유지 | 채팅 하나로 통일 (#176) | 해결 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 9단계 |
| 40 | 10-16 | 채팅이 사라져서 안 보임, 터치하면 보이게. 아이폰 크롬에 남은 대화는 복구 불가였음 | 대화 기록 저장 (#181) | 해결 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 8단계 |
| 41 | 10-16 | 대화가 화면 맨 아래라 보기 힘듦, 칠 때 키보드 위에 대화가 안 뜨고 ⋯ 안에 채팅 버튼이 숨어 있음 (후기 1-(1)~(3)) | 칠 때 대화 표시, 한 번에 누르는 채팅 버튼 (#181) | 해결 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 1단계 |
| 42 | 10-16 | 칠 때 대화창이 아래로 길어져 키보드 밑으로 들어감. 배경은 투명, 위쪽은 점점 흐려지게 | 위로 자라는 투명 대화창 (#183) | 해결 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 4단계 |
| 43 | 10-16 | 키보드 바로 위(대화록)를 탭해도 키보드가 안 내려감 | (#188) | 해결 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 2단계 |
| 44 | 10-16 | 키보드를 닫자마자 대화가 사라짐, 최근 줄을 5초 정도 띄워줘 | 최근 3줄 5초 (#188) | 해결 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 8단계 |
| 45 | 10-16 | 떠 있는 대화도 말풍선과 같은 시간만큼만 | (#188) | 해결 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 8단계 |
| 46 | 10-16 | 키보드 없이 떠 있는 대화를 터치해 스크롤 | (#190) | 해결 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 8단계 |
| 47 | 10-16 | 인게임 대화록이 너무 높음, 펼친 대화록을 다시 탭해도 접히게 | 방향키 바로 위, 탭 토글 (#191) | 해결 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 4단계 |
| 48 | 10-16 | 빠른 채팅 버튼이 너무 작음, 특히 높이 | 44px, 16px (#192) | 해결 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 5단계 |
| 49 | 10-14 | 빠른 채팅을 친구들 말투로 (ㅎㅇ, 굳굳, ㄲㅂ …) | (#155, #156) | 해결 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 5단계 |
| 50 | 10-17 | 빠른 채팅이 다섯 개뿐, ㄱㄱ·잠만 추가, 옆으로 스크롤 | 14개, 옆 스크롤 (#201) | 머지 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 5단계 |
| 51 | 10-17 | 대화가 사라진 뒤 다시 보려면 키보드까지 올려야 함 → 희미한 단계 추가 | 선명 5초 + 희미 1분 (#196), 스와이프로 바로 열기 (#197) | 머지 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 8단계 |
| 52 | 10-17 | 희미한 1분이 가려서 거슬림 → 5초 선명 + 5초 희미, 들어오고 나간 줄도 보통 줄처럼 | (#198) | 머지 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 8단계 |
| 53 | 10-17 | 떠 있는 대화에도 시간 표시 | (#204) | 머지 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 8단계 |
| 54 | 10-17 | 이름을 바꾸면 그 사람의 지난 대화도 새 이름으로 | (#202) | 머지 | 해당 없음: 앱은 대화방 이름을 그대로 씀(이름 바꾸기 없음) |
| 55 | 10-19 | 일시정지·점수표 위에도 대화가 맨 위로 | (#214) | 머지 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 9단계 |
| 56 | 10-19 | 대화록 스크롤 바 숨기기 (PC·폰) | (#219) | 머지 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 4단계 |
| 57 | 10-19 | 라운드가 끝난 뒤에도 대화가 최대로 흐려짐 | 라운드 뒤엔 흐림 없음 (#222) | 머지 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 9단계 |
| 58 | 10-19 | PC 채팅 바를 대화창 폭의 패널로, 채팅 바 반투명 | (#212, #213) | 머지 | 해당 없음: PC 키보드 전용 |
| 59 | 10-16 | 방 목록 채팅도 방 안 채팅처럼 떠 있는 방식으로 | 공통 채팅 모듈 (#186) | 머지 | 해당 없음: 웹 페이지 전용(앱에 없는 화면) |

## 인게임 화면·버튼·레이아웃

| # | 날짜 | 웹 이슈 | 웹 조치 (PR) | 웹 상태 | 앱 QA |
| --- | --- | --- | --- | --- | --- |
| 60 | 10-10 | 세로 화면용 세로로 긴 맵 | 세로 화면에서 맵 90도 회전 (#3) | 해결 | [`hash-rush-field-cues-and-maps`](scenarios/hash-rush-field-cues-and-maps.md) 1단계 |
| 61 | 10-10 | 모바일에서 집 쪽 UI가 떠 있어 가림 | 컨트롤을 맵 아래로 (#17) | 해결 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 7단계 |
| 62 | 10-11 | 상단 글자 등 모든 요소가 뒤를 가리면 안 됨, 글씨만 보이게 | 라운드 위 요소 반투명 (#82) | 해결 | [`hash-rush-field-cues-and-maps`](scenarios/hash-rush-field-cues-and-maps.md) 9단계 |
| 63 | 10-11 | 더블킬·트리플킬 이펙트 글씨가 화면을 가림 | 작고 반투명하게 (#63) | 해결 | [`hash-rush-field-cues-and-maps`](scenarios/hash-rush-field-cues-and-maps.md) 5단계 |
| 64 | 10-11 | 해씨를 문 햄스터가 잘 보이게, 집 근처면 빨간 경고와 안내 문구 | 스포트라이트 + 빨간 경보 (#40) | 해결 | [`hash-rush-field-cues-and-maps`](scenarios/hash-rush-field-cues-and-maps.md) 3단계 |
| 65 | 10-11 | 소리 버튼이 3단계 | 켜기/끄기 2단계 (#64) | 해결 | [`hash-rush-sound-and-haptics`](scenarios/hash-rush-sound-and-haptics.md) 1단계 |
| 66 | 10-11 | 느려진 걸 알게 발걸음·땀 이펙트 | (#69) | 해결 | [`hash-rush-field-cues-and-maps`](scenarios/hash-rush-field-cues-and-maps.md) 5단계 |
| 67 | 10-11 | 컴퓨터 레벨을 햄스터 밑에 색으로 | (#78) | 해결 | [`hash-rush-field-cues-and-maps`](scenarios/hash-rush-field-cues-and-maps.md) 6단계 |
| 68 | 10-12 | 하늘맵 밤에 빙판이 안 보임 | 빛나는 얼음 (#92) | 해결 | [`hash-rush-field-cues-and-maps`](scenarios/hash-rush-field-cues-and-maps.md) 8단계 |
| 69 | 10-12 | 모바일에서 꿀밤 버튼이 로비로·나가기 버튼을 가림 → ⋯ 메뉴로 | 세로 화면에서 메뉴로 접기 (#104) | 해결 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 9단계 |
| 70 | 10-13 | 모바일 맵이 너무 작음, 가로를 꽉 채워줘 | (#134) | 해결 | [`hash-rush-field-cues-and-maps`](scenarios/hash-rush-field-cues-and-maps.md) 1단계 |
| 71 | 10-13 | 내가 누군지 안 보임 → 시작 5초 파란 동그라미, 끝날 때까지 표시 유지 | (#134, #136) | 해결 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 6단계 |
| 72 | 10-13 | 처음 하는 사람이 "가까워지면 터지냐", "옆에 갔다 오면 되냐"고 물음 | "해씨 캐는 중", "꿀밤!", "던지기!" 문구 (#135) | 해결 | [`hash-rush-field-cues-and-maps`](scenarios/hash-rush-field-cues-and-maps.md) 2단계 · [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 5단계 |
| 73 | 10-14 | 이동 중 "나" 표시 글자 (파란 동그라미 색) | (#147) | 해결 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 6단계 |
| 74 | 10-14 | PC 키 설명이 왼쪽 버튼에 가려짐 → 오른쪽 끝에 | (#161) | 해결 | 해당 없음: PC 키보드 전용 |
| 75 | 10-14 | 팀전에서 햄스터 테두리·채팅 이름을 팀 색으로, 같은 이름 금지 | (#148) | 해결 | [`hash-rush-field-cues-and-maps`](scenarios/hash-rush-field-cues-and-maps.md) 6단계 · [`hash-rush-lobby-seats-and-ranking`](scenarios/hash-rush-lobby-seats-and-ranking.md) 2단계 |
| 76 | 10-14 | 모바일에서 방 나가기가 꿀밤 버튼에 가려짐 | (#165) | 해결 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 9단계 · [`hash-rush-in-room`](scenarios/hash-rush-in-room.md) 2단계 |
| 77 | 10-14 | ⋯에 일시정지, 크게 PAUSE | 일시정지 (#147), 방장만 (#149) | 해결 | 앱에 없음: 서버 방이라 일시정지 기능 없음 |
| 78 | 10-16 | ⋯ 버튼을 톱니바퀴로 오른쪽 위에, 포털과 겹침 | 시계 옆 ⚙️ (#181) | 해결 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 9단계 |
| 79 | 10-16 | 왼쪽 위에 점수표 버튼, PC도 표시하고 Tab으로도 열린다고 알려줘 | 🏆 점수표 (Tab) (#182, #184) | 해결 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 10단계 |
| 80 | 10-16 | 채팅 버튼이 햄스터를 가려 "내 캐릭터가 어디지?", 꿀밤·방향키도 너무 가림 | 버튼 반투명, 햄스터가 밑에 오면 흐림 (#189) | 해결 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 8단계 |
| 81 | 10-16 | 한 판 더·채팅 버튼을 방향키와 꿀밤 사이로 | 채팅 (#189), 한 판 더는 규칙이 안 먹어 다시 (#193) | 머지 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 9단계 |
| 82 | 10-17 | PC 채팅 버튼이 라운드 종료 버튼과 겹침, Esc로 메뉴 | 채팅 버튼 구석으로, Esc = 메뉴 (#203) | 머지 | 해당 없음: PC 키보드 전용 |
| 83 | 10-17 | 말풍선 배경 투명, 다른 햄스터가 가까이 오면 더 투명, 떠 있는 대화도 근처만 가도 | (#203) | 머지 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 6단계 |
| 84 | 10-19 | 라운드 끝났을 때·시작 직후 하단 버튼을 더 진하게, 채팅 버튼은 맨 위 | 흐림은 절반까지만 (#216) | 머지 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 8단계 |
| 85 | 10-19 | 대기실에서 채팅 버튼이 너무 투명 | 라운드 밖에서는 불투명 (#221) | 머지 | [`hash-rush-chat-and-keyboard`](scenarios/hash-rush-chat-and-keyboard.md) 1단계 |
| 86 | 10-19 | 방향키가 너무 투명해 처음 하는 사람이 어려워함 | 평소엔 또렷하게, 햄스터가 밑에 올 때만 흐림 (#223) | 머지 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 8단계 |
| 87 | 10-20 | 터치 전용 안내를 숨긴 자리에 빈칸이 남음 | (#226) | 머지 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 7단계 |
| 88 | 10-20 | 화면을 벗어나면 자동 일시정지 → "굳이?" 대신 소리만 죽이기 | 숨겨져도 라운드는 계속, 소리는 꺼짐 (#227, #228) | 머지 | [`hash-rush-room-game-lifecycle`](scenarios/hash-rush-room-game-lifecycle.md) 8단계 · [`hash-rush-sound-and-haptics`](scenarios/hash-rush-sound-and-haptics.md) 3단계 |

## 점수표·결과·한 판 더·라운드 흐름

| # | 날짜 | 웹 이슈 | 웹 조치 (PR) | 웹 상태 | 앱 QA |
| --- | --- | --- | --- | --- | --- |
| 89 | 10-11 | 게스트의 "로비로"는 사실 방 나가기, "방장이 재시작하길 기다리는 중" 표시 | (#20) | 해결 | [`hash-rush-round-flow-multiplayer`](scenarios/hash-rush-round-flow-multiplayer.md) 2단계 |
| 90 | 10-11 | 경기 중 Tab으로 점수표, 떼면 닫힘 | (#39, #46) | 해결 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 10단계 |
| 91 | 10-11 | 라운드가 끝난 뒤 점수표를 잠깐 끄고 다른 UI를 누르고 싶음, 한 판 더도 밖에 | (#42) | 해결 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 11단계 |
| 92 | 10-11 | 누적 열에 "누적"이 반복돼 표가 너무 넓음 → 위에 "이번 라운드 / 누적", 몇 번째 경기인지 | (#44, #61) | 해결 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 10단계 |
| 93 | 10-11 | MVP 배지는 맨 오른쪽, 현란하게 | (#71, #76) | 해결 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 10단계 |
| 94 | 10-12 | "구름이 이겼어요"가 이상함 → 승리!!/패배 + 승자 이름, 타임오버는 이유도 | (#95) | 해결 | [`hash-rush-round-flow-multiplayer`](scenarios/hash-rush-round-flow-multiplayer.md) 1단계 |
| 95 | 10-12 | 폰에서 점수표가 너무 빽빽함 → 이번 라운드/누적 탭 | (#104) | 해결 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 10단계 |
| 96 | 10-12 | 우승 카드에 닫기 버튼이 없어 로비로 못 돌아감, 폰에서 잘 나오냐 | (#125) | 해결 | [`hash-rush-round-flow-multiplayer`](scenarios/hash-rush-round-flow-multiplayer.md) 5단계 |
| 97 | 10-13 | 폰 상단 이름표에 승수가 없음, "10승 먼저 하면 우승" 표기, X 버튼 크게 | (#142) | 해결 | [`hash-rush-round-flow-multiplayer`](scenarios/hash-rush-round-flow-multiplayer.md) 3단계 |
| 98 | 10-13 | 폰에서 게임이 끝나도 점수표가 안 나옴 | 변수 이름이 겹쳐 생긴 버그 (#143) | 해결 | [`hash-rush-round-flow-multiplayer`](scenarios/hash-rush-round-flow-multiplayer.md) 1단계 |
| 99 | 10-13 | 결과 카드가 safe area를 눌러도 닫히게 | (#144) | 해결 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 11단계 |
| 100 | 10-14 | 끝났을 때 ⋯를 누르는 순간 점수판이 뜨고, 그 자리의 한 판 더가 자동으로 눌림 | 한 판 더를 메뉴 버튼에서 떼어냄 (#147) | 해결 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 11단계 |
| 101 | 10-14 | 방장의 "로비로"는 사실 모두의 게임 종료 → "라운드 종료", 누구나 대기실 보기 | (#150) | 해결 | [`hash-rush-round-flow-multiplayer`](scenarios/hash-rush-round-flow-multiplayer.md) 2단계 |
| 102 | 10-14 | 게스트도 "한 판 더? (방장만)" 버튼을 봐야 함 | 회색 버튼 (#164) | 대체됨 | 해당 없음: 다음 방식으로 대체됨 |
| 103 | 10-14 | 괄호 때문에 한 판 더 버튼이 너무 큼 | 설명을 아래 작은 줄로 (#165) | 대체됨 | 해당 없음: 다음 방식으로 대체됨 |
| 104 | 10-14 | "방장한테 요청하기", 누르면 채팅으로 모두에게 | (#170) | 대체됨 | 해당 없음: 다음 방식으로 대체됨 |
| 105 | 10-16 | "한 판 더?!"만, 누르면 "방장한테 요청했어요!" (후기 2-(5)) | (#181) | 해결 | [`hash-rush-round-flow-multiplayer`](scenarios/hash-rush-round-flow-multiplayer.md) 2단계 |
| 106 | 10-14 | 새로고침해도 경기가 이어져서 완전히 다시 시작할 방법이 없음 (기록은 남기고) | 기록 지우기 (#160) → 중단으로 남기고 1라운드부터 (#163) | 해결 | [`hash-rush-round-flow-multiplayer`](scenarios/hash-rush-round-flow-multiplayer.md) 5단계 |
| 107 | 10-14 | 각자 몇 승 몇 패인지 | 패 열 (#167) | 해결 | [`hash-rush-round-flow-multiplayer`](scenarios/hash-rush-round-flow-multiplayer.md) 3단계 |
| 108 | 10-16 | 승수는 점수표에서 가장 잘 보이게, 누적을 기본으로 | (#182) | 해결 | [`hash-rush-round-flow-multiplayer`](scenarios/hash-rush-round-flow-multiplayer.md) 3단계 |
| 109 | 10-19 | PC에서 점수표가 X로 안 닫힘 | (#218) | 머지 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 10단계 |
| 110 | 10-20 | 표가 넓으면 결과·우승 카드가 화면 밖으로 | 카드 안에서 표만 스크롤 (#218, #225) | 머지 | [`hash-rush-touch-controls-and-hud`](scenarios/hash-rush-touch-controls-and-hud.md) 10단계 |
| 111 | 10-15 | 방을 잃었을 때 이유와 새로고침·새 방 버튼을 전체 화면으로 | (main 직접 커밋) | 머지 | [`hash-rush-room-game-lifecycle`](scenarios/hash-rush-room-game-lifecycle.md) 10단계 |

## 대기실·방 목록·랭킹·게시판

| # | 날짜 | 웹 이슈 | 웹 조치 (PR) | 웹 상태 | 앱 QA |
| --- | --- | --- | --- | --- | --- |
| 112 | 10-10 | 친구 초대로 열린 자리는 이름 비우기 | (#11) | 해결 | [`hash-rush-invite-link`](scenarios/hash-rush-invite-link.md) 3단계 |
| 113 | 10-10 | 화면에 "undefined" 글자 | 빠진 문구 키 처리 (#13) | 해결 | [`hash-rush-locale-copy`](scenarios/hash-rush-locale-copy.md) 2단계 |
| 114 | 10-10 | LTE 친구가 접속 실패 시 이유를 알려줘 | 실패 이유 표시 (#12), TURN 중계 (#15) | 해결 | [`hash-rush-round-flow-multiplayer`](scenarios/hash-rush-round-flow-multiplayer.md) 7단계 |
| 115 | 10-11 | 방 목록 보기가 방장한테만 보임, 게스트에게 더 필요 | (#31) | 해결 | 해당 없음: 웹 페이지 전용(앱에 없는 화면) |
| 116 | 10-11 | 팀전인지 개인전인지 게스트도 잘 보이게 | (#35) | 해결 | [`hash-rush-lobby-seats-and-ranking`](scenarios/hash-rush-lobby-seats-and-ranking.md) 1단계 |
| 117 | 10-11 | 열림 처리 안 해도 공유 링크, 들어오면 자동으로 자리 추가 | (#57) | 해결 | [`hash-rush-invite-link`](scenarios/hash-rush-invite-link.md) 2단계 |
| 118 | 10-11 | 빈자리가 사람·컴퓨터와 구분이 안 됨 | 얼굴 없는 점선 자리 (#66) | 해결 | [`hash-rush-lobby-seats-and-ranking`](scenarios/hash-rush-lobby-seats-and-ranking.md) 3단계 |
| 119 | 10-11 | 내 방 자리가 열려 있는데 "열린 방이 없다"고 뜨고, 내 방은 맨 위에 | (#54) | 해결 | 해당 없음: 웹 페이지 전용(앱에 없는 화면) |
| 120 | 10-11 | 배포할 때마다 새 버전 받기 | 로비에 새로고침 안내 (#67) | 해결 | 해당 없음: 웹 페이지 전용(앱에 없는 화면) |
| 121 | 10-12 | 목록보기에서는 소리가 나고 방에 들어가면 안 남 | 페이지 로드 즉시 소리 시도 (#121) | 해결 | [`hash-rush-sound-and-haptics`](scenarios/hash-rush-sound-and-haptics.md) 2단계 |
| 122 | 10-13 | "방을 찾을 수 없음"에 새 방 만들기를 기본으로, "기존 방 다시 시도" | (#137, #138) | 해결 | [`hash-rush-room-game-lifecycle`](scenarios/hash-rush-room-game-lifecycle.md) 10단계 |
| 123 | 10-13 | 방장이 새로고침하면 모두 같이 새로고침 | (#140) | 해결 | 해당 없음: 웹 페이지 전용(앱에 없는 화면) |
| 124 | 10-13 | 자리 목록 열 제목, 새로 온 사람 노랑색 | (#141) | 머지 | [`hash-rush-lobby-seats-and-ranking`](scenarios/hash-rush-lobby-seats-and-ranking.md) 1단계 |
| 125 | 10-14 | 폰에서 이름을 바꿔도 새로고침하면 이전 이름 | (#169, #174) | 해결 | 해당 없음: 앱은 대화방 이름을 그대로 씀(이름 바꾸기 없음) |
| 126 | 10-14 | 친구가 이름을 고치는 동안 팀 드롭다운이 초기화됨 | (#172) | 해결 | [`hash-rush-hosted-lobby`](scenarios/hash-rush-hosted-lobby.md) 5단계 |
| 127 | 10-14 | 대기실에서 얼굴을 누르면 프로필(레이팅·전적·승률) | (#159) | 해결 | 앱에 없음: 대기실 프로필(레이팅·전적) 화면 없음 |
| 128 | 10-14 | 방장 넘기기 (프로필에서) | (#171) | 해결 | [`hash-rush-lobby-seats-and-ranking`](scenarios/hash-rush-lobby-seats-and-ranking.md) 6단계 |
| 129 | 10-14 | 랭킹 UI를 비번 아래·맵 선택 위로 | (#153) | 해결 | 해당 없음: 웹 페이지 전용(앱에 없는 화면) |
| 130 | 10-14 | 전적에 컴퓨터 레벨, 팀전/개인전, 팀 색 | (#157, #162) | 해결 | 앱에 없음: 대기실 프로필(레이팅·전적) 화면 없음 |
| 131 | 10-14 | 랭킹이 누락되고 버튼을 두 번 누르면 두 번 뜨었음 | (#166) | 해결 | [`hash-rush-lobby-seats-and-ranking`](scenarios/hash-rush-lobby-seats-and-ranking.md) 8단계 |
| 132 | 10-14 | 전적 5개씩·랭킹 10개씩 페이지 | (#175) | 해결 | [`hash-rush-lobby-seats-and-ranking`](scenarios/hash-rush-lobby-seats-and-ranking.md) 8단계 |
| 133 | 10-15 | 관전자 이름 목록, 관전자가 빈자리 앉기 | (main 직접 커밋) | 머지 | [`hash-rush-lobby-seats-and-ranking`](scenarios/hash-rush-lobby-seats-and-ranking.md) 4단계 |
| 134 | 10-15 | 햄버거 메뉴(랭킹·피드백 게시판) | (main 직접 커밋) | 해결 | 해당 없음: 웹 페이지 전용(앱에 없는 화면) |
| 135 | 10-15 | 피드백 게시판·랭킹을 새 페이지로 | (#179) | 해결 | [`hash-rush-in-room`](scenarios/hash-rush-in-room.md) 1단계 |
| 136 | 10-15 | 방 목록 새 페이지(채팅·규칙·10개씩), 방 안에 "방 목록 보기 / 방 나가기" | (#180) | 해결 | 해당 없음: 웹 페이지 전용(앱에 없는 화면) |
| 137 | 10-17 | 방을 닫았다 다시 열면 초대 링크가 바뀜 | 브라우저별 고정 방 아이디 (#199) | 머지 | [`hash-rush-invite-link`](scenarios/hash-rush-invite-link.md) 4단계 |
| 138 | 10-17 | 랭킹에서 유저가 다 사라짐 | 브라우저가 본 것을 다시 올림 (#195) | 머지 | [`hash-rush-lobby-seats-and-ranking`](scenarios/hash-rush-lobby-seats-and-ranking.md) 8단계 |
| 139 | 10-18 | 언어를 바꾸면 기본 햄스터 이름도 그 언어로 | (#207) | 머지 | [`hash-rush-locale-copy`](scenarios/hash-rush-locale-copy.md) 5단계 |
| 140 | 10-19 | 대기실에서 직접 관전 선택, 관전자 목록에 표시 | (#217) | 머지 | [`hash-rush-lobby-seats-and-ranking`](scenarios/hash-rush-lobby-seats-and-ranking.md) 4단계 |
| 141 | 10-19 | 들락날락하면 유령 햄스터가 남아 "권준호2" | 같은 브라우저는 교체, 10초 끊기면 퇴장 (#220) | 머지 | [`hash-rush-lobby-seats-and-ranking`](scenarios/hash-rush-lobby-seats-and-ranking.md) 5단계 · [`hash-rush-room-game-lifecycle`](scenarios/hash-rush-room-game-lifecycle.md) 7단계 |
| 142 | 10-19 | 폰에서 어느 게 본인인지 모름, 팀명 글자 대신 색만, 여백·패딩 축소 | 색 점, 내 줄 테두리·표시 (#224, #225) | 머지 | [`hash-rush-lobby-seats-and-ranking`](scenarios/hash-rush-lobby-seats-and-ranking.md) 2단계 · [`hash-rush-room-game-lifecycle`](scenarios/hash-rush-room-game-lifecycle.md) 2단계 |
| 143 | 10-20 | 방장 이름이 "나"인 방이 목록에 이상하게 보임 | (#226) | 머지 | [`hash-rush-lobby-seats-and-ranking`](scenarios/hash-rush-lobby-seats-and-ranking.md) 7단계 |
| 144 | 10-22 | 피드백 게시판에 남긴 글이 사라짐 | 브라우저가 본 글을 다시 올림 (#229) | 머지 | 해당 없음: 웹 페이지 전용(앱에 없는 화면) |

## 맵·집·포털·소리

| # | 날짜 | 웹 이슈 | 웹 조치 (PR) | 웹 상태 | 앱 QA |
| --- | --- | --- | --- | --- | --- |
| 145 | 10-10 | 길이 더 꺾이고 복잡하게 | 헤지 미로 (#4) | 해결 | [`hash-rush-field-cues-and-maps`](scenarios/hash-rush-field-cues-and-maps.md) 8단계 |
| 146 | 10-10 | 해바라기 양옆에 집 귀환 비콘, 연장전에 집이 넓어진 게 잘 안 보임 | 굴 + 연장전 색 (#8) | 해결 | [`hash-rush-field-cues-and-maps`](scenarios/hash-rush-field-cues-and-maps.md) 7단계 |
| 147 | 10-11 | 해변맵에 해변 느낌이 없음, 묘지맵 등 테마 장식 | 맵별 풍경 (#86) | 해결 | [`hash-rush-field-cues-and-maps`](scenarios/hash-rush-field-cues-and-maps.md) 8단계 |
| 148 | 10-11 | 사막·묘지·신맵 길이 단조로움, 벽이 두꺼움 | 조밀한 미로 (#88, #89) | 해결 | [`hash-rush-field-cues-and-maps`](scenarios/hash-rush-field-cues-and-maps.md) 8단계 |
| 149 | 10-12 | 사막·하늘·해변 큰 벽에 구멍, 얼음맵 맨 윗줄 꺾기 | (#94, #119, #122, #123) | 해결 | [`hash-rush-field-cues-and-maps`](scenarios/hash-rush-field-cues-and-maps.md) 8단계 |
| 150 | 10-11 | 맵 선택을 한 줄 전체로 | (#86) | 해결 | [`hash-rush-hosted-lobby`](scenarios/hash-rush-hosted-lobby.md) 5단계 |
| 151 | 10-13 | 해씨 옆에서 가만히 있어야 하고, 누가 캐고 있으면 못 캔다는 것을 알려줘 | "해씨 캐는 중…" (#135) | 해결 | [`hash-rush-field-cues-and-maps`](scenarios/hash-rush-field-cues-and-maps.md) 2단계 |
| 152 | 10-16 | 집으로 귀환이 어렵다 (후기 2-(2)) | "🏠 집" 안내, 해씨를 들면 집 바닥이 빛남 (#181) | 부분 | [`hash-rush-field-cues-and-maps`](scenarios/hash-rush-field-cues-and-maps.md) 3단계 |
| 153 | 10-16 | 포털이 포털인지 모름, 해씨를 들고 타면 안 된다는 것도 | 보라 소용돌이 + 안내 (#181) | 해결 | [`hash-rush-field-cues-and-maps`](scenarios/hash-rush-field-cues-and-maps.md) 4단계 |
| 154 | 10-16 | "집" 글씨가 둥지에 가려짐 | 둥지 옆으로 (#184) | 해결 | [`hash-rush-field-cues-and-maps`](scenarios/hash-rush-field-cues-and-maps.md) 3단계 |
| 155 | 10-19 | 포털 못 탄다는 안내를 햄스터 머리 위에도 | (#218) | 머지 | [`hash-rush-field-cues-and-maps`](scenarios/hash-rush-field-cues-and-maps.md) 4단계 |
| 156 | 10-19 | 해씨를 들고 오는 쪽이 너무 유리, 뒤따라가서는 못 막음 (유저 대화) | 의견만 제시 | 열림 | 게임 밸런스: 사람과 몇 판 해 보고 판단(수동) |
| 157 | 10-11 | 음악 한 곡뿐이라 질림 → 2분짜리 6곡, 한 바퀴씩 섞어서 | (#81, #84) | 해결 | [`hash-rush-sound-and-haptics`](scenarios/hash-rush-sound-and-haptics.md) 2단계 |
| 158 | 10-11 | 경보·해씨·연장전 효과음 | (#49) | 해결 | [`hash-rush-sound-and-haptics`](scenarios/hash-rush-sound-and-haptics.md) 수동 확인 |
| 159 | 10-15 | 남의 채팅에 작은 알림음 | (main 직접 커밋) | 머지 | [`hash-rush-sound-and-haptics`](scenarios/hash-rush-sound-and-haptics.md) 6단계 |

## 설치·언어·연결 등 플랫폼

| # | 날짜 | 웹 이슈 | 웹 조치 (PR) | 웹 상태 | 앱 QA |
| --- | --- | --- | --- | --- | --- |
| 160 | 10-10 | 한·중(간체/번체)·일은 각 언어, 나머지는 영어 | (#6) | 해결 | [`hash-rush-locale-copy`](scenarios/hash-rush-locale-copy.md) 1단계 |
| 161 | 10-11 | 추가된 버튼·이펙트 글자가 한국어로만 됐을 것 같음, 초보/중수/고수 | (#58) | 해결 | [`hash-rush-locale-copy`](scenarios/hash-rush-locale-copy.md) 2단계 |
| 162 | 10-11 | 링크 미리보기(og)는 영어로, 미리보기 이미지 | (#24, #25, #60) | 해결 | 해당 없음: 웹 페이지 전용(앱에 없는 화면) |
| 163 | 10-20 | 영어로 모든 화면을 띄워 확인, 고칠 것은 직접 | 영어·일본어 자리 메뉴 CPU 표기 등 (#207 외) | 머지 | [`hash-rush-locale-copy`](scenarios/hash-rush-locale-copy.md) 2단계 |
| 164 | 10-10 | LTE·5G에서 방장 연결 실패 | ExpressTURN 중계 (#15) | 해결 | [`hash-rush-round-flow-multiplayer`](scenarios/hash-rush-round-flow-multiplayer.md) 6단계 |
| 165 | 10-12 | 친구 컴퓨터에 원격 접속하면 렉 | 게스트 햄스터 예측 (#118) | 해결 | [`hash-rush-round-flow-multiplayer`](scenarios/hash-rush-round-flow-multiplayer.md) 6단계 |
| 166 | 10-19 | 방장이 아니면 중간중간 끊김 | 다른 햄스터 속도 유지 + 부드러운 보정 (#211) | 부분 | [`hash-rush-round-flow-multiplayer`](scenarios/hash-rush-round-flow-multiplayer.md) 6단계 |
| 167 | 10-16 | 키보드 위 ⌃⌄✓ 막대·주소 표시 없애기 | 홈 화면 추가 (매니페스트·아이콘) (#184) | 미검증 | 해당 없음: 홈 화면 추가·주소창(앱이라 필요 없음) |
| 168 | 10-16 | 홈 화면 추가를 햄버거·톱니바퀴 메뉴에 | (#184) | 해결 | 해당 없음: 홈 화면 추가·주소창(앱이라 필요 없음) |
| 169 | 10-17 | "공유 버튼을 누르라"는 안내가 이해 안 됨, 버튼으로 바로 추가할 수 없나 | 아이폰은 불가. 브라우저별 1·2·3단계 + 화살표 (#193) | 부분 | 해당 없음: 홈 화면 추가·주소창(앱이라 필요 없음) |
| 170 | 10-16 | mingle 앱 웹뷰에 넣기 (나중) | 키보드 동작·로그인 연동이 관건, 답변만 | 열림 | 이 문서가 그 결과(앱 안 게임) |

## 웹 문서의 남은 과제·실기기 확인 목록

| 웹 항목 | 앱 QA |
| --- | --- |
| 해씨를 들고 오는 쪽이 너무 유리함 | 게임 밸런스, `hash-rush-field-cues-and-maps` 수동 확인 |
| 집으로 귀환 "큰 대책" | `hash-rush-field-cues-and-maps` 3단계 + 수동 확인 |
| 방장이 아닌 사람의 끊김 | `hash-rush-round-flow-multiplayer` 6단계 |
| mingle 앱 웹뷰에 넣기 | 완료(네이티브 이식). 키보드는 `hash-rush-chat-and-keyboard` |
| 튜토리얼 판 / 로그인 | 앱은 해시챗 로그인을 씀. 튜토리얼은 `게임 방법` 페이지(`hash-rush-in-room` 1단계) |
| 방향키를 손 안 떼고 계속 누르기 (#181) | `hash-rush-touch-controls-and-hud` 1단계 |
| 키보드가 올라온 채로 스크롤 (#200) | `hash-rush-chat-and-keyboard` 4단계 |
| 한 판 더 버튼 위치 (#193) | 앱은 방장 시작 방식: `hash-rush-round-flow-multiplayer` 2단계 |
| 아이폰 크롬 홈 화면 추가 안내 (#193), 홈 화면 아이콘의 ⌃⌄✓ 막대 (#184) | 해당 없음(앱). ⌃⌄✓ 막대는 `hash-rush-chat-and-keyboard` 수동 확인 |
| 빠른 채팅 14개, 선명 5초 + 희미 5초, PC 채팅 패널 | `hash-rush-chat-and-keyboard` 5·8단계 (앱은 13개, 2초 + 2초), PC 패널은 해당 없음 |
| 버튼 흐림 절반, 방향키 또렷하게, 대기실 색 점·내 줄, 카드 안 표 스크롤 | `hash-rush-touch-controls-and-hud` 8·10단계, `hash-rush-lobby-seats-and-ranking` 2단계 |
