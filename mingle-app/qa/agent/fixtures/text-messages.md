# Text message fixtures

Typed through the simulator keyboard by `text-message-translation` and related scenarios. Each line lists the
message and the intent the translation must keep. Judge the translations against the intent, not word by word.

| # | Language | Message | Intent to preserve |
| --- | --- | --- | --- |
| 1 | ko (반말) | 야 오늘 저녁에 시간 돼? 7시쯤 홍대에서 보자 | Casual invitation between friends; time 7 pm; place Hongdae. Must stay casual, not 존댓말-polite in other languages. |
| 2 | ko (존댓말) | 혹시 내일 오전 회의 30분만 미뤄주실 수 있을까요? | Polite request to push tomorrow morning's meeting back by 30 minutes. Must stay polite. |
| 3 | en | lol no way, did you actually finish the whole thing already?? | Surprised, playful disbelief that the other person already finished. Keep the laughter and the casual tone. |
| 4 | ja | 来週の土曜日、もし空いてたら一緒にカフェ行かない？ | Casual invitation to a café next Saturday, if free. |
| 5 | en | I can't make it on Friday, but Saturday works. | Negation on Friday; Saturday works. The negation must survive. |
| 6 | ko | ㅋㅋㅋ 그거 진짜 대박이다 👍 | Laughing, "that's really awesome", thumbs-up emoji kept. |
| 7 | mixed ko+en | 이거 deadline이 언제까지였지? | Asks when the deadline was. Mixed-language input; every part survives (T4). |

Do not add personal data to this file. Keep messages short enough to type in a few seconds.
