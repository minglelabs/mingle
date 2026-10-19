# 번역 모델 비교 (2026-10-18)

Gemini 2.5 Flash-Lite · GPT-6 Luna · Claude Haiku 5.5 · DeepSeek v4.1 Flash 1017

## 규모

- 메시지 **20개** (최종 턴 17개 + 중간 턴 3개)
- 메시지마다 **3회** 반복
- 모델 4개 + DeepSeek 변형 1개 = 5종
- 총 **300콜** (5종 × 20개 × 3회, 종당 60콜)

## 조건

- `mingle-app/src/server/api/handlers/v1/translate-finalize-handler.ts`의 `buildPrompt`, JSON 스키마, 프로바이더별 요청 내용을 그대로 재현했다.
- reasoning은 전부 끄고 요청했다.
  - Gemini: `thinkingBudget: 0`, `serviceTier: priority`
  - GPT: `reasoning_effort: none`, `service_tier: priority`, strict json_schema
  - Haiku: `thinking: disabled`, `effort: low`, json_schema
  - DeepSeek(OpenRouter): `reasoning.effort: none`, strict json_schema
- 실측 reasoning 토큰: GPT·DeepSeek 0, Gemini는 중간 턴 4건에서만 2개. Haiku는 thinking을 끈 상태라 응답에 해당 항목이 없다.
- 최종 턴은 운영 앱과 같이 소스 언어 재판별 모드(`sourceLanguage` / `sourceLanguagesMixed` / `sourceTextHasForeignScript` 반환)로 보냈다.
- **DeepSeek 공식 고정**은 OpenRouter에서 `provider: DeepSeek`로 고정하고 `json_object`를 쓴 변형이다. 공식 엔드포인트는 strict json_schema를 지원하지 않아 기본 라우팅에서 빠진다.

## 종합

| 모델 | 성공 | 지연 중간값 / 하위 10% | 판별 정확도 (src / mix / fs) | 번역 안 된 채 남은 텍스트 |
|---|---|---|---|---|
| Gemini 2.5 Flash-Lite | 60/60 | **1.0s** / 1.2s | 48 / 47 / 44 (51건 중) | 1 |
| **GPT-6 Luna** | 60/60 | 1.4s / 1.7s | **51 / 51 / 51** | 0 |
| Claude Haiku 5.5 | 60/60 | 1.7s / 2.4s | 48 / 51 / 51 | 0 |
| DeepSeek 1017 (OpenRouter 기본) | 58/60 | 5.0s / **15.2s** | 47 / 45 / 47 (50건 중) | 5 |
| DeepSeek 1017 (공식 고정) | 56/60 | 1.2s / 1.6s | 44 / 41 / 41 (47건 중) | 6 |

- **DeepSeek 기본 라우팅:** Cloudflare, InferenceNet, DeepInfra로 분산된다. 지연은 최대 22s였고, 2건은 13s 후 빈 응답이었다.
- **DeepSeek 공식 고정:** 스키마를 강제할 수 없다. 4건은 번역 없이 원문 언어 값만 돌려주고 끝났다.
- **판별 기대값:**
  - 11번(혼용 한·일)은 `ko / T / T`
  - 12번(혼용 한·영)은 `ko / T / T`
  - 13번(한글로 적은 일본어 발음)은 `ja / F / T`
  - 14번은 `es`
  - 나머지는 원래 소스 언어 / F / F
- **결론:** 기본 모델은 GPT-6 Luna 유지. DeepSeek 1017은 형식 실패와 지연 때문에 부적합하다.

## 테스트 메시지 목록 (20개)

| # | ID | 모드 | 소스 | 타깃 | 메시지 |
|---|---|---|---|---|---|
| 1 | `ko-casual` | 최종(언어 재판별) | ko | ko, en, ja | 아 진짜 오늘 회사에서 개빡쳤는데 부장님이 또 야근하라고 해서 그냥 퇴사각 재고 있음 |
| 2 | `ko-polite-biz` | 최종(언어 재판별) | ko | ko, en, zh-CN | 혹시 다음 주 화요일 오후 세 시쯤에 미팅 가능하실까요? 안 되시면 편하신 시간 알려주세요. |
| 3 | `ko-slang` | 최종(언어 재판별) | ko | ko, en, ja | 그 영화 완전 내 스타일이야, 보는 내내 소름 돋았고 마지막 반전은 진짜 미쳤다 ㄹㅇ |
| 4 | `ko-stt-noisy` | 최종(언어 재판별) | ko | ko, en, ja | 어 그러니까 내가 말한 건 그 그 뭐지 아 맞다 그 카페 강남역 십일번 출구 쪽에 있는 거 |
| 5 | `en-idiom` | 최종(언어 재판별) | en | en, ko, ja | Honestly I'm on the fence about it, but if it doesn't pan out we can always go back to the drawing board. |
| 6 | `en-casual` | 최종(언어 재판별) | en | en, ko, es | Dude, no way, you actually pulled it off? That's insane, drinks are on me tonight. |
| 7 | `ja-casual` | 최종(언어 재판별) | ja | ja, ko, en | えー、マジで？それ先に言ってよ、もう予約しちゃったじゃん。 |
| 8 | `ja-keigo` | 최종(언어 재판별) | ja | ja, ko, en | 本日はお忙しいところお時間をいただき、誠にありがとうございます。早速ですが本題に入らせていただきます。 |
| 9 | `zh-cn` | 최종(언어 재판별) | zh-CN | zh-CN, zh-TW, ko, en | 这个周末我们去爬山吧，听说那边的风景特别好，顺便还能吃顿火锅。 |
| 10 | `zh-tw` | 최종(언어 재판별) | zh-TW | zh-TW, zh-CN, ko | 我覺得這個方案還不錯，不過預算可能要再討論一下，你們覺得呢？ |
| 11 | `mixed-ko-ja` | 최종(언어 재판별) | ko | ko, ja, en | そんな답답해서 죽겠다고 내가 진짜로. |
| 12 | `mixed-ko-en` | 최종(언어 재판별) | ko | ko, en, ja | 이번 sprint에서 deadline 맞추려면 그 feature는 일단 빼고 가는 게 맞을 것 같아요. |
| 13 | `wrong-src-hangul-ja` | 최종(언어 재판별) | ko | ko, ja, en | 료카이데스, 스구니 우카가이마스. |
| 14 | `wrong-src-es` | 최종(언어 재판별) | ko | ko, en, ja | ¿Dónde está la estación de metro más cercana? Creo que me perdí. |
| 15 | `vi` | 최종(언어 재판별) | vi | vi, ko, en | Anh ơi, cho em hỏi cái này bao nhiêu tiền vậy? Có giảm giá không anh? |
| 16 | `ko-context` | 최종(언어 재판별) | ko | ko, en, ja | 근데 그거 걔가 먼저 시작한 거야. |
| 17 | `ko-pun-short` | 최종(언어 재판별) | ko | ko, en, ja | 응 ㅇㅋ 이따 봐 |
| 18 | `interim-ko` | 중간(is_final=no) | ko | en, ja | 내일 아침에 공항 가는 길에 혹시 |
| 19 | `interim-en` | 중간(is_final=no) | en | ko, ja | So what I was trying to say is that if we |
| 20 | `interim-ja` | 중간(is_final=no) | ja | ko, en | 明日の会議なんだけど、ちょっと |

