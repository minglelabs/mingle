# 코인(충전형 재화) + 인앱결제 기획서

작성일 2026-10-02 (개정 1: 무료 충전 방식, 마진, 어드민 착수 방식, 잔액 0 처리 확정). 작업 브랜치는 `main`에서 따고 워크트리에서 진행한다. 구현 내용과 운영 설정은 [coin-iap-implementation.md](coin-iap-implementation.md).

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
- 구독 상품, 선물하기, 쿠폰 코드. (웹 결제는 Polar로 추가됨: [coin-iap-implementation.md](coin-iap-implementation.md)의 "웹 결제" 참조)
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

**[확정] 어드민은 지금 main 방식으로 만든다.** PR #231을 기다리지 않는다. main의 어드민은 환경변수 계정(`MINGLE_ADMIN_USERNAME` / `MINGLE_ADMIN_PASSWORD`)과 서명 쿠키(`src/lib/admin-auth.ts`)로 인증하고, 화면은 `/admin/dashboard`, `/admin/reports`, `/admin/conversations`처럼 독립 페이지다. 코인 어드민도 같은 인증을 쓰는 `/admin/coins` 페이지로 만든다. main에는 `AdminAuditLog`가 없으므로 감사 기록은 `app_coin_admin_grants`와 원장으로 남긴다(8장). #231이 머지되면 그쪽 탭 구조(더보기)에 링크만 추가하면 된다.

---

## 3. 재화 규칙

### 3.1 단위와 정밀도
- 1코인 = $0.001. 표시 단위는 정수 코인.
- 번역 한 건의 원가는 0.01코인 수준이라 정수 코인으로는 표현이 안 된다. **내부 저장 단위는 마이크로코인(1코인 = 1,000,000µ, BigInt)** 으로 하고, 화면에는 코인으로 내림 표시한다.
- 모든 금액 연산은 정수(BigInt)로만 한다. 부동소수 금지.

### 3.2 충전 종류 (lot의 source)
| source | 설명 | 무료 여부 | 만료 |
|---|---|---|---|
| `daily_free` | 24시간마다 무료 잔액을 1,000까지 채움 | 무료 | 없음 (상한으로 통제) |
| `purchase` | 인앱결제 | 유료 | 없음 (스토어 정책상 유료 재화는 만료시키지 않음) |
| `admin_grant` | 어드민 충전 | 어드민이 무료/유료 구분 선택 | 선택(기본 없음) |
| `signup_bonus` | 가입 보너스 **[결정 필요]** 지급 여부·금액 | 무료 | 없음 |
| `refund_reversal` | 환불 취소 등 보정 | 원 lot을 따름 | 없음 |

### 3.3 일일 무료 충전 [확정]
- 기준: 마지막 무료 충전 시각으로부터 24시간 경과. 시간대·자정 개념 없음.
- **지급량 = 1,000 − 현재 무료 잔액.** 안 쓴 무료분이 남아 있으면 모자란 만큼만 채운다.
  - 무료 잔액 0 → 1,000 지급. 무료 잔액 300 → 700 지급. 무료 잔액 1,000 이상 → 지급 없음.
  - 여기서 "무료 잔액"은 `is_free = true`인 lot의 잔량 합계다. 어드민이 무료로 준 코인, 가입 보너스도 포함된다. 즉 어드민이 무료 5,000을 줬다면 그걸 1,000 밑으로 쓸 때까지 일일 충전은 없다. 유료 잔액은 계산에 넣지 않는다.
  - 지급이 0이어도 `last_daily_grant_at`은 갱신한다(24시간 주기가 밀리지 않게). 이때 lot은 만들지 않고, 원장에도 0짜리 행을 남기지 않는다.
- 미접속 기간 소급 없음: 3일 만에 와도 한 번만 채운다.
- 구현: 크론이 아니라 **지연 지급**. 잔액 조회·차감·앱 진입 시 서버가 `now - lastDailyGrantAt >= 24h`이면 그 자리에서 지급한다. 전체 유저를 매일 도는 배치가 필요 없고, 서버 인스턴스 수와 무관하다.
- 신규 유저(`last_daily_grant_at`이 null)는 첫 조회 때 바로 1,000을 받는다.
- 동시 요청으로 두 번 지급되지 않게 지갑 행 잠금 안에서 처리한다(5.3).
- 다음 무료 충전까지 남은 시간을 API로 내려 UI에 카운트다운으로 보여준다.

