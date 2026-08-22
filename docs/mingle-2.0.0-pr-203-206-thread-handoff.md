# Mingle 2.0.0 통합 인수인계 및 다음 작업 기획서

기준일: 2026-08-22  
목적: PR #203, PR #206, 현재 쓰레드에서 진행한 수정사항과 남은 검증·배포 작업을 다음 Codex 쓰레드에 전달

이 문서는 단순한 기능 설명이 아니라, 현재 브랜치에서 무엇이 이미 끝났고 무엇을 아직 확인해야 하는지, 다음 쓰레드에서 어떤 순서로 작업해야 안전한지를 복원하기 위한 통합 handoff 문서입니다.

## 0. 먼저 읽어야 할 핵심 요약

- 현재 로컬 작업 워크트리는 /Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test 입니다.
- 현재 브랜치는 codex/messenger-tabs-device-test 입니다.
- 이 쓰레드에서 문서를 추가하기 직전 기준 HEAD는 PR #206 merge commit f307a434였습니다.
- PR #206은 PR #203의 브랜치에 이미 merge되었습니다. PR #203 자체는 2026-08-22 확인 시 OPEN 상태이며 아직 main에 merge된 것으로 간주하면 안 됩니다.
- 현재 브랜치는 이름과 달리 디바이스 테스트만 담은 브랜치가 아닙니다. 2.0.0 릴리스 범위, 멀티멤버 대화방, 프로필·위치, native back, 실시간 메시징, 계정 생명주기 변경이 함께 통합된 장기 브랜치입니다.
- 모바일 앱 버전과 API namespace 버전은 반드시 같이 올라가야 합니다. 2.0.0 앱은 iOS에서 ios/v2.0.0, Android에서 android/v2.0.0을 사용해야 하며 1.1.4 namespace로 되돌아가면 안 됩니다.
- 다음 쓰레드에서 가장 먼저 할 일은 현재 워크트리·브랜치·HEAD·변경사항을 확인한 뒤, Devbox와 안정적인 named tunnel을 사용한 실제 2계정 디바이스 검증입니다.
- DB를 초기화하거나 migration 파일을 삭제·재정렬하면 안 됩니다. 특히 같은 timestamp를 가진 서로 다른 migration directory가 두 개 있으므로 둘 다 보존해야 합니다.

## 1. 현재 Git 상태와 브랜치 관계

### 1.1 작업 위치

개발·서버 실행·모바일 빌드·Devbox 검증은 아래 워크트리에서 진행해야 합니다.

    /Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test

주 작업 디렉터리인 /Users/nam/mingle은 별도의 main 워크트리입니다. 현재 작업과 섞으면 branch checkout, env, generated artifact가 서로 영향을 줄 수 있으므로 다음 쓰레드에서도 주의해야 합니다.

작업 시작 시 확인할 항목:

    git status --short --branch
    git log -1 --oneline --decorate
    git branch --show-current

이 문서를 추가하기 전 기준:

| 항목 | 값 |
| --- | --- |
| 로컬 브랜치 | codex/messenger-tabs-device-test |
| 원격 브랜치 | origin/codex/messenger-tabs-device-test |
| 기준 HEAD | f307a434 |
| 기준 커밋 의미 | PR #206을 현재 브랜치에 merge한 커밋 |
| 작업 워크트리 상태 | 문서 추가 직전 clean |

문서 커밋 이후 HEAD는 새 문서 커밋으로 바뀌므로, 다음 쓰레드에서는 hash보다 branch와 실제 log를 우선 확인해야 합니다.

### 1.2 PR #203

| 항목 | 내용 |
| --- | --- |
| 번호 | #203 |
| 제목 | codex/messenger-tabs-device-test |
| base | main |
| head | codex/messenger-tabs-device-test |
| 확인 시 상태 | OPEN |
| 확인 시 merge 상태 | CLEAN |
| 목적 | Mingle 2.0.0 client/server 통합 및 릴리스 후보 검증 |

PR #203의 본문에서 설명한 주요 목적은 다음과 같습니다.

- messenger tabs 및 My Page를 포함한 2.0.0 클라이언트 범위 통합
- native STT 연속성 유지
- profile/social 기능, notification, language preference, usage 화면 통합
- provider별 OAuth transient-cookie 처리
- iOS/Android namespace API를 2.0.0으로 맞춤
- Railway를 이 브랜치에 연결하고 자동 배포하는 릴리스 경로 구성
- 인증·native auth·sign-in targeted test 통과

PR #203 설명에는 전체 TypeScript 검사에서 기존의 무관한 테스트 오류가 있었다는 제한도 적혀 있습니다. 따라서 “PR이 CLEAN”이라는 상태와 “모든 디바이스·production 시나리오가 검증 완료”라는 의미를 혼동하면 안 됩니다.

PR #203 확인 당시 주요 체크:

- App Namespace Contracts: legacy-empty 성공
- App Namespace Contracts: ios-v1.0.0 성공
- App Namespace Contracts: ios-v1.0.2 성공
- Landing Namespace Contracts 성공
- Push Context Gate 성공
- Unit Tests (Vitest) 성공
- live integration은 skip된 항목이 있음

### 1.3 PR #206

| 항목 | 내용 |
| --- | --- |
| 번호 | #206 |
| 제목 | Add channel membership for multi-member conversation rooms (Phase 0+1) |
| head branch | feat/multi-member-rooms |
| base branch | codex/messenger-tabs-device-test |
| 상태 | MERGED |
| merge commit | f307a434d07e8da861aaac899d03e7fdc6116ff7 |