`ko-context`는 직전 턴(“민수랑 지훈이 어제 왜 싸웠대?”, 3초 전)을 함께 보냄.

## 메시지별 결과 (1회차 번역 + 3회 지연 중간값)

최종 턴 판별값 표기: `src` 소스 언어 / `mix` 혼용 / `fs` 외래문자. ❌ = 실패(빈 응답·타깃 누락).

### 1. `ko-casual` — 아 진짜 오늘 회사에서 개빡쳤는데 부장님이 또 야근하라고 해서 그냥 퇴사각 재고 있음

| 모델 | 지연(중간값) | 판별 | ko | en | ja |
|---|---|---|---|---|---|
| Gemini 2.5 Flash-Lite | 1.1s | src=ko mix=F fs=F | 아 진짜 오늘 회사에서 개빡쳤는데 부장님이 또 야근하라고 해서 그냥 퇴사각 재고 있음 | I was so pissed off at work today, and my boss told me to work overtime again, so I'm just considering quitting. | 今日会社で本当にムカついたのに、部長にまた残業しろって言われたから、もう退職を考えてるよ。 |
| GPT-6 Luna | 1.5s | src=ko mix=F fs=F | 아 진짜 오늘 회사에서 개빡쳤는데 부장님이 또 야근하라고 해서 그냥 퇴사각 재고 있음 | Ugh, I was so pissed off at work today. The department head told me to work overtime again, so I’m seriously thinking about quitting. | あー、今日会社でマジでブチ切れたんだけど、部長にまた残業しろって言われて、もう辞めどきかなって考えてる。 |
| Claude Haiku 5.5 | 1.7s | src=ko mix=F fs=F | 아 진짜 오늘 회사에서 개빡쳤는데 부장님이 또 야근하라고 해서 그냥 퇴사각 재고 있음 | Ugh, seriously, I got super pissed off at work today, and the department head told me to work overtime again, so I'm seriously considering just quitting. | ああ本当に、今日は会社で超むかついたんだけど、部長がまた残業しろって言ってきて、もう辞める覚悟を考えてるところ。 |
| DeepSeek 1017 (OpenRouter 기본) | 4.4s | src=ko mix=F fs=F | 아 진짜 오늘 회사에서 개빡쳤는데 부장님이 또 야근하라고 해서 그냥 퇴사각 재고 있음 | Ugh, seriously, work today was so damn frustrating—the manager told me to work overtime again, so I'm literally thinking about quitting. | あーもう、今日マジで会社でめっちゃムカついたんだけど、部長がまた残業しろって言うから、もう退職を考えてる。 |
| DeepSeek 1017 (공식 고정) | 1.3s | src=ko mix=F fs=F | 아 진짜 오늘 회사에서 개빡쳤는데 부장님이 또 야근하라고 해서 그냥 퇴사각 재고 있음 | Ah seriously, I was so pissed off at work today, and the manager told me to work overtime again, so I'm just thinking about quitting. | あー本当に今日会社でめちゃくちゃ腹が立ったんだけど、部長がまた残業しろって言うから、もう退職を考えてる。 |

### 2. `ko-polite-biz` — 혹시 다음 주 화요일 오후 세 시쯤에 미팅 가능하실까요? 안 되시면 편하신 시간 알려주세요.

| 모델 | 지연(중간값) | 판별 | ko | en | zh-CN |
|---|---|---|---|---|---|
| Gemini 2.5 Flash-Lite | 1.1s | src=ko mix=F fs=F | 혹시 다음 주 화요일 오후 세 시쯤에 미팅 가능하실까요? 안 되시면 편하신 시간 알려주세요. | Would it be possible to have a meeting around 3 PM next Tuesday? If not, please let me know a time that works for you. | 请问下周二下午三点左右有空开会吗？如果不方便，请告知您方便的时间。 |
| GPT-6 Luna | 1.4s | src=ko mix=F fs=F | 혹시 다음 주 화요일 오후 세 시쯤에 미팅 가능하실까요? 안 되시면 편하신 시간 알려주세요. | Would you happen to be available for a meeting around 3 p.m. next Tuesday? If not, please let me know what time works for you. | 请问您下周二下午三点左右方便开会吗？如果不方便，请告诉我您方便的时间。 |
| Claude Haiku 5.5 | 1.6s | src=ko mix=F fs=F | 혹시 다음 주 화요일 오후 세 시쯤에 미팅 가능하실까요? 안 되시면 편하신 시간 알려주세요. | Would it be possible to meet next Tuesday around 3 PM? If that doesn't work, please let me know a time that's convenient for you. | 请问下周二下午三点左右方便开会吗？如果不方便，请告诉我您方便的时间。 |
| DeepSeek 1017 (OpenRouter 기본) | 3.4s | src=ko mix=F fs=F | 혹시 다음 주 화요일 오후 세 시쯤에 미팅 가능하실까요? 안 되시면 편하신 시간 알려주세요. | Would it be possible to have a meeting around 3 p.m. next Tuesday? If that doesn't work, please let me know a time that is convenient for you. | 请问下周二下午三点左右可以开会吗？如果不方便，请告诉我您方便的时间。 |
| DeepSeek 1017 (공식 고정) | 1.3s | src=ko mix=F fs=F | 혹시 다음 주 화요일 오후 세 시쯤에 미팅 가능하실까요? 안 되시면 편하신 시간 알려주세요. | Would it perhaps be possible to have a meeting around 3 p.m. next Tuesday? If that doesn't work, please let me know a time that is convenient for you. | 请问下周二下午三点左右可以开会吗？如果不方便的话，请告诉我您方便的时间。 |

### 3. `ko-slang` — 그 영화 완전 내 스타일이야, 보는 내내 소름 돋았고 마지막 반전은 진짜 미쳤다 ㄹㅇ