### 3.4 소진 순서 (요구사항 7)
1. 무료 lot 먼저(`is_free = true`). 무료 lot끼리는 오래된 순.
2. 그다음 유료 lot을 오래된 순(FIFO, `created_at` 오름차순).
3. 만료된 lot은 건너뛴다.
4. 한 번의 차감이 여러 lot에 걸칠 수 있고, 어느 lot에서 얼마를 뺐는지 전부 기록한다(5.1 `coin_spend_allocations`).

### 3.5 잔액 0 처리 [확정]
**잔액이 0이 되면 모든 AI 기능을 즉시 끊는다.** 잔액은 절대 음수가 되지 않는다.

- 대상: STT(음성 인식), 메시지 번역, TTS(음성 통역), 사진 OCR·번역. 과금되는 기능 전부.
- **시작 차단**: 잔액이 0이면 STT 세션 시작, TTS 요청, 사진 번역 요청을 서버가 거부한다(전용 에러 코드 `coin_insufficient`). 클라이언트는 상점을 띄운다.
- **진행 중 차단**: STT는 주기 정산(4.2)에서 잔액이 0이 되는 순간 서버가 세션을 종료한다. 클라이언트는 마이크를 끄고 "코인이 부족해요" 시트를 띄운다. 정산 주기는 짧게(10~15초) 잡아 초과 사용을 줄인다.
- **번역**: 과금 주체는 발신자다(4.3). 발신자 잔액이 0이면 그 메시지는 번역되지 않고 원문만 전달된다. 수신자 화면에는 번역이 없다는 표시만 한다. 발신자가 충전한 뒤 과거 메시지를 소급 번역하지는 않는다.
- **텍스트 메시지 전송 자체는 막지 않는다.** 끊는 것은 AI 기능이지 대화가 아니다.
- **마지막 차감이 잔액보다 클 때**: 토큰 수는 호출이 끝나야 알 수 있어, 마지막 한 건의 원가가 남은 잔액을 넘을 수 있다. 이때는 남은 잔액만큼만 차감해 0으로 만들고, 못 받은 금액은 `usage_charges.uncollected_micro`에 기록한다. 음수 잔액이나 부채는 만들지 않는다.
- **사전 확인 최소치**: 호출 전에 "잔액 > 0"만 본다. 최소 잔액 요건을 따로 두지 않는다.
- 게시물·댓글·프로필 번역 등 무과금 기능(4.4)은 영향받지 않는다.
- 저잔액(예: 200코인 미만) 안내를 대화방 상단에 한 번 띄워, 갑자기 끊기는 일을 줄인다.

---

## 4. 사용량 과금

### 4.1 원칙
`차감 코인 = 원가(USD) × 1,000 × 마진 배수`

- 원가는 사용량(초, 토큰, 글자) × 단가.
- **단가는 코드 상수가 아니라 DB 테이블(`coin_pricing_rates`)** 로 관리한다. 모델·공급사 가격이 바뀌면 배포 없이 고치고, 과거 차감이 어떤 단가로 계산됐는지 추적할 수 있어야 한다.
- **[확정] 마진 배수를 적용한다.** 스토어 수수료(15~30%) 때문에 1달러 결제의 실수령은 $0.70~0.85라, 원가 그대로 차감하면 적자다. 범위는 1.5~2.0이고 **초기값은 1.5**로 시작한다(`margin_bps = 15000`). 단가표 행마다 들어가는 값이라 종류별로 다르게 줄 수 있고, 어드민에서 배포 없이 조정한다.

### 4.2 과금 지점과 단위
| 종류 | 과금 단위 | 측정 위치 | 비고 |
|---|---|---|---|
| STT | 오디오 초 | `mingle-stt` 세션 종료·주기 보고 | 10~15초마다 중간 정산. 잔액 0이면 세션 종료(3.5) |
| 번역(대화 메시지) | 입력·출력 토큰, 모델별 | `translate-texts.ts` / `translate-finalize-handler.ts` | 토큰 수는 이미 `AppMessage`에 저장됨 |
| TTS(통역 음성) | 글자 수 또는 오디오 토큰 | TTS 호출 지점 | 모델별 단가 |
| 사진 OCR + 번역 | 이미지 1장 + 토큰 | `conversation-image-text*.ts` | 재조회(캐시 히트)는 무료 |