PR #206은 되돌려졌던 direct-messages 작업을 다시 정리한 PR입니다. 기존 solo conversation channel schema/server를 실제 multi-account membership 구조로 확장하는 것이 핵심이며, Phase 0+1에서는 새 화면·새 route·새 UI 컴포넌트를 추가하지 않는 범위로 진행되었습니다.

PR #206 merge 이후의 현재 브랜치는 PR #203의 head 브랜치이므로, 다음 쓰레드에서 feat/multi-member-rooms가 아직 따로 작업 대상이라고 가정하면 안 됩니다. 필요한 경우 PR #206 merge commit f307a434와 해당 PR의 변경 이력을 기준으로 추적합니다.

## 2. 제품·릴리스 범위

### 2.1 2.0.0 버전 규칙

Mingle은 모바일 앱 버전과 API namespace 버전을 항상 동일하게 유지해야 합니다.

| 앱 | 올바른 namespace |
| --- | --- |
| iOS 2.0.0 | ios/v2.0.0 |
| Android 2.0.0 | android/v2.0.0 |

1.1.4 namespace 또는 1.1.4 웹 fallback으로 진입하는 현상은 호환성 문제가 아니라 릴리스 버전이 섞이는 문제입니다. 외부 링크·OAuth callback·native WebView fallback·API route를 모두 확인할 때 이 규칙을 기준으로 삼아야 합니다.

### 2.2 현재 브랜치가 포함하는 큰 기능 묶음

- messenger tabs 및 conversation list/room 전환
- 2.0.0 API namespace 및 release web
- My Page와 profile edit/settings
- 공개 프로필, follow/follower/following, profile share
- 프로필 이미지 preview와 여러 profile surface
- profile location 저장·표시·지도
- 15개 primary UI locale의 i18n
- 대화방 언어·번역 모델·글자 크기·기본 표시 언어
- native STT와 iOS/Android 권한 흐름
- push/notification 및 usage 화면
- account deactivation/withdrawal
- Android OS back 및 iOS edge-swipe back
- multi-member channel membership
- messaging WebSocket과 polling fallback
- provider별 OAuth callback cookie 처리

## 3. PR #206 멀티멤버 대화방 상세

### 3.1 데이터 모델

핵심 join table은 app_conversation_channel_members입니다.

- channel과 user의 관계를 channel 단위로 관리합니다.
- 기존 channel owner를 migration에서 첫 member로 backfill합니다.
- owner는 owner/admin 역할을 유지합니다.
- member별 status와 paused_at을 저장할 수 있습니다.
- member별 display_language와 selected_languages를 저장합니다.
- 아직 실제 member row가 없는 invitee는 pending_invitee_user_ids에 보관할 수 있습니다.
- pending invitee는 첫 메시지가 생성되는 시점에 membership으로 materialize되는 흐름이 포함되어 있습니다.
- 대화방 생성 helper인 createConversationChannelForUser는 optional invitee IDs를 받아 초기 membership을 만들 수 있지만, PR #206 시점에는 이 인자를 실제 API/UI invite flow에 연결하지 않았습니다.

### 3.2 조회·권한 규칙

- 대화방 읽기·수정 권한은 channel owner 여부만 보지 않고 실제 membership을 기준으로 판단합니다.
- 대화방 삭제-for-everyone은 owner-only 정책입니다.
- 2명 이상 방의 title, language, status, selected-language aggregation은 member 정보 기준입니다.
- solo room은 기존 채널 단위 동작을 최대한 유지합니다.
- 정확히 2명의 1:1 room에서 block 관계가 있으면 기존 사진 숨김·메시지 차단 정책을 유지합니다.
- 3명 이상 group room에서는 한 명의 block 관계 때문에 방 전체를 종료하거나 다른 멤버의 메시지를 막으면 안 됩니다.

### 3.3 Review에서 반영한 수정

PR #206 review에서 다음 P1/P2 이슈를 반영했습니다.

1. 차단된 counterpart의 avatar URL이 목록 렌더링까지 남지 않도록 제거했습니다.
2. 1:1 message request가 target set이 다른 기존 group room을 재사용하지 않도록 했습니다. 그렇지 않으면 의도하지 않은 group member에게 private message가 노출될 수 있습니다.
3. 존재하지 않는 invitee user ID를 저장하기 전에 검증하도록 했습니다.
4. 초기 메시지 materialization이 잘못된 invitee를 조용히 무시하지 않도록 했습니다.
5. blocked 안내 문구를 15개 primary locale에 넣고 unsupported locale은 영어로 fallback합니다.

다음 이슈는 product 정책 또는 follow-up으로 남아 있습니다.

- 같은 멤버 조합의 duplicate room은 현재 제품 정책상 허용합니다. 자동 병합을 새로 넣지 마십시오.
- review issue #4는 인지되었지만 follow-up branch로 미뤄졌습니다. 다음 쓰레드에서 다시 추적해야 합니다.
- invitee를 실제 UI에서 선택하고 초대하는 API entry point는 PR #206 범위 밖입니다.
- ChatBubble의 self/other 표시와 완전한 live sync는 후속 검증·수정 대상입니다.

## 4. 실시간 메시징 구조와 운영 조건

### 4.1 서비스 책임

