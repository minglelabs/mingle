# `feat/multi-member-rooms` 브랜치 컨텍스트

이 문서는 다음 Codex 쓰레드에서 작업을 이어갈 때 현재 브랜치의 목적, 이미 반영된 변경, 검증 상태, 남은 이슈와 주의사항을 빠르게 복원하기 위한 인수인계 기록입니다.

기록 기준일: 2026-08-22

## 1. 브랜치와 워크트리

- 작업 워크트리: `/Users/nam/.codex/worktrees/mingle/pr-206-device-test-rebased`
- 작업 브랜치: `feat/multi-member-rooms`
- 관련 PR: `minglelabs/mingle#206`
- 통합 기준이 된 부모 브랜치: `codex/messenger-tabs-device-test`
- 기록 전 기준 커밋: `963d38f1` (`feat: split conversation realtime into messaging service`)
- 기록 전에는 `origin/feat/multi-member-rooms`와 로컬 HEAD가 일치했고, 소스 변경사항은 깨끗했습니다.
- `/Users/nam/mingle`은 별도의 main 워크트리입니다. 이 브랜치의 개발·서버 실행·검증은 반드시 위 워크트리에서 해야 합니다.

이 브랜치는 처음부터 하나의 작은 기능만 담은 브랜치가 아닙니다. PR #206의 멀티멤버 대화방 데이터 모델을 중심으로, 부모 브랜치의 디바이스 테스트 변경, 프로필·위치 기능, 내비게이션 표면 전환, 대화방 재사용, 실시간 메시지 전달까지 함께 통합된 장기 작업 브랜치입니다.

## 2. 현재 브랜치의 목적과 반영 범위

### 2.1 멀티멤버 대화방

기존 대화방이 방 소유자 중심으로 동작하던 구조를 멤버 중심으로 확장하는 것이 핵심 목적입니다.

- `app_conversation_channel_members`를 사용해 대화방과 멤버의 관계를 관리합니다.
- 기존 대화방은 마이그레이션에서 소유자를 첫 멤버로 backfill합니다.
- 소유자는 대화방 owner/admin 역할을 유지합니다.
- 멤버별 상태와 `paused_at`을 관리할 수 있습니다.
- 멤버별 표시 언어(`display_language`)와 선택 언어(`selected_languages`)를 관리합니다.
- 아직 실제 멤버 row가 없는 초대 대상은 대화방의 `pending_invitee_user_ids`에 보관하고, 첫 메시지가 생성될 때 멤버로 materialize합니다.
- 멤버가 2명 이상인 방의 제목·언어·상태·선택 언어는 멤버 정보의 합집합/집계 규칙을 사용합니다. 혼자만 있는 방은 기존 채널 단위 동작을 유지합니다.
- 차단 관계는 정확히 2명의 실제 멤버로 이루어진 1:1 방에서는 사진 숨김과 메시지 차단에 영향을 줍니다. 3명 이상인 방 전체를 차단 한 명 때문에 종료시키면 안 됩니다.

### 2.2 프로필과 내비게이션

프로필 상세 화면은 부모 화면을 유지한 `SlideSurface` 오버레이 모델로 통일하는 방향입니다.

프로필 진입점은 다음을 모두 고려해야 합니다.

- 탐색 탭 검색 결과
- 대화방 상단/메시지의 프로필 사진
- 대화방 햄버거 메뉴의 참여자 목록
- 알림 패널
- My Page 팔로우 목록

프로필 공유도 프로필 위에 중첩된 오버레이로 표시합니다. iOS 엣지 스와이프 백은 현재 떠 있는 surface만 닫아야 하며, Android OS back은 프로필 사진 미리보기와 같은 최상위 레이어를 먼저 닫아야 합니다.

### 2.3 프로필에서 메시지 보내기

프로필 상세의 메시지 보내기 흐름은 기존 화면의 위치 스택을 그대로 타고 다른 대화방으로 이동하는 방식이 아니라, 대화 진입 목적에 맞게 단순화하는 방향으로 정리되어 있습니다.

