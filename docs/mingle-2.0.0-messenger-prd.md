# Mingle 2.0.0 메신저화 기획서

## 문서 정보

| 항목 | 내용 |
| --- | --- |
| 상태 | Draft, 구현 착수 전 합의본 |
| 작성일 | 2026-08-07 |
| 기준 스레드 | Codex 스레드 「PR 92 메신저 뷰 복구」 |
| 참고 PR | [mingle PR #92](https://github.com/minglelabs/mingle/pull/92) |
| 구현 기준 | 최신 main, 기준 커밋 e701add3 |
| 목표 릴리즈 | 모바일 앱 2.0.0 |
| 모바일 API namespace | ios/v2.0.0, android/v2.0.0 |

이 문서는 PR 92의 방향을 최신 main에 맞게 다시 구현하기 위한 제품·기술 합의 문서입니다. 오래된 PR 브랜치를 그대로 병합하는 계획이 아니며, 현재 main의 대화 기능·네이티브 WebView 복원·릴리즈 라우팅을 보존한 상태에서 메신저 셸을 추가하는 것을 전제로 합니다.

## 1. 요약

Mingle의 모바일 앱 첫 화면을 메신저형 대화목록으로 정착시키고, 대화목록과 마이페이지를 하단 탭으로 연결합니다. 사용자는 앱에 들어오자마자 접근 가능한 대화를 확인하고, 대화방에 들어갔다가 목록으로 안정적으로 돌아오며, 마이페이지에서 프로필과 언어 설정을 관리할 수 있어야 합니다.

이번 2.0.0 범위의 핵심은 새로운 소셜 기능을 한 번에 만드는 것이 아니라, 기존 실시간 번역 대화 기능을 메신저의 기본 탐색 구조 안에 안정적으로 배치하는 것입니다.

핵심 결정은 다음과 같습니다.

1. PR 92 브랜치는 직접 병합하지 않고 최신 main에서 필요한 UX와 동작을 선별해 재구현합니다.
2. 네이티브 WebView의 첫 진입점은 대화목록입니다.
3. 하단 탭은 대화목록과 마이페이지 두 개로 시작합니다.
4. 대화방 열기·닫기·iOS 뒤로가기는 URL query와 WebView history가 서로 재진입을 일으키지 않도록 하나의 상태 흐름으로 관리합니다.
5. 앱 버전, API namespace, 웹 릴리즈 variant, STT runtime은 모두 2.0.0 릴리즈 라인으로 분리하고 기존 버전은 삭제하거나 덮어쓰지 않습니다.

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
- 기존 대화방의 STT, 번역, 검색, 생성, 이름 변경, 삭제 동작을 유지합니다.
- 대화방을 열고 닫는 과정에서 false open-error 알럿, history 점프, 자동 재진입이 발생하지 않습니다.
- 대화목록과 마이페이지를 모든 지원 locale에서 동일한 구조로 사용할 수 있습니다.
- 프로필 이름과 언어 설정을 저장하고 다시 불러올 수 있습니다.
- AdMob 배너와 safe-area·하단 탭 여백이 서로 겹치지 않습니다.
- iOS와 Android 실기기에서 devbox/ngrok으로 동일한 2.0.0 동작을 검증할 수 있습니다.
- 앱 버전과 API namespace가 항상 일치하도록 빌드·런타임 검증을 갖춥니다.

### 비목표

- PR 92의 오래된 코드를 그대로 복구하거나 브랜치 전체를 병합하지 않습니다.
- 이번 범위에서 그룹 채팅, 친구 그래프, 공개 대화 검색, 읽음 표시, 푸시 알림, 온라인 presence를 새로 만들지 않습니다.
- 기존 번역·STT의 의미나 모델 정책을 메신저화와 함께 변경하지 않습니다.
- 데스크톱 웹의 기본 탐색을 모바일 메신저 셸과 동일하게 강제하지 않습니다. 데스크톱 웹 변경은 별도 합의가 필요합니다.
- 기존 1.0.x, 1.1.x API·웹·STT 릴리즈를 제거하거나 동작을 바꾸지 않습니다.

## 4. 대상 사용자와 기본 정책

### 대상 사용자

1. 네이티브 WebView로 Mingle을 사용하는 비로그인 또는 인증 사용자
2. 기존 대화를 다시 열고 실시간 번역을 이어가려는 사용자
3. 마이페이지에서 언어·프로필 상태를 확인하려는 사용자
4. iOS·Android 실기기에서 새 릴리즈를 검증하는 QA 및 릴리즈 담당자

### 대화 접근 정책 초안

비로그인 네이티브 WebView에서 임의 대화를 공개하는 정책은 도입하지 않습니다. 서버가 현재 인증·tracking context에 대해 반환한 접근 가능 대화만 노출하고, 상세 조회 시에도 서버가 owner 또는 participant 권한을 다시 검증합니다.

- 클라이언트가 임의 conversation ID를 주입해 방을 여는 것은 허용하지 않습니다.
- 인증 context가 없거나 접근 가능한 목록이 없으면 대화목록 셸과 빈 상태를 표시합니다.
- 빈 상태에서 로그인 또는 새 대화 시작 CTA를 제공하는지, 최종 문구는 제품 확정이 필요합니다.
- 향후 공개·게스트 대화 정책은 2.0.0 메신저 셸 범위 밖의 별도 결정입니다.

## 5. 정보 구조와 주요 흐름

### 화면 구조

| 화면 | 경로 | 역할 |
| --- | --- | --- |
| 진입점 | /[locale] | 현재 release variant에 따라 대화목록으로 연결 |
| 대화목록 | /[locale]/conversations | 접근 가능한 대화 목록, 검색, 새 대화 시작 |
| 대화방 | /[locale]/conversations?conversation=ID | 목록 위에 열린 실시간 번역 대화방 |
| 마이페이지 | /[locale]/mypage | 프로필·언어·인증 상태 |

### 사용자 흐름

네이티브 앱 진입
→ locale 경로
→ 대화목록 셸 표시
→ 목록 데이터 백그라운드 refresh
→ 대화방 열기 또는 마이페이지 탭 선택
→ 대화방은 닫기·뒤로가기로 대화목록에 복귀

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
- 기존 검색, 새 대화, pull-to-refresh, 이름 변경, 삭제, running/paused 표시를 유지합니다.
- 빈 상태에서는 대화목록 셸을 유지하고, 로그인 또는 새 대화 CTA를 표시할 수 있어야 합니다.
- 목록 API 실패 시 이미 그려진 목록을 지우지 않고 재시도 가능한 상태를 제공합니다.
- 마지막 목록 행은 하단 탭, safe area, 하단 배너에 가려지지 않아야 합니다.

### M-02. 대화방 열기와 닫기

- 목록 행을 누르면 해당 대화방이 열리고 URL에 conversation=ID 상태가 반영됩니다.
- 사용자 탭으로 여는 경우 history entry는 한 번만 추가합니다.
- route restore, popstate restore, QA restore처럼 URL이 이미 방을 가리키는 경우에는 중복 push를 하지 않습니다.
- 실제 대화방이 열린 뒤 active 또는 paused 상태 PATCH가 실패해도 방 진입 실패로 간주하지 않습니다.
- 상태 동기화 실패는 비차단 방식으로 기록하고, 필요한 경우 재시도합니다.
- 새 대화 생성 직후의 read-after-write 지연으로 발생하는 일시적인 404·5xx는 재시도 정책으로 흡수합니다.
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
- 인증 사용자는 이름, 이미지, 언어 설정을 확인하고 변경할 수 있어야 합니다.
- 비로그인 사용자는 기본 이름·기본 아이콘·로그인 CTA를 봅니다.
- 로그인·로그아웃·계정 삭제의 최종 노출 범위는 기존 인증 UX를 재사용하되, 메신저 MVP에 필요한 수준으로 제한합니다.
- 언어 변경 후 현재 locale과 저장된 pageLanguage가 일치해야 합니다.
- 마이페이지에서 대화목록 탭을 누르면 보존된 native context와 함께 /[locale]/conversations로 이동합니다.
- 마이페이지에서는 AdMob 배너를 노출하지 않습니다.

### M-05. 프로필·언어 저장

현재 Prisma User 모델에 name, image, language, pageLanguage 필드가 있으므로 2.0.0의 기본안은 기존 필드를 재사용합니다.

- 인증 사용자 display name은 User.name, avatar는 User.image를 사용합니다.
- UI locale은 User.pageLanguage를 우선하고, 없으면 User.language와 device locale을 fallback으로 사용합니다.
- 인증 사용자 변경은 서버 저장을 기준으로 하며, 새 API가 필요하면 기존 account/preferences contract에 추가합니다.
- 비로그인 사용자의 메신저 셸 설정은 해당 WebView 기기 범위에서만 유지합니다.
- 인증이 없는 사용자 정보를 User에 새로 계정 데이터처럼 저장하지 않습니다.
- 기존 필드로 해결되지 않는 요구가 추가되면 구현 전에 Prisma schema 변경 여부를 재평가합니다. 마이그레이션이 필요할 경우 prisma migration dev로 생성하고 로컬 DB에도 적용해야 합니다.

### M-06. AdMob과 화면 여백

- 하단 탭의 첫 번째 탭인 대화목록 영역만 배너 노출 대상입니다.
- 마이페이지에서는 배너를 숨깁니다.
- 대화방은 별도 하단 탭이 아니라 대화목록 탭의 overlay이므로, 기존 conversation-zone 배너 정책을 유지할지 최종 시각 검수에서 확정합니다. 기본 구현안은 conversation-zone을 대화목록 탭의 일부로 취급합니다.
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
- 상세 조회·상태 변경·메시지 기록은 서버에서 동일한 권한을 재검증합니다.
- 클라이언트의 conversation query는 선택자일 뿐 권한 증명이 아닙니다.
- 401·403·404는 서로 다른 제품 상태로 기록하고, 모두 같은 open-error 알럿으로 합치지 않습니다.

### API 범위

2.0.0 namespace 아래에서 기존 대화 API와 메신저 셸에 필요한 계정·버전 계약을 동일하게 접근할 수 있어야 합니다.

- GET /conversations
- POST /conversations
- GET/PATCH/DELETE /conversations/:conversationId
- GET/PATCH /account/preferences
- POST /client/version-policy
- 기존 translate/finalize, tts, log/client-event 경로

공통 로직은 기존 handler를 공유하고, URL scope별 controller는 분리합니다. 응답 필드와 오류 code는 기존 동작을 우선 보존하며, 새 필드가 필요할 때는 contract test를 먼저 추가합니다.

## 10. 구현 단계

### Phase 0. 기준선 고정

- 최신 main에서 새 작업 브랜치를 생성합니다.
- PR 92 브랜치에서 필요한 화면·동작·문구만 체크리스트로 추출합니다.
- current main의 conversation-list, RN restore, banner zone, v1.1.4 route를 기준으로 회귀 테스트를 고정합니다.

### Phase 1. 메신저 셸

- 대화목록을 native first screen으로 정리합니다.
- BottomTabBar 공통 컴포넌트와 native query 보존 helper를 추가합니다.
- 목록 scroll clearance와 safe-area 계산을 연결합니다.
- 기존 대화목록 기능을 유지한 채 탭 상태만 추가합니다.

### Phase 2. 마이페이지

- /[locale]/mypage route와 비로그인 profile shell을 추가합니다.
- 인증 사용자 profile·language read/write를 연결합니다.
- 모든 지원 locale의 dictionary copy와 fallback을 추가합니다.
- 탭 이동과 language 변경의 full reload·history 결과를 검증합니다.

### Phase 3. 대화방 안정성

- open, close, popstate, route restore의 history state machine을 정리합니다.
- false open-error 알럿과 status PATCH race를 분리합니다.
- manual close suppression, custom location sync, native restore latch를 회귀 테스트합니다.
- 방 닫기 후 STT가 재시작하거나 같은 방이 재진입하지 않는지 확인합니다.

### Phase 4. 2.0.0 릴리즈 분리

- API controller, web entry, client behavior profile, STT runtime, RN config를 v2.0.0으로 추가합니다.
- iOS·Android 앱 version과 namespace 검증을 fail-closed로 연결합니다.
- v1.1.4 및 이전 release contract test를 유지합니다.

### Phase 5. 광고·디바이스 검증

- list/conversation/hidden banner zone을 탭 상태와 연결합니다.
- devbox device profile로 두 서버와 ngrok을 실행합니다.
- iOS와 Android에서 기존 앱 삭제·재설치, URL, 스타일, 배너, history를 차례로 검증합니다.
- 실제 UI/UX 변경과 발견된 문제는 docs/ui-ux-codex-thread-history.md에 기록합니다.

## 11. 수용 기준과 QA 시나리오

| 우선순위 | 시나리오 | 통과 기준 |
| --- | --- | --- |
| P0 | 비로그인 native cold start | 흰 화면·강제 마이페이지 redirect 없이 대화목록 셸과 빈 상태가 보임 |
| P0 | 접근 가능한 기존 방 열기 | 방이 열리고 URL·native restore가 같은 ID를 가리킴 |
| P0 | 방 닫기와 iOS 뒤로가기 | 대화목록으로 돌아가며 마이페이지로 점프하거나 방이 재진입하지 않음 |
| P0 | 방 진입 후 active/paused PATCH 실패 | 방을 닫지 않고 false open-error 알럿을 표시하지 않음 |
| P0 | 빠른 active→paused 연속 조작 | 오래된 응답이 최신 상태를 덮지 않음 |
| P1 | 대상 없음·권한 없음 | 방을 열지 않고 목록에 남으며 재시도 가능한 상태를 제공 |
| P1 | 네트워크 실패 | 현재 목록·방 화면을 보존하고 재시도 가능 |
| P1 | 대화목록→마이페이지→대화목록 | 두 탭이 실제 route를 바꾸고 native query가 보존됨 |
| P1 | profile·language 저장 | 인증 사용자는 재진입 후 복원되고, 비로그인은 같은 기기에서 복원됨 |
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
- conversation_open_succeeded
- conversation_open_rejected
- conversation_status_sync_failed
- conversation_close_completed
- conversation_reentry_suppressed
- messenger_tab_changed
- mypage_preference_saved
- native_banner_zone_changed
- native_runtime_namespace_mismatch

정식 수치 목표는 출시 전 운영 데이터 기준으로 확정합니다. 구현 직후부터는 다음 실패가 0건이어야 합니다.

- 앱 버전과 API namespace 불일치로 설치·실행되는 경우
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
| 2.0.0 파일 복제 누락 | API·web·STT·RN을 release matrix와 contract test로 관리 |
| 게스트 권한 정책 불명확 | 서버가 반환한 접근 가능 목록만 허용하고 공개 대화는 별도 결정 |
| 배너·safe area·하단 탭 충돌 | native zone과 content clearance를 하나의 계산 계약으로 관리 |
| 모바일 기기별 WebView 차이 | devbox ngrok 기반 iOS·Android 실기기 QA를 필수 gate로 지정 |
| 현지화 누락 | dictionary type과 지원 locale별 문구 검증을 구현 완료 조건에 포함 |

## 14. 오픈 질문

구현 착수 전에 다음 항목의 제품 결정을 확정해야 합니다.

1. 비로그인 사용자의 빈 상태 CTA는 로그인 유도와 새 대화 시작 중 무엇을 우선할까요?
2. 서버가 반환한 접근 가능 대화를 비로그인 native context에서도 허용할지, 인증 사용자만 허용할지 최종 권한 정책은 무엇인가요?
3. 마이페이지에서 display name을 사용자가 직접 수정할 수 있나요, 아니면 인증 provider 이름만 표시하나요?
4. 대화방 overlay에서도 conversation-zone AdMob을 유지할까요, 아니면 방에 들어가면 완전히 숨길까요?
5. 2.0.0에서 마이페이지에 반드시 포함할 인증 기능은 로그인만인가요, 로그아웃·계정 삭제까지인가요?
6. 지원 locale 목록과 언어 변경 후 기본 복귀 경로를 현재 i18n 정책과 동일하게 확정할까요?
7. 2.0.0의 internal/TestFlight/Play 내부 테스트와 일반 배포 순서를 어떻게 나눌까요?
8. 읽지 않은 메시지 수, 푸시 알림, 새 대화 초대 링크는 후속 메신저 Phase로 분리하는 것이 맞나요?

## 15. Definition of Done

- [ ] 최신 main에서 구현되며 PR 92 브랜치 전체 병합을 하지 않았습니다.
- [ ] native first screen, 대화목록, 대화방, 마이페이지, 하단 탭의 핵심 흐름이 수용 기준을 통과했습니다.
- [ ] 방 열기·닫기·iOS 뒤로가기·native restore에서 false alert와 자동 재진입이 없습니다.
- [ ] 프로필·언어 저장 정책과 게스트 권한 정책이 문서화되고 테스트되었습니다.
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
