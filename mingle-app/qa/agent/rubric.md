# QA Judging Rubric

The QA agent uses this rubric to turn observations into verdicts. The preferences behind the judgments are in
[taste.md](taste.md). Every finding names the taste rule it breaks (for example `T1`), unless it is a plain
functional bug.

## Scenario verdicts

| Verdict | Meaning |
| --- | --- |
| `pass` | Every oracle check held and no finding is S2 or worse. S3 nits may be listed. |
| `concern` | The flow worked, but there is at least one S2 finding, or an S1 finding seen only once that could not be reproduced. |
| `fail` | At least one S0 or S1 finding was reproduced, or an oracle check clearly failed. |
| `blocked` | The scenario could not run (environment, login, build, or a preceding step failed). Say what blocked it. Never report a blocked scenario as passed. |
| `manual` | The oracle needs something the simulator cannot provide (real microphone, Bluetooth, real ads, push, haptics). The step goes on the real-device checklist. |

## Finding severity

| Severity | Anchor | Examples from the history |
| --- | --- | --- |
| **S0 — blocker** | A core flow cannot finish, data is lost or leaked, or the app crashes, freezes or loops. | Back re-enters the room in a loop with STT restarting. A sent message disappears. A share link exposes private room data. The mic stays on `Connecting` forever. |
| **S1 — major** | The flow finishes, but the owner would file a bug the same day. | The keyboard closes after Send. STT stops when the photo button is tapped. A false "Failed to open" toast. A banner hides the attachment menu. A language row is empty or duplicated. Content jumps while reading. |
| **S2 — minor** | Visible polish problem that does not stop the task. | A flicker under about 300 ms. Controls misaligned by a few points. A label wraps awkwardly in one locale. A second tap needed now and then. An inconsistent transition. |
| **S3 — nit** | Taste-level preference. | Spacing that feels loose. Copy that could be shorter. A selected state that could be a little stronger. |

Rules:

- Timing-dependent findings (flicker, races, missed taps) must be tried at least twice. Report how many attempts
  showed it, for example `2/3`.
- Every finding records its evidence: a screenshot path, a QA bridge snapshot field, a log line or an
  `app_event_logs` row. A finding with no evidence is at most S3.
- Do not grade the simulator itself. Simulator-only artefacts (missing camera, no real audio input, simulator
  keyboard quirks) are noted as environment limits, not findings.

## Translation quality (1–5 per dimension)

Score each translated message on four dimensions. A message passes when its average is **≥ 4.0** and no
dimension is **≤ 2**. A scenario passes when every scored message passes.

| Score | Accuracy | Naturalness | Tone and register | Latency |
| --- | --- | --- | --- | --- |
| **5** | All meaning kept: names, numbers, negation, intent. | Reads like a native speaker wrote it in chat. | Same politeness, warmth and casualness (반말/존댓말, です/だ, tu/vous). Emoji and laughter kept. | Translation visible ≤ 1.0 s after the source is final. |
| **4** | One small nuance softened; nothing a reader would act on differently. | Slightly stiff but fine in chat. | Register matches; a little flatter. | 1–2 s |
| **3** | One meaning detail lost or added (a tense, a qualifier). | Clearly translated wording; understandable. | Register off by one step (too formal for friends). | 2–3 s |
| **2** | A key element is wrong (who, what, yes/no, number). | Hard to read; word salad in places. | Wrong register that changes the social meaning (rude, or cold to a friend). | 3–5 s |
| **1** | Wrong meaning, a hallucination, the wrong language, or missing. | Unreadable. | Offensive or absurd. | > 5 s, or never arrives. |

Also check, outside the 1–5 score:

- Every language set for the room has a row, there are no duplicate or empty rows, and the original-language marker
  sits on the source language (T4).
- Chinese uses the script the room expects (zh-CN vs zh-TW).
- Mixed-language speech keeps every part after finalization.

For speech input, also judge recognition before translation. When the expected sentence is known (scripted or
injected audio), report the character error rate: **CER ≤ 5 %** pass, **5–15 %** concern, **> 15 %** fail.
Without ground truth, report "not scored".

## Responsiveness and smoothness

Screenshots cannot show frame rate. Use numbers, and say which device they came from.

| Signal | Pass | Concern | Fail | Source |
| --- | --- | --- | --- | --- |
| Tap → visible response | ≤ 100 ms (looks instant) | Visibly delayed, under 300 ms | ≥ 300 ms, or needs a second tap | Screenshot pairs, QA bridge state |
| Speech start → first partial text | ≤ 1 s | 1–2 s | > 2 s | Screenshots, `stt_turn_started` timing |
| Long-chat scroll (500 messages) | No hitch you can see; handler median ≤ 2 ms | Occasional hitch | Repeated hitches or stalls | [IOS_SCROLL_FPS_CAPTURE.md](../mobile-ui/IOS_SCROLL_FPS_CAPTURE.md) on a real iPhone |
| Screen transition | One continuous slide; no white or black flash | One-frame flash | Flash plus content swap or re-layout | Screenshots taken during the transition |

Simulator frame rates are not the iPhone's. Scroll smoothness on the simulator is at most a `concern` signal.
The final scroll-jank verdict always goes on the real-device checklist.

## Report expectations

For each scenario the report shows: verdict, findings ordered by severity, the taste rules involved, 1–4 key
screenshots, the snapshot or log evidence, and what is left for a real device. The report opens with a summary:
counts by verdict, the S0/S1 findings, and the real-device checklist.