| 모델 | 지연(중간값) | 판별 | ko | en | ja |
|---|---|---|---|---|---|
| Gemini 2.5 Flash-Lite | 1.1s | src=ko mix=T fs=T | 그 영화 완전 내 스타일이야, 보는 내내 소름 돋았고 마지막 반전은 진짜 미쳤다 ㄹㅇ | That movie is totally my style, I got goosebumps the whole time I was watching it, and the final twist was really insane lol | その映画、完全に私のスタイルだよ。見ている間ずっと鳥肌が立って、最後のどんでん返しはマジでヤバかったwwww |
| GPT-6 Luna | 1.5s | src=ko mix=F fs=F | 그 영화 완전 내 스타일이야, 보는 내내 소름 돋았고 마지막 반전은 진짜 미쳤다 ㄹㅇ | That movie was totally my kind of thing. I had chills the whole time, and that final twist was seriously insane, for real. | あの映画、完全に私の好みだった。見ている間ずっと鳥肌が立ったし、最後のどんでん返しは本当にヤバかった。マジで。 |
| Claude Haiku 5.5 | 1.6s | src=ko mix=F fs=F | 그 영화 완전 내 스타일이야, 보는 내내 소름 돋았고 마지막 반전은 진짜 미쳤다 ㄹㅇ | That movie is totally my style, I got goosebumps the whole time, and the final twist was seriously insane, no cap. | あの映画は完全に私好みだよ、見ている間ずっと鳥肌が立ったし、最後のどんでん返しは本当にやばかった、マジで。 |
| DeepSeek 1017 (OpenRouter 기본) | 5.7s | src=ko mix=F fs=F | 그 영화 완전 내 스타일이야, 보는 내내 소름 돋았고 마지막 반전은 진짜 미쳤다 ㄹㅇ | That movie is totally my style, I had goosebumps the whole time watching it, and the final twist was seriously insane, for real | あの映画は完全に私の好みで、観ている間ずっと鳥肌が立ったし、最後のどんでん返しはマジでやばかった、ガチで |
| DeepSeek 1017 (공식 고정) | 1.5s | src=ko mix=F fs=F | 그 영화 완전 내 스타일이야, 보는 내내 소름 돋았고 마지막 반전은 진짜 미쳤다 ㄹㅇ | That movie is totally my style, I had goosebumps the whole time watching it, and the final twist was seriously insane, for real | あの映画は完全に私のタイプで、観ている間ずっと鳥肌が立ったし、最後のどんでん返しはマジでやばかった、ガチで |

### 4. `ko-stt-noisy` — 어 그러니까 내가 말한 건 그 그 뭐지 아 맞다 그 카페 강남역 십일번 출구 쪽에 있는 거

| 모델 | 지연(중간값) | 판별 | ko | en | ja |
|---|---|---|---|---|---|
| Gemini 2.5 Flash-Lite | 1.2s | src=ko mix=F fs=F | 어 그러니까 내가 말한 건 그 그 뭐지 아 맞다 그 카페 강남역 십일번 출구 쪽에 있는 거 | Uh, so what I was saying was that that, what is it, oh right, that cafe on the Gangnam Station Exit 11 side. | ええと、つまり私が言っていたのは、その、何だっけ、ああそう、江南駅11番出口の側にあるカフェのことです。 |
| GPT-6 Luna | 1.6s | src=ko mix=F fs=F | 어, 그러니까 내가 말한 건 그, 그 뭐지? 아, 맞다. 그 카페, 강남역 11번 출구 쪽에 있는 거. | Uh, so what I meant was that, um, what was it? Oh, right—the café near Exit 11 at Gangnam Station. | ええと、つまり私が言ったのは、あの、何だっけ？あ、そうだ。江南駅11番出口の近くにあるあのカフェ。 |
| Claude Haiku 5.5 | 2.0s | src=ko mix=F fs=F | 어 그러니까 내가 말한 건 그 그 뭐지 아 맞다 그 카페 강남역 십일번 출구 쪽에 있는 거 | Uh, so what I mentioned was, uh, what's it called, oh right, that cafe near Exit 11 at Gangnam Station. | えっと、だから私が言ったのは、あの、何だっけ、あ、そうだ、あのカフェ、江南駅11番出口の近くにあるやつです。 |
| DeepSeek 1017 (OpenRouter 기본) | 3.5s | src=ko mix=F fs=F | 어 그러니까 내가 말한 건 그 그 뭐지 아 맞다 그 카페 강남역 십일번 출구 쪽에 있는 거 | Uh, so what I meant was, that, that, what was it, oh right, that cafe, the one near Gangnam Station Exit 11 | あ、だから私が言ったのは、その、その、何だっけ、あ、そうだ、そのカフェ、江南駅11番出口の方にあるやつ |
| DeepSeek 1017 (공식 고정) | 1.2s ❌2/3 | src=ko mix=F fs=F | 어 그러니까 내가 말한 건 그 그 뭐지 아 맞다 그 카페 강남역 십일번 출구 쪽에 있는 거 | ❌ | ❌ |

### 5. `en-idiom` — Honestly I'm on the fence about it, but if it doesn't pan out we can always go back to the drawing board.

| 모델 | 지연(중간값) | 판별 | en | ko | ja |
|---|---|---|---|---|---|
| Gemini 2.5 Flash-Lite | 1.1s | src=en mix=F fs=F | Honestly I'm on the fence about it, but if it doesn't pan out we can always go back to the drawing board. | 솔직히 모르겠어요. 하지만 잘 안되면 언제든지 처음부터 다시 시작할 수 있어요. | 正直なところ、決めかねていますが、うまくいかなかった場合はいつでも白紙に戻ることができます。 |
| GPT-6 Luna | 1.4s | src=en mix=F fs=F | Honestly I'm on the fence about it, but if it doesn't pan out we can always go back to the drawing board. | 솔직히 아직 마음을 정하지 못했지만, 잘 안 되면 언제든 다시 처음부터 생각해 볼 수 있어. | 正直、まだ決めかねているけれど、うまくいかなければいつでも振り出しに戻って考え直せるよ。 |
| Claude Haiku 5.5 | 2.0s | src=en mix=F fs=F | Honestly I'm on the fence about it, but if it doesn't pan out we can always go back to the drawing board. | 솔직히 말해서 아직 결정을 못 내리겠어. 하지만 잘 안 되면 언제든 처음부터 다시 생각해 보면 돼. | 正直なところ、まだ迷っているんだ。でもうまくいかなければ、いつでも振り出しに戻って考え直せばいいよ。 |
| DeepSeek 1017 (OpenRouter 기본) | 4.9s | src=en mix=F fs=F | Honestly I'm on the fence about it, but if it doesn't pan out we can always go back to the drawing board. | 솔직히 말하면 나는 아직 결정을 못 내리고 있는데, 만약 잘 안 되면 언제든지 처음부터 다시 시작하면 돼. | 正直なところ、まだ決めかねているけど、もしうまくいかなければいつでも一からやり直せばいいよ。 |
| DeepSeek 1017 (공식 고정) | 1.2s ❌2/3 | src=en mix=F fs=F | Honestly I'm on the fence about it, but if it doesn't pan out we can always go back to the drawing board. | 솔직히 말해서 나는 아직 결정을 못 내리고 있는데, 만약 잘 안 되면 언제든지 처음부터 다시 시작하면 돼. | 正直なところ、まだ決めかねているんだけど、もしうまくいかなかったら、いつでも最初からやり直せばいいからね。 |

### 6. `en-casual` — Dude, no way, you actually pulled it off? That's insane, drinks are on me tonight.

