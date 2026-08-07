# Mingle 2.0.0 메신저화 기획서

## 문서 정보

| 항목 | 내용 |
| --- | --- |
| 상태 | Draft, 구현 착수 전 합의본 |
| 작성일 | 2026-08-07 |
| 기준 스레드 | Codex 스레드 「PR 92 메신저 뷰 복구」 |
| 참고 PR | [mingle PR #92](https://github.com/minglelabs/mingle/pull/92) |
| 기능 범위 기준 | [Notion 메신저 기획](https://app.notion.com/p/roycenam/3b122e3ed20a801e8f63faedb47a45eb) 의 「필수 기능」 |
| 구현 기준 | 최신 main, 기준 커밋 e701add3 |
| 목표 릴리즈 | 모바일 앱 2.0.0 |
| 모바일 API namespace | ios/v2.0.0, android/v2.0.0 |

이 문서는 PR 92의 방향을 최신 main에 맞게 다시 구현하기 위한 제품·기술 합의 문서입니다. 오래된 PR 브랜치를 그대로 병합하는 계획이 아니며, 현재 main의 대화 기능·네이티브 WebView 복원·릴리즈 라우팅을 보존한 상태에서 메신저 셸을 추가하는 것을 전제로 합니다.

## 1. 요약

Mingle의 모바일 앱 첫 화면을 메신저형 대화목록으로 정착시키고, 대화목록과 마이페이지를 하단 탭으로 연결합니다. 사용자는 앱에 들어오자마자 접근 가능한 대화를 확인하고, 대화방에 들어갔다가 목록으로 안정적으로 돌아오며, 마이페이지에서 프로필·팔로우 관계·언어 설정을 관리할 수 있어야 합니다.

이번 2.0.0 범위는 기존 실시간 번역 대화 기능을 메신저의 기본 탐색 구조 안에 배치하면서, Notion의 「필수 기능」에 적힌 계정·프로필·팔로우·공유·안전·알림 기능까지 함께 구현하는 것을 목표로 합니다. 대화는 1:1을 기준으로 하며, Notion의 「없어도 되는 기능」 목록은 구현·QA·완료 조건에서 제외합니다.

핵심 결정은 다음과 같습니다.

1. PR 92 브랜치는 직접 병합하지 않고 최신 main에서 필요한 UX와 동작을 선별해 재구현합니다.
2. 네이티브 WebView의 첫 진입점은 대화목록입니다.
3. 하단 탭은 대화목록과 마이페이지 두 개로 시작합니다.
4. 대화방은 텍스트 메시지와 기존 STT 기반 음성 입력 메시지를 보내고, 채팅방 링크 공유·멤버 목록 확인·목록 및 프로필에서의 새 채팅방 생성을 지원합니다.
5. 마이페이지는 팔로잉·팔로워 목록과 목록 내부 검색, 프로필 사진·국적·모국어 편집을 제공합니다.
6. 소셜 로그인·전화번호 인증·차단·신고·앱 내 알림을 필수 계정 및 안전 기능으로 포함합니다.
7. 대화방 열기·닫기·iOS 뒤로가기는 URL query와 WebView history가 서로 재진입을 일으키지 않도록 하나의 상태 흐름으로 관리합니다.
8. 앱 버전, API namespace, 웹 릴리즈 variant, STT runtime은 모두 2.0.0 릴리즈 라인으로 분리하고 기존 버전은 삭제하거나 덮어쓰지 않습니다.

### 범위 해석

- Notion의 「필수 기능」 안에 물음표로 적힌 전화번호 인증도 이번 요청에 따라 필수 구현으로 취급합니다. SMS provider·지원 국가 같은 운영 결정만 오픈 질문으로 남깁니다.
- 「음성 메시지 보내기」는 Notion의 후속 메모에 적힌 현재 흐름, 즉 말하기 → STT → 텍스트 메시지 전송을 의미합니다. 음성 파일 전송·보이스톡은 범위에 넣지 않습니다.
- 「알림 기능」은 앱 내 알림함과 미읽음 표시를 구현합니다. 백그라운드·앱 종료 상태 새 메시지 알림은 Notion의 제외 목록에 따라 넣지 않습니다.

## 2. 배경과 문제

현재 main은 이미 /[locale] 진입 후 /[locale]/conversations로 연결되는 대화목록 기반 구조를 갖고 있습니다. 핵심 화면과 데이터는 다음 영역에 있습니다.

- mingle-app/src/components/conversation-list.tsx
- mingle-app/src/components/mingle-home.tsx
- mingle-app/src/web/shared/v1.1.0/conversations-entry.tsx
- mingle-app/rn/App.tsx
- mingle-app/src/lib/app-conversations.ts

그러나 PR 92의 메신저 뷰 작업은 현재 main보다 오래된 브랜치 위에서 진행되어 직접 병합할 수 없습니다. 스레드에서 확인된 사용자 문제는 다음과 같습니다.

- 대화목록에서 마이페이지로 이동하는 하단 탭이 필요합니다.
- 하단 탭이 화면을 과도하게 차지하지 않아야 하며, 목록 마지막 행이 탭에 가려지지 않아야 합니다.
- 마이페이지 탭을 눌러도 대화목록에 남아 있는 것처럼 보이는 라우팅 문제가 있었습니다.
- 방은 실제로 열렸는데 active 또는 paused 상태 PATCH 실패가 방 진입 실패 알럿으로 표시되는 문제가 있었습니다.
- 대화방을 닫거나 뒤로 갈 때 이전 탭 history를 타고 마이페이지로 이동하거나, 닫은 방이 다시 열리는 문제가 있었습니다.
- iOS와 Android가 서로 다른 터널 또는 오래된 API namespace를 바라보면 같은 앱을 테스트할 수 없습니다.
- Android WebView가 ngrok 화면을 기본 HTML처럼 렌더링해 메신저 UI를 판단할 수 없는 경우가 있었습니다.
- AdMob 배너가 대화목록 외 탭에 노출되거나, 기기 테스트에서 광고 영역과 목록·탭 여백이 충돌할 수 있었습니다.

## 3. 목표와 비목표

### 목표

- 네이티브 WebView 사용자가 앱 진입 직후 대화목록을 볼 수 있습니다.
- 서버가 현재 인증·tracking context에 대해 허용한 대화만 목록과 상세 화면에서 접근할 수 있습니다.
- 기존 대화방의 STT 기반 음성 입력, 텍스트 입력, 번역 동작을 유지합니다.
- 대화목록 우측 상단과 사용자 프로필에서 1:1 채팅방을 만들 수 있습니다.
- 채팅방 링크를 공유하고, 채팅방 안에서 현재 멤버 목록을 확인할 수 있습니다.
- 마이페이지에서 팔로잉·팔로워 목록을 확인하고 해당 목록 안에서만 사용자를 검색할 수 있습니다.
- 프로필 사진·국적·모국어를 등록하고 수정할 수 있습니다.
- 사용자 프로필에서 팔로우, 채팅방 생성, 차단, 신고를 수행할 수 있습니다.
- 소셜 로그인과 전화번호 인증을 완료한 사용자가 메신저의 소셜 기능을 사용할 수 있습니다.
- 팔로우 요청·수락 등 핵심 상태 변화를 앱 내 알림함과 미읽음 표시로 확인할 수 있습니다.
- 대화방을 열고 닫는 과정에서 false open-error 알럿, history 점프, 자동 재진입이 발생하지 않습니다.
- 대화목록과 마이페이지를 모든 지원 locale에서 동일한 구조로 사용할 수 있습니다.
- 프로필 정보와 언어 설정을 저장하고 다시 불러올 수 있습니다.
- AdMob 배너와 safe-area·하단 탭 여백이 서로 겹치지 않습니다.
- iOS와 Android 실기기에서 devbox/ngrok으로 동일한 2.0.0 동작을 검증할 수 있습니다.
- 앱 버전과 API namespace가 항상 일치하도록 빌드·런타임 검증을 갖춥니다.

### 비목표

- PR 92의 오래된 코드를 그대로 복구하거나 브랜치 전체를 병합하지 않습니다.
- 이번 릴리즈는 1:1 대화만 지원하며 3인 이상 단체 채팅은 포함하지 않습니다.
- Notion의 「없어도 되는 기능」 목록은 이번 릴리즈의 요구사항·QA·Definition of Done에 포함하지 않습니다.
- 백그라운드 또는 앱 종료 상태의 새 메시지 푸시는 이번 범위에 포함하지 않습니다. 알림은 앱 내 알림함·미읽음 표시를 기준으로 합니다.
- 기존 번역·STT의 의미나 모델 정책을 메신저화와 함께 변경하지 않습니다.
- 데스크톱 웹의 기본 탐색을 모바일 메신저 셸과 동일하게 강제하지 않습니다. 데스크톱 웹 변경은 별도 합의가 필요합니다.
- 기존 1.0.x, 1.1.x API·웹·STT 릴리즈를 제거하거나 동작을 바꾸지 않습니다.

## 4. 대상 사용자와 기본 정책

### 대상 사용자

1. 네이티브 WebView로 Mingle을 사용하는 비로그인 또는 인증 사용자
2. 기존 대화를 다시 열고 실시간 번역을 이어가려는 사용자
3. 팔로우 관계를 만들고 상대 프로필에서 1:1 대화를 시작하려는 사용자
4. 채팅방 링크를 공유받아 가입·인증 후 대화에 참여하려는 사용자
5. iOS·Android 실기기에서 새 릴리즈를 검증하는 QA 및 릴리즈 담당자

### 대화 접근 정책 초안

비로그인 네이티브 WebView에서 임의 대화를 공개하는 정책은 도입하지 않습니다. 서버가 현재 인증·tracking context에 대해 반환한 접근 가능 대화만 노출하고, 상세 조회 시에도 서버가 owner 또는 participant 권한을 다시 검증합니다. 팔로우·채팅방 생성·공유 참여·프로필 수정·차단·신고·알림 확인은 인증 및 전화번호 인증을 완료한 사용자만 수행할 수 있습니다.

- 클라이언트가 임의 conversation ID를 주입해 방을 여는 것은 허용하지 않습니다.
- 인증 context가 없거나 접근 가능한 목록이 없으면 대화목록 셸과 빈 상태를 표시합니다.
- 빈 상태에서는 소셜 로그인 CTA를 우선 표시하고, 인증·전화번호 인증이 끝난 뒤 새 대화 시작 CTA를 제공합니다.
- 공유 링크로 처음 들어온 사용자는 소셜 로그인 → 전화번호 인증 → 기본 프로필 설정 → 공유한 사용자를 팔로우 → 채팅방 진입 순서로 진행합니다.
- 초대 링크 접근과 팔로우 승인 전에는 상대 프로필과 필요한 안내만 표시하고, 대화 내용은 공개하지 않습니다.

## 5. 정보 구조와 주요 흐름

### 화면 구조

| 화면 | 경로 | 역할 |
| --- | --- | --- |
| 진입점 | /[locale] | 현재 release variant에 따라 대화목록으로 연결 |
| 대화목록 | /[locale]/conversations | 접근 가능한 1:1 대화 목록, 우측 상단 새 대화 시작 |
| 대화방 | /[locale]/conversations?conversation=ID | 목록 위에 열린 실시간 번역 대화방 |
| 마이페이지 | /[locale]/mypage | 내 프로필·언어·팔로잉·팔로워·알림 진입 |
| 사용자 프로필 | /[locale]/profile/[userId] | 프로필 확인, 팔로우, 채팅방 생성, 차단·신고 |
| 팔로우 목록 | /[locale]/mypage?section=followers\|following | 팔로워·팔로잉 목록과 목록 내부 검색 |
| 인증 | /[locale]/auth/signin, /[locale]/auth/phone | 소셜 로그인과 전화번호 인증 |

### 사용자 흐름

네이티브 앱 진입
→ locale 경로
→ 대화목록 셸 표시
→ 목록 데이터 백그라운드 refresh
→ 우측 상단 새 대화 또는 기존 대화방 열기
→ 대화방에서 텍스트·STT 음성 입력 전송 및 공유
→ 마이페이지 탭에서 프로필·팔로우 목록·알림 확인
→ 대화방은 닫기·뒤로가기로 대화목록에 복귀

프로필에서 채팅 시작
→ 사용자 프로필 열기
→ 팔로우 요청 또는 기존 팔로우 관계 확인
→ 허용 상태이면 1:1 채팅방 생성
→ 대화방 진입

공유받은 사용자의 채팅 시작
→ 채팅방 공유 링크 접속
→ 신규 사용자는 소셜 로그인·전화번호 인증·프로필 설정
→ 공유한 사용자 프로필 확인 및 팔로우 요청
→ 팔로우 승인 후 채팅방 연결

마이페이지의 팔로우 목록
→ 팔로워 또는 팔로잉 선택
→ 해당 목록 안에서만 검색
→ 사용자 프로필 열기 또는 차단·신고

대화방에서 iOS 뒤로가기
→ 이전 탭으로 이동하지 않음
→ 현재 conversation 상태만 제거
→ 대화목록 유지

마이페이지에서 언어 변경
→ 지원 locale 검증
→ UI locale과 pageLanguage 저장
→ 현재 native query context 보존
→ 새 locale의 마이페이지 또는 대화목록 표시

## 6. 제품 요구사항

### M-01. 메신저 진입과 대화목록

- 네이티브 앱의 첫 화면은 대화목록이어야 합니다.
- /[locale]에서 /[locale]/conversations로 이동할 때 apiNamespace, nativeUi, nativeAuth, nativeStt, nativePlatform, inset, debug, QA 관련 query를 보존합니다.
- nativeUi=1인 경우 서버 렌더링은 빠르게 그릴 수 있는 대화 셸을 우선 반환하고, latest preview·message count 등 무거운 정보는 백그라운드 refresh로 채웁니다.
- 서버가 반환한 대화 목록은 기존 최신순·상태·최근 메시지·메시지 수 표시 규칙을 유지합니다.
- 목록 우측 상단에 새 채팅방 만들기 버튼을 두고, 팔로잉·팔로워 목록에서 상대를 선택해 1:1 방을 만듭니다.
- 새 방 생성은 인증·전화번호 인증 완료 사용자만 수행하며, 생성 직후 같은 대화방으로 이동합니다.
- 기존 pull-to-refresh와 running/paused 표시를 유지합니다. 대화 내용 검색은 이번 범위에 포함하지 않습니다.
- 빈 상태에서는 대화목록 셸을 유지하고, 미인증 사용자는 소셜 로그인 CTA를, 인증 사용자는 새 대화 CTA를 봅니다.
- 목록 API 실패 시 이미 그려진 목록을 지우지 않고 재시도 가능한 상태를 제공합니다.
- 마지막 목록 행은 하단 탭, safe area, 하단 배너에 가려지지 않아야 합니다.

### M-02. 메시지 전송과 대화방

- 텍스트 입력으로 메시지를 보낼 수 있어야 합니다.
- 기존 STT 흐름을 유지해 사용자가 말한 내용을 텍스트로 변환한 뒤 메시지로 보낼 수 있어야 합니다. 음성 파일 전송이나 S2S 통역은 이번 범위에 포함하지 않습니다.
- 대화방은 1:1만 허용하며, owner와 상대 participant를 포함한 현재 멤버 목록을 대화방 안에서 확인할 수 있어야 합니다.
- 대화방에서 공유 버튼을 누르면 채팅방 링크를 OS 공유 시트로 공유할 수 있어야 합니다.
- 공유 링크는 임의 conversation ID 노출만으로 대화 내용을 열지 않고, 서버가 링크·사용자·팔로우·participant 권한을 확인한 뒤 프로필 또는 대화방으로 연결합니다.
- 사용자 프로필에서 채팅방 만들기를 실행해도 목록의 새 방 만들기와 동일한 1:1 생성 흐름을 사용합니다.
- 새 대화 생성 직후의 read-after-write 지연으로 발생하는 일시적인 404·5xx는 재시도 정책으로 흡수합니다.

- 목록 행을 누르면 해당 대화방이 열리고 URL에 conversation=ID 상태가 반영됩니다.
- 사용자 탭으로 여는 경우 history entry는 한 번만 추가합니다.
- route restore, popstate restore, QA restore처럼 URL이 이미 방을 가리키는 경우에는 중복 push를 하지 않습니다.
- 실제 대화방이 열린 뒤 active 또는 paused 상태 PATCH가 실패해도 방 진입 실패로 간주하지 않습니다.
- 상태 동기화 실패는 비차단 방식으로 기록하고, 필요한 경우 재시도합니다.
- 접근 불가·삭제됨·존재하지 않는 conversation ID는 방을 열지 않고 목록으로 돌아가며 재시도 또는 새로고침을 제공합니다.
- 네트워크 실패는 현재 화면을 유지하고 재시도 가능한 오류로 표시합니다.
- 닫기 버튼, 시스템 뒤로가기, iOS edge-swipe의 결과는 대화목록 복귀로 일관되어야 합니다.
- 닫은 방은 같은 render cycle 또는 다음 route sync에서 자동 재진입하지 않아야 합니다.
- STT가 실행 중일 때 native runtime 상태가 실제 recording 상태의 기준이며, WebView의 오래된 PATCH 응답이 상태를 되돌리지 않아야 합니다.

### M-03. 하단 탭

- MVP 하단 탭은 대화목록과 마이페이지 두 개입니다.
- 대화목록 탭은 Message Circle 계열 아이콘, 마이페이지 탭은 프로필 이미지 또는 기본 프로필 아이콘을 사용합니다.
- 활성 탭은 색상·fill·outline 등 기존 디자인 언어로 명확히 구분합니다.
- 하단 탭의 기본 높이 목표는 52px이며, iOS safe-area padding은 별도로 더합니다.
- 탭 자체의 높이를 줄이기 위해 내부 margin과 수직 정렬을 컴팩트하게 유지합니다.
- 대화목록의 scroll container는 탭 기본 높이와 safe area만큼 하단 여백을 확보합니다.
- 하단 배너가 대화목록에 활성화된 경우 배너 높이까지 계산해 마지막 콘텐츠가 가려지지 않게 합니다.
- 탭 이동은 전체 WebView reload가 아니라 현재 웹 앱 안의 route 이동으로 처리합니다.
- 탭 전환 시 보존해야 하는 native context query는 공통 helper에서 정의합니다.
- conversation query와 현재 탭에 종속된 overlay 상태는 탭 전환 시 제거해 마이페이지에서 방이 열리지 않게 합니다.

보존 대상의 기본 목록은 다음과 같습니다.

- apiNamespace 또는 apiNs
- nativeAuth, nativePlatform, nativeUi, nativeStt
- nativeTopInsetPx, nativeBottomInsetPx, nativeListTopInsetPx
- nativeBannerPosition, nativeConversationBannerPosition
- nativeConversationTopInsetPx, nativeConversationBottomInsetPx
- nativeClientVersion, nativeClientBuild
- sttDebug, ttsDebug, qa, nativeQa

실제 구현 시 query allow-list는 현재 RN과 WebView가 전달하는 키를 기준으로 한 곳에서 관리하고, 새 native query가 추가될 때 테스트가 누락되지 않게 합니다.

### M-04. 마이페이지

- 경로는 /[locale]/mypage로 통일합니다.
- 비로그인 native WebView에서도 route redirect 없이 기본 프로필 셸을 렌더링합니다.
- 인증 사용자는 프로필 사진, 국적, 모국어, UI 언어 설정을 확인하고 변경할 수 있어야 합니다.
- 비로그인 사용자는 기본 프로필 셸과 소셜 로그인 CTA를 봅니다. 팔로우·팔로워·프로필 수정은 로그인·전화번호 인증 후에 엽니다.
- 팔로잉·팔로워 탭을 제공하고, 선택한 목록 안의 사용자만 이름 또는 사용자 식별자로 검색할 수 있어야 합니다.
- 마이페이지 또는 알림 아이콘에서 앱 내 알림함으로 이동할 수 있어야 합니다.
- 언어 변경 후 현재 locale과 저장된 pageLanguage가 일치해야 합니다.
- 마이페이지에서 대화목록 탭을 누르면 보존된 native context와 함께 /[locale]/conversations로 이동합니다.
- 마이페이지에서는 AdMob 배너를 노출하지 않습니다.

### M-05. 사용자 프로필·팔로우·채팅 시작

- 사용자 프로필에는 프로필 사진, 국적, 모국어, 팔로워 수, 팔로잉 수와 현재 팔로우 관계를 표시합니다.
- 내 프로필에서 프로필 사진·국적·모국어를 등록·수정할 수 있습니다.
- 사용자 프로필에서 팔로우 요청을 보내고, 받은 요청을 수락하거나 거절할 수 있어야 합니다.
- 팔로워·팔로잉 목록은 서버 권한에 맞게 반환하며, 탐색·공개 사용자 전체 검색은 제공하지 않습니다.
- 팔로우가 허용된 상대 프로필에서는 1:1 채팅방 만들기 버튼을 제공하고, 기존 방이 있으면 해당 방으로 연결합니다.
- 차단은 프로필과 대화방의 공통 메뉴에서 수행하며, 차단 이후 서로 새 팔로우·새 채팅방 생성·채팅 메시지 전송을 할 수 없어야 합니다.
- 신고는 프로필과 대화방의 공통 메뉴에서 대상·사유를 확인받은 뒤 서버에 접수하고, 신고자 정보는 신고 대상에게 노출하지 않습니다.

### M-06. 소셜 로그인·전화번호 인증

- 소셜 로그인은 현재 지원하는 Apple·Google provider를 메신저 진입 경로에서 사용할 수 있어야 합니다.
- provider 설정 누락이나 callback 실패는 로그인 성공으로 처리하지 않고, 재시도 가능한 오류 상태로 보여야 합니다.
- 신규 사용자는 소셜 로그인 후 전화번호 인증을 완료해야 팔로우·채팅방 생성·프로필 공유 참여를 사용할 수 있습니다.
- 전화번호 인증은 요청·인증번호 입력·재전송·만료·시도 횟수 제한을 포함합니다. 인증번호와 전화번호 원문은 클라이언트 로그에 남기지 않습니다.
- 이미 인증된 사용자는 새 기기에서 로그인할 때 서버가 인증 상태를 복원하며, 전화번호를 바꾸면 재인증을 요구합니다.
- 기존 email 로그인은 호환성을 위해 유지할 수 있지만, 이번 필수 범위의 신규 소셜 진입은 Apple·Google을 기준으로 합니다.

### M-07. 앱 내 알림

- 알림함은 팔로우 요청, 팔로우 승인, 채팅방 공유·참여 상태 등 메신저 소셜 흐름의 핵심 상태 변화를 표시합니다.
- 읽지 않은 알림 수를 마이페이지 또는 공통 알림 아이콘에 표시하고, 알림을 열면 읽음 상태로 갱신합니다. 이는 대화 메시지 읽음 확인과 다른 기능입니다.
- 알림을 누르면 관련 사용자 프로필·팔로우 목록·대화방으로 이동하며, 대상이 삭제되거나 차단된 경우 안전한 대체 상태를 표시합니다.
- 이번 범위의 알림 채널은 앱 내 알림함·미읽음 표시입니다. 백그라운드·앱 종료 상태의 새 메시지 푸시는 구현하지 않습니다.

### M-08. 프로필·언어 저장과 데이터 변경

현재 Prisma User 모델에 name, image, language, pageLanguage 필드가 있으므로 해당 필드는 재사용합니다. 국적·모국어·전화번호 인증 상태, 팔로우·멤버·차단·신고·알림·공유 링크는 현재 schema에 없으므로 데이터 모델 확장이 필요합니다.

- 예상 모델은 User 확장(nationality, nativeLanguage, phoneVerifiedAt 등), Follow/FollowRequest, ConversationMember, ConversationShareLink, Block, Report, Notification, PhoneVerificationAttempt입니다.
- 전화번호 원문과 인증번호는 보안·보존 정책을 먼저 정한 뒤 필요한 최소값만 저장합니다. 인증번호는 해시 또는 외부 인증 provider 결과만 저장하는 방식을 우선 검토합니다.
- 인증 사용자 display name은 기존 User.name, avatar는 User.image를 사용합니다.
- 국적·모국어는 별도 명확한 필드로 저장하고, 기존 language가 의미하는 speech/UI 설정과 혼용하지 않습니다.
- UI locale은 User.pageLanguage를 우선하고, 없으면 User.language와 device locale을 fallback으로 사용합니다.
- 인증 사용자 변경은 서버 저장을 기준으로 하며, 기존 account/preferences contract 또는 profile contract에 추가합니다.
- 비로그인 사용자의 메신저 셸 설정은 해당 WebView 기기 범위에서만 유지합니다.
- 팔로우 관계는 요청·수락·거절·차단 상태를 구분하고, 대화 멤버는 owner와 participant 권한을 구분합니다. 2.0.0에서는 participant 수를 1명으로 제한합니다.
- 공유 링크는 만료·철회·사용자 권한을 서버에서 확인할 수 있는 토큰 모델로 관리합니다.
- 기존 필드로 해결되지 않는 요구가 추가되면 구현 전에 Prisma schema 변경 여부를 재평가합니다. 마이그레이션이 필요할 경우 prisma migration dev로 생성하고 로컬 DB에도 적용해야 합니다.

### M-09. AdMob과 화면 여백

- 하단 탭의 첫 번째 탭인 대화목록 영역만 배너 노출 대상입니다.
- 마이페이지에서는 배너를 숨깁니다.
- 대화방은 별도 하단 탭이 아니라 대화목록 탭의 overlay이므로 conversation-zone을 대화목록 탭의 일부로 취급합니다.
- native banner zone은 list, conversation, hidden을 구분해야 하며 마이페이지 진입 시 hidden을 명시적으로 전송합니다.
- 배너가 bottom에 있을 때 목록·대화방·하단 탭의 clearance 계산이 중복되지 않아야 합니다.
- dev/test 빌드에서는 기기에서 동작 여부를 확인할 수 있도록 테스트 광고 단위를 우선 사용하고, production build에서는 서버가 내려주는 production unit을 사용합니다.
- Android에서 광고가 늦게 뜨더라도 화면 레이아웃이 깨지지 않고, no-fill을 UI 기능 실패로 오인하지 않도록 로그와 테스트 상태를 구분합니다.

## 7. 네이티브 WebView·history 설계 원칙

### URL 상태

대화방의 공개 상태는 conversation query 하나를 기준으로 합니다. React state, URL, native restore storage가 서로 다른 방을 가리키지 않아야 합니다.

- 사용자 목록 탭: conversation query를 추가하고 history push
- 프로그램 내부 열기: URL이 이미 반영되어 있으면 history none
- 닫기: active conversation을 먼저 null로 반영하고 conversation query를 replace로 제거
- popstate: 현재 URL을 읽고 방이 있으면 닫기, 방이 없으면 목록 유지
- 방 수동 닫기 직후의 native restore·route sync는 같은 conversation ID를 다시 열지 않음
- URL 변경을 구독하는 외부 store는 popstate·hashchange뿐 아니라 programmatic history 변경 이벤트도 수신

### WebView source

- cold start에서 저장된 대화방 복원은 한 번만 WebView initial source에 반영합니다.
- 앱이 이미 실행된 뒤 목록과 방 사이를 이동하는 URL 변경은 WebView source 전체를 바꾸지 않습니다.
- 방을 닫았는데 RN source가 이전 conversation URL로 다시 mount되는 동작은 허용하지 않습니다.
- 복원 정보는 현재 코드의 TTL 정책을 따르며, 만료·권한 오류·존재하지 않는 방이면 목록으로 정리합니다.

### 뒤로가기

- 방 화면에서 뒤로가기: 대화목록
- 대화목록에서 뒤로가기: 네이티브 앱의 상위 종료·이전 동작
- 목록에서 마이페이지로 이동한 뒤 방을 닫더라도 마이페이지로 튀지 않음
- iOS edge-swipe와 명시적 닫기 버튼의 결과가 다르지 않음
- STT 실행 중 닫기 시 native stop lifecycle과 WebView overlay 닫기 순서를 명시하고, late status event가 방을 재개방하지 않게 함

## 8. 2.0.0 버전·namespace 계획

현재 main의 전용 mobile release 기준은 v1.1.4입니다. 2.0.0 구현은 v1.1.4 파일을 수정해 이름만 바꾸는 방식이 아니라 새 release variant와 namespace를 추가하는 방식으로 진행합니다.

| 영역 | 2.0.0 기준 | 구현 원칙 |
| --- | --- | --- |
| iOS 앱 | CFBundleShortVersionString 2.0.0 | API namespace와 함께 검증 |
| Android 앱 | versionName 2.0.0 | API namespace와 함께 검증 |
| iOS API | /api/ios/v2.0.0/... | 기존 controller/handler 계약을 새 namespace로 분리 |
| Android API | /api/android/v2.0.0/... | 기존 controller/handler 계약을 새 namespace로 분리 |
| 웹 variant | default_v2_0_0, ios_v2_0_0, android_v2_0_0 | 기존 v1.1.4 entry는 보존 |
| STT runtime | default/ios/android v2.0.0 | behavior profile과 release runtime을 함께 추가 |
| RN 기본값 | ios/v2.0.0 또는 android/v2.0.0 | 플랫폼별 앱 빌드와 일치 |
| version policy | v2.0.0 client policy endpoint | min/recommended/latest 정책을 별도 검증 |

필수 일치 규칙:

- iOS 앱 버전 2.0.0이면 API namespace는 ios/v2.0.0이어야 합니다.
- Android 앱 버전 2.0.0이면 API namespace는 android/v2.0.0이어야 합니다.
- 앱 버전과 namespace가 다르면 devbox 설치·release build·배포를 fail-closed합니다.
- v1.1.4 이하의 route, controller, web entry, STT runtime, allow-list는 2.0.0 작업으로 삭제하지 않습니다.
- API, 웹 프론트, STT가 각각 v2.0.0을 선택했는지 contract test로 확인합니다.

우선 검토할 구현 표면:

- mingle-app/src/lib/client-behavior-profile.ts
- mingle-app/src/lib/api-contract.ts
- mingle-app/src/app/[locale]/page.tsx
- mingle-app/src/app/[locale]/conversations/page.tsx
- mingle-app/src/app/[locale]/mypage/page.tsx
- mingle-app/src/app/[locale]/profile/[userId]/page.tsx
- mingle-app/src/app/[locale]/auth/phone/page.tsx
- mingle-app/src/server/api/controllers
- mingle-app/src/app/api
- mingle-app/src/web/default, ios, android
- mingle-stt/release-runtime.ts 및 mingle-stt/runtime
- mingle-app/rn/App.tsx
- mingle-app/rn/src/releaseTargets.ts
- mingle-app/rn/src/runtimeConfig.ts
- mingle-app/rn/src/webViewLayout.ts
- mingle-app/rn/src/webViewRestore.ts

## 9. 인증·데이터·API 계약

### 목록과 상세 권한

- 목록은 현재 identity resolver와 AppConversationChannel 소유권 기준을 유지합니다.
- 상세 조회·상태 변경·메시지 기록·멤버 목록·공유 링크 사용은 서버에서 동일한 권한을 재검증합니다.
- 클라이언트의 conversation query는 선택자일 뿐 권한 증명이 아닙니다.
- 401·403·404는 서로 다른 제품 상태로 기록하고, 모두 같은 open-error 알럿으로 합치지 않습니다.
- 팔로우·차단·신고·알림 조회에도 현재 로그인 사용자와 전화번호 인증 상태를 서버에서 확인합니다.

### API 범위

2.0.0 namespace 아래에서 기존 대화 API와 메신저 셸에 필요한 계정·버전 계약을 동일하게 접근할 수 있어야 합니다.

- GET /conversations
- POST /conversations
- GET/PATCH /conversations/:conversationId
- GET /conversations/:conversationId/members
- POST /conversations/:conversationId/share-links
- GET /profiles/:userId
- POST /account/profile/image
- PATCH /account/profile
- GET /account/followers
- GET /account/following
- POST/PATCH /follows 또는 /follow-requests
- POST/DELETE /blocks
- POST /reports
- GET/PATCH /notifications
- POST /auth/phone/request
- POST /auth/phone/verify
- GET/PATCH /account/preferences
- POST /client/version-policy
- 기존 translate/finalize, tts, log/client-event 경로

공통 로직은 기존 handler를 공유하고, URL scope별 controller는 분리합니다. 응답 필드와 오류 code는 기존 동작을 우선 보존하며, 새 필드가 필요할 때는 contract test를 먼저 추가합니다. 팔로우 목록 검색은 서버가 해당 사용자의 팔로워·팔로잉 집합을 먼저 제한한 뒤 query를 적용해야 하며, 전체 사용자 탐색 API로 우회할 수 없어야 합니다.

## 10. 구현 단계

### Phase 0. 기준선 고정

- 최신 main에서 새 작업 브랜치를 생성합니다.
- PR 92 브랜치와 Notion 「필수 기능」에서 이번 릴리즈에 필요한 화면·동작·문구만 체크리스트로 추출합니다.
- Notion 「없어도 되는 기능」은 구현 티켓·QA 시나리오로 만들지 않습니다.
- current main의 conversation-list, RN restore, banner zone, v1.1.4 route를 기준으로 회귀 테스트를 고정합니다.

### Phase 1. 인증·프로필 데이터 기반

- Apple·Google 소셜 로그인 진입과 callback 오류 처리를 메신저 경로에 연결합니다.
- 전화번호 인증 request·verify·재전송·만료·rate limit 계약을 추가합니다.
- 프로필 사진·국적·모국어·전화번호 인증 상태의 schema/API를 설계합니다.
- Prisma schema가 바뀌면 prisma migration dev로 migration을 만들고 로컬 DB에 적용합니다.
- 인증·전화번호 인증·프로필 완료 상태를 공통 guard로 만들어 이후 기능이 동일하게 사용합니다.

### Phase 2. 팔로우·프로필·안전 기능

- /[locale]/mypage route와 비로그인 profile shell을 추가합니다.
- /[locale]/profile/[userId]와 팔로워·팔로잉 목록을 추가합니다.
- 팔로우 요청·수락·거절과 목록 내부 검색을 구현하고, 탐색·전체 사용자 검색은 만들지 않습니다.
- 프로필에서 1:1 채팅방 만들기 진입을 연결합니다.
- 프로필·대화방의 차단·신고 공통 메뉴와 서버 권한 검사를 구현합니다.
- 인증 사용자 profile·language read/write를 연결합니다.
- 모든 지원 locale의 dictionary copy와 fallback을 추가합니다.
- 팔로우·프로필·차단·신고의 권한 및 차단 후 노출 정책을 contract test로 검증합니다.

### Phase 3. 메신저 셸·대화 기능

- 대화목록을 native first screen으로 정리합니다.
- BottomTabBar 공통 컴포넌트와 native query 보존 helper를 추가합니다.
- 목록 우측 상단 새 채팅방 생성 버튼과 팔로우 목록 선택 sheet를 추가합니다.
- 대화방 메시지 입력, 기존 STT 기반 음성 입력 전송, 1:1 participant와 멤버 목록을 연결합니다.
- 채팅방 공유 링크 생성·접근·OS 공유 시트와 신규 사용자의 인증·팔로우 연결 흐름을 구현합니다.
- 목록 scroll clearance와 safe-area 계산을 연결합니다.

### Phase 4. 대화방 안정성·알림

- open, close, popstate, route restore의 history state machine을 정리합니다.
- false open-error 알럿과 status PATCH race를 분리합니다.
- manual close suppression, custom location sync, native restore latch를 회귀 테스트합니다.
- 방 닫기 후 STT가 재시작하거나 같은 방이 재진입하지 않는지 확인합니다.
- 앱 내 알림함·미읽음 배지와 팔로우·공유 관련 알림 이벤트를 연결합니다.
- 마이페이지와 대화목록의 탭 이동, language 변경, 알림 deep link의 full reload·history 결과를 검증합니다.
- AdMob list/conversation/hidden zone과 하단 탭 clearance를 연결합니다.

### Phase 5. 2.0.0 릴리즈 분리

- API controller, web entry, client behavior profile, STT runtime, RN config를 v2.0.0으로 추가합니다.
- iOS·Android 앱 version과 namespace 검증을 fail-closed로 연결합니다.
- v1.1.4 및 이전 release contract test를 유지합니다.

### Phase 6. 광고·디바이스 검증

- list/conversation/hidden banner zone을 탭 상태와 연결합니다.
- devbox device profile로 두 서버와 ngrok을 실행합니다.
- iOS와 Android에서 기존 앱 삭제·재설치, URL, 스타일, 배너, history를 차례로 검증합니다.
- 실제 UI/UX 변경과 발견된 문제는 docs/ui-ux-codex-thread-history.md에 기록합니다.

## 11. 수용 기준과 QA 시나리오

| 우선순위 | 시나리오 | 통과 기준 |
| --- | --- | --- |
| P0 | 비로그인 native cold start | 흰 화면·강제 마이페이지 redirect 없이 대화목록 셸과 빈 상태가 보임 |
| P0 | 소셜 로그인·전화번호 인증 | Apple·Google 로그인 callback이 완료되고, 인증번호 만료·재전송·실패 상태가 안전하게 처리됨 |
| P0 | 텍스트·STT 음성 입력 전송 | 텍스트 입력과 기존 STT 음성 입력이 각각 메시지로 저장되고 상대 화면에 표시됨 |
| P0 | 목록에서 새 1:1 방 만들기 | 대화목록 우측 상단에서 팔로우 목록의 상대를 선택해 방을 만들고 즉시 진입함 |
| P0 | 접근 가능한 기존 방 열기 | 방이 열리고 URL·native restore가 같은 ID를 가리킴 |
| P0 | 프로필에서 새 1:1 방 만들기 | 허용된 상대 프로필에서 기존 방 재사용 또는 새 방 생성이 동작함 |
| P0 | 공유 링크 접근 | 기존 사용자는 권한 확인 후 방으로, 신규 사용자는 로그인·전화번호 인증·팔로우 승인 흐름으로 연결됨 |
| P0 | 차단·신고 | 프로필·대화방에서 차단·신고가 접수되고 차단 후 새 팔로우·방 생성·메시지 전송이 차단됨 |
| P0 | 방 닫기와 iOS 뒤로가기 | 대화목록으로 돌아가며 마이페이지로 점프하거나 방이 재진입하지 않음 |
| P0 | 방 진입 후 active/paused PATCH 실패 | 방을 닫지 않고 false open-error 알럿을 표시하지 않음 |
| P0 | 빠른 active→paused 연속 조작 | 오래된 응답이 최신 상태를 덮지 않음 |
| P1 | 대상 없음·권한 없음 | 방을 열지 않고 목록에 남으며 재시도 가능한 상태를 제공 |
| P1 | 네트워크 실패 | 현재 목록·방 화면을 보존하고 재시도 가능 |
| P1 | 대화목록→마이페이지→대화목록 | 두 탭이 실제 route를 바꾸고 native query가 보존됨 |
| P1 | profile·nationality·native language 저장 | 인증 사용자는 재진입 후 프로필 사진·국적·모국어·언어 설정이 복원됨 |
| P1 | 팔로워·팔로잉 목록 검색 | 선택한 목록 안의 사용자만 검색되고 전체 사용자 탐색 결과는 노출되지 않음 |
| P1 | 채팅방 멤버·공유 | 방 안에서 owner와 participant를 확인하고, 공유 링크를 재사용·철회 정책에 맞게 처리함 |
| P1 | 앱 내 알림 | 팔로우·공유 상태 알림과 미읽음 수가 표시되고 탭하면 관련 화면으로 이동함 |
| P1 | 목록 스크롤 | 마지막 행이 하단 탭과 배너에 가려지지 않음 |
| P1 | 배너 zone | 대화목록 탭에서만 표시되고 마이페이지에서 hidden 상태가 됨 |
| P1 | Android ngrok WebView | 기본 HTML이 아닌 정상 스타일의 메신저 UI가 표시됨 |
| P1 | iOS ngrok WebView | Cloudflare가 아닌 현재 devbox ngrok web/STT endpoint를 사용함 |
| P1 | 앱 재설치 | iOS·Android의 앱 버전과 API namespace가 각각 2.0.0 쌍으로 일치함 |
| P2 | 기존 버전 회귀 | v1.1.4 및 이전 contract·route가 삭제되거나 2.0.0 동작으로 오염되지 않음 |

### 권장 검증 순서

1. scripts/devbox bootstrap
2. scripts/devbox up --profile device --with-mobile-install
3. 필요 시 scripts/devbox up --profile device --with-ios-install --with-ios-clean-install
4. scripts/devbox test --target app
5. web·RN·STT의 focused contract test
6. iOS·Android 실기기 수동 QA
7. git diff --check 및 release namespace 일치 검증

서버와 모바일 앱을 직접 띄우는 검증은 mingle 프로젝트의 devbox를 사용합니다. Cloudflare는 ngrok 한도 등으로 명시적으로 전환할 때만 fallback으로 사용합니다.

## 12. 관측성과 성공 지표

2.0.0 구현에서는 다음 사건을 최소한 개발·QA 로그로 구분합니다.

- messenger_entry_rendered
- conversation_list_loaded
- conversation_list_empty
- conversation_create_started
- conversation_created
- conversation_open_succeeded
- conversation_open_rejected
- message_text_sent
- message_stt_sent
- conversation_share_link_created
- conversation_member_list_opened
- conversation_status_sync_failed
- conversation_close_completed
- conversation_reentry_suppressed
- messenger_tab_changed
- profile_viewed
- profile_updated
- follow_request_created
- follow_request_resolved
- block_created
- report_submitted
- phone_verification_succeeded
- in_app_notification_opened
- mypage_preference_saved
- native_banner_zone_changed
- native_runtime_namespace_mismatch

정식 수치 목표는 출시 전 운영 데이터 기준으로 확정합니다. 구현 직후부터는 다음 실패가 0건이어야 합니다.

- 앱 버전과 API namespace 불일치로 설치·실행되는 경우
- 인증되지 않은 사용자가 팔로우·방 생성·공유 참여·프로필 수정 기능을 실행하는 경우
- 차단된 사용자 사이에 새 방 생성 또는 메시지 전송이 허용되는 경우
- 방이 실제로 열렸는데 open-error 알럿이 표시되는 경우
- 닫은 방이 자동으로 재진입하는 경우
- 마이페이지에 배너가 표시되는 경우
- Android가 ngrok HTML을 기본 브라우저 스타일로 표시하는 경우

## 13. 위험과 대응

| 위험 | 대응 |
| --- | --- |
| PR 92와 main의 구조 차이 | 브랜치 병합 대신 main 기준 선택적 재구현 |
| route, state, native restore의 경쟁 | conversation query를 단일 상태로 두고 push/replace/none 규칙 고정 |
| 오래된 PATCH 응답이 최신 상태 덮어씀 | conversation별 mutation version과 AbortController 유지 |
| 소셜 그래프·멤버 권한 누락 | Follow·ConversationMember·Block 상태를 서버에서 재검증하고 1:1 participant 상한을 적용 |
| 전화번호 인증 남용·개인정보 노출 | 인증번호 TTL·rate limit·로그 마스킹·재인증 정책을 contract로 고정 |
| 공유 링크가 권한 우회로 사용됨 | 링크 token과 conversation 권한을 분리하고 가입·팔로우 승인 전에는 대화 내용을 공개하지 않음 |
| 차단·신고와 알림의 개인정보 노출 | 신고자 비공개, 차단 후 대상 숨김, 알림 payload 최소화 |
| 2.0.0 파일 복제 누락 | API·web·STT·RN을 release matrix와 contract test로 관리 |
| 게스트 권한 정책 불명확 | 게스트는 목록 셸·로그인 CTA만 보고, 팔로우·방 생성·공유 참여는 인증·전화번호 인증 뒤에 허용 |
| 배너·safe area·하단 탭 충돌 | native zone과 content clearance를 하나의 계산 계약으로 관리 |
| 모바일 기기별 WebView 차이 | devbox ngrok 기반 iOS·Android 실기기 QA를 필수 gate로 지정 |
| 현지화 누락 | dictionary type과 지원 locale별 문구 검증을 구현 완료 조건에 포함 |

## 14. 오픈 질문

구현 착수 전에 다음 항목의 제품 결정을 확정해야 합니다.

1. 전화번호 인증 SMS provider, 지원 국가, 동일 번호의 계정 연결 정책을 확정해야 합니다.
2. 프로필 사진 저장 방식·허용 용량·실패 시 대체 이미지를 확정해야 합니다.
3. 팔로우 요청을 받은 사용자의 알림·수락·거절 화면과 차단 시 기존 요청 처리 규칙을 확정해야 합니다.
4. 신고 사유 목록과 접수 후 운영자 처리 화면을 기존 admin 흐름에 연결할지 확정해야 합니다.
5. 공유 링크의 만료·철회 시점과 링크를 받은 사용자의 팔로우 승인 전 노출 문구를 확정해야 합니다.
6. 지원 locale 목록과 언어 변경 후 기본 복귀 경로를 현재 i18n 정책과 동일하게 확정해야 합니다.
7. 2.0.0의 internal/TestFlight/Play 내부 테스트와 일반 배포 순서를 확정해야 합니다.

## 15. Definition of Done

- [ ] 최신 main에서 구현되며 PR 92 브랜치 전체 병합을 하지 않았습니다.
- [ ] native first screen, 대화목록, 대화방, 마이페이지, 사용자 프로필, 하단 탭의 핵심 흐름이 수용 기준을 통과했습니다.
- [ ] 텍스트 메시지·기존 STT 음성 입력 전송, 목록·프로필에서의 1:1 방 생성, 채팅방 공유, 멤버 목록 확인이 동작합니다.
- [ ] 팔로우 요청·수락·거절, 팔로워·팔로잉 목록 내부 검색, 프로필 사진·국적·모국어 수정이 동작합니다.
- [ ] 소셜 로그인·전화번호 인증, 차단·신고, 앱 내 알림·미읽음 표시가 동작합니다.
- [ ] 방 열기·닫기·iOS 뒤로가기·native restore에서 false alert와 자동 재진입이 없습니다.
- [ ] 프로필·언어 저장 정책, 공유 링크 권한, 1:1 participant 상한, 인증 guard가 문서화되고 테스트되었습니다.
- [ ] AdMob은 대화목록 탭 정책에 맞고, 목록 하단 clearance가 검증되었습니다.
- [ ] iOS와 Android의 앱 버전·API namespace가 각각 2.0.0 쌍으로 일치합니다.
- [ ] API·웹·STT v2.0.0 variant가 기존 버전을 보존한 채 contract test를 통과했습니다.
- [ ] devbox/ngrok으로 iOS·Android 실기기 설치와 핵심 QA를 완료했습니다.
- [ ] UI/UX 변경사항이 docs/ui-ux-codex-thread-history.md에 기록되었습니다.
- [ ] 구현 중 Prisma schema 변경이 생긴 경우 migration dev 파일과 로컬 DB 적용 결과가 함께 존재합니다.

## 참고 문서와 코드

- docs/api-versioning-architecture.md
- docs/release-namespace-rollout-checklist.md
- docs/worktree-devbox.md
- docs/ui-ux-codex-thread-history.md
- mingle-app/src/components/conversation-list.tsx
- mingle-app/rn/App.tsx
- mingle-app/rn/src/webViewLayout.ts
- mingle-app/rn/src/webViewRestore.ts
- mingle-app/src/lib/app-conversations.ts
- mingle-app/prisma/schema.prisma