| 서비스 | 책임 | 기본 포트 |
| --- | --- | --- |
| mingle-app | auth, API, room/member 권한, message DB 저장 | 3000 |
| mingle-stt | STT | 3001 |
| mingle-messaging | WebSocket fanout, publish endpoint | 3002 |

mingle-app이 DB commit과 권한 검증을 담당하고, 저장 성공 후 messaging publish endpoint에 이벤트를 전달합니다. mingle-messaging은 WebSocket fanout을 담당하지만 Prisma나 제품 권한의 source of truth가 아닙니다.

클라이언트는 conversation-events WebSocket을 구독하고 연결이 끊기면 polling fallback을 사용합니다. WebSocket이 연결되지 않았다는 이유만으로 메시지 저장 API의 성공 여부를 판단하면 안 됩니다.

### 4.2 Railway single-service 라우팅

현재 방향은 Railway 한 service 안에서 web, STT, messaging 프로세스를 함께 실행하는 것입니다.

- public $PORT는 web entry가 사용합니다.
- /stt는 STT WebSocket으로 전달되어야 합니다.
- /conversation-events는 messaging WebSocket으로 전달되어야 합니다.
- /conversation-events/publish는 messaging publish HTTP endpoint로 전달되어야 합니다.
- /railway/health는 aggregate health를 반환해야 합니다.

모든 요청을 app 3000으로만 보내는 오래된 proxy 설정이면 message publish가 전달되지 않거나 WebSocket이 실패할 수 있습니다. deployment 후 반드시 routing을 별도로 확인해야 합니다.

### 4.3 필수 secret과 environment

- MINGLE_REALTIME_SECRET은 mingle-app과 mingle-messaging 양쪽에서 동일해야 합니다.
- 이 값은 realtime token과 publish auth에 함께 사용됩니다.
- 값이 없으면 messaging의 realtimeConfigured가 false가 되고 WebSocket invalid_token, publish unauthorized가 발생할 수 있습니다.
- secret 값 자체는 로그·문서·최종 답변에 출력하지 않습니다.
- Docker/launcher 기본값은 STT path /stt, messaging WebSocket path /conversation-events, publish path /conversation-events/publish, 내부 messaging URL http://127.0.0.1:3002 입니다.
- single-service에서 same-origin path를 자동 추론해야 한다면 오래된 NEXT_PUBLIC_WS_URL 또는 NEXT_PUBLIC_MESSAGING_WS_URL을 남겨 다른 host로 보내지 않도록 확인합니다.

## 5. 이 쓰레드에서 처리한 이슈

### 5.1 Instagram feedback 외부 이동이 1.1.4로 바뀌던 문제

#### 증상

Android 2.0.0 앱에서 Instagram이 설치되지 않은 상태로 프로필의 feedback 기능을 누르면, 현재 2.0.0 화면이 유지되지 않고 1.1.4 웹으로 앱이 바뀌는 문제가 관찰되었습니다.

#### 원인

React Native WebView가 외부 Instagram URL과 browser fallback을 일반 웹 페이지 로드 실패와 같은 방식으로 처리했습니다. Android에서 앱이 없을 때의 intent fallback이 적절히 분기되지 않았고, 초기 진입 이후의 WebView load error에도 legacy fallback이 적용될 가능성이 있었습니다.

#### 반영 내용

커밋 2ab20402에서 외부 navigation 처리를 분리했습니다.

- instagram.com 및 하위 도메인을 식별합니다.
- intent://와 instagram:// scheme을 식별합니다.
- intent URL의 S.browser_fallback_url을 추출합니다.
- Instagram 앱이 있으면 OS가 앱으로 열도록 시도합니다.
- 앱이 없거나 intent가 열리지 않으면 browser fallback을 엽니다.
- WebView의 legacy fallback은 initial load가 정착되기 전의 초기 진입 실패에만 적용합니다.
- 정상적인 현재 2.0.0 페이지의 외부 링크 실패가 앱 전체를 1.1.4로 교체하지 않도록 했습니다.

#### 다음 검증 matrix

Android 2.0.0에서 아래 세 경우를 모두 확인해야 합니다.

| 조건 | 기대 결과 |
| --- | --- |
| Instagram 설치 + 로그인 | Instagram 앱 또는 OS가 허용하는 Instagram 화면으로 이동 |
| Instagram 설치 + 로그아웃 | Instagram 앱의 로그인 화면/브라우저 fallback 등 외부 흐름으로 이동하되 Mingle은 2.0.0 유지 |
| Instagram 미설치 | 브라우저 fallback으로 이동하되 Mingle은 2.0.0 유지 |

세 조건 모두에서 Mingle 화면이 1.1.4로 바뀌면 안 됩니다. Instagram 로그인 여부는 이 버그의 핵심 방어 조건이 아니지만, 설치·미설치와 함께 실제로 확인해야 합니다. iOS external navigation에는 이 Android 전용 분기 때문에 동작 변화가 생기지 않았는지도 확인합니다.

### 5.2 Android OS back이 앱을 종료하던 문제

#### 사용자가 확인한 표면

- My Page 설정 메뉴
- 프로필 변경
- 프로필 이미지 미리보기
- 설정 내부 7개 화면
- 계정 비활성화·탈퇴 모달
- 대화방 햄버거 메뉴와 내부 4개 화면
- 대화방 언어 선택
- 대화방 이름 변경·삭제 모달
- 글자 크기·번역 모델 메뉴
- 일반적인 대화방에서 대화목록으로 이동
- 팔로워 목록·프로필 공유 화면
- QR scanner: Android native 화면이 먼저 닫히는 계층