| 모델 | 지연(중간값) | 판별 | en | ko | es |
|---|---|---|---|---|---|
| Gemini 2.5 Flash-Lite | 1.1s | src=en mix=F fs=F | Dude, no way, you actually pulled it off? That's insane, drinks are on me tonight. | 이봐, 말도 안 돼, 진짜 해냈다고? 말도 안 돼, 오늘 밤은 내가 쏜다. | Amigo, no me lo puedo creer, ¿de verdad lo has conseguido? Es una locura, la bebida corre por mi cuenta esta noche. |
| GPT-6 Luna | 1.5s | src=en mix=F fs=F | Dude, no way, you actually pulled it off? That's insane, drinks are on me tonight. | 야, 말도 안 돼, 진짜 해냈다고? 대박이다. 오늘 밤 술은 내가 살게. | Tío, no me lo puedo creer, ¿de verdad lo conseguiste? ¡Es una locura! Esta noche invito yo a las copas. |
| Claude Haiku 5.5 | 2.0s | src=en mix=F fs=F | Dude, no way, you actually pulled it off? That's insane, drinks are on me tonight. | 야, 말도 안 돼, 진짜 해냈어? 미쳤다, 오늘 밤 술은 내가 쏠게. | Tío, no me lo creo, ¿de verdad lo lograste? Es una locura, las bebidas corren por mi cuenta esta noche. |
| DeepSeek 1017 (OpenRouter 기본) | 4.2s | src=en mix=F fs=F | Dude, no way, you actually pulled it off? That's insane, drinks are on me tonight. | 야, 말도 안 돼, 진짜 해냈어? 대단하다, 오늘 밤 술은 내가 쏠게. | Tío, no puede ser, ¿de verdad lo lograste? Es una locura, esta noche las copas las invito yo. |
| DeepSeek 1017 (공식 고정) | 1.4s | src=en mix=F fs=F | Dude, no way, you actually pulled it off? That's insane, drinks are on me tonight. | 이봐, 말도 안 돼, 진짜 해냈다고? 대단한데, 오늘 밤 술은 내가 살게. | Tío, no puede ser, ¿de verdad lo lograste? Es una locura, esta noche las copas las invito yo. |

### 7. `ja-casual` — えー、マジで？それ先に言ってよ、もう予約しちゃったじゃん。

| 모델 | 지연(중간값) | 판별 | ja | ko | en |
|---|---|---|---|---|---|
| Gemini 2.5 Flash-Lite | 1.0s | src=ja mix=F fs=F | えー、マジで？それ先に言ってよ、もう予約しちゃったじゃん。 | 어, 정말? 그걸 먼저 말해줬어야지, 벌써 예약해버렸잖아. | Huh, really? You should have told me that earlier, I already made the reservation. |
| GPT-6 Luna | 1.4s | src=ja mix=F fs=F | えー、マジで？それ先に言ってよ、もう予約しちゃったじゃん。 | 에이, 진짜? 그걸 먼저 말해 줬어야지. 나 벌써 예약해 버렸잖아. | Wait, seriously? You should’ve told me that earlier—I already made a reservation. |
| Claude Haiku 5.5 | 1.7s | src=ja mix=F fs=F | えー、マジで？それ先に言ってよ、もう予約しちゃったじゃん。 | 에이, 진짜? 그거 먼저 말해 줬어야지, 벌써 예약해 버렸잖아. | Eh, seriously? You should have told me that first, I already went and made the reservation. |
| DeepSeek 1017 (OpenRouter 기본) | 4.0s | src=ja mix=F fs=F | えー、マジで？それ先に言ってよ、もう予約しちゃったじゃん。 | 에—, 진짜? 그거 먼저 말해 줘야지, 이미 예약해 버렸잖아. | Whaaat, seriously? You should've told me that first—I already made the reservation! |
| DeepSeek 1017 (공식 고정) | 1.4s | src=ja mix=F fs=F | えー、マジで？それ先に言ってよ、もう予約しちゃったじゃん。 | 에—, 진짜? 그거 먼저 말해 줘, 이미 예약해 버렸잖아. | Whaaat, seriously? You should've told me that first—I already made the reservation. |

### 8. `ja-keigo` — 本日はお忙しいところお時間をいただき、誠にありがとうございます。早速ですが本題に入らせていただきます。

| 모델 | 지연(중간값) | 판별 | ja | ko | en |
|---|---|---|---|---|---|
| Gemini 2.5 Flash-Lite | 1.0s | src=ja mix=F fs=F | 本日はお忙しいところお時間をいただき、誠にありがとうございます。早速ですが本題に入らせていただきます。 | 바쁘신 와중에도 시간을 내주셔서 정말 감사합니다. 바로 본론으로 들어가겠습니다. | Thank you very much for taking the time out of your busy schedule today. Without further ado, let's get to the main topic. |
| GPT-6 Luna | 1.4s | src=ja mix=F fs=F | 本日はお忙しいところお時間をいただき、誠にありがとうございます。早速ですが本題に入らせていただきます。 | 오늘 바쁘신 와중에도 시간을 내주셔서 진심으로 감사드립니다. 바로 본론으로 들어가겠습니다. | Thank you very much for taking the time to meet with me today despite your busy schedule. Without further ado, I’d like to get straight to the main topic. |
| Claude Haiku 5.5 | 1.6s | src=ja mix=F fs=F | 本日はお忙しいところお時間をいただき、誠にありがとうございます。早速ですが本題に入らせていただきます。 | 바쁘신 와중에 시간을 내주셔서 진심으로 감사합니다. 바로 본론으로 들어가겠습니다. | Thank you very much for taking the time out of your busy schedule today. I'd like to get straight to the main topic. |
| DeepSeek 1017 (OpenRouter 기본) | 11.8s | src=ja mix=F fs=F | 本日はお忙しいところお時間をいただき、誠にありがとうございます。早速ですが本題に入らせていただきます。 | 본일은 바쁘신 중에 시간을 내주셔서 진심으로 감사드립니다. 조속히 본론으로 들어가겠습니다. | Thank you very much for taking the time out of your busy schedule today. Without further ado, let me get to the main topic. |
| DeepSeek 1017 (공식 고정) | 1.2s | src=ja mix=F fs=F | 本日はお忙しいところお時間をいただき、誠にありがとうございます。早速ですが本題に入らせていただきます。 | 오늘은 바쁘신 와중에 시간을 내주셔서 진심으로 감사드립니다. 바로 본론으로 들어가겠습니다. | Thank you very much for taking the time out of your busy schedule today. Without further ado, let me get to the main topic. |

### 9. `zh-cn` — 这个周末我们去爬山吧，听说那边的风景特别好，顺便还能吃顿火锅。