- 이미 재사용 가능한 방이 있으면 새로 만들기/이어하기를 묻는 모달을 표시합니다.
- 이어하기를 선택하면 `app_messages.created_at` 기준으로 가장 최근 메시지가 있는 대화방을 선택합니다. 방 생성 시각이나 단순 배열 순서를 최신성의 기준으로 사용하면 안 됩니다.
- 이 규칙은 1:1 대화에도 적용합니다. 같은 두 사용자 사이에 대화방이 여러 개이면 이어하기일 때 최신 메시지 방으로 이동합니다.
- 새로 만들기를 선택하면 새 대화방을 만들고 그 방으로 이동합니다.
- 선택된 방이 현재 화면에 이미 열려 있는 방이면, 프로필·참여자·햄버거 surface만 닫고 현재 방에 남습니다.
- 선택된 방이 현재 방이 아니면 기존 위치 스택을 비우고 `[대화목록] -> [대화방]` 두 단계로 다시 쌓습니다.
- 따라서 새 방 또는 다른 기존 방으로 이동한 뒤 대화방에서 뒤로 가면 이전 프로필/참여자/햄버거/이전 방을 거치지 않고 대화목록으로 돌아가는 것이 목표 동작입니다.
- 직접 메시지 전환에는 popstate가 늦게 도착하거나 iOS가 gesture를 replay하는 상황을 막기 위한 settle/pending-navigation guard가 들어가 있습니다. 실제 기기에서 반복 검증해야 합니다.

관련 주요 커밋:

| 커밋 | 의미 |
| --- | --- |
| `a29c4759` | 새 메시지가 새로고침 없이 대화목록에 반영되도록 연결 |
| `fffb3000` | 기존 그룹방 재사용 여부를 묻는 흐름 추가 |
| `4344026f` | 중복 방 재사용을 최신성 기준으로 결정적으로 처리 |
| `1d16e488` | `app_messages.created_at` 기준으로 최신 방 선택 |
| `9ce06bb3` | 프로필에서 직접 대화로 전환할 때 history 보호 |
| `370a4e4d` | 프로필/메뉴/이전 방 위치 스택을 리셋하고 목록 -> 방으로 이동 |

초기의 문제는 `public-user-profile-screen.tsx`에서 메시지 보내기 후 `router.push()`를 직접 호출하면서 발생했습니다. 이 호출은 `SlideSurface`와 메뉴 depth가 관리하는 history marker를 거치지 않아 profile/menu state와 Next.js route entry가 서로 어긋났습니다. 그 결과 iOS 엣지 백에서 프로필과 참여자 목록이 다시 나타나고, 대화방 전환 시 composer가 자동 focus되어 키보드가 뜨는 문제가 있었습니다. 현재는 부모 콜백을 통해 대화 전환을 수행하고, 위치 스택 리셋/settle 방식을 사용합니다.

## 3. 실시간 메시징 구조

현재 방향은 STT 프로세스에 실시간 메시징을 얹는 것이 아니라, 코드와 런타임 책임을 `mingle-messaging`으로 분리하는 것입니다.

### 역할

- `mingle-app`: 인증, API, 대화방/멤버 조회, 메시지 저장을 담당합니다.
- `mingle-app`: 메시지를 DB에 commit한 뒤 `mingle-messaging`의 publish endpoint에 새 메시지 이벤트를 전달합니다.
- `mingle-messaging`: WebSocket `/conversation-events`와 HTTP `/conversation-events/publish`를 담당합니다.
- `mingle-stt`: STT 작업만 담당합니다. 메시징 WebSocket의 소유자가 아닙니다.
- 클라이언트는 messaging WebSocket에 구독하고, 연결이 끊기면 기존 polling fallback이 보조합니다.

코드 서비스를 분리했지만 사용량이 적은 현재는 Railway 한 인스턴스에서 web, STT, messaging 프로세스/포트를 함께 실행할 수 있습니다. 코드 유지보수상 책임을 분리하면서도 인프라 비용과 배포 단위는 당장 늘리지 않는 구성이 가능합니다.

### 포트와 프록시

Railway single-service 실행 기준 포트는 다음과 같습니다.

- web: `3000`
- STT: `3001`
- messaging: `3002`

