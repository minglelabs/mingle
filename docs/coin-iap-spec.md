# 코인(충전형 재화) + 인앱결제 기획서

작성일 2026-10-02. 작업 브랜치는 `main`에서 따고 워크트리(`.worktrees/coin-iap`)에서 진행한다.

이 문서에서 **[결정 필요]** 표시는 착수 전에 사용자 확인이 필요한 항목이고, **[가정]** 표시는 확인하지 않은 수치·전제다. 나머지는 요구사항 또는 권장 설계다.

---

## 1. 목표와 범위

### 요구사항 (사용자 지시 그대로)
1. 충전형 재화 1종을 만들고 인앱결제(iOS·Android)와 연동한다.
2. 24시간이 지날 때마다(시간대 무관) 1,000씩 자동 충전한다.
3. 어드민에서 특정 유저에게 충전할 수 있다.
4. 환율은 1달러 = 1,000코인.
5. 모든 변동을 DB에 로그로 남긴다. 잔액 스냅샷만 있어서는 안 된다.
6. 충전 건(패키지)마다 레코드를 남기는 테이블이 따로 있어야 한다.
7. 소진 순서: 무료로 충전된 것부터, 그다음은 오래된 것부터.
8. STT·번역·통역(TTS) 사용량에 비례해, 토큰 원가(달러)를 계산해 그만큼 차감한다.
9. UI/UX가 좋아야 한다: 상점 버튼, 얼마나 썼는지 쉽게 보기 등.

### 이번 범위에서 제외 (권장)
- 구독 상품, 웹(PC) 결제, 선물하기, 쿠폰 코드.
- 게시물·댓글·프로필 번역 과금(공유 캐시라 과금 주체가 모호함. 4.4 참조).

### 재화 이름
**코인(Coin)** 을 권장한다. 사용자가 든 예시 중 "1달러=1,000코인"으로 직접 부른 이름이고, 15개 언어 모두 번역이 자연스럽다. 코드 식별자는 `coin`. **[결정 필요]** 다른 이름을 원하면 착수 전에 확정.

---

## 2. 현재 코드 상태 (main 기준, 확인한 것)