| 모델 | 지연(중간값) | 판별 | zh-CN | zh-TW | ko | en |
|---|---|---|---|---|---|---|
| Gemini 2.5 Flash-Lite | 1.3s | src=zh-CN mix=F fs=F | 这个周末我们去爬山吧，听说那边的风景特别好，顺便还能吃顿火锅。 | 這個週末我們去爬山吧，聽說那邊的風景特別好，順便還能吃頓火鍋。 | 이번 주말에 등산 가는 거 어때? 거기 경치가 정말 좋다고 하던데, 겸사겸사 훠궈도 먹고. | Let's go hiking this weekend. I heard the scenery there is especially good, and we can have hot pot while we're at it. |
| GPT-6 Luna | 1.7s | src=zh-CN mix=F fs=F | 这个周末我们去爬山吧，听说那边的风景特别好，顺便还能吃顿火锅。 | 這個週末我們去爬山吧，聽說那邊的風景特別好，順便還能吃頓火鍋。 | 이번 주말에 우리 등산하러 가자. 거기 경치가 정말 좋다고 들었어. 가는 김에 훠궈도 먹을 수 있고. | Let’s go hiking this weekend. I heard the scenery there is especially beautiful, and we can grab hot pot while we’re at it. |
| Claude Haiku 5.5 | 2.4s | src=zh-CN mix=F fs=F | 这个周末我们去爬山吧，听说那边的风景特别好，顺便还能吃顿火锅。 | 這個週末我們去爬山吧，聽說那邊的風景特別好，順便還能吃頓火鍋。 | 이번 주말에 우리 등산 가자. 그쪽 풍경이 정말 좋다고 하던데, 겸사겸사 훠궈도 먹을 수 있어. | Let's go hiking this weekend. I heard the scenery over there is especially beautiful, and we can also grab a hot pot meal while we're at it. |
| DeepSeek 1017 (OpenRouter 기본) | 15.6s | src=zh-CN mix=F fs=F | 这个周末我们去爬山吧，听说那边的风景特别好，顺便还能吃顿火锅。 | 這個週末我們去爬山吧，聽說那邊的風景特別好，順便還能吃頓火鍋。 | 이번 주말에 우리 등산하러 가자, 거기 경치가 특히 좋다고 들었어, 겸사겸사 훠궈도 먹을 수 있어. | Let's go hiking this weekend. I heard the scenery there is especially nice, and we can grab some hot pot while we're at it. |
| DeepSeek 1017 (공식 고정) | 1.5s | src=zh-CN mix=F fs=F | 这个周末我们去爬山吧，听说那边的风景特别好，顺便还能吃顿火锅。 | 這個週末我們去爬山吧，聽說那邊的風景特別好，順便還能吃頓火鍋。 | 이번 주말에 우리 등산하러 가자, 거기 경치가 정말 좋다고 들었어, 겸사겸사 훠궈도 먹을 수 있어. | Let's go hiking this weekend; I heard the scenery there is really nice, and we can grab some hot pot along the way. |

### 10. `zh-tw` — 我覺得這個方案還不錯，不過預算可能要再討論一下，你們覺得呢？

| 모델 | 지연(중간값) | 판별 | zh-TW | zh-CN | ko |
|---|---|---|---|---|---|
| Gemini 2.5 Flash-Lite | 1.1s | src=zh-TW mix=F fs=F | 我覺得這個方案還不錯，不過預算可能要再討論一下，你們覺得呢？ | 我觉得这个方案还不错，不过预算可能要再讨论一下，你们觉得呢？ | 이 방안은 괜찮다고 생각하지만 예산에 대해서는 좀 더 논의가 필요할 것 같아요. 어떻게 생각하세요? |
| GPT-6 Luna | 1.4s | src=zh-TW mix=F fs=F | 我覺得這個方案還不錯，不過預算可能要再討論一下，你們覺得呢？ | 我觉得这个方案还不错，不过预算可能要再讨论一下，你们觉得呢？ | 이 방안은 꽤 괜찮은 것 같아요. 다만 예산은 좀 더 논의해 봐야 할 것 같은데, 여러분은 어떻게 생각하세요？ |
| Claude Haiku 5.5 | 2.0s | src=zh-TW mix=F fs=F | 我覺得這個方案還不錯，不過預算可能要再討論一下，你們覺得呢？ | 我觉得这个方案还不错，不过预算可能要再讨论一下，你们觉得呢？ | 이 방안은 괜찮은 것 같아요. 다만 예산은 다시 한번 논의해야 할 것 같은데, 여러분은 어떻게 생각하세요? |
| DeepSeek 1017 (OpenRouter 기본) | 13.4s | src=zh-TW mix=F fs=F | 我覺得這個方案還不錯，不過預算可能要再討論一下，你們覺得呢？ | 我觉得这个方案还不错，不过预算可能要再讨论一下，你们觉得呢？ | 저는 이 방안이 괜찮다고 생각하는데, 예산은 다시 논의해야 할 것 같아요. 여러분은 어떻게 생각하세요? |
| DeepSeek 1017 (공식 고정) | 1.2s | src=zh-TW mix=F fs=F | 我覺得這個方案還不錯，不過預算可能要再討論一下，你們覺得呢？ | 我觉得这个方案还不错，不过预算可能要再讨论一下，你们觉得呢？ | 저는 이 방안이 괜찮다고 생각하는데, 예산은 다시 논의해야 할 것 같아요. 여러분은 어떻게 생각하세요? |

### 11. `mixed-ko-ja` — そんな답답해서 죽겠다고 내가 진짜로.

| 모델 | 지연(중간값) | 판별 | ko | ja | en |
|---|---|---|---|---|---|
| Gemini 2.5 Flash-Lite | 1.0s | src=ja mix=T fs=T | 정말 답답해서 죽겠다고 내가 진짜로. | そんな 답답해서 死ぬほどだよ、本当に。 | I'm really frustrated to death, I swear. |
| GPT-6 Luna | 1.3s | src=ko mix=T fs=T | 그렇게 답답해서 죽겠다고, 내가 진짜로. | そんなに息苦しくて死にそうだって、私、本当に。 | I’m telling you, I’m so frustrated I could die. |
| Claude Haiku 5.5 | 1.9s | src=ja mix=T fs=T | 그렇게 답답해서 죽겠다고 내가 진짜로. | そんなに焦れったくて死にそうだって、私は本当に。 | Honestly, I'm so frustrated I could die, that's really how I feel. |
| DeepSeek 1017 (OpenRouter 기본) | 11.4s | src=ja mix=F fs=F | 그렇게 답답해서 죽겠다고 내가 진짜로. | そんな답답해서 죽겠다고 내가 진짜로. | I'm so frustrated I could die, seriously. |
| DeepSeek 1017 (공식 고정) | 1.0s | src=ja mix=F fs=F | 그렇게 답답해서 죽겠다고 내가 진짜로. | そんな답답해서 죽겠다고 내가 진짜로. | I'm telling you, I'm so frustrated I could die. |

### 12. `mixed-ko-en` — 이번 sprint에서 deadline 맞추려면 그 feature는 일단 빼고 가는 게 맞을 것 같아요.

