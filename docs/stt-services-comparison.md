# STT Services and Models Comparison

Last reviewed: 2026-04-27

아래 표는 사용자 평가표에 최신/최고 모델명과 최신 모델 출시일을 추가하고, 조사한 STT 서비스/오픈웨이트 후보를 같은 형식으로 확장한 것입니다. 사용자 평가가 없는 항목은 아직 Mingle 실측 전이므로 `미평가` 또는 `공식 확인 필요`로 남겼습니다.

| 모델 | 최신/최고 모델명 | 최신 모델 출시일 | 결론 | 다중언어 자동감지/스위칭 | 한국어 STT 품질 | 번역 | 무료 티어 | 가격 | 레이턴시 | 안정성 | 발화 턴 분리 | 발화자 분리 | 비고 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Soniox | `stt-rt-v4` | 2026-02-05 | 품질 최고급·무료가 없음·발화 분리가 500ms 이하가 안됨 | O (발화자 분리를 시켜야함) | ◎ | X | X | 0.12/h | ◎ | ◎ | △ | △ | [공식 모델 문서](https://soniox.com/docs/stt/models) |
| Gladia | `solaria-1` | 2025-04-02 | 기능 조건 최강·성능 아쉬움 | ◎ (3+ 언어) | △ (영어 외 언어 약함) | △ (언어별 불안정) | ◎ (월 10h) | 0.6/h | ◎ | ◎ | O | X | [Solaria 출시 공지](https://www.prnewswire.com/news-releases/gladia-launches-solaria-the-first-fully-multilingual-next-generation-speech-to-text-model-for-global-scalability-302417497.html) |
| Deepgram | `nova-3` | 2025-02-12 | STT 성능 우수 | O (한국어는 안됨. 10개 언어만.) | ◎ | X | ◎ (대량 크레딧) | 0.4/h | ◎ | ◎ | △ | X | [Nova-3 changelog](https://developers.deepgram.com/changelog/2025/2/12) |
| Fireworks | `fireworks-asr-v2` | 2025-09-24 | 실험 성공한 적 없음 | △ | X | X | ○ (18h) | 0.05/h | ○ | ○ | △ | X | [ASR v2 모델 페이지](https://fireworks.ai/models/fireworks/fireworks-asr-v2). 기존 코드의 `fireworks-asr-large`보다 최신 |
| Google Translate 음성 | 공개 모델명 없음 | 공식 미공개 | 지속번역·자동감지 부족 | X | △ | ◎ | ◎ | 0 | ◎ | ◎ | X | X | 소비자용 Google Translate 음성 기능 기준. STT API 모델명/출시일은 공개되어 있지 않음 |
| OpenAI | `gpt-4o-transcribe` | 2025-03-20 | 정확도 기준 후보·언어 태그/발화자 분리 약함 | O | ◎ | X | X | 공식 확인 필요 | ○ | ◎ | △ | X | [차세대 오디오 모델 출시](https://openai.com/index/introducing-our-next-generation-audio-models/). `mingle-model-test`는 `gpt-4o-mini-transcribe` 경로 사용 |
| Google Cloud Speech-to-Text | `chirp_3` | 2025-10-13 | 클라우드 표준 후보·Mingle 연결은 아직 미구현 | O | 미평가 | X | ○ | 공식 확인 필요 | ○ | ◎ | △ | O | [Speech-to-Text release notes](https://docs.cloud.google.com/speech-to-text/docs/release-notes) |
| ElevenLabs | `scribe_v2_realtime` | 2025-11-11 | 저지연 실시간 후보·Mingle 실측 평가 필요 | ◎ | 미평가 | X | ○ | 공식 확인 필요 | ◎ | ○ | O | △ | [Scribe v2 Realtime 출시 공지](https://elevenlabs.io/blog/introducing-scribe-v2-realtime) |
| Speechmatics | `Ursa 2` / Enhanced Operating Point | 2024-10-11 | 엔터프라이즈/온프렘 후보·언어 조합 제약 확인 필요 | △ | 미평가 | X | X | 공식 확인 필요 | ○ | ◎ | O | △ | [Ursa 2 출시 공지](https://www.speechmatics.com/company/articles-and-news/ursa-2-elevating-speech-recognition-across-52-languages) |
| AssemblyAI | Universal-3 Pro Streaming (`u3-rt-pro`) | 2026-03-25 | 프롬프트 가능한 STT 후보·최신 스트리밍은 6개 언어 중심 | O (6개 언어 중심) | X | X | ○ | 공식 확인 필요 | ○ | ○ | O | O | [AssemblyAI changelog](https://www.assemblyai.com/changelog) |
| Amazon | Amazon Nova Sonic | 2025-04-08 | AWS 음성 에이전트 후보·순수 Transcribe 최신 내부 모델명은 비공개 | O | 미평가 | X | ○ | 공식 확인 필요 | ○ | ◎ | △ | O | [Amazon Nova Sonic 공지](https://press.aboutamazon.com/2025/4/introducing-amazon-nova-sonic-a-new-gen-ai-model-for-building-voice-applications-and-agents) |
| Microsoft Azure Speech / Foundry | `MAI-Transcribe-1` | 2026-04-02 | 최신 Azure 후보·현재 public preview라 운영 안정성 확인 필요 | O | 미평가 | X | ○ | 0.36/h | ○ | △ | △ | △ | [Microsoft AI 공지](https://microsoft.ai/?post_type=new), [Microsoft Learn](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/mai-transcribe) |
| IBM | Granite Speech 3.3 8B | 2025-04-16 | 오픈/엔터프라이즈 후보·실시간 제품화 검증 필요 | △ | 미평가 | O | ○ | 자체 호스팅 비용 | △ | △ | X | X | [IBM Granite 3.3 공지](https://community.ibm.com/community/user/blogs/nickolus-plowden/2025/04/16/ibm-granite-33-speech-recognition-refined-reasonin) |
| Rev AI | Reverb ASR / Reverb Turbo | 2024-10-03 | 장문 전사/diarization 후보·라이선스와 한국어 품질 확인 필요 | O | 미평가 | X | ○ | 공식 확인 필요 | ○ | ◎ | △ | O | [Reverb 출시 공지](https://www.rev.com/blog/introducing-reverb-open-source-asr-diarization) |
| NVIDIA Speech NIM / Riva | Nemotron ASR Streaming, Parakeet TDT/RNNT family | 2026-02-01 | 자체 인프라 후보·GPU 운영 부담 큼 | △ | 미평가 | X | X | 자체 GPU 비용 | ◎ | ○ | O | O | [Speech NIM 26.02.0 release notes](https://docs.nvidia.com/nim/speech/latest/about/release-notes.html). 월 단위 릴리스라 1일로 정규화 |
| Picovoice | Cheetah Streaming STT / Leopard STT | 2026-04-13 | 온디바이스 후보·지원 언어와 라이선스 확인 필요 | △ | ○ | X | ○ | 공식 확인 필요 | ◎ | ○ | O | △ | [Picovoice package list](https://pypi.org/org/Picovoice/), [Leopard docs](https://picovoice.ai/docs/leopard/) |
| OpenAI Whisper | `large-v3-turbo` | 2024-09-30 | 로컬/오픈소스 기준선·실시간 제품화는 직접 구성 필요 | O | ○ | O | ◎ | 자체 호스팅 비용 | △ | ○ | X | X | [Whisper model card](https://github.com/openai/whisper/blob/main/model-card.md). 공식 모델카드는 2024-09 월 단위, GitHub PR 기준 2024-09-30 |
| Vosk | Vosk API `v0.3.50` | 2024-04-22 | 초경량 오프라인 후보·최신 neural STT 대비 품질 한계 | X | X | X | ◎ | 0 / 자체 호스팅 비용 | ◎ | ○ | △ | △ | [Vosk GitHub](https://github.com/alphacep/vosk-api) |
| Meta Omnilingual ASR | Omnilingual ASR 7B family | 2025-11-11 | 초다국어/저자원 언어 연구 후보·실시간 운영은 무거움 | ◎ | 미평가 | X | ◎ | 자체 호스팅 비용 | △ | △ | X | X | [GitHub](https://github.com/facebookresearch/omnilingual-asr), [Meta research article](https://ai.meta.com/blog/omnilingual-asr-advancing-automatic-speech-recognition/) |
| NVIDIA NeMo | Parakeet-TDT-0.6B-v3 | 2026-02-01 | 오픈웨이트 고속 ASR 후보·한국어와 diarization은 별도 구성 필요 | △ | X | X | ◎ | 자체 호스팅 비용 | ◎ | △ | O | X | [Speech NIM 26.02.0 release notes](https://docs.nvidia.com/nim/speech/latest/about/release-notes.html). NIM 문서 기준 최신 배포 모델 |