#### 원인 판단

탭 자체를 전면 리팩토링해야 하는 문제가 아니라, WebView 안의 overlay/history 상태와 React Native의 Android BackHandler가 서로 어떤 레이어가 최상위인지 알지 못했던 문제입니다.

#### 반영 내용

관련 커밋:

- 8636b658: Android system back navigation issue 기록
- 2b29af15: Mingle panel의 native back 처리
- 620c4746: 여러 app surface에 대한 Android back 처리 보완
- 2affe851: app surface별 back 동작 audit

구현 방향:

- native-back-handler.ts에 우선순위가 있는 handler stack을 두었습니다.
- Web surface가 열려 있으면 topmost surface handler가 먼저 닫힙니다.
- web layer가 native_navigation_state payload로 canHandleAndroidBack을 전달합니다.
- RN App.tsx는 Android hardware BackHandler에서 web capability, native menu, web history를 확인합니다.
- WebView가 처리할 수 있을 때는 native back dispatch를 주입하고, 처리할 것이 없을 때만 앱 종료를 허용합니다.
- iOS는 이 Android capability signal의 영향을 받지 않으며 기존 iOS WebView history와 edge-swipe 처리를 유지합니다.
- my-page, mingle-home, conversation-list, profile/follow/share, language onboarding, location map이 각자 handler를 등록합니다.

#### 현재 판단과 검증 주의

사용자가 실제로 여러 화면을 테스트한 뒤 “다 잘 된다”고 확인했고 관련 변경은 push되었습니다. 따라서 tabs 전체를 재구현할 필요는 현재 없습니다.

다만 다음 회귀 테스트는 필요합니다.

1. modal 위에 panel이 열린 경우 최상위 modal이 먼저 닫히는지
2. profile image preview가 열린 경우 profile surface보다 preview가 먼저 닫히는지
3. 대화방 hamburger 내부 화면에서 back을 누르면 단계별로 한 depth만 줄어드는지
4. 일반 room에서 back을 누르면 room이 닫히고 conversation list로 가는지
5. QR scanner에서는 native QR layer가 먼저 닫히고, 그 다음 WebView layer가 닫히는지
6. 처리할 WebView/native layer가 없을 때만 앱이 종료되는지
7. iOS edge-swipe와 iOS의 기존 back 동작이 변하지 않았는지

최소 변경 원칙은 현재 구조를 유지하고 handler 등록·capability 신호·우선순위만 보완하는 것입니다. tabs 리팩토링은 실제 재현되는 회귀가 있을 때만 검토합니다.

### 5.3 프로필 위치 기능

#### 제품 동작

- My Page 또는 다른 사용자의 public profile에서 handle 아래에 위치를 표시합니다.
- 위치가 없으면 owner에게는 위치 등록 안내, 다른 사용자에게는 위치 없음 안내를 표시합니다.
- 위치 표시를 누르면 오른쪽에서 전체 화면으로 들어오는 SlideSurface 형태의 지도 화면을 엽니다.
- 지도 panel은 현재 topmost native back handler를 등록합니다.
- 위치 권한은 앱 시작 시가 아니라 사용자가 위치 기능을 실제로 사용할 때 요청합니다.
- iOS와 Android 모두 native permission bridge를 사용하고 browser 환경에는 browser geolocation fallback을 둡니다.

#### 저장 데이터와 API

profile 위치 migration:

    mingle-app/prisma/migrations/20260820150000_add_user_profile_location/migration.sql

저장 필드:

- location latitude/longitude
- fallback city/country
- country code
- locationUpdatedAt
- locationPermissionVerifiedAt

profile API와 public user profile API가 위치를 제공합니다. 위치를 저장할 때 좌표와 reverse-geocoded fallback을 함께 보관합니다.

#### 권한을 껐을 때의 privacy invariant

이 기능의 중요한 정책은 “한 번 저장한 위치를 권한을 끈 뒤 계속 공개하지 않는다”입니다.

- My Page 진입 시 native permission을 확인합니다.
- pageshow와 visibilitychange 때도 다시 확인합니다. 설정 앱에서 권한을 끄고 Mingle로 돌아오는 경우를 잡기 위한 것입니다.
- granted이면 서버에 locationPermissionStatus=granted를 보내고 verified 시각을 갱신합니다.
- denied, blocked, unavailable이면 화면의 위치를 즉시 비우고 서버 PATCH로 권한 상태를 전달합니다.
- 서버는 granted 이외의 상태를 받으면 좌표·도시·국가·country code·updated/verified 시각을 모두 null로 정리합니다.
- 위치 기능의 저장·갱신은 owner profile에서만 수행합니다.
- 다른 사용자의 public profile을 보는 viewer의 위치 권한을 검사하는 것이 아니라, 해당 위치를 등록한 owner의 공개 데이터 상태를 표시합니다.

이 정책을 수정할 때는 local state만 지우고 서버 값을 남겨두는 식으로 바꾸면 안 됩니다. 네트워크 요청이 실패하더라도 화면의 위치는 즉시 숨겨야 하며, 서버 cleanup 재시도 정책이 필요하면 별도 설계로 다뤄야 합니다.

#### 15개 locale i18n

지원 primary UI locale:

| 코드 | 언어 |
| --- | --- |
| ko | 한국어 |
| en | 영어 |
| ja | 일본어 |
| zh-CN | 중국어 간체 |
| zh-TW | 중국어 번체 |
| fr | 프랑스어 |
| de | 독일어 |
| es | 스페인어 |
| pt | 포르투갈어 |
| it | 이탈리아어 |
| ru | 러시아어 |
| ar | 아랍어 |
| hi | 힌디어 |
| th | 태국어 |
| vi | 베트남어 |

위치 등록·권한 안내·오류·지도 제목·빈 상태·지도 attribution copy를 모두 15개 locale에 넣었습니다. 지원되지 않는 locale은 primary locale로 매핑한 뒤 영어를 최종 fallback으로 사용합니다.

### 5.4 한국어로 먼저 보였다가 영어로 바뀌던 위치명

#### 증상

영어 사용자가 한국어 사용자 profile을 열면 처음에는 저장된 한국어 fallback이 보였다가 영어로 바뀌었습니다. 화면을 나갔다가 다시 들어오면 다시 한국어가 보이는 경우도 있었습니다.

#### 원인

OpenStreetMap Nominatim reverse geocoding을 viewer locale의 Accept-Language로 비동기 요청하고 있었는데, 비동기 응답이 오기 전에 profile fallback으로 상태를 다시 덮는 effect race가 있었습니다. 첫 진입은 요청 응답이 마지막에 도착하면 영어가 되었지만, 재진입·cache hit에서는 지연 reset이 localized result를 덮을 수 있었습니다.

#### 반영 내용

커밋 1352c08d에서 delayed reset을 제거했습니다.

- profile fallback을 loading 중의 초기 표시값으로 사용합니다.
- localized reverse-geocode 결과가 같은 좌표에 대한 응답이면 최종 표시값이 됩니다.
- locale·좌표가 바뀌면 해당 요청을 취소하고 새 요청만 반영합니다.
- 좌표를 반올림한 언어별 cache key를 사용합니다.

따라서 영어 viewer가 한국인 profile을 보면 위치 버튼은 Seoul, South Korea처럼 viewer locale 기준으로 표시되는 것이 목표입니다. 이 호출은 AI 호출이 아니라 Nominatim HTTP reverse-geocoding 호출입니다. 별도 Gemini API 호출은 없습니다. 다만 OSM Nominatim 사용 정책과 rate limit은 지켜야 하며, 모든 클라이언트가 무제한으로 호출해도 되는 서비스라는 뜻은 아닙니다.

### 5.5 OSM 지도와 Google Maps Embed 전환

#### OSM에서 관찰한 한계

OSM Nominatim의 reverse geocoding response는 Accept-Language에 따라 Seoul, South Korea처럼 바꿀 수 있지만, OSM 표준 tile의 지명 표기는 지역명 원어가 우선되는 경우가 많습니다. iframe의 lang만 바꾼다고 지도 tile의 모든 지명이 viewer locale로 바뀐다고 보장할 수 없습니다.

#### 현재 구현

커밋 05be12d2에서 지도 iframe을 Google Maps Embed로 바꾸었습니다.

- reverse geocoding은 여전히 Nominatim입니다.
- 지도 표시만 Google Maps Embed API의 /maps/embed/v1/place를 사용합니다.
- q 또는 좌표 center, zoom 12, viewer locale의 language를 넣습니다.
- iframe에는 strict-origin-when-cross-origin referrer policy를 적용합니다.
- Google key가 없으면 fallback 지도/안내를 표시할 수 있습니다.

필수 environment 이름:

    NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY

이 키는 Gemini, AdMob, Firebase, OAuth key가 아닙니다. WebView에서 지도 iframe을 표시하기 위한 browser-visible Maps Embed key입니다. Google Cloud에서 Maps Embed API를 활성화하고, billing account와 API key를 준비한 뒤 다음 제한을 적용해야 합니다.

- API restriction: Maps Embed API만 허용
- Application restriction: 실제 서비스 web origin 및 필요한 devbox origin만 허용
- key를 서버 secret처럼 생각하지 말고 origin/API restriction으로 피해를 줄임
- Railway/Vault 변수명은 위 이름과 정확히 일치시킴

Google 공식 문서:

- https://developers.google.com/maps/documentation/embed/quickstart
- https://developers.google.com/maps/api-security-best-practices

Google Maps Embed API의 과금·무료 조건은 Google Cloud console의 현재 billing/usage 정책을 기준으로 다시 확인해야 합니다. 지도 타일 운영비, Embed API billing account, Nominatim reverse-geocoding 정책은 서로 다른 문제입니다.

### 5.6 iOS linker 오류와 Google Mobile Ads

사용자가 말한 Google Mobile Ads는 광고 SDK인 AdMob입니다. 지도용 Google Maps Embed key와는 별개입니다.

관련 수정:

- 커밋 cccdb1bd
- mingle-app/rn/ios/Podfile에서 RCT_USE_PREBUILT_RNCORE를 0으로 설정
- Podfile.lock 재생성
- React Native core source를 직접 빌드하여 iOS linker 오류를 피하는 방향

AdMob environment는 RN_ADMOB_* 계열이고, 지도 key를 이 변수에 넣으면 안 됩니다. 반대로 NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY를 AdMob 설정으로 취급해서도 안 됩니다.

