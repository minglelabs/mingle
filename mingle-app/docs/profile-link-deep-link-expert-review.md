# Mingle 프로필 공유 링크 딥링크 검수 요청서

작성일: 2026-08-16  
대상 앱: Mingle iOS React Native 앱 2.0.0  
현재 TestFlight 빌드: 73  
현재 서버: `https://mingle-2-0-0-production.up.railway.app`  
현재 Git 커밋: `a8706c00` (`Harden repeated profile deep links`)

## 1. 검수 요청 요약

프로필 공유 링크의 브라우저 화면에서 **“앱에서 열기”를 처음 누르면 Mingle 앱이 열리고 대상 상대 프로필로 이동하지만, 같은 흐름에서 두 번째로 누르면 앱이 단순히 foreground로 올라오거나 기존 화면에 머물고 대상 프로필로 이동하지 않는 문제**가 계속 재현되고 있습니다.

TestFlight 72에서 1차 수정 후에도 문제가 남았고, TestFlight 73에서 아래의 추가 수정을 적용했지만 사용자가 여전히 동일한 증상을 보고했습니다.

현재 가장 필요한 것은 새로운 추측성 수정이 아니라, 다음 세 구간 중 어디에서 두 번째 요청이 사라지는지 확인하는 것입니다.

```text
Chrome의 “앱에서 열기” 클릭
        ↓
iOS가 URL을 Mingle에 전달
        ↓
AppDelegate / React Native Linking 이벤트
        ↓
WebView 프로필 라우팅
        ↓
/{locale}/users/{userId} 표시
```

특히 **두 번째 클릭의 URL이 iOS AppDelegate까지 도착하는지**를 먼저 확인해야 합니다. 현재 코드만으로는 사용자 기기에서 두 번째 요청이 어느 단계까지 도착했는지 확인할 수 있는 진단 로그가 부족합니다.

## 2. 작업의 원래 목적

Mingle에서 사용자의 프로필을 공유할 수 있어야 합니다.

### 정상 동작 목표

1. Mingle의 프로필 공유 화면에서 안정적인 HTTPS 프로필 링크를 생성합니다.
2. QR 코드에는 변경 가능한 handle이 아니라 변경되지 않는 `userId`를 사용합니다.
3. 공유 링크를 브라우저에서 열면 프로필 내용을 브라우저에 직접 보여주지 않고 Mingle 설치/실행 안내 화면을 보여줍니다.
4. Mingle이 설치되어 있으면 “앱에서 열기”를 눌렀을 때 Mingle이 열립니다.
5. 앱이 이미 실행 중이어도 해당 링크의 상대 프로필로 이동해야 합니다.
6. 앱이 완전히 종료된 상태에서도 링크를 통해 앱이 실행되고 해당 프로필로 이동해야 합니다.
7. 앱이 열려 있던 위치와 상관없이 새 프로필 화면이 하나의 navigation stack entry로 열려야 합니다.
8. 같은 링크 또는 다른 상대의 링크를 연속으로 열어도 매번 요청된 `userId`의 프로필이 표시되어야 합니다.
9. iOS에서는 App Store 설치 버튼에 실제 Apple 로고를 표시하고, Android에서는 Google Play 버튼을 표시합니다.

### 링크 형식

브라우저/QR의 공개 링크:

```text
https://mingle-2-0-0-production.up.railway.app/p/{userId}
```

브라우저의 “앱에서 열기”에서 사용하는 custom URL scheme:

```text
mingle://profile/{userId}?linkNonce={nonce}
mingleprofile://profile/{userId}?linkNonce={nonce}
```

앱 내부 WebView에서 최종적으로 열어야 하는 URL:

```text
https://mingle-2-0-0-production.up.railway.app/{locale}/users/{userId}
  ?nativeUi=1
  &nativeAuth=1
  &apiNamespace=ios/v2.0.0
  &nativeStt=1|0
  &profileLinkNonce={nonce}
```

`linkNonce`와 `profileLinkNonce`는 사용자를 식별하는 값이 아닙니다. 반복 요청이 동일 URL로 접혀서 무시되지 않도록 요청마다 구분하기 위한 값입니다. 실제 프로필 대상은 항상 immutable `userId`입니다.

## 3. 현재 사용자 증상

사용자가 보고한 실제 증상은 다음과 같습니다.

1. 상대 프로필 공유 링크를 Chrome에서 엽니다.
2. 브라우저의 Mingle 프로필 안내 화면에서 “앱에서 열기”를 누릅니다.
3. 첫 번째 클릭은 정상입니다.
   - Mingle이 열립니다.
   - 요청한 상대 프로필이 표시됩니다.