| 모델 | 지연(중간값) | 판별 | ko | en | ja |
|---|---|---|---|---|---|
| Gemini 2.5 Flash-Lite | 1.1s | src=ko mix=F fs=F | 이번 sprint에서 deadline 맞추려면 그 feature는 일단 빼고 가는 게 맞을 것 같아요. | To meet the deadline in this sprint, I think it's best to leave that feature out for now. | 今回のスプリントで締め切りに間に合わせるためには、その機能は一旦除外していくのが正しいと思います。 |
| GPT-6 Luna | 1.4s | src=ko mix=T fs=T | 이번 스프린트에서 마감일을 맞추려면 그 기능은 일단 빼고 가는 게 맞을 것 같아요. | I think we should leave that feature out for now to meet the deadline for this sprint. | このスプリントの期限に間に合わせるには、その機能はいったん外して進めるのがよさそうです。 |
| Claude Haiku 5.5 | 2.1s | src=ko mix=T fs=T | 이번 스프린트에서 데드라인 맞추려면 그 기능은 일단 빼고 가는 게 맞을 것 같아요. | To meet the deadline in this sprint, I think it's right to leave that feature out for now. | 今回のスプリントで締め切りに間に合わせるには、その機能は一旦外して進めるのが良さそうです。 |
| DeepSeek 1017 (OpenRouter 기본) | 5.1s ❌1/3 | src=ko mix=T fs=T | 이번 sprint에서 deadline 맞추려면 그 feature는 일단 빼고 가는 게 맞을 것 같아요. | To meet the deadline in this sprint, I think it's right to leave that feature out for now. | 今回のsprintでdeadlineに間に合わせるなら、そのfeatureはいったん外して進むのが正しいと思います。 |
| DeepSeek 1017 (공식 고정) | 1.0s | src=ko mix=T fs=T | 이번 sprint에서 deadline 맞추려면 그 feature는 일단 빼고 가는 게 맞을 것 같아요. | To meet the deadline in this sprint, I think it's right to leave that feature out for now. | 今回のsprintでdeadlineに間に合わせるなら、そのfeatureはいったん外して進めるのが正しいと思います。 |

### 13. `wrong-src-hangul-ja` — 료카이데스, 스구니 우카가이마스.

| 모델 | 지연(중간값) | 판별 | ko | ja | en |
|---|---|---|---|---|---|
| Gemini 2.5 Flash-Lite | 1.1s | src=ja mix=F fs=F | 료카이데스, 스구니 우카가이마스. | 了解です。すぐに伺います。 | Understood. I will visit you right away. |
| GPT-6 Luna | 1.4s | src=ja mix=F fs=T | 알겠습니다. 바로 찾아뵙겠습니다. | 了解です。すぐに伺います。 | Understood. I’ll come right away. |
| Claude Haiku 5.5 | 1.4s | src=ja mix=F fs=T | 료카이데스, 스구니 우카가이마스. | 了解です、すぐにうかがいます。 | Understood, I'll visit right away. |
| DeepSeek 1017 (OpenRouter 기본) | 6.5s | src=ja mix=F fs=T | 료카이데스, 스구니 우카가이마스. | 了解です、すぐに伺います。 | Understood, I'll be right there. |
| DeepSeek 1017 (공식 고정) | 1.0s | src=ja mix=F fs=T | 료카이데스, 스구니 우카가이마스. | 了解です、すぐに伺います。 | Understood, I'll be right there. |

### 14. `wrong-src-es` — ¿Dónde está la estación de metro más cercana? Creo que me perdí.

| 모델 | 지연(중간값) | 판별 | ko | en | ja |
|---|---|---|---|---|---|
| Gemini 2.5 Flash-Lite | 1.0s | src=es mix=F fs=F | 가장 가까운 지하철역이 어디인가요? 제가 길을 잃은 것 같아요. | Where is the nearest metro station? I think I'm lost. | 最寄りの地下鉄駅はどこですか？道に迷ったようです。 |
| GPT-6 Luna | 1.3s | src=es mix=F fs=F | 가장 가까운 지하철역이 어디에 있나요? 길을 잃은 것 같아요. | Where is the nearest subway station? I think I’m lost. | 一番近い地下鉄の駅はどこですか？道に迷ったようです。 |
| Claude Haiku 5.5 | 1.5s | src=es mix=F fs=F | 가장 가까운 지하철역이 어디에 있나요? 길을 잃은 것 같아요. | Where is the nearest subway station? I think I got lost. | 一番近い地下鉄の駅はどこですか？道に迷ったみたいです。 |
| DeepSeek 1017 (OpenRouter 기본) | 9.5s | src=es mix=F fs=F | 가장 가까운 지하철역이 어디예요? 길을 잃은 것 같아요. | Where is the nearest subway station? I think I'm lost. | 一番近い地下鉄の駅はどこですか？道に迷ったようです。 |
| DeepSeek 1017 (공식 고정) | 1.1s | src=es mix=F fs=F | 가장 가까운 지하철역이 어디예요? 길을 잃은 것 같아요. | Where is the nearest subway station? I think I got lost. | 一番近い地下鉄の駅はどこですか？道に迷ったようです。 |

### 15. `vi` — Anh ơi, cho em hỏi cái này bao nhiêu tiền vậy? Có giảm giá không anh?

| 모델 | 지연(중간값) | 판별 | vi | ko | en |
|---|---|---|---|---|---|
| Gemini 2.5 Flash-Lite | 1.0s | src=vi mix=F fs=F | Anh ơi, cho em hỏi cái này bao nhiêu tiền vậy? Có giảm giá không anh? | 아저씨, 이거 얼마예요? 할인 되나요? | Excuse me, sir, how much is this? Is there a discount? |
| GPT-6 Luna | 1.3s | src=vi mix=F fs=F | Anh ơi, cho em hỏi cái này bao nhiêu tiền vậy? Có giảm giá không anh? | 저기요, 이거 얼마예요? 할인되나요? | Excuse me, how much is this? Is it on sale? |
| Claude Haiku 5.5 | 2.5s | src=vi mix=F fs=F | Anh ơi, cho em hỏi cái này bao nhiêu tiền vậy? Có giảm giá không anh? | 저기요, 이거 얼마예요? 할인되나요? | Excuse me, how much is this? Is there a discount? |
| DeepSeek 1017 (OpenRouter 기본) | 6.8s | src=vi mix=F fs=F | Anh ơi, cho em hỏi cái này bao nhiêu tiền vậy? Có giảm giá không anh? | 오빠, 이거 얼마예요? 할인돼요? | Excuse me, how much is this? Is there a discount? |
| DeepSeek 1017 (공식 고정) | 1.1s | src=vi mix=F fs=F | Anh ơi, cho em hỏi cái này bao nhiêu tiền vậy? Có giảm giá không anh? | 오빠, 이거 얼마예요? 할인되나요? | Excuse me, how much is this? Is there a discount? |

### 16. `ko-context` — 근데 그거 걔가 먼저 시작한 거야.