### 4.3 누가 내는가
- **STT**: 마이크를 켠 사람.
- **번역**: 메시지를 보낸 사람. 여러 언어로 번역되면 그만큼 전부 발신자 부담. 발신자 잔액이 0이면 번역하지 않는다(3.5).
- **TTS**: 음성 출력을 켠 사람(듣는 사람).
- **사진 번역**: 번역을 요청한 사람.
- 번역 실패·재시도는 한 번만 과금한다(멱등 키: 메시지 ID + 언어 + 본문 버전).

### 4.4 무료로 두는 것 (권장)
- 게시물·댓글·프로필 소개 번역: 결과가 모든 사용자에게 공유되는 캐시라 "누구 돈으로 번역했나"가 불공정해진다. v1은 무료. **[결정 필요]**
- 어드민 스태프용 번역, 운영 계정 관련 번역.

### 4.5 단가표 초기값
**[가정] 아래 수치는 확인하지 않은 예시다.** 착수 시 각 공급사의 현재 가격 페이지에서 실제 값을 가져와 `coin_pricing_rates` 시드로 넣는다.

| 항목 | 예시 원가 | 마진 1.5일 때 차감 |
|---|---|---|
| Soniox 실시간 STT | 시간당 약 $0.12 | 분당 약 3코인 |
| 번역 gemini-2.5-flash-lite | 100토큰 메시지 약 $0.00005 | 약 0.075코인 |
| 번역 gpt-6-luna | 모델 가격 확인 필요 | — |
| TTS gemini-3.8-flash-lite-tts | 모델 가격 확인 필요 | — |
| 사진 OCR | 모델 가격 확인 필요 | — |

체감 기준: 위 STT 예시와 마진 1.5라면 일일 무료 1,000코인은 통역 약 5시간 30분 분량이다. 무료분이 넉넉해 유료 전환이 일어나지 않을 수 있으니, **실제 단가를 넣은 뒤 "무료 1,000코인으로 몇 분 쓸 수 있는가"를 계산해 사용자에게 보고하고, 마진(1.5~2.0 범위)을 최종 확인받는다.**

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
- 불변식: 유저의 `SUM(amount_micro)` = `wallet.balance_micro` = `SUM(lots.remaining_micro)` ≥ 0

**`app_coin_spend_allocations`** — 한 차감이 어느 lot에서 얼마씩 나갔는지.
- `ledger_id`, `lot_id`, `amount_micro`

**`app_coin_usage_charges`** — 사용량 과금 건별 계산 근거. 요구사항 8.
- `id`, `user_id`, `kind`: `stt | translation | tts | image_text`
- `units` JSON(초, 입력·출력 토큰, 글자 수), `model`, `provider`
- `pricing_rate_id`, `cost_usd_micro`(원가, 마이크로달러), `margin_bps`, `charged_micro`(실제 차감액), `uncollected_micro`(잔액 부족으로 못 받은 금액, 기본 0)
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
- `id`, `admin_username`, `request_ip`, `user_agent`, `user_id`, `amount_micro`(음수면 회수), `is_free`, `reason`(필수), `expires_at`, `created_at`
- main에는 어드민 세션 테이블이 없으므로 세션 ID 대신 로그인 아이디와 요청 정보를 남긴다.

### 5.2 차감 알고리즘 (한 트랜잭션)
1. `SELECT ... FROM app_coin_wallets WHERE user_id = $1 FOR UPDATE`
2. 일일 무료 충전 자격이 있으면 먼저 지급(3.3: 1,000 − 무료 잔액만큼 lot + ledger).
3. `idempotency_key`로 이미 처리된 과금이면 기존 결과 반환.
4. 만료 lot 정리: `expires_at <= now AND remaining > 0`이면 `expire` 원장 기록 후 0으로.
5. 3.4 순서로 lot을 잠그고(`FOR UPDATE`) 필요한 만큼 차례로 차감, 건마다 `spend_allocations` 기록.
6. `usage_charges`, `ledger(spend)` 기록, `wallets` 스냅샷 갱신.
7. lot이 모자라면 남은 만큼만 차감해 잔액을 0으로 만들고, 부족분은 `usage_charges.uncollected_micro`에 기록한다. 응답에 `balance_exhausted: true`를 실어 호출 측이 AI 기능을 즉시 끊게 한다(3.5).