이 쓰레드에서 확인된 iOS TestFlight 업로드 기록은 version 2.0.0, build 83, upload record ID f262255b-9e61-4008-9395-aff0ae5e7f38이며 당시 PROCESSING 상태였습니다. 이 기록은 최신 PR #206 merge 이후의 최종 릴리스 검증 완료를 뜻하지 않습니다. 지도 변경이 배포 web layer에만 반영되는지, release 앱이 embedded bundle을 사용하는지에 따라 native rebuild 필요 여부를 최종 확인해야 합니다.

## 6. Xcode 저장공간·CLI 개발 주의사항

### 6.1 삭제해도 되는 항목

| 항목 | 의미 | 삭제 판단 |
| --- | --- | --- |
| Project Build Data and Indexes | Xcode build cache/index | 삭제 가능. 필요할 때 Xcode와 빌드 도구가 다시 생성하며 다음 빌드가 느려질 수 있음 |
| Project Archives | 과거 .xcarchive와 배포 산출물 | 과거 IPA 재추출·dSYM·crash symbolication이 필요 없으면 삭제 가능 |
| iOS Device Support | 특정 iOS를 실행하는 실물 기기용 디버그 심볼 | 해당 OS 기기를 당장 쓰지 않으면 삭제 가능. 필요 시 다시 다운로드될 수 있음 |
| bridgeOS Device Support | 실물 iPhone 디버깅 지원 파일 | 해당 OS의 실물 기기를 쓰지 않으면 삭제 가능. simulator가 아님 |
| Command Line Tools | git, CocoaPods, xcodebuild 등 CLI 도구 | 유지해야 함. CLI로 iOS 빌드·개발을 계속한다면 삭제하지 않음 |

하단에 보인 iPhone14,7 항목은 simulator가 아니라 실제 기기 OS support입니다. 연결된 기기의 현재 OS가 26.6이고 목록의 26.2.1·26.3.1을 쓰지 않는다면 예전 support는 정리할 수 있습니다. 다만 같은 OS 기기를 다시 연결하면 재다운로드가 필요할 수 있습니다.

Project Build Data and Indexes는 “삭제하면 즉시 다시 생긴다”가 아니라, 필요한 다음 Xcode/xcodebuild 작업 시 다시 생성됩니다. 소스 코드나 프로젝트 설정을 삭제하는 것이 아닙니다.

Project Archives는 CLI 빌드가 동작하는 데 필수는 아닙니다. 다만 TestFlight 이전 archive에서 IPA나 dSYM을 다시 꺼낼 계획이 있으면 보관해야 합니다.

## 7. Prisma migration과 DB 운영 주의사항

### 7.1 절대 하지 말아야 할 것

- migration directory를 삭제하거나 이름을 바꾸지 않습니다.
- migration 순서를 임의로 재정렬하지 않습니다.
- 실제 DATABASE_URL을 확인하지 않고 db reset을 실행하지 않습니다.
- production migration이 이미 적용됐는지 확인하지 않고 같은 SQL을 재적용하지 않습니다.
- prisma generate만 실행하고 migration이 적용됐다고 간주하지 않습니다.
- 현재 브랜치에 없는 migration을 main 워크트리에서 임의로 만들어 섞지 않습니다.

스키마 변경이 필요한 다음 작업은 반드시 current worktree에서 prisma migrate dev로 migration 파일을 만들고, 같은 방식으로 local DB에 적용합니다.

### 7.2 PR #206 및 현재 브랜치의 DB 체크

첨부된 PR #206 인수인계 문서는 production migration이 수동 적용되었고 기존 1.1.4 데이터/API에는 영향이 없다고 기록하고 있습니다. 그러나 현재 target database의 실제 적용 상태는 다음 쓰레드에서 다시 확인해야 합니다.

- Prisma migration history
- app_conversation_channel_members와 관련 member columns
- member status/selected languages
- pending invitee fields
- profile location fields
- handle finalization 이후 legacy username column 상태

동일 timestamp인 20260820100000 migration directory 두 개는 모두 필요합니다. 하나를 지우면 fresh migration과 production history가 갈라질 수 있습니다.

## 8. Devbox·Vault·모바일 실기기 검증

### 8.1 기본 원칙

- Mingle 서버를 켤 때는 devbox를 사용합니다.
- 스크립트는 현재 작업 워크트리의 scripts/devbox를 사용합니다.
- main 워크트리의 server/env와 섞지 않습니다.
- local Vault는 HTTPS가 아니라 HTTP일 수 있습니다.
- shell에 잘못된 VAULT_ADDR가 남아 있으면 http: server gave HTTP response to HTTPS client 오류가 납니다.

대표적인 local Vault 실행 예:

    VAULT_ADDR=http://127.0.0.1:8200 scripts/devbox up --profile device --tunnel-provider cloudflare

Vault에 이미 있는 값을 보존하면서 일부만 갱신해야 하면 kv put보다 kv patch를 우선 검토합니다. kv put은 전체 secret object를 덮어쓸 수 있으므로, 값을 확인하지 않고 blind put하면 안 됩니다.

### 8.2 안정적인 tunnel 조건

모바일 OAuth와 WebSocket 검증에는 quick tunnel을 permanent callback 주소로 사용하면 안 됩니다. Cloudflare named tunnel과 고정 hostname을 사용해야 합니다.

historical device profile에서 확인된 구성:

- web: port 10058
- STT: port 12058
- messaging: port 14058
- web hostname: mingle-app-devbox.photo-for-passport.com
- STT hostname: mingle-stt-devbox.photo-for-passport.com
- messaging WebSocket hostname: mingle-messaging-devbox.photo-for-passport.com/conversation-events

현재 scripts/devbox가 shared secret/messaging 설정을 어떻게 읽는지는 반드시 현재 worktree에서 확인합니다. messaging hostname 값이 비어 있으면 real-time 검증을 시작하지 않습니다.

OAuth callback은 다음을 기준으로 확인합니다.

- Google: /api/auth/callback/google
- Apple: Google과 별도의 Apple callback·설정
- iOS에서 Apple이 된다고 Android Google OAuth 설정이 자동으로 맞는 것은 아님

### 8.3 release 앱 주의

Release 앱이 embedded JavaScript bundle을 사용하는 경로라면 Metro가 없어도 실행될 수 있지만, web 변경이 즉시 반영된다고 가정하면 안 됩니다. 현재 release entry가 deployed web을 로드하는지 embedded bundle을 로드하는지 확인한 뒤 native rebuild 필요 여부를 결정합니다.

기기 검증 순서:

1. 기존 앱을 삭제하고 clean install합니다.
2. iOS/Android 앱 version과 build를 확인합니다.
3. 실제 2계정으로 로그인합니다.
4. profile -> message -> room -> back 흐름을 확인합니다.
5. multi-member room message 저장·수신·목록 fanout을 확인합니다.
6. WebSocket 실패 시 polling fallback을 확인합니다.
7. 위치 권한 허용·거부·설정에서 revoke 후 복귀를 확인합니다.
8. Instagram 설치·로그인·미설치 matrix를 확인합니다.
9. Android OS back과 iOS edge-swipe를 각각 확인합니다.

## 9. 검증 결과와 검증 범위

### 9.1 이 쓰레드에서 직접 확인된 결과

PR #206 merge 전의 부모 기준 코드에서 다음 검증을 수행했습니다.

- profile 관련 targeted test: 5개 통과
- 전체 unit test: 118 files, 991 tests 통과
- targeted ESLint 통과
- TypeScript noEmit 통과
- git diff --check 통과
- release web build 통과
- release web build에서 272 static pages 생성 확인

이 결과는 PR #206 merge 전 부모 기준 검증입니다. 현재 f307a434 merge 이후 전체 suite와 실제 device 검증을 다시 실행한 결과가 아닙니다.

### 9.2 PR #206 인수인계 문서에 기록된 결과

첨부 문서 기준:

- app-conversations test 13/13 통과
- TypeScript 검사 통과
- ESLint 검사 통과
- real local DB membership check 수행
- iOS/Android release build 및 install 수행
- iOS/Android version 2.0.0, build 82 기록
- iPhone 14 및 Android SM-G960N에서 Devbox device test 수행

이 결과도 “첨부 문서가 보고한 결과”로 취급해야 하며, 현재 branch와 Railway production에 그대로 재현되었다고 자동 간주하면 안 됩니다.

### 9.3 아직 완료로 표시하면 안 되는 검증

- PR #206 merge 이후 전체 unit/typecheck 재실행
- Railway 실제 deploy 및 /railway/health 200
- messaging realtimeConfigured=true
- 두 계정의 실제 WebSocket message send/receive
- non-member session key message rejection
- profile에서 새 room/기존 room 이어하기와 newest message 선택
- profile/participant/hamburger surface가 이동 후 history에 남지 않는지
- 이동 후 room back이 conversation list로만 돌아가는지
- keyboard auto-focus 및 iOS gesture replay 회귀
- Google Maps key가 모든 환경에서 적용되는지
- Android Instagram 3조건 matrix
- 권한 revoke 후 location DB cleanup
- 최종 TestFlight/Internal testing 업로드 및 store submission

## 10. 다음 쓰레드에서 해결해야 할 남은 작업

### P0: 현재 branch와 운영 경로 확인

1. current worktree에서 branch와 HEAD를 확인합니다.
2. PR #206 merge 이후 파일 상태를 확인합니다.
3. Railway가 PR #203 head의 최신 커밋을 배포하는지 확인합니다.
4. /railway/health를 호출합니다.
5. app, STT, messaging의 aggregate health와 realtimeConfigured를 확인합니다.
6. stale WebSocket URL과 proxy route를 제거·수정합니다.

### P0: 실제 2계정 멀티멤버 검증

- normal member send/receive
- 새 방 생성
- 기존 방 이어하기
- 동일한 1:1 duplicate room에서 최신 message 기준 선택
- group room target set mismatch 재사용 방지
- pending invitee materialization
- invalid/nonexistent invitee rejection
- non-member session key rejection
- 1:1 block
- 3명 이상 group에서 block 격리
- WebSocket failure 후 polling fallback

### P1: profile/navigation 회귀

- My Page -> public profile -> message
- conversation avatar -> profile -> message
- hamburger participants -> profile -> message
- notification -> profile
- follower/following -> profile
- profile share open/close
- current room으로 다시 선택했을 때 현재 room 유지
- 다른 room으로 이동했을 때 [list] -> [room]으로 history reset
- Android hardware back
- iOS edge-swipe
- keyboard가 방 전환 직후 자동으로 뜨지 않는지

### P1: 위치·지도