| 모델 | 지연(중간값) | 판별 | ko | en | ja |
|---|---|---|---|---|---|
| Gemini 2.5 Flash-Lite | 1.0s | src=ko mix=F fs=F | 근데 그거 걔가 먼저 시작한 거야. | But he/she started that first. | でも、それは彼（彼女）が先に始めたことだよ。 |
| GPT-6 Luna | 1.3s | src=ko mix=F fs=F | 근데 그거 걔가 먼저 시작한 거야. | But they started it first. | でも、それはあの人が先に始めたんだよ。 |
| Claude Haiku 5.5 | 1.6s | src=ko mix=F fs=F | 근데 그거 걔가 먼저 시작한 거야. | But that one, he started it first. | でもそれ、あの子が先に始めたんだよ。 |
| DeepSeek 1017 (OpenRouter 기본) | 1.5s | src=ko mix=F fs=F | 근데 그거 걔가 먼저 시작한 거야. | But that, he's the one who started it first. | でもそれ、あの子が先に始めたんだよ。 |
| DeepSeek 1017 (공식 고정) | 1.1s | src=ko mix=F fs=F | 근데 그거 걔가 먼저 시작한 거야. | But he was the one who started that first. | でも、それはあの子が先に始めたことだよ。 |

### 17. `ko-pun-short` — 응 ㅇㅋ 이따 봐

| 모델 | 지연(중간값) | 판별 | ko | en | ja |
|---|---|---|---|---|---|
| Gemini 2.5 Flash-Lite | 0.9s | src=ko mix=F fs=F | 응 ㅇㅋ 이따 봐 | Yeah, okay. See you later. | うん、OK。後でね。 |
| GPT-6 Luna | 1.1s | src=ko mix=F fs=F | 응, 오케이. 이따 봐. | Yeah, okay. See you later. | うん、オッケー。またあとでね。 |
| Claude Haiku 5.5 | 1.3s | src=ko mix=F fs=F | 응 ㅇㅋ 이따 봐 | Yeah, okay, see you later | うん、オッケー、また後でね |
| DeepSeek 1017 (OpenRouter 기본) | 4.3s | src=ko mix=F fs=F | 응 ㅇㅋ 이따 봐 | Yeah, OK, see you later | うん、オッケー、また後でね |
| DeepSeek 1017 (공식 고정) | 1.2s | src=ko mix=T fs=T | 응 ㅇㅋ 이따 봐 | Yeah, OK, see you later | うん、オッケー、また後でね |

### 18. `interim-ko` — 내일 아침에 공항 가는 길에 혹시

| 모델 | 지연(중간값) | en | ja |
|---|---|---|---|
| Gemini 2.5 Flash-Lite | 0.9s | On my way to the airport tomorrow morning, by any chance | 明日の朝、空港に向かう途中で、もしよろしければ |
| GPT-6 Luna | 1.2s | Maybe on the way to the airport tomorrow morning... | 明日の朝、空港へ行く途中に、もしかして… |
| Claude Haiku 5.5 | 1.7s | On the way to the airport tomorrow morning, by any chance | 明日の朝、空港へ行く途中で、もしかして |
| DeepSeek 1017 (OpenRouter 기본) | 12.8s ❌1/3 | On the way to the airport tomorrow morning, by any chance | 明日の朝、空港へ行く途中で、もしかしたら |
| DeepSeek 1017 (공식 고정) | 1.0s | On the way to the airport tomorrow morning, by any chance | 明日の朝、空港へ行く途中で、もしかしたら |

### 19. `interim-en` — So what I was trying to say is that if we

| 모델 | 지연(중간값) | ko | ja |
|---|---|---|---|
| Gemini 2.5 Flash-Lite | 0.9s | 그래서 제가 말하려고 했던 것은 만약 우리가 | それで私が言おうとしていたのは、もし私たちが |
| GPT-6 Luna | 1.2s | 그러니까 제가 말하려던 건, 만약 우리가 | つまり、私が言おうとしていたのは、もし私たちが |
| Claude Haiku 5.5 | 1.3s | 그래서 제가 말하려던 건, 만약 우리가 | つまり私が言いたかったのは、もし私たちが |
| DeepSeek 1017 (OpenRouter 기본) | 1.1s | 그래서 제가 말하려던 것은 만약 우리가 | それで私が言おうとしていたのは、もし私たちが |
| DeepSeek 1017 (공식 고정) | 1.3s | 그래서 제가 말하려던 것은 만약 우리가 | それで私が言おうとしていたのは、もし私たちが |

### 20. `interim-ja` — 明日の会議なんだけど、ちょっと

| 모델 | 지연(중간값) | ko | en |
|---|---|---|---|
| Gemini 2.5 Flash-Lite | 0.9s | 내일 회의 말인데, 잠깐 | About tomorrow's meeting, just a moment |
| GPT-6 Luna | 1.3s | 내일 회의 말인데, 좀… | About tomorrow’s meeting, I was just… |
| Claude Haiku 5.5 | 1.8s | 내일 회의 말인데, 좀 | About tomorrow's meeting, it's just a bit |
| DeepSeek 1017 (OpenRouter 기본) | 3.8s | 내일 회의인데, 좀 | About tomorrow's meeting, just a bit— |
| DeepSeek 1017 (공식 고정) | 1.4s | 내일 회의인데, 잠깐 | About tomorrow's meeting, just a bit |

## 추가: Mercury 3 (2026-10-20)

- `inception/mercury-3`를 OpenRouter로 호출했다. 기존 DeepSeek와 같은 방식(strict json_schema, `reasoning.effort: none`)이고, 같은 메시지 20개를 3회씩 총 60콜 보냈다.
- reasoning 토큰은 60콜 전부 0이었다. 1차 실행에서 15건이 Inception 쪽 429(속도 제한)로 실패해, 그 회차만 3초 간격으로 다시 돌려 채웠다.
- 블라인드 평가는 Mercury 3 추가 전에 끝나서, 평가자 점수에는 포함되지 않는다.

| 모델 | 성공 | 지연 중간값 / 하위 10% | 판별 정확도 (src / mix / fs) | 번역 안 된 채 남은 텍스트 | 1천 건당 (OpenRouter 표준가) |
|---|---|---|---|---|---|
| Mercury 3 | 60/60 (재시도 후) | **0.8s** / 1.1s | 48 / 48 / 51 (51건 중) | 3 | $0.12 |
| (참고) GPT-6 Luna | 60/60 | 1.4s / 1.7s | 51 / 51 / 51 | 0 | $0.10 |

- **좋았던 점:** 지금까지 비교한 모델 중 가장 빠르다. 일반 구어·비즈니스·중국어 번역은 무난하다.
- **문제점:**
  - 11번(혼용 한·일): 일본어 칸에 원문을 그대로 넣었다.
  - 12번(혼용 한·영): 혼용 여부를 false로 판단했다.
  - 13번(한글로 적은 일본어 발음): 한국어 칸에 발음을 그대로 반복했고, 伺います를 영어 "inquire"로 오역했다.
  - 15번: 베트남어 "anh"을 "오빠"로 옮겼다.
  - 16번: "was started by him first"처럼 어색한 수동태를 썼다.
  - 20번: ちょっと를 "잠깐 / just a moment"로 오역했다.