4. 같은 흐름에서 다시 “앱에서 열기”를 누릅니다.
5. 두 번째 클릭은 정상적인 프로필 이동으로 보이지 않습니다.
   - Mingle이 foreground로 올라오기만 하거나
   - 이미 열려 있던 기존 WebView 화면에 머물거나
   - 요청한 상대 프로필로 바뀌지 않습니다.

현재 사용자 표현은 “처음에만 상대 프로필이 열리고 그 뒤에 다시 하면 안 된다”입니다.

아직 다음 항목은 확정되지 않았습니다.

- 두 번째 클릭 시 Chrome이 실제로 custom scheme URL을 호출했는지
- iOS가 두 번째 URL을 AppDelegate에 전달했는지
- AppDelegate에서 React Native `Linking` 이벤트까지 전달됐는지
- React Native JS가 이벤트를 받았지만 WebView 라우팅을 실패했는지
- 같은 상대 프로필을 다시 연 것이어서 화면상 변화가 없었던 것인지
- Chrome 또는 WebView가 이전 JavaScript bundle을 캐시하고 있었는지

따라서 현재 단계에서 “iOS가 URL을 막는다” 또는 “WebView가 원인이다”라고 단정하면 안 됩니다.

## 4. 구현 및 이슈 히스토리

### 4.1 최초 프로필 공유/딥링크 구현

프로필 공유 화면과 공개 링크 화면을 추가했습니다.

- QR은 매번 생성하며 DB에 QR 이미지를 저장하지 않습니다.
- QR에는 공개용 HTTPS 링크를 넣습니다.
- 공개 링크는 `/p/{userId}` 형식입니다.
- 브라우저 페이지는 Mingle 설치/실행 안내만 표시합니다.
- iOS Universal Links용 AASA endpoint를 추가했습니다.
- Android App Links용 `assetlinks.json` endpoint를 추가했습니다.
- React Native에서 `Linking.getInitialURL()`과 `Linking.addEventListener('url')`을 사용했습니다.
- WebView가 준비되기 전 링크가 들어오면 `userId`를 pending 상태로 보관한 뒤 WebView 준비 후 이동하도록 했습니다.
- WebView 내부에서 custom scheme이 발생하는 경우 `onShouldStartLoadWithRequest`에서 가로채도록 했습니다.

관련 초기 커밋:

- `Route profile links through the WebView`
- `Align public profiles with My Page`

### 4.2 TestFlight 71 전후

프로필 공유 링크와 WebView 라우팅 기능이 포함된 네이티브 빌드를 TestFlight에 업로드했습니다.

이 시점의 핵심 구조는 다음과 같았습니다.

```text
Chrome HTTPS /p/{userId}
  → mingle://profile/{userId}
  → React Native Linking
  → WebView window.location.assign(/{locale}/users/{userId})
```

### 4.3 TestFlight 72 수정

커밋: `704291a0`  
메시지: `Make repeated profile links reopen reliably`

72번에서 적용한 수정:

1. 브라우저의 “앱에서 열기” 클릭마다 `linkNonce`를 붙였습니다.
2. 네이티브 앱이 WebView로 이동시킬 때마다 `profileLinkNonce`를 새로 생성했습니다.
3. WebView의 최종 destination URL이 이전 요청과 달라지도록 했습니다.
4. 테스트에서 custom scheme query와 native destination query를 검증했습니다.

목표는 다음 두 가지였습니다.

- iOS/Chrome이 같은 custom URL 재실행을 중복으로 판단하지 않게 하기
- WebView가 동일한 프로필 route를 no-op으로 판단하지 않게 하기

결과: 사용자가 TestFlight 72에서도 두 번째 “앱에서 열기”가 동작하지 않는다고 보고했습니다.

### 4.4 TestFlight 73 수정

커밋: `a8706c00`  
메시지: `Harden repeated profile deep links`

72번 수정만으로 해결되지 않았기 때문에 다음을 추가했습니다.

#### 브라우저 측

클릭 횟수에 따라 custom scheme을 번갈아 사용합니다.

```text
1회차: mingle://profile/{userId}?linkNonce=...
2회차: mingleprofile://profile/{userId}?linkNonce=...
3회차: mingle://profile/{userId}?linkNonce=...
```

#### iOS 네이티브 측