`/stt`는 STT로, `/conversation-events`와 `/conversation-events/publish`는 messaging으로 전달되어야 합니다. 모든 HTTP를 `mingle-app`으로만 보내는 오래된 reverse proxy 설정을 사용하면 publish가 연결되지 않아 실시간 수신이 실패하고 polling만 동작할 수 있습니다.

주요 환경변수는 다음과 같습니다.

- `MINGLE_MESSAGING_URL`: `mingle-app`이 내부적으로 messaging publish endpoint를 호출할 주소
- `MINGLE_REALTIME_SECRET`: app과 messaging 사이의 publish 인증 및 realtime 인증에 사용하는 공통 secret

`MINGLE_REALTIME_SECRET`은 app과 messaging 양쪽에서 반드시 같은 값이어야 합니다. secret을 바꾼 뒤에는 관련 프로세스를 모두 재시작해야 이미 실행 중인 프로세스에 반영됩니다.

### 비회원 메시지 저장 P1

기존에는 `log-client-event-handler.ts`가 메시지를 저장하기 전에 차단 여부만 확인했고, `isMessageSenderBlockedInConversation`이 session key를 보낸 사용자가 실제 대화방 멤버인지 보장하지 않았습니다. 따라서 session key를 알고 있는 비회원이 메시지를 저장하고 멤버 materialize와 실시간 publish까지 유발할 수 있었습니다.

현재 브랜치에서는 메시지 저장 전에 대화방의 실제 멤버와 sender user id를 검증하는 방향으로 보완했습니다. 검증이 실패하면 메시지 저장, pending invitee materialize, realtime publish가 일어나면 안 됩니다.

다음 케이스는 반드시 확인해야 합니다.

1. 정상 멤버가 메시지를 보낼 수 있는지
2. session key가 없거나 잘못된 경우 거부되는지
3. session key는 맞지만 해당 방의 멤버가 아닌 사용자가 거부되는지
4. 1:1 차단 관계에서 기존 차단 정책이 유지되는지
5. 3명 이상 방에서 한 명의 차단 관계가 다른 멤버의 메시지까지 막지 않는지

## 4. 부모 브랜치에서 통합된 주요 기능

`cb7544f7`에서 `codex/messenger-tabs-device-test`를 현재 브랜치에 merge했습니다. 지도 기능만 들어온 것이 아니라 다음 변경도 함께 들어왔습니다.

- 프로필 위치 및 discovery source 관련 스키마/API/UI
- 프로필 surface와 프로필 이미지 preview의 native back 처리
- Android/iOS native runtime 및 back capability 전달
- 관리자 대시보드/metrics 관련 코드
- 회원 탈퇴 유예, 비활성화, 생년월일, 팔로우 알림 관련 기능
- 멤버 상태·언어·초대 대상 관련 멀티멤버 대화 기능
- 디바이스 테스트와 모바일 빌드 설정
- UI/UX 이력 문서 변경

따라서 이후 충돌을 해결하거나 기능을 수정할 때는 “지도 기능만 있는 부모 변경”으로 가정하면 안 됩니다. 부모 브랜치의 profile location, native back, account lifecycle 기능을 함께 보존해야 합니다.

## 5. 데이터베이스와 Prisma 주의사항

### 5.1 현재 마이그레이션 범위

현재 브랜치에는 user block/report, handle 전환, follow notification, profile image, admin metrics, language preference, conversation language, push token, birth date, deactivation, withdrawal, conversation channel members, member status, discovery source, profile location, selected languages, pending invitee 관련 마이그레이션이 포함되어 있습니다.

특히 다음 항목을 기억해야 합니다.

- `20260819230000`은 기존 대화방의 소유자를 멤버로 backfill하는 conversation member migration입니다.
- `20260820100000`에는 서로 다른 목적의 migration directory가 두 개 있습니다. timestamp가 같다는 이유로 둘 중 하나를 삭제하면 안 됩니다. directory명이 다르고 Prisma migration history에서 모두 필요합니다.
- `20260820140828_finalize_handle_schema`는 `app.app_users`의 legacy `username` column을 제거하는 finalization migration입니다.

### 5.2 handle finalization migration 복원 경위