### 5.3 동시성·무결성
- 유저 단위 직렬화는 지갑 행 잠금으로 한다.
- 모든 쓰기 경로에 멱등 키를 둔다: 결제는 `store_transaction_id`, 과금은 `kind:message_id:language:body_version` 또는 `stt:session_key:chunk_index`, 일일 충전은 `daily:user_id:grant_seq`.
- 정합성 점검 스크립트: 유저별로 원장 합계·lot 잔량 합계·지갑 스냅샷이 일치하는지 검사. 어드민 대시보드에 불일치 건수를 노출.
- STT 서비스(`mingle-stt`)는 DB에 직접 쓰지 않고, 웹 서버의 내부 과금 API를 서비스 간 인증으로 호출한다.

---

## 6. 인앱결제

### 6.1 상품 구성
모두 소모성(consumable) 상품. 1달러 = 1,000코인 기준에 금액이 클수록 커지는 볼륨 보너스를 얹는다. **[확정]** 1·3·10·30·100달러 5종.

| 상품 ID | 가격 | 기본 코인 | 보너스 | 합계 |
|---|---|---|---|---|
| `coin_1000` | $0.99 | 1,000 | — | 1,000 |
| `coin_3000` | $2.99 | 3,000 | +90 (3%) | 3,090 |
| `coin_10000` | $9.99 | 10,000 | +600 (6%) | 10,600 |
| `coin_30000` | $29.99 | 30,000 | +3,000 (10%) | 33,000 |
| `coin_100000` | $99.99 | 100,000 | +15,000 (15%) | 115,000 |

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
- 환불 시: 해당 lot의 남은 수량만 회수한다(`refund_clawback`). 잔액은 음수가 되지 않으므로, 이미 써 버린 만큼은 회수하지 못하고 `iap_purchases.meta`에 미회수 금액으로 기록한다. 반복 환불 유저는 어드민에 표시.
- 서명 검증, 재전송(중복 알림) 멱등 처리 필수.

### 6.5 버전·배포
- 네이티브 변경이 있어 새 앱 버전이 필요하다. 릴리스 절차는 메모리 `mobile-release-procedure` 참조(네임스페이스 정렬 PR, Railway 배포 확인 후 빌드).
- **[결정 필요] 구버전 앱 처리**: 구버전에는 상점이 없다. 선택지는 (a) 과금 시작과 동시에 최소 지원 버전을 올려 강제 업데이트, (b) 구버전 네임스페이스 요청은 과금 면제. (a)를 권장하되, iOS 심사 통과 후에 올린다.
- 과금은 서버 플래그(`COIN_BILLING_ENABLED`)로 켜고 끈다. 먼저 "차감 계산과 기록만 하고 실제 차단은 안 하는" 그림자 모드로 며칠 돌려 단가·무료 수량을 검증한다.

### 6.6 스토어 설정 (코드 외 작업)
- App Store Connect: 소모성 상품 5개 등록, 심사용 스크린샷, 서버 알림 URL, In-App Purchase 키 발급.
- Google Play Console: 인앱 상품 5개, 실시간 개발자 알림(Pub/Sub), 서비스 계정 권한.
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

## 8. 어드민 [확정: main 방식으로 즉시 착수]

main의 기존 어드민과 같은 방식으로 만든다: 같은 로그인 쿠키 검증, 독립 페이지 `/admin/coins`, 서버 액션 또는 `/admin/coins/.../route.ts`. 기존 `/admin` 첫 화면에서 들어가는 링크를 추가한다.

- **유저 지갑 조회** (`/admin/coins`): 이메일·핸들·유저 ID로 검색 → 잔액(무료·유료), lot 목록(출처, 최초·잔여, 만료), 원장 타임라인, 결제 내역, 사용량 요약.
- **충전**: 수량, 무료/유료 구분, 만료일(선택), 사유(필수). 실행 전 확인 단계. 요구사항 3.
  - 무료로 충전하면 무료 잔액에 합산되어, 1,000 밑으로 내려갈 때까지 일일 무료 충전이 멈춘다(3.3). 충전 화면에 이 안내를 표시한다.