- `Info.plist`에 `mingleprofile` scheme을 추가했습니다.
- `AppDelegate.application(_:open:options:)`에서 프로필 URL을 UserDefaults에 기록합니다.
- Universal Link callback에서도 `/p/` URL을 기록합니다.
- React Native `NativeRuntimeConfigModule`에 pending profile link 조회/삭제 메서드를 추가했습니다.
- 앱이 active가 될 때 pending URL을 다시 소비하도록 했습니다.
- `Linking` 이벤트와 pending storage가 같은 URL을 중복 처리하지 않도록 raw URL 기준 dedupe를 추가했습니다.

#### Android 네이티브 측

- `AndroidManifest.xml`에 `mingleprofile://profile` intent filter를 추가했습니다.
- `MainActivity.onCreate()`와 `onNewIntent()`에서 프로필 URL을 기록합니다.
- `NativeRuntimeConfigModule`에서 pending URL을 조회/삭제할 수 있게 했습니다.

#### Apple 로고

브라우저 설치 안내 화면의 App Store 버튼에서 Lucide의 일반 사과 외곽선 아이콘을 제거하고, 채워진 Apple 로고 SVG를 직접 표시하도록 변경했습니다.

결과: TestFlight 73을 올린 뒤에도 사용자가 여전히 같은 문제를 보고했습니다.

## 5. 현재 코드 흐름

### 5.1 브라우저 버튼

파일:

`mingle-app/src/components/profile-link-install-screen.tsx`

현재 후속 구현은 브라우저의 기본 링크 이동을 사용합니다.

1. 실제 `<a href>` 요소를 렌더링해 Chrome의 사용자 클릭 activation을 유지합니다.
2. 클릭 직전에 `launchNonceRef`를 증가시키고 `href`에 새 nonce를 반영합니다.
3. 브라우저의 기본 anchor navigation으로 canonical `mingle://` scheme을 실행합니다.
4. 브라우저 버튼 자체에서는 `window.location.assign()`을 사용하지 않습니다. WebView 내부의 최종 HTTPS 이동은 native shell이 계속 `window.location.assign()`으로 처리합니다.

주의할 점:

- 이 코드는 브라우저 페이지가 최신 Railway bundle을 사용하고 있을 때만 적용됩니다.
- Chrome이 이미 이전 client bundle을 캐시하고 있다면 새 anchor/nonce 코드가 실행되지 않을 수 있습니다.
- `launchNonceRef`는 페이지가 새로 로드되면 0으로 초기화됩니다.
- 73번에서 추가했던 scheme 번갈아 사용은 canonical scheme을 매번 새 nonce로 실행하는 방식으로 정리했습니다.
- Chrome이 두 번째 URL을 실제로 앱에 전달했는지는 여전히 native trace로 확인해야 합니다.

### 5.2 React Native URL 수신

파일:

`mingle-app/rn/App.tsx`

현재 수신 경로는 세 가지입니다.

1. cold start: `Linking.getInitialURL()`
2. warm start: `Linking.addEventListener('url')`
3. native pending fallback: `NativeRuntimeConfigModule.getPendingProfileLink()`

프로필 URL이 파싱되면 다음과 같이 처리합니다.

```text
URL parse
  → userId 추출
  → WebView 준비 여부 확인
  → 미준비면 pendingProfileLinkUserIdRef에 보관
  → 준비됐으면 WebView에 window.location.assign(destination) 주입
```

현재 dedupe 기준은 raw URL 문자열이며, 동일 URL은 짧은 중복 전달 구간(1.5초)에서만 무시합니다.

```text
lastHandledProfileLinkRef.current === rawUrl
  && Date.now() - lastHandledProfileLinkAtRef.current < 1500
```

따라서 같은 raw URL은 한 번만 처리하고, nonce가 다른 URL은 새 요청으로 처리합니다.

### 5.3 iOS URL callback

파일:

`mingle-app/rn/ios/mingle/AppDelegate.swift`

현재 구현은 다음과 같습니다.

```text
application(_:open:options:)
  → NativeRuntimeConfigModule.recordIncomingProfileLink(url)
  → RCTLinkingManager.application(...)
```

앱이 완전히 종료된 cold start에서 launch option에 URL이 들어오는 경우에도 같은 pending 저장을 수행합니다. AppDelegate는 scheme, sequence, nonce 존재 여부를 native log에 남깁니다.

Universal Link는 다음 callback으로 들어옵니다.

```text
application(_:continue:restorationHandler:)
  → webpageURL 저장
  → RCTLinkingManager.application(...)
```