- My Page 최초 진입 시 권한 확인
- 권한 granted 상태에서 기존 위치 유지
- 위치 사용 버튼을 누를 때만 permission request
- denied/blocked/unavailable 시 화면과 서버 값 초기화
- 설정 앱에서 권한을 끄고 Mingle로 복귀했을 때 cleanup
- 다른 사용자의 위치 공개 흐름
- 15개 locale의 copy
- 영어 viewer의 Seoul, South Korea 표시
- OSM reverse geocode 호출과 Google map embed 호출의 역할 분리
- Maps Embed API key restriction과 Railway/Vault 변수명 확인

### P1: release

- iOS linker 변경을 포함한 clean archive
- TestFlight build version/API namespace 확인
- Android internal test build version/API namespace 확인
- 앱 내부에서 legacy 1.1.4 route가 남아 있지 않은지 확인
- app store submission 전 실제 native back, OAuth, STT, location 권한 확인

## 11. 다음 쓰레드에서 피해야 할 접근

- /Users/nam/mingle main 워크트리에서 서버를 켜고 current worktree 결과로 착각하기
- quick Cloudflare tunnel URL을 OAuth callback이나 모바일 permanent config로 사용하기
- web, STT, messaging을 각각 다른 secret으로 띄우기
- Vault 값을 확인하지 않고 kv put으로 전체 secret을 덮어쓰기
- DATABASE_URL 확인 없이 DB reset
- migration file 삭제·이름 변경·순서 변경
- build 성공만 보고 OAuth·WebSocket·permission·back을 검증 완료로 표시하기
- Railway에 deploy하면서 proxy route를 확인하지 않기
- PR #206의 invite API/UI가 이미 완성되었다고 가정하기
- duplicate room을 제품 확인 없이 자동 merge하기
- Android back 문제를 tabs 전면 리팩토링으로 확대하기
- 2.0.0 기능을 1.1.4 namespace 또는 legacy fallback에 연결하기
- Google Maps key를 Gemini, AdMob, Firebase key로 혼용하기
- Nominatim reverse geocoding을 AI 호출 또는 무제한 무료 서비스로 설명하기
- viewer 권한과 location owner 권한을 같은 것으로 처리하기

## 12. 다음 쓰레드 시작용 실행 순서

### Step 1. 상태 고정

현재 worktree에서 다음을 확인하고 결과를 기록합니다.

    git status --short --branch
    git log -10 --oneline --decorate
    git branch -vv

branch가 codex/messenger-tabs-device-test가 아니거나 PR #206 merge commit을 포함하지 않으면, 임의로 작업하지 말고 origin 상태를 먼저 확인합니다.

### Step 2. 환경·서비스

- current worktree의 devbox 설명과 scripts/devbox를 읽습니다.
- local Vault 주소를 확인합니다.
- named tunnel hostname 세 개가 설정되어 있는지 확인합니다.
- app/messaging의 MINGLE_REALTIME_SECRET이 동일한지 값은 노출하지 않고 확인합니다.
- Google Maps Embed key는 NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY 이름으로 설정되었는지 확인합니다.

### Step 3. health

- web HTTP health
- STT WebSocket
- messaging WebSocket
- publish endpoint
- aggregate /railway/health
- realtimeConfigured

### Step 4. 실제 기기

- clean install
- iOS 2.0.0
- Android 2.0.0
- Google/Apple auth
- STT
- two-account room
- profile/location
- Instagram external navigation
- Android back/iOS edge-swipe

### Step 5. 그 다음에만 수정

실패한 surface와 로그를 하나의 원인으로 묶지 말고, 다음 경계를 먼저 분리합니다.

1. native OS layer
2. React Native WebView bridge
3. web history/SlideSurface
4. API namespace/auth
5. DB membership/permission
6. messaging WebSocket/proxy
7. external app/browser fallback

수정은 실패 경계에 가장 가까운 최소 파일부터 진행하고, UI/UX 변경이면 docs/ui-ux-codex-thread-history.md에도 이슈·원인·영향·검증 조건을 기록합니다.

## 13. 관련 문서와 기준 자료

- docs/feat-multi-member-rooms-context.md: PR #206 및 현재 통합 브랜치의 기존 상세 컨텍스트
- docs/ui-ux-codex-thread-history.md: 이 쓰레드에서 발생한 UI/UX 이슈의 누적 이력
- 첨부 파일: PR #206 feat/multi-member-rooms 인수인계 문서
- PR #203: codex/messenger-tabs-device-test의 2.0.0 릴리스 목적과 체크
- PR #206: Add channel membership for multi-member conversation rooms (Phase 0+1)
- Google Maps Embed API quickstart: https://developers.google.com/maps/documentation/embed/quickstart
- Google Maps API security best practices: https://developers.google.com/maps/api-security-best-practices

## 14. 새 쓰레드에 전달할 최종 지시문

이 문서를 먼저 읽고, /Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test에서 현재 branch와 HEAD를 확인하십시오. PR #206은 이미 codex/messenger-tabs-device-test에 merge되어 있고, PR #203은 아직 main merge 전일 수 있습니다. 먼저 Devbox named tunnel, Vault runtime, Railway health, MINGLE_REALTIME_SECRET 일치 여부를 확인한 다음 실제 iOS/Android 2계정 검증을 진행하십시오. 멀티멤버 권한·실시간·profile navigation·location privacy·Instagram fallback·Android back을 각각 검증하고, migration 삭제/reset과 tabs 전면 리팩토링은 피하십시오.