| 항목 | 현황 |
|---|---|
| 인앱결제 라이브러리 | 없음. `mingle-app/rn/package.json`에 IAP 관련 패키지 없음 |
| STT | `mingle-stt/` 서비스, Soniox 기반(`stt-server.ts`, `soniox-audio-relay.ts`). 사용 초는 `AppEventLog.usageSec`에 기록 |
| 번역 토큰 | `AppMessage.translationPromptTokens / CompletionTokens / TotalTokens` 컬럼이 이미 있음. 번역 호출은 `src/server/translation/translate-texts.ts`, `translate-finalize-handler.ts` |
| 번역 모델 | `src/lib/translation-models.ts` (gemini-2.5-flash-lite, gemma-4-31b-it, qwen3.5-9b, gpt-6-luna). 신규 가입자 기본 gpt-6-luna |
| TTS 모델 | `src/lib/tts-models.ts`, 기본 gemini-3.8-flash-lite-tts |
| 사진 OCR·번역 | `src/server/conversation-image-text*.ts` (토큰 사용량 읽는 코드 있음) |
| 사용량 화면 | 마이페이지 → 메뉴 → "사용량" (`profile-usage-content.tsx`, `src/server/user-usage.ts`). 사용 시간·메시지 수·언어별 분포를 보여줌 |
| 어드민 | main에는 `/admin`(피드백), `/admin/dashboard`, `/admin/reports`, `/admin/conversations`만 있음. 탭 구조의 어드민 셸·DB 세션·감사 로그(`AdminAuditLog`)는 `feat/posting-feed`(PR #231)에만 있음 |
| 버전 정책 | `client/version-policy` API, 환경변수 `IOS_/ANDROID_CLIENT_MIN_SUPPORTED_VERSION` 등 |

**[결정 필요] 어드민 의존성**: 어드민 충전 화면은 PR #231의 어드민 셸·감사 로그 위에 만드는 게 맞다. 선택지는 (a) #231 머지 후 착수, (b) main의 기존 `/admin` 방식으로 먼저 만들고 #231 머지 때 옮김. (a)를 권장하되, 급하면 서버·앱부터 만들고 어드민 화면만 뒤로 미룬다.

---

## 3. 재화 규칙

### 3.1 단위와 정밀도
- 1코인 = $0.001. 표시 단위는 정수 코인.
- 번역 한 건의 원가는 0.01코인 수준이라 정수 코인으로는 표현이 안 된다. **내부 저장 단위는 마이크로코인(1코인 = 1,000,000µ, BigInt)** 으로 하고, 화면에는 코인으로 내림 표시한다.
- 모든 금액 연산은 정수(BigInt)로만 한다. 부동소수 금지.

### 3.2 충전 종류 (lot의 source)
| source | 설명 | 무료 여부 | 만료 |
|---|---|---|---|
| `daily_free` | 24시간마다 1,000 | 무료 | **[결정 필요]** 3.3 |
| `purchase` | 인앱결제 | 유료 | 없음 (스토어 정책상 유료 재화는 만료시키지 않음) |
| `admin_grant` | 어드민 충전 | 어드민이 무료/유료 구분 선택 | 선택(기본 없음) |
| `signup_bonus` | 가입 보너스 **[결정 필요]** 지급 여부·금액 | 무료 | 없음 |
| `refund_reversal` | 환불 취소 등 보정 | 원 lot을 따름 | 없음 |

### 3.3 일일 무료 충전
- 기준: 마지막 무료 충전 시각으로부터 24시간 경과. 시간대·자정 개념 없음.
- 구현: 크론이 아니라 **지연 지급**. 잔액 조회·차감·앱 진입 시 서버가 `now - lastDailyGrantAt >= 24h`이면 그 자리에서 지급한다. 전체 유저를 매일 도는 배치가 필요 없고, 서버 인스턴스 수와 무관하다.
- 동시 요청으로 두 번 지급되지 않게 지갑 행 잠금 안에서 처리한다(5.3).
- **[결정 필요] 누적 방식** — 요구사항 문장만으로는 정해지지 않는다.
  - (A, 권장) **미접속 기간 소급 없음 + 무료 잔액 상한 1,000**: 24시간이 지나면 무료 잔액을 1,000으로 채운다. 3일 만에 와도 1,000. 원가 통제가 쉽고 "매일 1,000 무료"로 설명하기 쉽다.
  - (B) 소급 없음 + 누적: 올 때마다 1,000이 더해지고 안 쓴 무료분이 계속 쌓인다.
  - (C) 소급 지급: 3일 만에 오면 3,000. 휴면 계정에 부채가 쌓여 비권장.
- 다음 무료 충전까지 남은 시간을 API로 내려 UI에 카운트다운으로 보여준다.

### 3.4 소진 순서 (요구사항 7)
1. 무료 lot 먼저(`is_free = true`). 무료 lot끼리는 오래된 순.
2. 그다음 유료 lot을 오래된 순(FIFO, `created_at` 오름차순).
3. 만료된 lot은 건너뛴다.
4. 한 번의 차감이 여러 lot에 걸칠 수 있고, 어느 lot에서 얼마를 뺐는지 전부 기록한다(5.1 `coin_spend_allocations`).

### 3.5 잔액 부족 처리
- **[결정 필요]** 권장안:
  - 새 STT 세션·TTS·사진 번역 시작 전에 잔액을 확인하고, 0 이하면 시작을 막고 상점을 띄운다.
  - 진행 중인 STT 세션은 끊지 않는다. 소액 음수 잔액을 허용하고(한도 예: -200코인), 다음 충전에서 먼저 상계한다. 말하는 도중에 통역이 끊기는 경험을 피하기 위함.
  - 수신 메시지 번역(상대가 보낸 글을 내 언어로)은 잔액과 무관하게 항상 된다. 과금 주체가 발신자이기 때문(4.3).
- 잔액이 낮을 때(예: 200코인 미만) 대화방 상단에 비침습적 안내를 한 번 띄운다.

---

## 4. 사용량 과금

### 4.1 원칙
`차감 코인 = 원가(USD) × 1,000 × 마진 배수`

- 원가는 사용량(초, 토큰, 글자) × 단가.
- **단가는 코드 상수가 아니라 DB 테이블(`coin_pricing_rates`)** 로 관리한다. 모델·공급사 가격이 바뀌면 배포 없이 고치고, 과거 차감이 어떤 단가로 계산됐는지 추적할 수 있어야 한다.
- **[결정 필요] 마진 배수**: 1.0이면 원가 그대로. 스토어 수수료(15~30%)를 감안하면 1달러 결제에서 실수령은 $0.70~0.85라, 원가 그대로 차감하면 적자다. 1.5~2.0 권장.

### 4.2 과금 지점과 단위
| 종류 | 과금 단위 | 측정 위치 | 비고 |
|---|---|---|---|
| STT | 오디오 초 | `mingle-stt` 세션 종료·주기 보고 | 긴 세션은 30~60초마다 중간 정산 |
| 번역(대화 메시지) | 입력·출력 토큰, 모델별 | `translate-texts.ts` / `translate-finalize-handler.ts` | 토큰 수는 이미 `AppMessage`에 저장됨 |
| TTS(통역 음성) | 글자 수 또는 오디오 토큰 | TTS 호출 지점 | 모델별 단가 |
| 사진 OCR + 번역 | 이미지 1장 + 토큰 | `conversation-image-text*.ts` | 재조회(캐시 히트)는 무료 |

### 4.3 누가 내는가
- **STT**: 마이크를 켠 사람.
- **번역**: 메시지를 보낸 사람. 여러 언어로 번역되면 그만큼 전부 발신자 부담.
- **TTS**: 음성 출력을 켠 사람(듣는 사람).
- **사진 번역**: 번역을 요청한 사람.
- 번역 실패·재시도는 한 번만 과금한다(멱등 키: 메시지 ID + 언어 + 본문 버전).

### 4.4 무료로 두는 것 (권장)
- 게시물·댓글·프로필 소개 번역: 결과가 모든 사용자에게 공유되는 캐시라 "누구 돈으로 번역했나"가 불공정해진다. v1은 무료. **[결정 필요]**
- 어드민 스태프용 번역, 운영 계정 관련 번역.

### 4.5 단가표 초기값
**[가정] 아래 수치는 확인하지 않은 예시다.** 착수 시 각 공급사의 현재 가격 페이지에서 실제 값을 가져와 `coin_pricing_rates` 시드로 넣는다.

| 항목 | 예시 원가 | 마진 1.0일 때 차감 |
|---|---|---|
| Soniox 실시간 STT | 시간당 약 $0.12 | 분당 약 2코인 |
| 번역 gemini-2.5-flash-lite | 100토큰 메시지 약 $0.00005 | 약 0.05코인 |
| 번역 gpt-6-luna | 모델 가격 확인 필요 | — |
| TTS gemini-3.8-flash-lite-tts | 모델 가격 확인 필요 | — |
| 사진 OCR | 모델 가격 확인 필요 | — |

체감 기준: 위 STT 예시대로라면 일일 무료 1,000코인은 통역 약 8시간 분량이다. 무료분이 지나치게 넉넉해 유료 전환이 일어나지 않을 수 있으니, **실제 단가를 넣은 뒤 "무료 1,000코인으로 몇 분 쓸 수 있는가"를 계산해 마진 배수와 무료 수량을 다시 확인한다.** **[결정 필요]**

---

## 5. 데이터 모델

테이블 이름은 기존 규칙(`app_` 접두사, snake_case 컬럼)에 맞춘다. 금액 컬럼은 전부 BigInt 마이크로코인.

### 5.1 테이블

**`app_coin_wallets`** — 유저당 1행. 빠른 조회용 스냅샷이며 진실의 원천이 아니다.
- `user_id` PK, `balance_micro`, `free_balance_micro`, `paid_balance_micro`
- `last_daily_grant_at`, `lifetime_purchased_micro`, `lifetime_spent_micro`
- `version`(낙관적 잠금 보조), `updated_at`

**`app_coin_lots`** — 충전 건(패키지)별 레코드. 요구사항 6.
- `id`, `user_id`, `source`(3.2), `is_free`
- `granted_micro`(최초 수량), `remaining_micro`(남은 수량)
- `expires_at`(nullable), `created_at`
- `purchase_id`(nullable FK), `admin_grant_id`(nullable FK), `note`
- 인덱스: `(user_id, is_free DESC, created_at ASC) WHERE remaining_micro > 0`

**`app_coin_ledger`** — 추가 전용(append-only) 원장. 요구사항 5. UPDATE·DELETE 금지.
- `id`(증가), `user_id`, `type`: `grant | spend | expire | refund_clawback | admin_revoke | adjust`
- `amount_micro`(부호 있음), `balance_after_micro`
- `lot_id`(grant·expire일 때), `usage_charge_id`(spend일 때), `purchase_id`, `admin_grant_id`
- `idempotency_key` UNIQUE, `created_at`, `meta` JSON
- 불변식: 유저의 `SUM(amount_micro)` = `wallet.balance_micro` = `SUM(lots.remaining_micro)`(음수 잔액 허용분 제외)

**`app_coin_spend_allocations`** — 한 차감이 어느 lot에서 얼마씩 나갔는지.
- `ledger_id`, `lot_id`, `amount_micro`

**`app_coin_usage_charges`** — 사용량 과금 건별 계산 근거. 요구사항 8.
- `id`, `user_id`, `kind`: `stt | translation | tts | image_text`
- `units` JSON(초, 입력·출력 토큰, 글자 수), `model`, `provider`
- `pricing_rate_id`, `cost_usd_micro`(원가, 마이크로달러), `margin_bps`, `charged_micro`
- `conversation_id`, `message_id`, `session_key`, `idempotency_key` UNIQUE, `created_at`

**`app_coin_pricing_rates`** — 버전 관리되는 단가표.
- `id`, `kind`, `provider`, `model`, `unit`(`second | input_token | output_token | char | image`)
- `usd_micro_per_unit`, `margin_bps`, `effective_from`, `effective_to`(nullable), `created_by_admin`

**`app_iap_products`** — 판매 상품 목록(6.1).
- `id`, `platform`(`ios | android`), `store_product_id`, `coin_micro`, `bonus_micro`
- `price_usd_cents`(표시용 기준가), `sort_order`, `is_active`, `badge`(예: `best_value`)

**`app_iap_purchases`** — 결제 건별 레코드.
- `id`, `user_id`, `platform`, `product_id`
- `store_transaction_id` UNIQUE(iOS `transactionId`, Android `purchaseToken`), `store_original_transaction_id`
- `status`: `pending | verified | granted | refunded | revoked | failed`
- `price_amount_micros`, `price_currency`, `storefront_country`
- `raw_payload` JSON(검증 응답 원문), `environment`(`sandbox | production`)
- `lot_id`(지급된 lot), `verified_at`, `granted_at`, `refunded_at`, `created_at`

**`app_iap_store_events`** — 스토어 서버 알림(웹훅) 원문 로그.
- `id`, `platform`, `notification_type`, `store_transaction_id`, `raw_payload`, `processed_at`, `process_result`, `created_at`

**`app_coin_admin_grants`** — 어드민 충전·회수 건.
- `id`, `admin_session_id`, `user_id`, `amount_micro`(음수면 회수), `is_free`, `reason`(필수), `expires_at`, `created_at`

### 5.2 차감 알고리즘 (한 트랜잭션)
1. `SELECT ... FROM app_coin_wallets WHERE user_id = $1 FOR UPDATE`
2. 일일 무료 충전 자격이 있으면 먼저 지급(lot + ledger).
3. `idempotency_key`로 이미 처리된 과금이면 기존 결과 반환.
4. 만료 lot 정리: `expires_at <= now AND remaining > 0`이면 `expire` 원장 기록 후 0으로.
5. 3.4 순서로 lot을 잠그고(`FOR UPDATE`) 필요한 만큼 차례로 차감, 건마다 `spend_allocations` 기록.
6. `usage_charges`, `ledger(spend)` 기록, `wallets` 스냅샷 갱신.
7. lot이 모자라면 3.5 정책에 따라 음수 한도 내에서 "미충당 차감"을 원장에 남기고, 다음 grant 때 상계.

### 5.3 동시성·무결성
- 유저 단위 직렬화는 지갑 행 잠금으로 한다.
- 모든 쓰기 경로에 멱등 키를 둔다: 결제는 `store_transaction_id`, 과금은 `kind:message_id:language:body_version` 또는 `stt:session_key:chunk_index`, 일일 충전은 `daily:user_id:grant_seq`.
- 정합성 점검 스크립트: 유저별로 원장 합계·lot 잔량 합계·지갑 스냅샷이 일치하는지 검사. 어드민 대시보드에 불일치 건수를 노출.
- STT 서비스(`mingle-stt`)는 DB에 직접 쓰지 않고, 웹 서버의 내부 과금 API를 서비스 간 인증으로 호출한다.

---

## 6. 인앱결제

### 6.1 상품 구성
모두 소모성(consumable) 상품. 1달러 = 1,000코인 기준에 대용량 보너스를 얹는다. **[결정 필요]** 구성과 보너스율.

| 상품 ID | 가격 | 기본 코인 | 보너스 | 합계 |
|---|---|---|---|---|
| `coin_1000` | $0.99 | 1,000 | — | 1,000 |
| `coin_5000` | $4.99 | 5,000 | +250 (5%) | 5,250 |
| `coin_10000` | $9.99 | 10,000 | +1,000 (10%) | 11,000 |
| `coin_30000` | $29.99 | 30,000 | +4,500 (15%) | 34,500 |

- 현지 통화 가격은 스토어가 정한다. 앱에는 스토어가 내려주는 현지화 가격 문자열을 그대로 표시한다.
- 보너스 코인은 같은 lot에 포함하되 `granted_micro`에 합산하고 `meta`에 기본·보너스를 구분해 남긴다.

### 6.2 클라이언트
- 앱은 웹뷰 구조이므로 결제는 네이티브(RN)에서 처리하고 웹과 브리지로 통신한다.
- 라이브러리: `react-native-iap` 권장(StoreKit 2, Play Billing 지원). **[결정 필요]** RevenueCat 같은 대행 서비스를 쓸지. 쓰면 구현이 줄지만 수수료와 외부 의존이 생긴다. 소모성 상품만 있으므로 직접 연동을 권장.
- 브리지 메시지(웹 → 네이티브): `iap_get_products`, `iap_purchase { productId }`, `iap_finish { transactionId }`. 네이티브 → 웹: `mingle:native-iap` 이벤트(`products`, `purchase_pending`, `purchase_success`, `purchase_cancelled`, `purchase_error`).
- 미완료 거래 복구: 앱 시작 시 미완료 거래를 조회해 서버 검증을 다시 시도한다(결제는 됐는데 코인이 안 들어온 경우 방지).
- 부모 승인 대기(Ask to Buy) 등 `pending` 상태를 UI에 표시한다.

### 6.3 서버 검증 흐름
1. 앱이 스토어 결제 완료 → `POST /api/{platform}/vX/coins/purchases` 에 거래 정보 전송.
2. 서버가 스토어에 직접 검증:
   - iOS: App Store Server API로 서명된 거래(JWS) 검증. 번들 ID, 상품 ID, 환경, 취소 여부 확인.
   - Android: Google Play Developer API `purchases.products.get`. `purchaseState`, 소모 여부 확인 후 서버에서 consume.
3. `store_transaction_id` UNIQUE로 중복 지급 차단.
4. 검증 성공 시 한 트랜잭션에서 `iap_purchases(granted)` + `coin_lots` + `coin_ledger(grant)` + 지갑 갱신.
5. 응답으로 새 잔액 반환 → 앱이 `iap_finish`로 거래 종료.
6. 클라이언트가 보낸 금액·코인 수는 신뢰하지 않는다. 지급량은 서버의 `app_iap_products`에서만 읽는다.

### 6.4 환불·취소
- iOS App Store Server Notifications V2(`REFUND`, `REVOKE`), Android 실시간 개발자 알림 + Voided Purchases API를 받는 웹훅을 만든다. 원문은 `app_iap_store_events`에 저장.
- 환불 시: 해당 lot의 남은 수량을 회수(`refund_clawback`). 이미 써 버린 만큼은 잔액을 음수로 만들고 다음 충전에서 상계한다. 반복 환불 유저는 어드민에 표시.
- 서명 검증, 재전송(중복 알림) 멱등 처리 필수.

### 6.5 버전·배포
- 네이티브 변경이 있어 새 앱 버전이 필요하다. 릴리스 절차는 메모리 `mobile-release-procedure` 참조(네임스페이스 정렬 PR, Railway 배포 확인 후 빌드).
- **[결정 필요] 구버전 앱 처리**: 구버전에는 상점이 없다. 선택지는 (a) 과금 시작과 동시에 최소 지원 버전을 올려 강제 업데이트, (b) 구버전 네임스페이스 요청은 과금 면제. (a)를 권장하되, iOS 심사 통과 후에 올린다.
- 과금은 서버 플래그(`COIN_BILLING_ENABLED`)로 켜고 끈다. 먼저 "차감 계산과 기록만 하고 실제 차단은 안 하는" 그림자 모드로 며칠 돌려 단가·무료 수량을 검증한다.

### 6.6 스토어 설정 (코드 외 작업)
- App Store Connect: 소모성 상품 4개 등록, 심사용 스크린샷, 서버 알림 URL, In-App Purchase 키 발급.
- Google Play Console: 인앱 상품 4개, 실시간 개발자 알림(Pub/Sub), 서비스 계정 권한.
- 유료 앱 계약·세금·은행 정보가 완료돼 있어야 한다(계정 소유자만 가능).
- 이용약관·개인정보처리방침에 유료 재화, 환불, 무료 코인 정책 추가.

---

## 7. API

모두 로그인 필요. 네임스페이스 경로(`/api/ios/vX`, `/api/android/vX`) 규칙을 따른다.

| 메서드·경로 | 설명 |
|---|---|
| `GET /coins/wallet` | 잔액(전체·무료·유료), 다음 무료 충전 시각, 저잔액 여부. 호출 시 일일 충전 지연 지급 |
| `GET /coins/products` | 판매 상품 목록(플랫폼별) |
| `POST /coins/purchases` | 결제 검증·지급 |
| `GET /coins/history?cursor=` | 원장 내역(충전·사용·환불), 페이지네이션 |
| `GET /coins/usage?range=today\|7d\|30d` | 종류별 사용 합계와 일별 추이 |
| `POST /internal/coins/charge` | 서비스 간 과금(STT 서비스용), 서비스 인증 |
| `POST /webhooks/appstore`, `/webhooks/googleplay` | 스토어 서버 알림 |
| `GET/POST /admin/coins/...` | 8장 |

잔액 변화는 기존 실시간 채널로 푸시해, 대화 중에도 잔액 표시가 바로 줄어들게 한다.

---

## 8. 어드민

- **유저 지갑 조회**: 유저 검색 → 잔액(무료·유료), lot 목록(출처, 최초·잔여, 만료), 원장 타임라인, 결제 내역, 사용량 요약.
- **충전**: 수량, 무료/유료 구분, 만료일(선택), 사유(필수). 실행 전 확인 단계. 요구사항 3.
- **회수**: 음수 조정. 사유 필수.
- 충전·회수는 모두 `app_coin_admin_grants`와 감사 로그에 남긴다.
- **상품 관리**: 상품 활성/비활성, 정렬, 뱃지.
- **단가표 관리**: 새 단가 추가(적용 시작 시각 지정). 기존 행은 수정하지 않고 종료 시각만 닫는다.
- **대시보드**: 일별 매출(스토어 통화·USD 환산), 충전량, 사용량(종류별), 추정 원가, 마진, 무료 지급량, 환불, 정합성 불일치 건수.

---

## 9. UI/UX

디자인 원칙: 통역 중인 사용자를 방해하지 않는다. 잔액은 늘 보이되 작게, 결제 유도는 필요한 순간에만.

### 9.1 잔액 칩 (항상 보이는 진입점)
- 위치: 대화목록 헤더, 마이페이지 프로필 영역. 대화방에서는 헤더에 작게.
- 모양: 코인 아이콘 + 숫자(`1,240`). 누르면 상점 시트가 열린다.
- 잔액이 줄 때 숫자가 부드럽게 카운트다운된다. 저잔액이면 칩 색이 주황으로 바뀐다.

### 9.2 상점 (요구사항: 상점 버튼)
- 진입: 잔액 칩, 마이페이지의 "상점" 버튼, 잔액 부족 안내.
- 형태: 다른 패널과 같은 슬라이드 패널(`SlideSurface`).
- 구성(위에서 아래로):
  1. 현재 잔액 크게 + "무료 1,240 · 충전 0" 구분 표시.
  2. 일일 무료 충전 카드: "매일 1,000코인 무료 · 다음 충전까지 5시간 12분" 진행 막대.
  3. 상품 카드 4개: 코인 수, 보너스 뱃지("+10%"), 현지화 가격 버튼. 가장 이득인 상품에 "추천" 표시.
  4. "이 코인으로 통역 약 N분" 환산 문구(실제 단가 기반).
  5. 하단: 사용 내역 보기, 구매 복원, 약관·환불 안내 링크.
- 결제 상태: 버튼 로딩 → 성공 시 잔액 숫자가 올라가는 애니메이션과 햅틱 → 실패·취소는 조용한 토스트. 승인 대기는 "승인 대기 중" 카드로 남긴다.
- 스토어 상품 조회 실패 시 재시도 버튼. 구버전·웹에서는 "앱을 업데이트하면 충전할 수 있어요" 안내.

### 9.3 사용량 (요구사항: 얼마나 썼는지 쉽게)
기존 마이페이지 → "사용량" 화면을 확장한다.
- 상단 요약: 오늘 / 7일 / 30일 탭. 선택 기간의 총 사용 코인.
- 종류별 막대: 음성 인식, 번역, 음성 통역, 사진 번역. 각 항목에 코인과 사용량(분, 메시지 수) 병기.
- 일별 추이 막대 그래프.
- 내역 리스트: 시간순으로 충전(+)과 사용(−). 사용은 대화방 단위로 묶어 "○○와의 대화 · 12분 · −31코인"처럼 보여주고, 누르면 세부(음성 인식 −24, 번역 −5, 음성 −2)가 펼쳐진다. 건별 원장을 그대로 나열하지 않는다.
- 충전 내역은 출처 표시: 무료 충전, 구매, 운영자 지급, 환불.

### 9.4 대화 중 표시
- 대화방을 나갈 때 "이번 대화에서 31코인 사용" 을 짧게 보여준다(끌 수 있음). **[결정 필요]** 넣을지 여부.
- 저잔액 안내: 대화방 상단 한 줄 배너, 세션당 한 번. 누르면 상점.
- 잔액 0: 마이크 버튼을 누르면 "코인이 부족해요" 시트(남은 무료 충전 시간 + 충전 버튼). 진행 중 세션은 3.5 정책에 따름.

### 9.5 접근성·다국어
- 15개 지원 언어 문구 추가(`src/i18n/`). 숫자는 로케일 형식.
- 버튼 터치 영역 44pt 이상, 스크린리더 라벨(잔액, 가격) 제공.
- 가격은 스토어 제공 문자열만 사용(직접 환산 금지).

---

## 10. 작업 순서 (권장)

1. **스키마·코어**: 마이그레이션, 지갑·lot·원장 서비스, 차감 알고리즘, 일일 지연 충전, 정합성 검사. 단위 테스트와 실제 PostgreSQL 동시성 테스트.
2. **과금 계산**: 단가표, `usage_charges`, 번역·TTS·사진 과금 연결, STT 내부 과금 API. 그림자 모드로 기록만.
3. **API + 사용량 UI**: 지갑·내역·사용량 API, 잔액 칩, 사용량 화면.
4. **어드민**: 조회, 충전·회수, 단가표, 대시보드.
5. **인앱결제**: RN 연동, 브리지, 서버 검증, 웹훅, 상점 UI. 샌드박스 결제 검증.
6. **출시 준비**: 약관, 스토어 상품 등록, 버전 정책, 그림자 모드 데이터로 단가·무료 수량 확정, 과금 활성화.

1~4는 네이티브 변경 없이 배포할 수 있다. 5부터 앱 재빌드와 스토어 심사가 필요하다.

---

## 11. 완료 기준 (수락 테스트)

- 신규 유저가 처음 접속하면 무료 1,000코인 lot과 원장 1건이 생긴다. 24시간 안에 다시 호출해도 추가 지급이 없고, 24시간 뒤에는 정책(3.3)대로 지급된다.
- 동시에 100건의 차감을 보내도 잔액이 원장 합계와 일치하고 이중 차감이 없다.
- 무료 lot과 유료 lot이 함께 있을 때 무료가 먼저 0이 되고, 유료는 오래된 것부터 줄어든다. 어느 lot에서 얼마가 나갔는지 조회된다.
- 샌드박스 결제 1건이 서버 검증을 거쳐 한 번만 지급된다. 같은 거래를 다시 보내면 중복 지급되지 않는다. 앱을 결제 직후 강제 종료해도 다음 실행에서 지급된다.
- 환불 알림을 받으면 해당 lot이 회수되고 원장에 남는다.
- STT 10분, 번역 20건, TTS, 사진 번역 1건을 쓰면 `usage_charges`에 건별 근거(단위, 단가, 원가, 차감액)가 남고 사용량 화면 합계와 일치한다.
- 어드민 충전·회수가 사유와 함께 감사 로그에 남고 유저 화면에 "운영자 지급"으로 보인다.
- 원장 행은 수정·삭제되지 않는다(애플리케이션 경로에 UPDATE/DELETE 없음, 테스트로 보장).

---

## 12. 결정 필요 항목 모음

1. 재화 이름 (권장: 코인).
2. 일일 무료 충전 누적 방식 (권장: 소급 없음 + 무료 잔액 상한 1,000).
3. 마진 배수 (권장 1.5~2.0)와, 실제 단가 반영 후 무료 1,000코인의 적정성.
4. 잔액 0일 때 진행 중 세션 처리와 음수 허용 한도.
5. 게시물·댓글·프로필 번역 과금 여부 (권장: v1 무료).
6. 가입 보너스 지급 여부.
7. 상품 구성과 보너스율.
8. IAP 직접 연동 vs 대행 서비스 (권장: 직접).
9. 어드민을 PR #231 머지 후에 만들지 여부.
10. 구버전 앱 처리 (권장: 과금 시작 시 최소 지원 버전 상향).
11. 대화 종료 시 사용 코인 요약 표시 여부.

## 13. 작업 규칙 (이 저장소 공통)

- `pnpm db:*`는 `mingle-app`에서 실행하고, 실행 전 `DATABASE_URL` 대상을 확인한다. 운영 DB는 Railway.
- 스키마 변경 후 `pnpm db:generate`.
- 개발 서버는 자동으로 띄우지 않는다.
- 결제·지갑 관련 운영 DB 변경과 스토어 설정은 사용자 확인 후 진행한다.
