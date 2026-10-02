# 코인 + 인앱결제 구현 노트

기획서: [coin-iap-spec.md](coin-iap-spec.md). 이 문서는 구현된 내용, 운영에 필요한 설정, 기획서와 다른 점을 적는다.

## 켜는 순서

과금은 기본으로 꺼져 있다(`COIN_BILLING_ENABLED` 미설정). 꺼진 상태에서는 아무것도 기록하지 않고, 앱에 코인 UI도 보이지 않는다.

1. 마이그레이션 적용: `20261003090000_add_coins_and_iap` (테이블 10개 추가 + 단가표·상품 시드. 기존 테이블 변경 없음).
2. `COIN_INTERNAL_SECRET` 설정(웹 서버와 mingle-stt 양쪽). Railway 단일 서비스에서는 `COIN_CHARGE_URL`이 컨테이너 내부 앱 주소로 자동 설정된다. 서비스를 따로 띄우면 mingle-stt에 `COIN_CHARGE_URL=https://<앱>/api/internal/coins/charge`를 넣는다.
3. `COIN_BILLING_ENABLED=shadow`: 차감액을 계산해 `app_coin_usage_charges`에 `shadow=true`로 기록만 한다. 지갑은 그대로이고 차단도 없다. `/admin/coins` 대시보드에서 "그림자 모드 기록"으로 확인한다.
4. `/admin/coins` → 상품·단가표에서 노란색(메모가 `ASSUMED`로 시작) 단가를 실제 값으로 교체한다.
5. `COIN_BILLING_ENABLED=1`: 실제 차감과 잔액 0 차단이 시작되고 앱에 코인 UI가 나타난다.

## 환경변수

| 변수 | 위치 | 설명 |
|---|---|---|
| `COIN_BILLING_ENABLED` | 웹 | 미설정/0 = 꺼짐, `shadow` = 기록만, `1` = 적용 |
| `COIN_INTERNAL_SECRET` | 웹, STT | STT 과금 토큰 서명 + 내부 과금 API 인증 |
| `COIN_CHARGE_URL` | STT | 내부 과금 API 주소 |
| `COIN_STT_ALLOW_LEGACY_ANONYMOUS` | 웹 | `0`이면 계정 없는 1.x 클라이언트의 무과금 STT 예외를 없앤다(1.x 지원 종료 후) |
| `IAP_ALLOW_SANDBOX` | 웹 | 샌드박스 결제(TestFlight·심사·라이선스 테스터)로 코인 지급 허용. 운영 기본값은 거부. **App 심사 기간에는 `1`로 켜야 한다** |
| `IOS_IAP_BUNDLE_ID` | 웹 | 기본 `com.minglelabs.mingle.rn` |
| `ANDROID_IAP_PACKAGE_NAME` | 웹 | 기본 `com.minglelabs.mingle.rn` |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | 웹 | Play Developer API 서비스 계정(JSON 또는 base64) |
| `GOOGLE_PLAY_RTDN_TOKEN` | 웹 | Pub/Sub 푸시 URL의 `?token=` 값 |

## 스토어 설정 (코드 외)

- App Store Connect: 소모성 상품 5개: `coin_1000`($0.99), `coin_3000`($2.99), `coin_10000`($9.99), `coin_30000`($29.99), `coin_100000`($99.99). 서버 알림 V2 URL: `https://<앱>/api/webhooks/appstore` (Production·Sandbox 둘 다).
- Google Play Console: 같은 ID의 인앱 상품 5개. 실시간 개발자 알림 Pub/Sub 푸시 구독 URL: `https://<앱>/api/webhooks/googleplay?token=<GOOGLE_PLAY_RTDN_TOKEN>`. 서비스 계정에 주문 조회·관리 권한.
- iOS는 `pnpm rn:pods`로 `react-native-iap`(NitroIap) 팟을 설치해야 한다.
- 네이티브 변경이 있으므로 새 앱 버전과 네임스페이스 정렬이 필요하다(메모리 `mobile-release-procedure`).

## 구조

| 영역 | 위치 |
|---|---|
| 지갑·lot·원장(추가 전용), 일일 무료 충전, 차감 | `mingle-app/src/server/coins/ledger.ts`, `wallet.ts`, `lot-plan.ts` |
| 단가표·차감액 계산 | `src/server/coins/pricing.ts` |
| 결제 검증·지급·환불 | `src/server/coins/iap-apple.ts`, `iap-google.ts`, `purchases.ts` |
| API | `src/server/api/controllers/shared/coins-controller.ts`, `src/app/api/coins/*`, `internal/coins/charge`, `webhooks/*` |
| 과금 연결 | `translate-finalize-handler.ts`(번역 + 인라인 TTS), `tts-inworld-handler.ts`, `conversation-image-text.ts`, `mingle-stt/coin-billing.ts` |
| 어드민 | `src/app/admin/coins`, `src/server/coins/admin.ts` |
| 앱 UI | `src/components/coins/*`, `src/lib/coin-wallet-client.ts`, `src/lib/coin-purchase-client.ts` |
| 네이티브 결제 브리지 | `mingle-app/rn/src/nativeIap.ts`, `src/lib/native-iap.ts` |