여기서 가장 중요한 미확인 지점은 **두 번째 custom scheme URL에서 이 AppDelegate callback이 실제로 호출되는지**입니다.

### 5.4 WebView 최종 이동

파일:

`mingle-app/rn/src/profileLink.ts`  
`mingle-app/rn/App.tsx`

최종 destination은 `/{locale}/users/{userId}`이며, `profileLinkNonce` query가 매번 달라집니다.

WebView 이동은 현재 아래 JavaScript를 주입합니다.

```js
window.location.assign("https://mingle-2-0-0-production.up.railway.app/ko/users/{userId}?...");
```

이 부분은 native WebView 내부에서 동작하므로 다음 가능성을 확인해야 합니다.

- 두 번째 요청 때 `webViewRef.current`가 유효한가
- `isPageReadyRef.current`가 false로 남아 pending에만 들어가는가
- `onLoadStart`가 기존 페이지를 다시 not-ready로 표시하는 타이밍 문제가 있는가
- WebView가 같은 pathname의 query 변경을 실제 navigation으로 처리하는가
- Next.js route가 새 query를 읽지 않고 이전 화면을 재사용하는가
- `onShouldStartLoadWithRequest`가 destination을 다시 가로채거나 잘못 허용하는가

## 6. 현재까지 확인된 사실

자동화/로컬 검증에서 확인된 내용입니다.

- 웹 unit test: 109개 파일, 940개 테스트 통과
- React Native Jest: 11개 suite, 57개 테스트 통과
- React Native TypeScript 검사 통과
- Next.js production build 통과
- iOS generic device Release archive 통과
- IPA export 통과
- App Store Connect validation 통과
- TestFlight upload 통과
- Railway production deployment가 커밋 `a8706c00` 기준 `SUCCESS`
- 현재 Git worktree clean
- 시뮬레이터는 사용하지 않았습니다.

중요하게도 위 검증은 **실제 iPhone의 Chrome → Mingle warm-start 딥링크 2회 연속 시나리오를 검증하지 않습니다.**

현재까지 확보하지 못한 증거:

- 실제 iPhone의 두 번째 `application(_:open:options:)` 호출 로그
- 두 번째 URL의 실제 scheme/nonce
- React Native `Linking` warm event 수신 로그
- pending URL 조회 결과
- `navigateWebViewToProfile()` 호출 로그
- WebView의 최종 `onNavigationStateChange` URL

## 7. 전문가가 우선 확인해야 할 가설

### 가설 A. 두 번째 클릭이 Chrome에서 iOS까지 도달하지 않음

가능한 원인:

- Chrome의 custom scheme 외부 실행 정책
- 브라우저의 `window.location.assign()` 방식이 사용자 activation을 잃음
- scheme query가 달라도 Chrome/WebKit이 앱 실행을 dedupe함
- `mingleprofile` scheme이 실제 설치된 73번 bundle에 등록되지 않음
- 사용자가 실제로는 이전 browser bundle의 버튼을 누르고 있음

확인 방법:

- AppDelegate의 open URL 로그 확인
- Chrome DevTools에서 두 번째 버튼 클릭 직전 `browser_open` 로그와 실행 URL 확인
- iOS 설치 앱의 Info.plist에서 `mingle`/`mingleprofile` 등록 여부 확인

### 가설 B. iOS callback은 오지만 React Native JS 이벤트가 누락됨

가능한 원인:

- `RCTLinkingManager` event emitter warm-start 전달 문제
- bridge가 inactive/transition 상태일 때 notification이 유실됨
- AppDelegate lifecycle과 scene lifecycle callback 차이
- pending storage는 기록됐지만 JS가 active 시점에 읽지 못함

확인 방법:

- AppDelegate 진입 직후 URL/sequence 로그
- `getPendingProfileLink()` 호출/반환 로그
- `Linking.addEventListener('url')` callback 로그
- 앱 active callback과 pending consume 순서 로그

### 가설 C. JS가 URL을 받지만 WebView 라우팅이 실패함

가능한 원인:

- `isPageReadyRef.current`가 false인 순간 pending이 갱신되지 않음
- WebView가 이미 다른 navigation 중이라 `injectJavaScript`가 무시됨
- `window.location.assign()` 주입은 성공했지만 Next route가 화면을 재사용함
- `onShouldStartLoadWithRequest`와 외부 URL 처리 callback 사이에 중복/경쟁이 있음
- `activeWebAppBaseUrl`과 실제 WebView origin이 서로 다름

확인 방법:

- `handleIncomingProfileLink()` 진입 로그
- parse 결과 `source`, `userId` 로그
- `navigateWebViewToProfile()`의 ready/ref 상태 로그
- 생성된 destination 전체 URL 로그
- WebView `onLoadStart`, `onLoadEnd`, `onNavigationStateChange` 로그
- 페이지의 실제 `window.location.href`를 native bridge로 전달

### 가설 D. 실제로는 같은 프로필을 다시 연 것이라 시각적 변화가 없음

가능한 원인:

- 첫 번째와 두 번째 링크의 `userId`가 동일함
- 앱은 실제로 destination을 다시 열었지만 같은 화면이라 사용자가 이동 실패로 판단함
- 프로필 화면 내부의 데이터 fetch/cache가 새 요청을 구분하지 않음

확인 방법:

- 서로 다른 두 명의 `userId`로 연속 테스트
- 첫 번째 대상 A, 두 번째 대상 B로 테스트
- WebView route pathname과 API 호출 대상 userId를 함께 비교

## 8. 반드시 지켜야 할 검수 주의사항

1. TestFlight 72가 아니라 반드시 **2.0.0 (73)** 을 사용해야 합니다.
2. Chrome의 기존 탭이 오래 열려 있으면 이전 JS bundle일 수 있으므로, 새 탭 또는 시크릿 탭에서 공유 링크를 다시 열어야 합니다.
3. 앱을 테스트하기 전 TestFlight에서 Mingle을 완전히 종료한 cold-start 케이스와, 이미 Mingle이 열려 있는 warm-start 케이스를 각각 분리해야 합니다.
4. 첫 번째 대상과 두 번째 대상을 서로 다른 사용자로 테스트해야 “같은 화면이라 변하지 않은 것”과 “라우팅 실패”를 구분할 수 있습니다.
5. 앱을 단순히 foreground로 올린 것인지, 실제로 두 번째 URL을 처리한 것인지 로그로 구분해야 합니다.
6. HTTPS Universal Link와 custom scheme “앱에서 열기”는 서로 다른 경로입니다.
   - QR/공개 링크 직접 클릭: HTTPS/AASA 경로
   - 브라우저의 “앱에서 열기”: custom scheme 경로
7. App Store 버튼의 Apple 로고 변경은 웹 화면 변경이며, 딥링크의 native callback 문제와 직접적인 관련이 없습니다.
8. API namespace는 앱 버전 정책상 `ios/v2.0.0`이어야 합니다. build number 73을 API namespace `ios/v2.0.0`과 혼동하면 안 됩니다.
9. 서버와 native binary를 따로 확인해야 합니다.
   - Railway: 최신 웹 JavaScript/버튼
   - TestFlight 73: iOS URL scheme/AppDelegate/React Native 코드
10. 사용자 ID, 인증 토큰, 프로필 개인정보를 진단 로그에 그대로 남기지 말고 필요한 경우 마지막 6자만 마스킹해서 기록해야 합니다.

## 9. 권장 진단 로그 설계

다음 이벤트를 하나의 `profile_deep_link_trace_id`로 묶어 기록하는 것을 권장합니다. trace ID는 매 클릭마다 새로 만들어야 합니다.

```text
web_profile_open_click
  - traceId
  - scheme
  - nonce
  - userIdHash
  - pageUrl

ios_app_delegate_open_url
  - traceId 또는 URL nonce
  - scheme
  - receivedAt

native_pending_profile_link_recorded
  - sequence
  - scheme
  - nonce

react_native_linking_event
  - scheme
  - nonce

react_native_pending_profile_link_consumed
  - sequence
  - scheme
  - nonce

profile_link_parsed
  - source
  - userIdHash

profile_link_webview_navigation_requested
  - userIdHash
  - destinationPath
  - profileLinkNonce
  - isPageReady
  - hasWebViewRef

profile_link_webview_load_start
  - destinationPath

profile_link_webview_load_end
  - destinationPath

profile_link_webview_navigation_state
  - currentPath
  - currentQueryKeys
```

진단 결과는 다음처럼 판정할 수 있습니다.

```text
web click 없음
  → Chrome/browser page cache 또는 버튼 실행 문제

web click 있음, AppDelegate 없음
  → iOS custom scheme 전달/등록/외부 실행 문제

AppDelegate 있음, Linking event 없음
  → React Native bridge/event emitter/lifecycle 문제

Linking event 있음, navigation requested 없음
  → JS parse/dedupe/active callback 문제

navigation requested 있음, WebView navigation state 없음
  → injectJavaScript/WebView navigation 문제

WebView navigation state 있음, 화면 대상 불일치
  → Next route/data cache 또는 profile page hydration 문제
```