- **회수**: 음수 조정. 남은 잔액까지만 회수된다. 사유 필수.
- **감사 기록**: main에는 감사 로그 테이블이 없다. 충전·회수는 `app_coin_admin_grants`(누가·언제·누구에게·얼마·왜)와 원장에 남기고, 단가표·상품 변경은 각 테이블의 `created_by_admin`과 이력 행으로 남긴다. main 어드민은 계정이 하나라 "누가"는 로그인 아이디와 요청 IP·User-Agent를 기록한다.
- **상품 관리**: 상품 활성/비활성, 정렬, 뱃지.
- **단가표 관리**: 새 단가 추가(적용 시작 시각, 마진 지정). 기존 행은 수정하지 않고 종료 시각만 닫는다.
- **대시보드**: 일별 매출(스토어 통화·USD 환산), 충전량, 사용량(종류별), 추정 원가, 마진, 무료 지급량, 미수금(`uncollected_micro` 합계), 환불, 정합성 불일치 건수. 기존 `/admin/dashboard`의 차트 컴포넌트를 재사용한다.

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
  1. 현재 잔액 크게 + "무료 640 · 충전 0" 구분 표시.
  2. 일일 무료 충전 카드: "매일 무료 코인을 1,000까지 채워 드려요 · 다음 충전까지 5시간 12분" 진행 막대. 무료 잔액이 이미 1,000 이상이면 "무료 코인이 가득 차 있어요"로 바꾼다.
  3. 상품 카드 5개: 코인 수, 보너스 뱃지("+10%"), 현지화 가격 버튼. 가장 이득인 상품에 "추천" 표시.
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

### 9.4 대화 중 표시와 잔액 0
- 저잔액 안내: 대화방 상단 한 줄 배너, 세션당 한 번. 누르면 상점. 잔액 0에서 바로 끊기므로 이 안내가 중요하다.
- **잔액 0이 된 순간**(3.5):
  - 음성 인식 중이면 마이크가 꺼지고 "코인을 다 썼어요" 시트가 올라온다. 내용: 다음 무료 충전까지 남은 시간, 충전 버튼, 닫기.
  - 음성 통역(TTS)이 켜져 있으면 재생이 멈춘다.
  - 대화방 상단에 "코인이 없어 번역과 통역이 멈췄어요" 배너가 충전할 때까지 유지된다.
- **잔액 0 상태에서**:
  - 마이크·음성 통역·사진 번역 버튼을 누르면 같은 시트가 뜬다.
  - 텍스트 메시지는 보낼 수 있고, 내 메시지에는 "번역되지 않음" 표시가 붙는다.
  - 상대가 잔액 0이라 번역 없이 온 메시지에는 "번역 없음" 표시만 한다(상대의 잔액 사정은 노출하지 않는다).
- 충전(구매·일일 무료)이 들어오면 배너가 사라지고 기능이 바로 다시 켜진다. 끊겼던 음성 인식을 자동으로 다시 시작하지는 않는다.
- 대화방을 나갈 때 "이번 대화에서 31코인 사용"을 짧게 보여준다(끌 수 있음). **[결정 필요]** 넣을지 여부.

### 9.5 접근성·다국어
- 15개 지원 언어 문구 추가(`src/i18n/`). 숫자는 로케일 형식.
- 버튼 터치 영역 44pt 이상, 스크린리더 라벨(잔액, 가격) 제공.
- 가격은 스토어 제공 문자열만 사용(직접 환산 금지).

---

## 10. 작업 순서 (권장)

1. **스키마·코어**: 마이그레이션, 지갑·lot·원장 서비스, 차감 알고리즘, 일일 지연 충전, 정합성 검사. 단위 테스트와 실제 PostgreSQL 동시성 테스트.
2. **과금 계산**: 단가표, `usage_charges`, 번역·TTS·사진 과금 연결, STT 내부 과금 API. 그림자 모드로 기록만.
3. **API + 사용량 UI**: 지갑·내역·사용량 API, 잔액 칩, 사용량 화면.
4. **어드민**(main 방식 `/admin/coins`): 조회, 충전·회수, 단가표, 대시보드. 1번과 병행 가능.
5. **인앱결제**: RN 연동, 브리지, 서버 검증, 웹훅, 상점 UI. 샌드박스 결제 검증.
6. **출시 준비**: 약관, 스토어 상품 등록, 버전 정책, 그림자 모드 데이터로 단가·무료 수량 확정, 과금 활성화.