로컬 DB를 초기화한 뒤 Apple/Google 로그인 문제가 발생했을 때, DB에는 존재하지만 현재 브랜치 working tree에는 빠져 있던 handle finalization migration이 원인 후보로 확인되었습니다. 이후 `2d784bb6`에서 다음 migration을 복원했습니다.

```sql
ALTER TABLE app.app_users
DROP COLUMN IF EXISTS username;
```

“오래된 migration처럼 보인다”는 이유만으로 migration 파일을 삭제하면 안 됩니다. 이미 적용된 DB와 현재 소스의 migration history가 어긋날 수 있습니다.

### 5.3 로컬 DB 초기화

DB 초기화는 로컬 테스트 DB에만 허용되는 파괴적 작업입니다.

- 실행 전에 반드시 `DATABASE_URL`의 host/database가 로컬 devbox DB인지 확인해야 합니다.
- 초기화하면 계정, 세션, 대화, 테스트 데이터가 모두 사라집니다.
- 초기화 후에는 Prisma generate와 migration 적용, 테스트 계정 재생성이 필요합니다.
- 운영 DB나 공유 DB를 대상으로 `prisma migrate reset`을 실행하면 안 됩니다.

스키마 변경이 있으면 프로젝트 정책대로 `prisma migrate dev`로 migration 파일을 만들고, devbox 로컬 DB에도 같은 migration을 적용해야 합니다. `prisma generate`만 실행해서 migration 누락을 해결했다고 판단하면 안 됩니다.

## 6. Devbox, Vault, 터널과 모바일 상태

### 6.1 서버 실행 원칙

Mingle 프로젝트의 백엔드와 모바일 로컬 검증은 일반적인 수동 서버 실행보다 devbox 흐름을 우선합니다.

- `scripts/devbox`를 반드시 현재 worktree에서 실행합니다.
- 서버를 `/Users/nam/mingle` main worktree에서 띄우면 다른 브랜치의 코드와 환경으로 테스트하게 됩니다.
- web, STT, messaging은 현재 devbox에서 각각 별도 포트로 실행되지만 같은 Railway 인스턴스에 함께 배치하는 것은 가능합니다.
- Release 모바일 앱은 Metro 개발 서버에 의존하지 않고 embedded JS bundle을 포함합니다. 따라서 Metro가 떠 있지 않다고 Release 빌드가 잘못된 것은 아닙니다.

기록 당시 devbox는 Cloudflare quick tunnel로 web, STT, messaging을 모두 띄운 상태였습니다. quick tunnel URL은 재시작할 때 바뀌므로 문서나 OAuth 설정에 영구값처럼 등록하면 안 됩니다. 다음 쓰레드에서는 먼저 `scripts/devbox status`로 현재 상태를 확인해야 합니다.

### 6.2 Cloudflare hostname

안정적인 OAuth와 모바일 재설치를 위해서는 quick tunnel보다 named Cloudflare hostname을 사용해야 합니다.

- web: `mingle-app-devbox.photo-for-passport.com`
- STT: `mingle-stt-devbox.photo-for-passport.com`
- messaging: 별도 hostname 필요. 제안값은 `mingle-messaging-devbox.photo-for-passport.com`

현재 devbox named tunnel 모드는 web, STT, messaging의 hostname과 Cloudflare token이 모두 있어야 합니다. `DEVBOX_CLOUDFLARE_MESSAGING_HOSTNAME`이 비어 있으면 named mode가 시작되지 않습니다.

현재 tunnel 구현은 각 프로세스가 별도 public endpoint를 사용하도록 되어 있으므로 web/STT/messaging에 같은 hostname을 재사용하면 안 됩니다. 사용자가 Cloudflare에 messaging hostname과 DNS를 등록한 뒤 메인 워크트리 `mingle-app/.env.local`에 공유 설정을 반영하고 `scripts/devbox bootstrap`으로 Vault에 업로드해야 합니다. 이후 named tunnel을 재시작한 다음 양쪽 모바일 Release 앱을 다시 빌드해야 합니다.

### 6.3 Vault secret

