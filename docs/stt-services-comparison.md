# STT Services and Models Comparison

Last reviewed: 2026-10-28

아래 표는 사용자 평가표에 최신/최고 모델명, 최신 모델 출시일, 시간당 가격을 추가하고, 조사한 STT 서비스/오픈웨이트 후보를 같은 형식으로 확장한 것입니다. 가격은 USD 기준의 오디오 1시간당 비용입니다. 공식 시간당 과금이 없는 오픈웨이트/자체호스팅 항목은 고동시성 또는 배치 처리 시의 추론 인프라 비용만 추산했으며, 유휴 GPU, 엔지니어링, 저장소, 네트워크, 엔터프라이즈 라이선스 비용은 제외했습니다.

표는 가로 스크롤을 전제로 한 넓은 비교표입니다. 각 헤더의 작은 설명은 해당 칼럼이 무엇을 뜻하는지 나타냅니다.

<div style="max-width: 100%; overflow-x: auto;">
<table width="3950" style="min-width: 3950px; table-layout: fixed;">
  <colgroup>
    <col width="220">
    <col width="330">
    <col width="160">
    <col width="170">
    <col width="340">
    <col width="320">
    <col width="230">
    <col width="160">
    <col width="220">
    <col width="170">
    <col width="170">
    <col width="190">
    <col width="190">
    <col width="1280">
  </colgroup>
  <thead>
    <tr>
      <th width="220" nowrap="nowrap">&nbsp;&nbsp;모&#8288;델&nbsp;&nbsp;<br><sub>서비스/모델군</sub></th>
      <th width="330" nowrap="nowrap">&nbsp;&nbsp;최&#8288;신/최&#8288;고&nbsp;모&#8288;델&nbsp;&nbsp;<br><sub>대표&nbsp;모델명</sub></th>
      <th width="160" nowrap="nowrap">&nbsp;&nbsp;출&#8288;시&#8288;일&nbsp;&nbsp;<br><sub>YYYY-MM-DD</sub></th>
      <th width="170" nowrap="nowrap">&nbsp;&nbsp;실&#8288;시&#8288;간&nbsp;&nbsp;<br><sub>스트리밍&nbsp;지원</sub></th>
      <th width="340" nowrap="nowrap">&nbsp;&nbsp;시&#8288;간&#8288;당&nbsp;가&#8288;격&nbsp;&nbsp;<br><sub>USD/audio&nbsp;hour</sub></th>
      <th width="320" nowrap="nowrap">&nbsp;&nbsp;언&#8288;어&nbsp;감&#8288;지/스&#8288;위&#8288;칭&nbsp;&nbsp;<br><sub>다국어&nbsp;자동&nbsp;처리</sub></th>
      <th width="230" nowrap="nowrap">&nbsp;&nbsp;한&#8288;국&#8288;어&nbsp;품&#8288;질&nbsp;&nbsp;<br><sub>STT&nbsp;정확도</sub></th>
      <th width="160" nowrap="nowrap">&nbsp;&nbsp;번&#8288;역&nbsp;&nbsp;<br><sub>내장</sub></th>
      <th width="220" nowrap="nowrap">&nbsp;&nbsp;무&#8288;료&nbsp;티&#8288;어&nbsp;&nbsp;<br><sub>체험/크레딧</sub></th>
      <th width="170" nowrap="nowrap">&nbsp;&nbsp;레&#8288;이&#8288;턴&#8288;시&nbsp;&nbsp;<br><sub>실시간성</sub></th>
      <th width="170" nowrap="nowrap">&nbsp;&nbsp;안&#8288;정&#8288;성&nbsp;&nbsp;<br><sub>운영&nbsp;신뢰도</sub></th>
      <th width="190" nowrap="nowrap">&nbsp;&nbsp;턴&nbsp;분&#8288;리&nbsp;&nbsp;<br><sub>발화&nbsp;단위</sub></th>
      <th width="190" nowrap="nowrap">&nbsp;&nbsp;화&#8288;자&nbsp;분&#8288;리&nbsp;&nbsp;<br><sub>diarization</sub></th>
      <th width="1280" nowrap="nowrap">&nbsp;&nbsp;비&#8288;고&nbsp;&nbsp;<br><sub>근거/가정</sub></th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Soniox</td>
      <td><code>stt-rt-v5</code></td>
      <td>2026-06-16</td>
      <td align="center">O</td>
      <td>$0.12/h RT<br>$0.10/h async</td>
      <td>O (발화자 분리를 시켜야함)</td>
      <td align="center">◎</td>
      <td>◎ (추가 비용 없음)</td>
      <td align="center">X</td>
      <td align="center">◎</td>
      <td align="center">◎</td>
      <td align="center">△</td>
      <td align="center">△</td>
      <td><a href="https://soniox.com/pricing">공식 가격표</a>, <a href="https://soniox.com/docs/stt/models">공식 모델 문서</a>. <code>stt-rt-v4</code>는 2026-06-30 종료되어 v5로 자동 라우팅. 60+ 언어 실시간 번역이 같은 API 호출에 포함</td>
    </tr>
    <tr>
      <td>Gladia</td>
      <td><code>solaria-1</code></td>
      <td>2025-04-02</td>
      <td align="center">O</td>
      <td>$0.75/h RT<br>$0.61/h async<br>Growth: $0.25/h RT, $0.20/h async부터</td>
      <td>◎ (3+ 언어)</td>
      <td>△ (영어 외 언어 약함)</td>
      <td>△ (언어별 불안정)</td>
      <td>◎ (€50 크레딧, RT 약 60h / async 약 80h)</td>
      <td align="center">◎</td>
      <td align="center">◎</td>
      <td align="center">O</td>
      <td align="center">X</td>
      <td><a href="https://www.gladia.io/pricing">공식 가격표</a>, <a href="https://www.prnewswire.com/news-releases/gladia-launches-solaria-the-first-fully-multilingual-next-generation-speech-to-text-model-for-global-scalability-302417497.html">Solaria 출시 공지</a>. 무료 티어는 기존 월 10h에서 Starter 가입 시 €50 크레딧으로 변경됨. <code>solaria-3</code>(2026-06-10)는 영어/유럽어 중심이라 다국어·한국어 용도는 <code>solaria-1</code> 유지</td>
    </tr>
    <tr>
      <td>Deepgram</td>
      <td><code>nova-3</code></td>
      <td>2025-02-12</td>
      <td align="center">O</td>
      <td>$0.462/h mono<br>$0.552/h multi</td>
      <td>O (55개 언어, 한국어 포함)</td>
      <td align="center">◎</td>
      <td align="center">X</td>
      <td>◎ (대량 크레딧)</td>
      <td align="center">◎</td>
      <td align="center">◎</td>
      <td align="center">△</td>
      <td align="center">X</td>
      <td><a href="https://deepgram.com/pricing">공식 가격표</a>, <a href="https://developers.deepgram.com/changelog/2025/2/12">Nova-3 changelog</a>, <a href="https://developers.deepgram.com/docs/models-languages-overview">Models &amp; Languages</a>. diarization은 +$0.12/h. 2026-10-23 Nova-3 Multilingual이 55개 언어로 확장되며 한국어 포함(<code>language_hint</code> 추가). 한국어 품질 칸은 단일 언어 모델 기준. Flux(<code>flux-general-multi</code>)는 10개 언어로 한국어 미지원</td>
    </tr>
    <tr>
      <td>Fireworks</td>
      <td><code>fireworks-asr-v2</code></td>
      <td>2025-09-24</td>
      <td align="center">O</td>
      <td>$0.054/h turbo<br>$0.09/h large</td>
      <td align="center">△</td>
      <td align="center">X</td>
      <td align="center">X</td>
      <td>○ (18h)</td>
      <td align="center">○</td>
      <td align="center">○</td>
      <td align="center">△</td>
      <td align="center">X</td>
      <td><a href="https://fireworks.ai/pricing">공식 가격표</a>, <a href="https://fireworks.ai/models/fireworks/fireworks-asr-v2">ASR v2 모델 페이지</a>. 가격표의 STT 항목은 Whisper v3 계열 기준, diarization은 +40%</td>
    </tr>
    <tr>
      <td>Google Translate 음성</td>
      <td>공개 모델명 없음</td>
      <td>공식 미공개</td>
      <td align="center">O</td>
      <td>$0/h (소비자 앱)</td>
      <td align="center">X</td>
      <td align="center">△</td>
      <td align="center">◎</td>
      <td align="center">◎</td>
      <td align="center">◎</td>
      <td align="center">◎</td>
      <td align="center">X</td>
      <td align="center">X</td>
      <td>소비자용 Google Translate 음성 기능 기준. STT API 모델명/출시일은 공개되어 있지 않음</td>
    </tr>
    <tr>
      <td>OpenAI</td>
      <td><code>gpt-live-transcribe</code> (RT)<br><code>gpt-transcribe</code> (batch)</td>
      <td>2026-07-28</td>
      <td>O (<code>gpt-live-transcribe</code>)</td>
      <td>$1.02/h RT<br>$0.27/h batch</td>
      <td align="center">O</td>
      <td align="center">◎</td>
      <td align="center">X</td>
      <td align="center">X</td>
      <td align="center">○</td>
      <td align="center">◎</td>
      <td align="center">△</td>
      <td align="center">X</td>
      <td><a href="https://platform.openai.com/docs/pricing/">공식 가격표</a>, <a href="https://openai.com/index/introducing-our-next-generation-audio-models/">차세대 오디오 모델 출시</a>, <a href="https://developers.openai.com/api/docs/models/gpt-live-transcribe">gpt-live-transcribe 모델 문서</a>. 2026-07-28 <code>gpt-live-transcribe</code>(Realtime transcription 세션, $0.017/min)와 <code>gpt-transcribe</code>(파일/배치, $0.0045/min, 2차 출처) 출시. 2026-05에 <code>gpt-realtime-whisper</code>도 나옴. 평가 칸은 <code>gpt-4o-transcribe</code> 당시 값. <code>mingle-model-test</code>는 <code>gpt-4o-mini-transcribe</code> 경로 사용</td>
    </tr>
    <tr>
      <td>Google Cloud Speech-to-Text</td>
      <td><code>chirp_3</code></td>
      <td>2025-10-13</td>
      <td align="center">O</td>
      <td>$0.96/h standard<br>$0.18/h dynamic batch</td>
      <td align="center">O</td>
      <td>미평가</td>
      <td align="center">X</td>
      <td align="center">○</td>
      <td align="center">○</td>
      <td align="center">◎</td>
      <td align="center">△</td>
      <td align="center">O</td>
      <td><a href="https://cloud.google.com/speech-to-text/pricing">공식 가격표</a>, <a href="https://docs.cloud.google.com/speech-to-text/docs/release-notes">Speech-to-Text release notes</a>. 멀티채널은 채널별 과금</td>
    </tr>
    <tr>
      <td>ElevenLabs</td>
      <td><code>scribe_v2_realtime</code></td>
      <td>2025-11-11</td>
      <td align="center">O</td>
      <td>$0.39/h RT<br>$0.22/h async</td>
      <td align="center">◎</td>
      <td>미평가</td>
      <td align="center">X</td>
      <td align="center">○</td>
      <td align="center">◎</td>
      <td align="center">○</td>
      <td align="center">O</td>
      <td align="center">△</td>
      <td><a href="https://elevenlabs.io/pricing/api?price.section=speech_to_text">공식 가격표</a>, <a href="https://elevenlabs.io/blog/introducing-scribe-v2-realtime">Scribe v2 Realtime 출시 공지</a></td>
    </tr>
    <tr>
      <td>Speechmatics</td>
      <td><code>Ursa 2</code> / Enhanced Operating Point</td>
      <td>2024-10-11</td>
      <td align="center">O</td>
      <td>$0.23/h Standard<br>$0.38/h Enhanced<br>(pre-recorded 기준, RT 별도 미공개)</td>
      <td align="center">△</td>
      <td>미평가</td>
      <td>X (애드온 +$0.49/h)</td>
      <td>○ ($100 크레딧)</td>
      <td align="center">○</td>
      <td align="center">◎</td>
      <td align="center">O</td>
      <td align="center">△</td>
      <td><a href="https://www.speechmatics.com/pricing">공식 가격표</a>, <a href="https://www.speechmatics.com/company/articles-and-news/ursa-2-elevating-speech-recognition-across-52-languages">Ursa 2 출시 공지</a>. 2026-07-02부터 <code>operating_point</code> 대신 <code>model</code> 속성(Standard/Enhanced/Melia-1)으로 선택. 의료 다국어 <code>oak-1</code>(batch), Agent STT용 <code>linden-1</code>이 추가됨</td>
    </tr>
    <tr>
      <td>Speechmatics Melia</td>
      <td><code>Melia 1</code></td>
      <td>2026-06-17</td>
      <td>O (RT는 diarization·custom dictionary 미지원)</td>
      <td>$0.12/h pre-recorded<br>RT 별도 미공개</td>
      <td>◎ (56개 언어, 문장 중 코드스위칭)</td>
      <td>미평가</td>
      <td>X (애드온 +$0.49/h)</td>
      <td>○ ($100 크레딧)</td>
      <td>미평가</td>
      <td>미평가</td>
      <td>미평가</td>
      <td>미평가</td>
      <td><a href="https://www.speechmatics.com/pricing">공식 가격표</a>, <a href="https://www.speechmatics.com/company/articles-and-news/introducing-melia-multilingual-speech-to-text-model">Melia 출시 공지</a>, <a href="https://speechmatics.featurebase.app/en/changelog/20260702-realtime-saas">Realtime SaaS release note</a>. 출시 시점은 batch 전용($0.129/h, 월 10h 무료)이었고, 2026-07-02 Realtime SaaS에 <code>model</code> 속성으로 Melia-1 선택이 추가됨. 2026-10 기준 <a href="https://docs.speechmatics.com/speech-to-text/models">공식 모델 문서</a>도 <code>melia-1</code>을 Batch/Realtime 모두 지원으로 명시(<code>"language": "multi"</code> 필수). RT에서는 speaker diarization, <code>max_delay</code>, custom dictionary 등이 빠짐. RT 가격은 미공개. 언어를 미리 지정하지 않는 다국어 모델로 Standard/Enhanced를 대체하지 않고 병행</td>
    </tr>
    <tr>
      <td>AssemblyAI</td>
      <td>Universal-3.6 Pro Realtime (<code>universal-3-6-pro</code>)</td>
      <td>2026-09 (일자 미공개)</td>
      <td align="center">O</td>
      <td>$0.45/h RT<br>$0.21/h async</td>
      <td>O (32개 언어, 한국어 포함)</td>
      <td>미평가</td>
      <td align="center">X</td>
      <td align="center">○</td>
      <td align="center">○</td>
      <td align="center">○</td>
      <td align="center">O</td>
      <td align="center">O</td>
      <td><a href="https://www.assemblyai.com/pricing/">공식 가격표</a>, <a href="https://www.assemblyai.com/changelog">AssemblyAI changelog</a>, <a href="https://www.assemblyai.com/llms/models.md">모델 목록</a>. streaming diarization은 +$0.12/h. <code>u3-rt-pro</code>는 retired. 3.6 Pro Realtime부터 한국어 지원(이전 X 평가는 <code>u3-rt-pro</code> 기준). async 기본은 <code>universal-3-pro</code>(3.5 Pro, 한국어 미지원)이고 한국어 async는 <code>universal-2</code></td>
    </tr>
    <tr>
      <td>Amazon</td>
      <td>Amazon Nova 2 Sonic</td>
      <td>2025-12-02</td>
      <td align="center">O</td>
      <td>추산 $0.24/h STT</td>
      <td align="center">O</td>
      <td>미평가</td>
      <td align="center">X</td>
      <td align="center">○</td>
      <td align="center">○</td>
      <td align="center">◎</td>
      <td align="center">△</td>
      <td align="center">O</td>
      <td><a href="https://press.aboutamazon.com/2025/4/introducing-amazon-nova-sonic-a-new-gen-ai-model-for-building-voice-applications-and-agents">Amazon Nova Sonic 공지</a>, <a href="https://aws.amazon.com/about-aws/whats-new/2025/12/amazon-nova-2-sonic-real-time-conversational-ai">Nova 2 Sonic 출시 공지</a>, <a href="https://aws.amazon.com/bedrock/pricing/">Amazon Bedrock 가격표</a>. speech-to-speech 모델로 2026-03, 2026-05에 in-place 품질 업데이트. 가격 추산은 1세대 Nova Sonic의 $3.40/M audio input + $2.40/M text output 기준으로 1h 약 60K audio tokens + 15K text tokens 가정</td>
    </tr>
    <tr>
      <td>Microsoft Azure Speech / Foundry</td>
      <td><code>MAI-Transcribe-2-Streaming</code> (RT)<br><code>MAI-Transcribe-2</code> (batch)</td>
      <td>2026-10-01 (RT)<br>2026-09-03 (batch)</td>
      <td>O (Streaming 모델만)</td>
      <td>$0.54/h RT<br>$0.10/h batch (2026-12-31까지)</td>
      <td>O (60개 언어 자동 감지)</td>
      <td>미평가</td>
      <td align="center">X</td>
      <td align="center">○</td>
      <td align="center">○</td>
      <td align="center">△</td>
      <td align="center">△</td>
      <td align="center">△</td>
      <td><a href="https://microsoft.ai/pdf/MAI-Transcribe-1-Model-Card.pdf">MAI-Transcribe-1 model card</a>, <a href="https://learn.microsoft.com/en-us/azure/ai-services/speech-service/mai-transcribe">Microsoft Learn</a>, <a href="https://microsoft.ai/news/our-first-streaming-transcription-model/">MAI-Transcribe-2-Streaming 출시 공지</a>. <code>MAI-Transcribe-1</code>은 실시간 미지원 상태로 2026-08-20 deprecated. 중간 버전 <code>MAI-Transcribe-1.5</code>도 선택 가능(한국어 포함, 언어 수는 2보다 적음). <code>MAI-Transcribe-2</code>는 public preview(SLA 없음)이며 파일 기반 Fast Transcription API 전용, 한국어 포함 60개 언어. 실시간은 <code>MAI-Transcribe-2-Streaming</code>(Realtime WebSocket, Speech SDK)으로 제공. 가격은 2차 출처 기준이며 평가 칸은 MAI-Transcribe-1 당시 값</td>
    </tr>
    <tr>
      <td>IBM</td>
      <td><code>granite-speech-5.0-2b</code></td>
      <td>2026-10-07</td>
      <td align="center">X</td>
      <td>추산 $0.10-$0.30/h 자체호스팅</td>
      <td align="center">△</td>
      <td>미평가</td>
      <td align="center">O</td>
      <td align="center">○</td>
      <td align="center">△</td>
      <td align="center">△</td>
      <td align="center">X</td>
      <td align="center">X</td>
      <td><a href="https://huggingface.co/ibm-granite/granite-speech-5.0-2b">Granite Speech 5.0 2B 모델카드</a>, <a href="https://community.ibm.com/community/user/blogs/nickolus-plowden/2025/04/16/ibm-granite-33-speech-recognition-refined-reasonin">IBM Granite 3.3 공지</a>. Apache 2.0, 4.1-2b 후속. 영어 전용 <code>granite-speech-5.0-470m-turboctc</code>(2026-08-04)도 있음. 공개 API 단가 없음; L4/A10G급 GPU에서 4-10x realtime 배치 처리 가정</td>
    </tr>
    <tr>
      <td>Rev AI</td>
      <td>Reverb ASR / Reverb Turbo</td>
      <td>2024-10-03</td>
      <td align="center">O</td>
      <td>$0.20/h Reverb<br>$0.10/h Turbo</td>
      <td align="center">O</td>
      <td>미평가</td>
      <td align="center">X</td>
      <td align="center">○</td>
      <td align="center">○</td>
      <td align="center">◎</td>
      <td align="center">△</td>
      <td align="center">O</td>
      <td><a href="https://www.rev.ai/pricing">공식 가격표</a>. 외국어 Reverb는 $0.30/h</td>
    </tr>
    <tr>
      <td>NVIDIA Speech NIM / Riva</td>
      <td>Nemotron ASR Streaming, Parakeet TDT/RNNT family</td>
      <td>2026-10 (NIM 26.10.0)</td>
      <td align="center">O</td>
      <td>추산 $0.02-$0.03/h 고동시성<br>저사용률은 $1/GPU-h+인스턴스 비용</td>
      <td align="center">△</td>
      <td>미평가</td>
      <td align="center">X</td>
      <td align="center">X</td>
      <td align="center">◎</td>
      <td align="center">○</td>
      <td align="center">O</td>
      <td align="center">O</td>
      <td><a href="https://docs.nvidia.com/ai-enterprise/planning-resource/licensing-guide/latest/pricing.html">NVIDIA AI Enterprise 가격표</a>, <a href="https://docs.nvidia.com/nim/speech/latest/reference/performances/asr/performance.html">ASR NIM 성능표</a>, <a href="https://docs.nvidia.com/nim/speech/latest/about/release-notes.html">Speech NIM release notes</a>. 26.10.0에서 <code>nemotron-asr-streaming:1.4.0</code>에 8화자 Sortformer diarization, 동시 스트림 약 5배 추가. H100 254x RTFX, GPU $4-$6/h 가정</td>
    </tr>
    <tr>
      <td>Picovoice</td>
      <td>Cheetah Streaming STT / Leopard STT</td>
      <td>2026-10-01 (Cheetah 4.2.0)</td>
      <td>O (Cheetah만)</td>
      <td>추산 $0.00-$0.02/h + 상용 라이선스</td>
      <td align="center">△</td>
      <td align="center">○</td>
      <td align="center">X</td>
      <td align="center">○</td>
      <td align="center">◎</td>
      <td align="center">○</td>
      <td align="center">O</td>
      <td align="center">△</td>
      <td><a href="https://pypi.org/org/Picovoice/">Picovoice package list</a>, <a href="https://picovoice.ai/docs/leopard/">Leopard docs</a>. 공개 시간당 API 단가 없음; 온디바이스 CPU 비용만 반영</td>
    </tr>
    <tr>
      <td>OpenAI Whisper</td>
      <td><code>large-v3-turbo</code></td>
      <td>2024-09-30</td>
      <td>△ (청크 방식)</td>
      <td>추산 $0.01-$0.05/h 자체호스팅</td>
      <td align="center">O</td>
      <td align="center">○</td>
      <td align="center">O</td>
      <td align="center">◎</td>
      <td align="center">△</td>
      <td align="center">○</td>
      <td align="center">X</td>
      <td align="center">X</td>
      <td><a href="https://github.com/openai/whisper/blob/main/model-card.md">Whisper model card</a>. 공식 모델카드는 2024-09 월 단위, GitHub PR 기준 2024-09-30. GPU 배치 처리 기준</td>
    </tr>
    <tr>
      <td>Vosk</td>
      <td>Vosk API <code>v0.3.50</code></td>
      <td>2024-04-22</td>
      <td align="center">O</td>
      <td>추산 $0.00-$0.03/h 자체호스팅</td>
      <td align="center">X</td>
      <td align="center">X</td>
      <td align="center">X</td>
      <td align="center">◎</td>
      <td align="center">◎</td>
      <td align="center">○</td>
      <td align="center">△</td>
      <td align="center">△</td>
      <td><a href="https://github.com/alphacep/vosk-api">Vosk GitHub</a>. CPU 로컬 처리 기준, 전용 서버 유휴 비용 제외</td>
    </tr>
    <tr>
      <td>Meta Omnilingual ASR</td>
      <td>Omnilingual ASR 7B family</td>
      <td>2025-11-11</td>
      <td align="center">X</td>
      <td>추산 $0.10-$0.40/h 자체호스팅</td>
      <td align="center">◎</td>
      <td>미평가</td>
      <td align="center">X</td>
      <td align="center">◎</td>
      <td align="center">△</td>
      <td align="center">△</td>
      <td align="center">X</td>
      <td align="center">X</td>
      <td><a href="https://github.com/facebookresearch/omnilingual-asr">GitHub</a>, <a href="https://ai.meta.com/blog/omnilingual-asr-advancing-automatic-speech-recognition/">Meta research article</a>. 7B급 GPU 배치 추론 기준</td>
    </tr>
    <tr>
      <td>NVIDIA NeMo</td>
      <td><code>nemotron-3.5-asr-streaming-0.6b</code><br><code>nemotron-labs-unified-asr-0.6b</code></td>
      <td>2026-08-21</td>
      <td>O (Nemotron streaming)</td>
      <td>추산 $0.005-$0.03/h 자체호스팅</td>
      <td align="center">△</td>
      <td>미평가</td>
      <td align="center">X</td>
      <td align="center">◎</td>
      <td align="center">◎</td>
      <td align="center">△</td>
      <td align="center">O</td>
      <td align="center">X</td>
      <td><a href="https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b">nemotron-3.5-asr-streaming-0.6b</a>(2026-05-15), <a href="https://huggingface.co/nvidia/nemotron-labs-unified-asr-0.6b">nemotron-labs-unified-asr-0.6b</a>(2026-08-21). Hugging Face 기준 최신 오픈웨이트 ASR. 이전 표기 Parakeet-TDT-0.6B-v3는 유럽어 중심이라 한국어 X였음. 0.6B급 GPU 고처리량 가정</td>
    </tr>
  </tbody>
</table>
</div>