1~4는 네이티브 변경 없이 배포할 수 있다. 5부터 앱 재빌드와 스토어 심사가 필요하다.

---

## 11. 완료 기준 (수락 테스트)

- 신규 유저가 처음 접속하면 무료 1,000코인 lot과 원장 1건이 생긴다. 24시간 안에 다시 호출해도 추가 지급이 없다.
- 24시간 뒤 무료 잔액이 300이면 700만, 0이면 1,000이 지급되고, 1,000 이상이면 지급되지 않는다. 3일 뒤에 와도 한 번만 채워진다. 유료 잔액은 이 계산에 영향을 주지 않는다.
- 잔액이 0이 되면 진행 중인 STT 세션이 다음 정산 주기 안에 종료되고, 이후 STT·TTS·사진 번역 요청은 `coin_insufficient`로 거부되며, 발신 메시지는 번역 없이 전달된다. 어떤 경로로도 잔액이 음수가 되지 않는다.
- 마지막 차감이 잔액을 넘으면 잔액은 정확히 0이 되고 부족분이 `uncollected_micro`에 남는다.
- 동시에 100건의 차감을 보내도 잔액이 원장 합계와 일치하고 이중 차감이 없다.
- 무료 lot과 유료 lot이 함께 있을 때 무료가 먼저 0이 되고, 유료는 오래된 것부터 줄어든다. 어느 lot에서 얼마가 나갔는지 조회된다.
- 샌드박스 결제 1건이 서버 검증을 거쳐 한 번만 지급된다. 같은 거래를 다시 보내면 중복 지급되지 않는다. 앱을 결제 직후 강제 종료해도 다음 실행에서 지급된다.
- 환불 알림을 받으면 해당 lot이 회수되고 원장에 남는다.
- STT 10분, 번역 20건, TTS, 사진 번역 1건을 쓰면 `usage_charges`에 건별 근거(단위, 단가, 원가, 차감액)가 남고 사용량 화면 합계와 일치한다.
- 어드민 충전·회수가 사유와 함께 감사 로그에 남고 유저 화면에 "운영자 지급"으로 보인다.
- 원장 행은 수정·삭제되지 않는다(애플리케이션 경로에 UPDATE/DELETE 없음, 테스트로 보장).

---

## 12. 결정 사항

### 확정
1. 일일 무료 충전: 24시간마다 무료 잔액을 1,000까지 채운다(지급량 = 1,000 − 무료 잔액). 소급 없음.
2. 마진 배수 적용: 범위 1.5~2.0, 초기값 1.5. 단가표에서 조정.
3. 어드민: PR #231을 기다리지 않고 main 방식(`/admin/coins`)으로 바로 만든다.
4. 잔액 0: 모든 AI 기능(STT, 번역, TTS, 사진 번역)을 즉시 끊는다. 음수 잔액 없음.
5. 상품: 1·3·10·30·100달러 5종, 볼륨 보너스 0·3·6·10·15%(6.1 표).

### 권장안대로 진행 (이견 있으면 착수 전 알려줄 것)
6. 재화 이름: 코인.
7. 게시물·댓글·프로필 번역: v1 무료.
8. IAP: `react-native-iap` 직접 연동.
9. 구버전 앱: 과금 활성화 시 최소 지원 버전 상향(iOS 심사 통과 후).

### 아직 미정
10. 가입 보너스 지급 여부. (지급하지 않아도 첫 조회 때 일일 무료 1,000을 받는다.)
11. 대화 종료 시 사용 코인 요약 표시 여부.
12. 마진 최종값: 실제 단가 반영 후 "무료 1,000코인 = 통역 몇 분"을 보고받고 확정.

## 13. 작업 규칙 (이 저장소 공통)

- `pnpm db:*`는 `mingle-app`에서 실행하고, 실행 전 `DATABASE_URL` 대상을 확인한다. 운영 DB는 Railway.
- 스키마 변경 후 `pnpm db:generate`.
- 개발 서버는 자동으로 띄우지 않는다.
- 결제·지갑 관련 운영 DB 변경과 스토어 설정은 사용자 확인 후 진행한다.