Vault CLI를 사용할 때 로컬 Vault 주소가 `http://127.0.0.1:8200`인지 확인해야 합니다. shell에 `https://127.0.0.1:8200`이 잡혀 있으면 잘못된 주소로 요청할 수 있습니다.

현재 `scripts/devbox.sh`는 messaging 전용 Vault path를 직접 읽는 것이 아니라 app runtime env 또는 STT runtime env에서 `MINGLE_REALTIME_SECRET`을 찾아 messaging 프로세스에 전달합니다. 따라서 `secret/mingle-messaging/dev`에 값을 새로 넣는 것만으로는 현재 devbox에 자동 반영된다고 볼 수 없습니다.

또한 `vault kv patch`는 기존 KV record가 있어야 합니다. path 자체가 없으면 404가 납니다. `vault kv put`은 record를 새로 만들 수 있지만 기존 key를 빠뜨리면 전체 record를 덮어쓸 수 있으므로, 운영/공유 secret path에서 무심코 사용하면 안 됩니다. 변경 후에는 devbox를 재시작해 secret을 다시 로드해야 합니다.

### 6.4 Google/Apple 로그인

Android에서 quick tunnel hostname으로 Google 로그인을 시도하면 등록된 callback hostname과 달라 `redirect_uri_mismatch`가 발생할 수 있습니다.

- Google callback 기본 경로는 `/api/auth/callback/google`입니다.
- 실제 callback URL은 현재 앱이 사용하는 web hostname + 위 경로입니다.
- named hostname을 쓰려면 Google OAuth client에 해당 exact callback URL을 등록해야 합니다.
- devbox 로그의 `google redirect sync skipped: failed to load oauth client` 경고는 이전 ngrok 실행 때도 관찰된 경고입니다. Cloudflare messaging 분리 때문에 새로 발생한 것으로 단정하면 안 되며, 자동 OAuth client URI 동기화가 client를 불러오지 못했다는 뜻입니다.
- Apple은 Google과 별도 provider/config입니다. iOS의 native Apple 로그인 경로와 Android의 browser callback 경로가 다를 수 있으므로, “iOS Apple이 됐다”는 사실만으로 Android Apple 설정까지 검증된 것은 아닙니다.

### 6.5 모바일 빌드

모바일 버전과 API namespace 버전은 항상 같아야 합니다. 현재 devbox status 기록은 다음과 같습니다.

- iOS API namespace: `ios/v2.0.0`
- Android API namespace: `android/v2.0.0`

Release 빌드 시 다음을 지켜야 합니다.

- iOS는 `Release` configuration으로 빌드합니다.
- Android는 `release` variant로 빌드합니다.
- Cloudflare URL을 바꿨다면 앱을 다시 빌드·설치해야 bundle에 새 URL이 들어갑니다.
- 빌드와 설치 성공만으로 로그인, realtime 수신, edge swipe가 검증된 것은 아닙니다. 실기기 기능 테스트가 별도로 필요합니다.
- 모바일 앱 버전과 API namespace가 어긋난 상태로 배포하면 안 됩니다.

기록 당시 연결된 디바이스에는 Android Release와 iOS Release가 각각 clean install되어 실행되었습니다. 다만 quick tunnel URL 기반이었고, Google OAuth callback과 실시간 수신의 최종 실기기 검증은 별도 수행해야 합니다.

## 7. 최근 검증 결과와 한계

마지막 기록 기준으로 다음 검증은 완료되었습니다.

- 웹 앱 테스트: 125개 파일, 1,104개 테스트
- `mingle-messaging` 관련 테스트: 16개
- STT 관련 테스트: 40개
- app build/typecheck 및 messaging HTTP/WebSocket 기본 통합 확인
- Android Release 빌드·설치·실행 성공
- iOS Release clean build·설치·실행 성공

다음은 아직 한계가 있습니다.

- Railway production deploy는 수행하지 않았습니다.
- Docker daemon이 없어 Docker build는 수행하지 못했습니다.
- 일부 lint 오류는 기존 unrelated 파일에 남아 있습니다. 전체 lint가 깨끗하다고 가정하면 안 됩니다.
- 실기기에서 새로고침 없이 상대방 메시지가 iOS와 Android 모두 안정적으로 들어오는지 최종 시나리오 테스트가 필요합니다. 과거 관찰에서는 iOS는 지연 후 수신되고 Android는 수신되지 않는 상태가 있었으며, 이후 secret/messaging 분리와 라우팅을 보완했습니다.
- profile -> message -> back, nested menu/participant -> profile -> message, Android photo preview OS back, composer keyboard focus는 자동 빌드 성공만으로 보장되지 않습니다.