## 단가 시드와 무료 코인 환산

확인한 가격(2026-10-03): Soniox 실시간 $0.12/시간, gemini-2.5-flash-lite $0.10/$0.40, gpt-6-luna $0.10/$0.50, gemini-3.8-flash-lite-tts 입력 $0.50 · 오디오 출력 $6.00(초당 25토큰), gemini-3.8-flash-tts 오디오 출력 $9.00, gemini-3.8/3.7-flash $0.75/$3.75, gemini-3.5-flash-lite $0.30/$2.50, gemini-3.1-flash-lite $0.25/$1.50 (모두 100만 토큰당).

확인하지 못해 가정값을 넣은 것(`ASSUMED`): gemma-4-31b-it(유료 가격 미공개), qwen/qwen3.5-9b(OpenRouter 가격 미확인), inworld-tts-1.5-mini(공개 가격표에 없음), TTS 입력의 글자→토큰 환산(4글자 = 1토큰).

마진 1.5 기준 음성 인식은 분당 3코인이다. 일일 무료 1,000코인은 음성 인식만 쓰면 약 333분(5시간 33분)이고, 번역·음성 통역을 같이 쓰면 그보다 짧다. 마진 2.0이면 분당 4코인, 약 250분이다.

## 기획서와 다른 점

- **단가 컬럼**: `usd_micro_per_unit` 대신 `usd_micro_per_million_units`. 토큰 단가가 1마이크로달러보다 작아 정수로 표현되지 않기 때문이다.
- **STT 과금 식별**: 클라이언트가 STT WebSocket URL 쿼리(`coin_token`, `coin_session`)로 과금 토큰을 넘긴다. 네이티브 STT 모듈을 고치지 않아도 되고, 현재 배포된 앱 버전에도 과금이 적용된다.
- **구버전 앱**: 웹뷰가 서버에서 내려오므로 구버전 앱에도 잔액 칩·차단이 그대로 적용된다. 다만 결제 브리지가 없어 상점에는 "앱을 업데이트하면 충전할 수 있어요"가 표시된다. 1.x 익명(비로그인) 클라이언트는 과금 대상이 아니다.
- **실시간 잔액 푸시 없음**: 메시징 서비스 변경 없이, 번역·TTS 응답에 잔액을 실어 보내고 지갑을 60초마다(그리고 화면 복귀 시) 다시 읽는다. 음성 인식 중 잔액 표시는 최대 60초 늦을 수 있다. 차단 자체는 STT 서버가 15초 정산 주기로 한다.
- **사진 번역**: 업로드 시 자동 OCR은 보낸 사람이, 이후 새 언어 번역은 처음 요청한 사람이 낸다. 사진당 OCR 1회, 언어당 번역 1회만 과금된다.
- **STT 과금 토큰 강제**: 과금이 적용(`1`)되면 토큰이 없거나 위조된 STT 연결은 거부된다. 예외는 계정이 없는 1.x 네임스페이스뿐이다. 네임스페이스는 클라이언트가 보내는 값이라 1.x를 사칭하면 우회할 수 있으므로, 1.x 지원을 끝내면 `COIN_STT_ALLOW_LEGACY_ANONYMOUS=0`으로 닫는다.
- **말풍선 음성 재생은 누를 때마다 과금**: 클라이언트가 음성을 캐시하지 않아 매번 새로 합성하기 때문이다. 번역과 함께 자동 재생되는 음성은 메시지당 한 번만 과금된다.
- **토큰 수를 알려주지 않는 번역 응답**은 글자 수로 추정해 과금한다(2글자 = 1토큰, 프롬프트 300토큰).
- **가입 보너스 없음**, **대화 종료 시 사용 코인 요약 없음**(미정 항목).

## 아직 안 된 것

- 내 메시지의 "번역되지 않음" 표시와 상대 메시지의 "번역 없음" 표시. 지금은 대화방 상단 배너("코인이 없어 번역과 통역이 멈췄어요")로만 알린다.
- 이용약관·개인정보처리방침의 유료 재화·환불 조항.
- 최소 지원 버전 상향(과금 활성화 시점에 결정).
- 실제 스토어 샌드박스 결제 검증. 서버 검증은 테스트용 인증서 체인과 실제 PostgreSQL로 확인했지만, 실제 App Store / Google Play 거래로는 아직 돌려 보지 않았다.

## 테스트

```bash
cd mingle-app && pnpm test:unit
```

실제 PostgreSQL이 필요한 원장 테스트(동시 100건 차감, 결제·환불, 사용량 집계, 어드민 쿼리):

```bash
COIN_TEST_DATABASE_URL="postgresql://.../cointest?schema=app" npx vitest run src/integration/live/coins-ledger.live.test.ts
```

스키마와 시드가 적용된 일회용 DB를 써야 한다.
