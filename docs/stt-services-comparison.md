# STT Services and Models Comparison

Last reviewed: 2026-04-27

이 문서는 `mingle-model-test`와 별도 실험에서 검토한 STT 후보, 그리고 전세계 STT 서비스/오픈웨이트 후보 20개를 정리합니다. 사용자 평가값이 있는 항목은 아래 평가표에 그대로 반영했습니다.

출시일은 공식 문서, 공식 블로그, 공식 릴리스 노트, 또는 공식 모델 페이지에서 확인되는 날짜를 `yyyy-mm-dd`로 적었습니다. 공식 출처가 정확한 일자를 공개하지 않는 경우에는 임의 날짜를 만들지 않고 `공식 미공개`로 표기했습니다.

## Mingle Evaluation Notes

| 모델 | 최신/최고 모델명 | 최신 모델 출시일 | 결론 | 다중언어 자동감지/스위칭 | 한국어 STT 품질 | 번역 | 무료 티어 | 가격 | 레이턴시 | 안정성 | 발화 턴 분리 | 발화자 분리 | 출처/비고 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Soniox | `stt-rt-v4` | 2026-02-05 | 품질 최고급·무료가 없음·발화 분리가 500ms 이하가 안됨 | O (발화자 분리를 시켜야함) | ◎ | X | X | 0.12/h | ◎ | ◎ | △ | △ | [Soniox models](https://soniox.com/docs/stt/models) |
| Gladia | `solaria-1` | 2025-04-02 | 기능 조건 최강·성능 아쉬움 | ◎ (3+ 언어) | △ (영어 외 언어 약함) | △ (언어별 불안정) | ◎ (월 10h) | 0.6/h | ◎ | ◎ | O | X | [Gladia Solaria launch](https://www.prnewswire.com/news-releases/gladia-launches-solaria-the-first-fully-multilingual-next-generation-speech-to-text-model-for-global-scalability-302417497.html) |
| Deepgram | `nova-3` | 2025-02-12 | STT 성능 우수 | O (한국어는 안됨. 10개 언어만.) | ◎ | X | ◎ (대량 크레딧) | 0.4/h | ◎ | ◎ | △ | X | [Deepgram Nova-3 changelog](https://developers.deepgram.com/changelog/2025/2/12) |
| Fireworks | `fireworks-asr-v2` | 2025-09-24 | 실험 성공한 적 없음 | △ | X | X | ○ (18h) | 0.05/h | ○ | ○ | △ | X | [Fireworks ASR v2 model page](https://fireworks.ai/models/fireworks/fireworks-asr-v2). 기존 코드의 `fireworks-asr-large`보다 최신 모델입니다. |
| Google Translate 음성 | 공개 모델명 없음 | 공식 미공개 | 지속번역·자동감지 부족 | X | △ | ◎ | ◎ | 0 | ◎ | ◎ | X | X | 소비자용 Google Translate 음성 기능 기준입니다. STT API 모델명/출시일은 공개되어 있지 않습니다. |

## Other `mingle-model-test` Candidates

| 모델 | 최신/최고 모델명 | 최신 모델 출시일 | 현재 문서 상태 |
| --- | --- | --- | --- |
| OpenAI | `gpt-4o-transcribe` | 2025-03-20 | `mingle-model-test`는 비용/지연시간 때문에 `gpt-4o-mini-transcribe` 경로를 테스트했습니다. |
| Google Cloud Speech-to-Text | `chirp_3` | 2025-10-13 | `mingle-model-test` 선택지는 있으나 실제 연결은 아직 구현 전입니다. |
| ElevenLabs | `scribe_v2_realtime` | 2025-11-11 | `mingle-model-test`에 연결되어 있으나 사용자 평가표는 아직 없습니다. |
| Speechmatics | `Ursa 2` / Enhanced Operating Point | 2024-10-11 | `mingle-model-test`에 연결되어 있으나 사용자 평가표는 아직 없습니다. 2026-03-12에 English enhanced model update가 있었습니다. |

## Global STT Services / Models

| # | 서비스/모델 | 유형 | 최신/최고 모델명 | 최신 모델 출시일 | 출처/비고 |
| --- | --- | --- | --- | --- | --- |
| 1 | Soniox | Managed API | `stt-rt-v4` | 2026-02-05 | [Models](https://soniox.com/docs/stt/models) |
| 2 | Gladia | Managed API | `solaria-1` | 2025-04-02 | [Solaria launch](https://www.prnewswire.com/news-releases/gladia-launches-solaria-the-first-fully-multilingual-next-generation-speech-to-text-model-for-global-scalability-302417497.html) |
| 3 | Deepgram | Managed API | `nova-3` | 2025-02-12 | [Nova-3 changelog](https://developers.deepgram.com/changelog/2025/2/12) |
| 4 | Fireworks AI | Managed API | `fireworks-asr-v2` | 2025-09-24 | [Streaming ASR v2](https://fireworks.ai/models/fireworks/fireworks-asr-v2) |
| 5 | Google Cloud Speech-to-Text | Managed API | `chirp_3` | 2025-10-13 | [Speech-to-Text release notes](https://docs.cloud.google.com/speech-to-text/docs/release-notes) |
| 6 | ElevenLabs | Managed API | `scribe_v2_realtime` | 2025-11-11 | [Scribe v2 Realtime](https://elevenlabs.io/blog/introducing-scribe-v2-realtime) |
| 7 | Speechmatics | Managed API / on-prem | `Ursa 2` / Enhanced Operating Point | 2024-10-11 | [Ursa 2 launch](https://www.speechmatics.com/company/articles-and-news/ursa-2-elevating-speech-recognition-across-52-languages) |
| 8 | OpenAI | Managed API | `gpt-4o-transcribe` | 2025-03-20 | [Next-generation audio models](https://openai.com/index/introducing-our-next-generation-audio-models/) |
| 9 | AssemblyAI | Managed API | Universal-3 Pro Streaming (`u3-rt-pro`) | 2026-03-25 | [Changelog](https://www.assemblyai.com/changelog) |
| 10 | Amazon | Managed API / voice foundation model | Amazon Nova Sonic | 2025-04-08 | [Amazon press release](https://press.aboutamazon.com/2025/4/introducing-amazon-nova-sonic-a-new-gen-ai-model-for-building-voice-applications-and-agents). 순수 Transcribe API의 최신 내부 모델명은 공개되지 않았습니다. |
| 11 | Microsoft Azure Speech / Foundry | Managed API | `MAI-Transcribe-1` | 2026-04-02 | [Microsoft AI](https://microsoft.ai/?post_type=new), [Microsoft Learn](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/mai-transcribe) |
| 12 | IBM | Managed API / open model | Granite Speech 3.3 8B | 2025-04-16 | [IBM community post](https://community.ibm.com/community/user/blogs/nickolus-plowden/2025/04/16/ibm-granite-33-speech-recognition-refined-reasonin) |
| 13 | Rev AI | Managed API / open weights | Reverb ASR / Reverb Turbo | 2024-10-03 | [Reverb launch](https://www.rev.com/blog/introducing-reverb-open-source-asr-diarization) |
| 14 | NVIDIA Speech NIM / Riva | Self-hosted / enterprise containers | Nemotron ASR Streaming, Parakeet TDT/RNNT family | 2026-02-01 | [Speech NIM 26.02.0 release notes](https://docs.nvidia.com/nim/speech/latest/about/release-notes.html). 릴리스가 `26.02.0` 월 단위라 1일로 정규화했습니다. |
| 15 | Picovoice | On-device SDK | Cheetah Streaming STT / Leopard STT | 2026-04-13 | [PyPI Picovoice package list](https://pypi.org/org/Picovoice/), [Leopard docs](https://picovoice.ai/docs/leopard/) |
| 16 | OpenAI Whisper | Open weights / open-source inference | `large-v3-turbo` | 2024-09-30 | [Whisper model card](https://github.com/openai/whisper/blob/main/model-card.md). 공식 모델카드는 2024-09 월 단위, GitHub PR 기준 2024-09-30입니다. |
| 17 | Vosk | Open-source offline toolkit | Vosk API `v0.3.50` | 2024-04-22 | [Vosk GitHub](https://github.com/alphacep/vosk-api) |
| 18 | Meta Omnilingual ASR | Open weights / open-source | Omnilingual ASR 7B family | 2025-11-11 | [Meta Omnilingual ASR GitHub](https://github.com/facebookresearch/omnilingual-asr), [Meta research article](https://ai.meta.com/blog/omnilingual-asr-advancing-automatic-speech-recognition/) |
| 19 | NVIDIA NeMo | Open weights / self-hosted | Parakeet-TDT-0.6B-v3 | 2026-02-01 | [Speech NIM 26.02.0 release notes](https://docs.nvidia.com/nim/speech/latest/about/release-notes.html). NIM 문서 기준 최신 배포 모델입니다. |
| 20 | Meta wav2vec2 / XLS-R | Open weights / fine-tuning base | `wav2vec2-xls-r-2b` | 공식 미공개 | [Hugging Face model card](https://huggingface.co/facebook/wav2vec2-xls-r-2b). 모델 카드에는 정확한 출시일이 공개되어 있지 않습니다. |

## Source Notes

- Local code references: `mingle-model-test/src/app/page.tsx`, `mingle-model-test/stt-server.ts`.
- `공식 미공개` 항목은 공식 출처에서 정확한 모델 출시일을 확인할 수 없어서 임의 추정하지 않았습니다.
- 사용자 평가값은 별도 벤치마크 표본/조건을 확인하지 않고 제공된 값을 그대로 옮긴 것입니다.