## 8. 다음 쓰레드에서 우선 확인할 순서

1. 현재 위치가 `/Users/nam/.codex/worktrees/mingle/pr-206-device-test-rebased`인지 확인합니다.
2. `git status`, `git log --oneline -10`, `scripts/devbox status`로 브랜치와 runtime을 확인합니다.
3. Cloudflare에 messaging named hostname을 등록하고 메인 워크트리 `.env.local`의 `DEVBOX_CLOUDFLARE_MESSAGING_HOSTNAME`에 설정한 뒤 bootstrap합니다.
4. named Cloudflare tunnel로 devbox를 재시작하고 web/STT/messaging health와 WebSocket 연결을 확인합니다.
5. app/messaging 양쪽이 동일한 `MINGLE_REALTIME_SECRET`을 읽는지 확인합니다. secret 값 자체는 로그나 문서에 출력하지 않습니다.
6. named URL을 주입한 iOS/Android Release 앱을 clean install합니다.
7. 두 계정으로 다음을 테스트합니다.
   - 앱을 새로고침하지 않고 상대방 메시지가 iOS에서 수신되는지
   - 같은 시나리오가 Android에서도 수신되는지
   - WebSocket을 끊었을 때 polling fallback이 동작하는지
   - 비회원이 알려진 session key로 메시지를 저장할 수 없는지
8. 프로필 진입점별 새로 만들기/이어하기, 여러 1:1 방의 최신 메시지 선택, 현재 방 예외, `[대화목록] -> [대화방]` back 흐름을 검증합니다.
9. 문제가 있으면 먼저 web app 로그, messaging health/publish 로그, 클라이언트 WebSocket URL/namespace, `MINGLE_REALTIME_SECRET` 일치 여부를 확인합니다. 그 다음에 native back이나 UI history를 조사합니다.

## 9. 반드시 피해야 할 작업

- main worktree에서 서버를 띄운 채 이 브랜치의 모바일 앱을 테스트하지 않습니다.
- quick tunnel URL을 OAuth의 영구 callback으로 사용하지 않습니다.
- web/STT/messaging에 같은 Cloudflare hostname을 억지로 사용하지 않습니다.
- `MINGLE_REALTIME_SECRET`을 app과 messaging에 서로 다른 값으로 넣지 않습니다.
- Vault record 전체 key를 모른 채 `vault kv put`으로 기존 path를 덮어쓰지 않습니다.
- `DATABASE_URL` 확인 없이 로컬 DB reset을 실행하지 않습니다.
- 운영 DB에 `prisma migrate reset`이나 임의의 migration 삭제를 실행하지 않습니다.
- migration timestamp가 같다는 이유로 directory 하나를 삭제하지 않습니다.
- Release 앱이 설치됐다는 이유만으로 Metro/dev server나 실제 기능 검증이 끝났다고 판단하지 않습니다.
- Railway에 single-service proxy의 `/conversation-events`와 `/conversation-events/publish` 라우팅을 확인하지 않은 채 배포하지 않습니다.
- production deploy와 모바일 배포를 같은 단계로 묶어 자동 실행하지 않습니다. 먼저 local named tunnel 실기기 검증을 끝내야 합니다.

## 10. 상태 요약

현재 브랜치는 멀티멤버 대화방과 프로필/내비게이션 변경을 부모 디바이스 테스트 브랜치와 통합했고, 메시징 WebSocket을 `mingle-messaging`으로 분리한 상태입니다. 비회원 session key 메시지 저장 P1도 보완되어 있습니다. 다음 핵심 작업은 Cloudflare named messaging hostname 설정, 양쪽 Release 앱 재설치, iOS/Android realtime·OAuth·back 동작의 실기기 검증, 그리고 Railway reverse proxy/secret 설정 확인입니다.