## 10. 검수자가 답을 주었으면 하는 질문

1. iOS에서 앱이 이미 실행 중인 상태로 Chrome custom scheme을 두 번 호출할 때, query nonce가 달라져도 `application(_:open:options:)` callback이 항상 호출되는 것이 맞습니까?
2. RN New Architecture에서 `RCTLinkingManager`의 warm URL event를 AppDelegate callback과 함께 안정적으로 보장하려면 별도 native event queue가 필요합니까?
3. `window.location.assign()` 대신 `Linking.openURL()` 또는 별도 native module 호출을 사용해야 하는 경로가 있습니까?
4. `mingleprofile`처럼 두 번째 custom scheme을 등록하는 방식이 iOS에서 실효성이 있습니까, 아니면 근본 원인을 가리는 임시 우회입니까?
5. AppDelegate와 SceneDelegate 중 어느 callback이 현재 앱 lifecycle에서 실제로 호출되는지 확인할 방법은 무엇입니까?
6. WebView에서 같은 pathname에 query만 달라지는 `window.location.assign()`을 확실한 새 history entry로 만들려면 `pushState`, `reload`, `WebView source` 갱신 중 어떤 방식이 적절합니까?
7. 공개 HTTPS 링크를 직접 탭하는 Universal Link 경로와 브라우저 버튼의 custom scheme 경로를 하나의 deferred deep-link 흐름으로 통합해야 합니까?
8. 현재 구조에서 앱이 열린 뒤 WebView가 준비되기 전 여러 profile URL이 들어올 때, 마지막 URL만 유지하는 것이 제품 요구에 맞습니까?

## 11. 검수 완료 기준

아래 시나리오가 모두 성공해야 합니다.

### iOS cold start

- Mingle 강제 종료
- Chrome에서 상대 A의 `/p/{userIdA}` 열기
- “앱에서 열기” 클릭
- Mingle이 실행되고 A 프로필 표시

### iOS warm start, 다른 사용자

- Chrome으로 복귀
- 상대 B의 `/p/{userIdB}` 열기
- “앱에서 열기” 클릭
- Mingle이 foreground가 되고 B 프로필 표시
- A 프로필에 그대로 남아 있으면 실패

### iOS warm start, 같은 사용자

- 동일한 `/p/{userIdA}` 페이지에서 “앱에서 열기”를 두 번 클릭
- 두 번째 클릭도 native URL callback 또는 WebView route 로그가 남아야 함
- 화면이 같더라도 요청이 무시되지 않았음을 로그로 확인

### iOS WebView 내부 경로

- Mingle 안에서 프로필 공유 화면을 엽니다.
- custom scheme 실행이 WebView request interception으로 들어오는지 확인합니다.
- 앱 전체를 닫지 않고 다른 프로필 링크를 연 뒤 대상 프로필이 변경되는지 확인합니다.

### 브라우저 설치 안내

- iOS에서 App Store 버튼에 채워진 Apple 로고가 보이는지 확인합니다.
- Android에서 Google Play 버튼과 Play 아이콘이 보이는지 확인합니다.
- 앱 미설치 상태에서는 앱 실행 실패 후 설치 안내가 정상인지 확인합니다.

## 12. 현재 결론

현재 결정한 후속 방향은 Chrome을 실제 사용 경로로 전제하고 다음 네 가지를 함께 적용하는 것입니다.

1. 브라우저의 `window.location.assign()` 대신 실제 anchor 기본 이동을 사용해 클릭 activation을 보존합니다.
2. scheme을 번갈아 바꾸는 임시 우회는 제거하고 canonical `mingle://` + 매 클릭 nonce를 사용합니다.
3. native pending 소비를 앱 active 직후와 짧은 재시도 구간에서 반복해 warm-start 이벤트 순서 경쟁을 완화합니다.
4. 브라우저 클릭, AppDelegate 기록, Linking 수신, pending 소비, WebView route 주입을 `[MingleProfileLink]` trace로 남깁니다.

이 변경은 특정 브라우저 원인을 확정한 것이 아니라, 사용자가 실제로 사용하는 Chrome 경로에서 user activation과 native pending fallback을 강화한 것입니다. TestFlight 74에서 실제 iPhone의 `Chrome click → AppDelegate → Linking/pending → WebView navigation` trace를 확인한 뒤, 남아 있는 실패 단계에 한정해 추가 수정해야 합니다.
