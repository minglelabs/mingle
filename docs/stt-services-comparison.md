# STT Services and Models Comparison

Last reviewed: 2026-04-27

아래 표는 사용자 평가표에 최신/최고 모델명, 최신 모델 출시일, 시간당 가격을 추가하고, 조사한 STT 서비스/오픈웨이트 후보를 같은 형식으로 확장한 것입니다. 가격은 USD 기준의 오디오 1시간당 비용입니다. 공식 시간당 과금이 없는 오픈웨이트/자체호스팅 항목은 고동시성 또는 배치 처리 시의 추론 인프라 비용만 추산했으며, 유휴 GPU, 엔지니어링, 저장소, 네트워크, 엔터프라이즈 라이선스 비용은 제외했습니다.

표는 가로 스크롤을 전제로 한 넓은 비교표입니다. 각 헤더의 작은 설명은 해당 칼럼이 무엇을 뜻하는지 나타냅니다.

<div style="max-width: 100%; overflow-x: auto;">
<table width="3780" style="min-width: 3780px; table-layout: fixed;">
  <colgroup>
    <col width="220">
    <col width="330">
    <col width="160">
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
      <td><code>stt-rt-v4</code></td>
      <td>2026-02-05</td>
      <td>$0.12/h RT<br>$0.10/h async</td>
      <td>O (발화자 분리를 시켜야함)</td>
      <td align="center">◎</td>
      <td align="center">X</td>
      <td align="center">X</td>
      <td align="center">◎</td>
      <td align="center">◎</td>
      <td align="center">△</td>
      <td align="center">△</td>
      <td><a href="https://soniox.com/pricing">공식 가격표</a>, <a href="https://soniox.com/docs/stt/models">공식 모델 문서</a></td>
    </tr>
    <tr>
      <td>Gladia</td>
      <td><code>solaria-1</code></td>
      <td>2025-04-02</td>
      <td>$0.75/h RT<br>$0.61/h async</td>
      <td>◎ (3+ 언어)</td>
      <td>△ (영어 외 언어 약함)</td>
      <td>△ (언어별 불안정)</td>
      <td>◎ (월 10h)</td>
      <td align="center">◎</td>
      <td align="center">◎</td>
      <td align="center">O</td>
      <td align="center">X</td>
      <td><a href="https://www.gladia.io/pricing">공식 가격표</a>, <a href="https://www.prnewswire.com/news-releases/gladia-launches-solaria-the-first-fully-multilingual-next-generation-speech-to-text-model-for-global-scalability-302417497.html">Solaria 출시 공지</a></td>
    </tr>
    <tr>
      <td>Deepgram</td>
      <td><code>nova-3</code></td>
      <td>2025-02-12</td>
      <td>$0.462/h mono<br>$0.552/h multi</td>
      <td>O (한국어는 안됨. 10개 언어만.)</td>
      <td align="center">◎</td>
      <td align="center">X</td>
      <td>◎ (대량 크레딧)</td>
      <td align="center">◎</td>
      <td align="center">◎</td>
      <td align="center">△</td>
      <td align="center">X</td>
      <td><a href="https://deepgram.com/pricing">공식 가격표</a>, <a href="https://developers.deepgram.com/changelog/2025/2/12">Nova-3 changelog</a>. diarization은 +$0.12/h</td>
    </tr>
    <tr>
      <td>Fireworks</td>
      <td><code>fireworks-asr-v2</code></td>
      <td>2025-09-24</td>
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
      <td><code>gpt-4o-transcribe</code></td>
      <td>2025-03-20</td>
      <td>$0.36/h</td>
      <td align="center">O</td>
      <td align="center">◎</td>
      <td align="center">X</td>
      <td align="center">X</td>
      <td align="center">○</td>
      <td align="center">◎</td>
      <td align="center">△</td>
      <td align="center">X</td>
      <td><a href="https://platform.openai.com/docs/pricing/">공식 가격표</a>, <a href="https://openai.com/index/introducing-our-next-generation-audio-models/">차세대 오디오 모델 출시</a>. <code>mingle-model-test</code>는 <code>gpt-4o-mini-transcribe</code> 경로 사용</td>
    </tr>
    <tr>
      <td>Google Cloud Speech-to-Text</td>
      <td><code>chirp_3</code></td>
      <td>2025-10-13</td>
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
      <td>$0.24/h부터<br>Enhanced/RT 추산 $0.24-$0.60/h</td>
      <td align="center">△</td>
      <td>미평가</td>
      <td align="center">X</td>
      <td align="center">X</td>
      <td align="center">○</td>
      <td align="center">◎</td>
      <td align="center">O</td>
      <td align="center">△</td>
      <td><a href="https://www.speechmatics.com/pricing">공식 가격표</a>, <a href="https://www.speechmatics.com/company/articles-and-news/ursa-2-elevating-speech-recognition-across-52-languages">Ursa 2 출시 공지</a>. 공개 가격표는 Pro 시작가 중심</td>
    </tr>
    <tr>
      <td>AssemblyAI</td>
      <td>Universal-3 Pro Streaming (<code>u3-rt-pro</code>)</td>
      <td>2026-03-25</td>
      <td>$0.45/h RT<br>$0.21/h async</td>
      <td>O (6개 언어 중심)</td>
      <td align="center">X</td>
      <td align="center">X</td>
      <td align="center">○</td>
      <td align="center">○</td>
      <td align="center">○</td>
      <td align="center">O</td>
      <td align="center">O</td>
      <td><a href="https://www.assemblyai.com/pricing/">공식 가격표</a>, <a href="https://www.assemblyai.com/changelog">AssemblyAI changelog</a>. streaming diarization은 +$0.12/h</td>
    </tr>
    <tr>
      <td>Amazon</td>
      <td>Amazon Nova Sonic</td>
      <td>2025-04-08</td>
      <td>추산 $0.24/h STT</td>
      <td align="center">O</td>
      <td>미평가</td>
      <td align="center">X</td>
      <td align="center">○</td>
      <td align="center">○</td>
      <td align="center">◎</td>
      <td align="center">△</td>
      <td align="center">O</td>
      <td><a href="https://press.aboutamazon.com/2025/4/introducing-amazon-nova-sonic-a-new-gen-ai-model-for-building-voice-applications-and-agents">Amazon Nova Sonic 공지</a>, <a href="https://aws.amazon.com/bedrock/pricing/">Amazon Bedrock 가격표</a>. $3.40/M audio input + $2.40/M text output 기준으로 1h 약 60K audio tokens + 15K text tokens 가정</td>
    </tr>
    <tr>
      <td>Microsoft Azure Speech / Foundry</td>
      <td><code>MAI-Transcribe-1</code></td>
      <td>2026-04-02</td>
      <td>$0.36/h</td>
      <td align="center">O</td>
      <td>미평가</td>
      <td align="center">X</td>
      <td align="center">○</td>
      <td align="center">○</td>
      <td align="center">△</td>
      <td align="center">△</td>
      <td align="center">△</td>
      <td><a href="https://microsoft.ai/pdf/MAI-Transcribe-1-Model-Card.pdf">MAI-Transcribe-1 model card</a>, <a href="https://learn.microsoft.com/en-us/azure/ai-services/speech-service/mai-transcribe">Microsoft Learn</a></td>
    </tr>
    <tr>
      <td>IBM</td>
      <td>Granite Speech 3.3 8B</td>
      <td>2025-04-16</td>
      <td>추산 $0.10-$0.30/h 자체호스팅</td>
      <td align="center">△</td>
      <td>미평가</td>
      <td align="center">O</td>
      <td align="center">○</td>
      <td align="center">△</td>
      <td align="center">△</td>
      <td align="center">X</td>
      <td align="center">X</td>
      <td><a href="https://community.ibm.com/community/user/blogs/nickolus-plowden/2025/04/16/ibm-granite-33-speech-recognition-refined-reasonin">IBM Granite 3.3 공지</a>. 공개 API 단가 없음; L4/A10G급 GPU에서 4-10x realtime 배치 처리 가정</td>
    </tr>
    <tr>
      <td>Rev AI</td>
      <td>Reverb ASR / Reverb Turbo</td>
      <td>2024-10-03</td>
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
      <td>2026-02-01</td>
      <td>추산 $0.02-$0.03/h 고동시성<br>저사용률은 $1/GPU-h+인스턴스 비용</td>
      <td align="center">△</td>
      <td>미평가</td>
      <td align="center">X</td>
      <td align="center">X</td>
      <td align="center">◎</td>
      <td align="center">○</td>
      <td align="center">O</td>
      <td align="center">O</td>
      <td><a href="https://docs.nvidia.com/ai-enterprise/planning-resource/licensing-guide/latest/pricing.html">NVIDIA AI Enterprise 가격표</a>, <a href="https://docs.nvidia.com/nim/speech/latest/reference/performances/asr/performance.html">ASR NIM 성능표</a>, <a href="https://docs.nvidia.com/nim/speech/latest/about/release-notes.html">Speech NIM 26.02.0 release notes</a>. H100 254x RTFX, GPU $4-$6/h 가정</td>
    </tr>
    <tr>
      <td>Picovoice</td>
      <td>Cheetah Streaming STT / Leopard STT</td>
      <td>2026-04-13</td>
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
      <td>Parakeet-TDT-0.6B-v3</td>
      <td>2026-02-01</td>
      <td>추산 $0.005-$0.03/h 자체호스팅</td>
      <td align="center">△</td>
      <td align="center">X</td>
      <td align="center">X</td>
      <td align="center">◎</td>
      <td align="center">◎</td>
      <td align="center">△</td>
      <td align="center">O</td>
      <td align="center">X</td>
      <td><a href="https://docs.nvidia.com/nim/speech/latest/about/release-notes.html">Speech NIM 26.02.0 release notes</a>. NIM 문서 기준 최신 배포 모델, 0.6B급 GPU 고처리량 가정</td>
    </tr>
  </tbody>
</table>
</div>