- **판단:** 품질은 Gemini·DeepSeek와 비슷하고, GPT-6 Luna·Haiku보다는 낮다.

### Mercury 3 메시지별 결과 (1회차 번역 + 3회 지연 중간값)

1. **아 진짜 오늘 회사에서 개빡쳤는데 부장님이 또 야근하라고 해서 그냥 퇴사각 재고 있음** — 0.9s · src=ko mix=F fs=F · en: Ugh, I’m so pissed off at work today. The department head told me to work overtime again, so I’m just thinking about quitting. / ja: あー本当に今日会社でむかついてるんだけど、部長がまた残業しろって言うから、もう辞めること考えてる。
2. **혹시 다음 주 화요일 오후 세 시쯤에 미팅 가능하실까요? 안 되시면 편하신 시간 알려주세요.** — 0.7s · src=ko mix=F fs=F · en: Would it be possible for you to meet next Tuesday around 3 p.m.? If not, please let me know a time that works for you. / zh-CN: 请问下周二下午三点左右可以见面吗？如果不行的话，请告诉我您方便的时间。
3. **그 영화 완전 내 스타일이야, 보는 내내 소름 돋았고 마지막 반전은 진짜 미쳤다 ㄹㅇ** — 1.2s · src=ko mix=F fs=F · en: That movie is totally my style, I got chills the whole time, and the final twist was insane, fr / ja: あの映画は完全に私のタイプだ、見ている間ずっと鳥肌が立って、最後のどんでん返しは本当にやばかった、マジで
4. **어 그러니까 내가 말한 건 그 그 뭐지 아 맞다 그 카페 강남역 십일번 출구 쪽에 있는 거** — 1.0s · src=ko mix=F fs=F · en: Oh, so what I was saying is, um, what was it—ah, right, it’s that café near exit 11 at Gangnam Station. / ja: あーだから、私が言ってたのは、その、あの、なんだっけ、あそうだ、そのカフェは江南駅の11番出口の辺りにあるやつ。
5. **Honestly I'm on the fence about it, but if it doesn't pan out we can always go back to the drawing board.** — 1.0s · src=en mix=F fs=F · ko: 솔직히 그것에 대해 고민 중이지만, 잘 안 되면 언제든지 원점에서 다시 시작할 수 있어. / ja: 正直、それについては迷っているけど、うまくいかなければいつでも振り出しに戻れる。
6. **Dude, no way, you actually pulled it off? That's insane, drinks are on me tonight.** — 0.9s · src=en mix=F fs=F · ko: 야, 설마, 진짜 해냈어? 정말 미쳤네, 오늘 밤 술은 내가 쏜다. / es: Tío, no puede ser, ¿en serio lo lograste? Eso es una locura, esta noche los tragos los pago yo.
7. **えー、マジで？それ先に言ってよ、もう予約しちゃったじゃん。** — 0.8s · src=ja mix=F fs=F · ko: 어, 진짜? 그걸 먼저 말해줬어야지, 벌써 예약해버렸잖아. / en: Eh, seriously? You should've said that earlier—I've already made a reservation.
8. **本日はお忙しいところお時間をいただき、誠にありがとうございます。早速ですが本題に入らせていただきます。** — 1.0s · src=ja mix=F fs=F · ko: 오늘 바쁘신 중에 시간을 내주셔서 정말로 감사합니다. 바로 본론으로 들어가겠습니다. / en: Thank you very much for taking time out of your busy schedule today. Let me get straight to the main topic.
9. **这个周末我们去爬山吧，听说那边的风景特别好，顺便还能吃顿火锅。** — 0.9s · src=zh-CN mix=F fs=F · zh-TW: 這個週末我們去爬山吧，聽說那邊的風景特別好，順便還能吃頓火鍋。 / ko: 이번 주말에 우리 등산 가자, 저쪽 경치가 정말 좋다고 들었어, 겸사겸사 훠궈도 먹을 수 있어. / en: Let's go hiking this weekend. I heard the scenery there is really nice, and we can also grab hotpot while we're at it.
10. **我覺得這個方案還不錯，不過預算可能要再討論一下，你們覺得呢？** — 1.0s · src=zh-TW mix=F fs=F · zh-CN: 我觉得这个方案还不错，不过预算可能要再讨论一下，你们觉得呢？ / ko: 이 방안은 괜찮다고 생각하지만, 예산은 다시 논의해야 할 수도 있습니다. 여러분은 어떻게 생각하세요?
11. **そんな답답해서 죽겠다고 내가 진짜로.** — 0.9s · src=ja mix=T fs=T · ko: 그렇게 답답해서 죽겠다고 내가 진짜로. / ja: そんな답답해서 죽겠다고 내가 진짜로. / en: I’m really dying from being so frustrated like that.
12. **이번 sprint에서 deadline 맞추려면 그 feature는 일단 빼고 가는 게 맞을 것 같아요.** — 1.1s · src=ko mix=F fs=T · en: To meet the deadline this sprint, I think we should drop that feature for now. / ja: 今回のスプリントで締め切りに間に合わせるには、その機能はひとまず外して進めるのが正しいと思います。
13. **료카이데스, 스구니 우카가이마스.** — 0.9s · src=ja mix=F fs=T · ko: 료카이데스, 스구니 우카가이마스 / ja: 了解です、すぐに伺います / en: Understood, I will inquire immediately.
14. **¿Dónde está la estación de metro más cercana? Creo que me perdí.** — 0.6s · src=es mix=F fs=F · ko: 가장 가까운 지하철 역이 어디에 있나요? 길을 잃은 것 같아요. / en: Where is the nearest metro station? I think I got lost. / ja: 一番近い地下鉄の駅はどこですか？道に迷ったと思います。
15. **Anh ơi, cho em hỏi cái này bao nhiêu tiền vậy? Có giảm giá không anh?** — 0.6s · src=vi mix=F fs=F · ko: 오빠, 이거 얼마예요? 할인 있어요? / en: Hey, can I ask how much this is? Is there a discount?
16. **근데 그거 걔가 먼저 시작한 거야.** — 0.6s · src=ko mix=F fs=F · en: But that was started by him first. / ja: でも、それは彼が先に始めたんだ。
17. **응 ㅇㅋ 이따 봐** — 0.8s · src=ko mix=F fs=F · en: Okay, see you later. / ja: うん、オーケー、あとでね。
18. **내일 아침에 공항 가는 길에 혹시** — 0.6s · en: On the way to the airport tomorrow morning, if by any chance... / ja: 明日の朝、空港に向かう途中で、もし...
19. **So what I was trying to say is that if we** — 0.5s · ko: 그래서 제가 말하려던 것은 만약 우리가 / ja: だから私が言おうとしていたのは、もし私たちが
20. **明日の会議なんだけど、ちょっと** — 0.4s · ko: 내일 회의에 대해서인데, 잠깐 / en: About tomorrow's meeting, just a moment
