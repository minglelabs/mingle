# 블라인드 테스트 v2 평가 결과 (6종)

[v2 블라인드 문서](translation-model-blind-test-v2.md)를 Claude, GPT, Gemini가 메시지마다 A~F 전체 순위를 매겨 평가했고, 그 결과를 [v2 정답표](translation-model-blind-test-v2-key.md)로 모델에 대응시켰다.

## 점수 규칙

- 칸 값은 20개 메시지의 **평균 순위**다. 1이 최고, 6이 최하이고, 낮을수록 좋다.
- 공동 순위는 차지한 자리의 평균으로 계산했다. 예를 들어 2~4위 공동이면 3이다.

## 결과

| 모델 | Claude 평가 | GPT 평가 | Gemini 평가 | 종합 평균 순위 |
|---|---|---|---|---|
| GPT-6 Luna | 1.88 | 1.77 | 1.77 | **1.81** |
| Claude Haiku 5.5 | 2.80 | 3.10 | 3.10 | **3.00** |
| DeepSeek 1017 (OpenRouter 기본) | 3.38 | 3.65 | 3.65 | **3.56** |
| DeepSeek 1017 (공식 고정) | 3.85 | 3.77 | 3.77 | **3.80** |
| Gemini 2.5 Flash-Lite | 4.53 | 4.00 | 4.00 | **4.17** |
| Mercury 3 | 4.58 | 4.70 | 4.70 | **4.66** |

## 1위 횟수 (공동 1위 포함)

| 모델 | Claude 평가 | GPT·Gemini 평가 |
|---|---|---|
| GPT-6 Luna | 14 | 15 |
| Claude Haiku 5.5 | 6 | 6 |
| DeepSeek 1017 (OpenRouter 기본) | 3 | 4 |
| DeepSeek 1017 (공식 고정) | 3 | 5 |
| Gemini 2.5 Flash-Lite | 2 | 1 |
| Mercury 3 | 1 | 1 |

## 주의

- **GPT와 Gemini의 평가표가 완전히 같다.** 받은 응답이 중복 복사된 것으로 보이므로, 실질적인 독립 평가는 2개다. 중복을 빼고 2개만 평균해도 순위는 같다.
- **평가자도 LLM이라 자기 계열 선호가 있을 수 있다.** Claude 평가는 Haiku에게, GPT 평가는 GPT-6 Luna에게 조금 더 후했다. 다만 순위를 바꿀 정도는 아니다.
- [1차 블라인드](translation-model-blind-test-results.md)(평가자 3명, 5종)와 순위가 같다. GPT-6 Luna > Haiku > DeepSeek 두 버전 > Gemini 순이다. 새로 넣은 Mercury 3는 그 아래인 꼴찌다.
