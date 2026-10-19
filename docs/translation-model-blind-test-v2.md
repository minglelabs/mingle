# 번역 모델 블라인드 테스트 v2 (6종)

같은 메시지를 6개 응답자(A~F)가 번역한 결과입니다. 모델명은 가렸고, **메시지마다 A~F 배정을 무작위로 섞었습니다.** 그래서 같은 글자라도 메시지마다 다른 모델입니다.

응답 시간은 모델을 짐작하게 할 수 있어 뺐습니다. 각 메시지에서 가장 좋은 번역과 가장 나쁜 번역을 골라 적은 뒤 [정답표](translation-model-blind-test-v2-key.md)와 맞춰보세요. 빈 칸 ❌는 응답 실패입니다.

## 1. 아 진짜 오늘 회사에서 개빡쳤는데 부장님이 또 야근하라고 해서 그냥 퇴사각 재고 있음

최종 턴 · 소스 ko → ko, en, ja

| | en | ja | 내 평가 |
|---|---|---|---|
| **A** | Ah seriously, I was so pissed off at work today, and the manager told me to work overtime again, so I'm just thinking about quitting. | あー本当に今日会社でめちゃくちゃ腹が立ったんだけど、部長がまた残業しろって言うから、もう退職を考えてる。 | |
| **B** | I was so pissed off at work today, and my boss told me to work overtime again, so I'm just considering quitting. | 今日会社で本当にムカついたのに、部長にまた残業しろって言われたから、もう退職を考えてるよ。 | |
| **C** | Ugh, I’m so pissed off at work today. The department head told me to work overtime again, so I’m just thinking about quitting. | あー本当に今日会社でむかついてるんだけど、部長がまた残業しろって言うから、もう辞めること考えてる。 | |
| **D** | Ugh, I was so pissed off at work today. The department head told me to work overtime again, so I’m seriously thinking about quitting. | あー、今日会社でマジでブチ切れたんだけど、部長にまた残業しろって言われて、もう辞めどきかなって考えてる。 | |
| **E** | Ugh, seriously, I got super pissed off at work today, and the department head told me to work overtime again, so I'm seriously considering just quitting. | ああ本当に、今日は会社で超むかついたんだけど、部長がまた残業しろって言ってきて、もう辞める覚悟を考えてるところ。 | |
| **F** | Ugh, seriously, work today was so damn frustrating—the manager told me to work overtime again, so I'm literally thinking about quitting. | あーもう、今日マジで会社でめっちゃムカついたんだけど、部長がまた残業しろって言うから、もう退職を考えてる。 | |

## 2. 혹시 다음 주 화요일 오후 세 시쯤에 미팅 가능하실까요? 안 되시면 편하신 시간 알려주세요.

최종 턴 · 소스 ko → ko, en, zh-CN

| | en | zh-CN | 내 평가 |
|---|---|---|---|
| **A** | Would you happen to be available for a meeting around 3 p.m. next Tuesday? If not, please let me know what time works for you. | 请问您下周二下午三点左右方便开会吗？如果不方便，请告诉我您方便的时间。 | |
| **B** | Would it be possible to meet next Tuesday around 3 PM? If that doesn't work, please let me know a time that's convenient for you. | 请问下周二下午三点左右方便开会吗？如果不方便，请告诉我您方便的时间。 | |
| **C** | Would it perhaps be possible to have a meeting around 3 p.m. next Tuesday? If that doesn't work, please let me know a time that is convenient for you. | 请问下周二下午三点左右可以开会吗？如果不方便的话，请告诉我您方便的时间。 | |
| **D** | Would it be possible to have a meeting around 3 PM next Tuesday? If not, please let me know a time that works for you. | 请问下周二下午三点左右有空开会吗？如果不方便，请告知您方便的时间。 | |
| **E** | Would it be possible to have a meeting around 3 p.m. next Tuesday? If that doesn't work, please let me know a time that is convenient for you. | 请问下周二下午三点左右可以开会吗？如果不方便，请告诉我您方便的时间。 | |
| **F** | Would it be possible for you to meet next Tuesday around 3 p.m.? If not, please let me know a time that works for you. | 请问下周二下午三点左右可以见面吗？如果不行的话，请告诉我您方便的时间。 | |

## 3. 그 영화 완전 내 스타일이야, 보는 내내 소름 돋았고 마지막 반전은 진짜 미쳤다 ㄹㅇ

최종 턴 · 소스 ko → ko, en, ja

| | en | ja | 내 평가 |
|---|---|---|---|
| **A** | That movie is totally my style, I had goosebumps the whole time watching it, and the final twist was seriously insane, for real | あの映画は完全に私の好みで、観ている間ずっと鳥肌が立ったし、最後のどんでん返しはマジでやばかった、ガチで | |
| **B** | That movie is totally my style, I got chills the whole time, and the final twist was insane, fr | あの映画は完全に私のタイプだ、見ている間ずっと鳥肌が立って、最後のどんでん返しは本当にやばかった、マジで | |
| **C** | That movie is totally my style, I got goosebumps the whole time I was watching it, and the final twist was really insane lol | その映画、完全に私のスタイルだよ。見ている間ずっと鳥肌が立って、最後のどんでん返しはマジでヤバかったwwww | |
| **D** | That movie was totally my kind of thing. I had chills the whole time, and that final twist was seriously insane, for real. | あの映画、完全に私の好みだった。見ている間ずっと鳥肌が立ったし、最後のどんでん返しは本当にヤバかった。マジで。 | |
| **E** | That movie is totally my style, I had goosebumps the whole time watching it, and the final twist was seriously insane, for real | あの映画は完全に私のタイプで、観ている間ずっと鳥肌が立ったし、最後のどんでん返しはマジでやばかった、ガチで | |
| **F** | That movie is totally my style, I got goosebumps the whole time, and the final twist was seriously insane, no cap. | あの映画は完全に私好みだよ、見ている間ずっと鳥肌が立ったし、最後のどんでん返しは本当にやばかった、マジで。 | |

## 4. 어 그러니까 내가 말한 건 그 그 뭐지 아 맞다 그 카페 강남역 십일번 출구 쪽에 있는 거

최종 턴 · 소스 ko → ko, en, ja

| | ko | en | ja | 내 평가 |
|---|---|---|---|---|
| **A** | 어 그러니까 내가 말한 건 그 그 뭐지 아 맞다 그 카페 강남역 십일번 출구 쪽에 있는 거 | Oh, so what I was saying is, um, what was it—ah, right, it’s that café near exit 11 at Gangnam Station. | あーだから、私が言ってたのは、その、あの、なんだっけ、あそうだ、そのカフェは江南駅の11番出口の辺りにあるやつ。 | |
| **B** | 어 그러니까 내가 말한 건 그 그 뭐지 아 맞다 그 카페 강남역 십일번 출구 쪽에 있는 거 | ❌ | ❌ | |
| **C** | 어 그러니까 내가 말한 건 그 그 뭐지 아 맞다 그 카페 강남역 십일번 출구 쪽에 있는 거 | Uh, so what I mentioned was, uh, what's it called, oh right, that cafe near Exit 11 at Gangnam Station. | えっと、だから私が言ったのは、あの、何だっけ、あ、そうだ、あのカフェ、江南駅11番出口の近くにあるやつです。 | |
| **D** | 어, 그러니까 내가 말한 건 그, 그 뭐지? 아, 맞다. 그 카페, 강남역 11번 출구 쪽에 있는 거. | Uh, so what I meant was that, um, what was it? Oh, right—the café near Exit 11 at Gangnam Station. | ええと、つまり私が言ったのは、あの、何だっけ？あ、そうだ。江南駅11番出口の近くにあるあのカフェ。 | |
| **E** | 어 그러니까 내가 말한 건 그 그 뭐지 아 맞다 그 카페 강남역 십일번 출구 쪽에 있는 거 | Uh, so what I was saying was that that, what is it, oh right, that cafe on the Gangnam Station Exit 11 side. | ええと、つまり私が言っていたのは、その、何だっけ、ああそう、江南駅11番出口の側にあるカフェのことです。 | |
| **F** | 어 그러니까 내가 말한 건 그 그 뭐지 아 맞다 그 카페 강남역 십일번 출구 쪽에 있는 거 | Uh, so what I meant was, that, that, what was it, oh right, that cafe, the one near Gangnam Station Exit 11 | あ、だから私が言ったのは、その、その、何だっけ、あ、そうだ、そのカフェ、江南駅11番出口の方にあるやつ | |

## 5. Honestly I'm on the fence about it, but if it doesn't pan out we can always go back to the drawing board.

최종 턴 · 소스 en → en, ko, ja

| | ko | ja | 내 평가 |
|---|---|---|---|
| **A** | 솔직히 그것에 대해 고민 중이지만, 잘 안 되면 언제든지 원점에서 다시 시작할 수 있어. | 正直、それについては迷っているけど、うまくいかなければいつでも振り出しに戻れる。 | |
| **B** | 솔직히 말해서 아직 결정을 못 내리겠어. 하지만 잘 안 되면 언제든 처음부터 다시 생각해 보면 돼. | 正直なところ、まだ迷っているんだ。でもうまくいかなければ、いつでも振り出しに戻って考え直せばいいよ。 | |
| **C** | 솔직히 말하면 나는 아직 결정을 못 내리고 있는데, 만약 잘 안 되면 언제든지 처음부터 다시 시작하면 돼. | 正直なところ、まだ決めかねているけど、もしうまくいかなければいつでも一からやり直せばいいよ。 | |
| **D** | 솔직히 말해서 나는 아직 결정을 못 내리고 있는데, 만약 잘 안 되면 언제든지 처음부터 다시 시작하면 돼. | 正直なところ、まだ決めかねているんだけど、もしうまくいかなかったら、いつでも最初からやり直せばいいからね。 | |
| **E** | 솔직히 모르겠어요. 하지만 잘 안되면 언제든지 처음부터 다시 시작할 수 있어요. | 正直なところ、決めかねていますが、うまくいかなかった場合はいつでも白紙に戻ることができます。 | |
| **F** | 솔직히 아직 마음을 정하지 못했지만, 잘 안 되면 언제든 다시 처음부터 생각해 볼 수 있어. | 正直、まだ決めかねているけれど、うまくいかなければいつでも振り出しに戻って考え直せるよ。 | |

## 6. Dude, no way, you actually pulled it off? That's insane, drinks are on me tonight.

최종 턴 · 소스 en → en, ko, es

| | ko | es | 내 평가 |
|---|---|---|---|
| **A** | 이봐, 말도 안 돼, 진짜 해냈다고? 말도 안 돼, 오늘 밤은 내가 쏜다. | Amigo, no me lo puedo creer, ¿de verdad lo has conseguido? Es una locura, la bebida corre por mi cuenta esta noche. | |
| **B** | 이봐, 말도 안 돼, 진짜 해냈다고? 대단한데, 오늘 밤 술은 내가 살게. | Tío, no puede ser, ¿de verdad lo lograste? Es una locura, esta noche las copas las invito yo. | |
| **C** | 야, 말도 안 돼, 진짜 해냈다고? 대박이다. 오늘 밤 술은 내가 살게. | Tío, no me lo puedo creer, ¿de verdad lo conseguiste? ¡Es una locura! Esta noche invito yo a las copas. | |
| **D** | 야, 말도 안 돼, 진짜 해냈어? 대단하다, 오늘 밤 술은 내가 쏠게. | Tío, no puede ser, ¿de verdad lo lograste? Es una locura, esta noche las copas las invito yo. | |
| **E** | 야, 말도 안 돼, 진짜 해냈어? 미쳤다, 오늘 밤 술은 내가 쏠게. | Tío, no me lo creo, ¿de verdad lo lograste? Es una locura, las bebidas corren por mi cuenta esta noche. | |
| **F** | 야, 설마, 진짜 해냈어? 정말 미쳤네, 오늘 밤 술은 내가 쏜다. | Tío, no puede ser, ¿en serio lo lograste? Eso es una locura, esta noche los tragos los pago yo. | |

## 7. えー、マジで？それ先に言ってよ、もう予約しちゃったじゃん。

최종 턴 · 소스 ja → ja, ko, en

| | ko | en | 내 평가 |
|---|---|---|---|
| **A** | 에이, 진짜? 그거 먼저 말해 줬어야지, 벌써 예약해 버렸잖아. | Eh, seriously? You should have told me that first, I already went and made the reservation. | |
| **B** | 에—, 진짜? 그거 먼저 말해 줘, 이미 예약해 버렸잖아. | Whaaat, seriously? You should've told me that first—I already made the reservation. | |
| **C** | 어, 진짜? 그걸 먼저 말해줬어야지, 벌써 예약해버렸잖아. | Eh, seriously? You should've said that earlier—I've already made a reservation. | |
| **D** | 어, 정말? 그걸 먼저 말해줬어야지, 벌써 예약해버렸잖아. | Huh, really? You should have told me that earlier, I already made the reservation. | |
| **E** | 에—, 진짜? 그거 먼저 말해 줘야지, 이미 예약해 버렸잖아. | Whaaat, seriously? You should've told me that first—I already made the reservation! | |
| **F** | 에이, 진짜? 그걸 먼저 말해 줬어야지. 나 벌써 예약해 버렸잖아. | Wait, seriously? You should’ve told me that earlier—I already made a reservation. | |

## 8. 本日はお忙しいところお時間をいただき、誠にありがとうございます。早速ですが本題に入らせていただきます。

최종 턴 · 소스 ja → ja, ko, en

| | ko | en | 내 평가 |
|---|---|---|---|
| **A** | 오늘 바쁘신 와중에도 시간을 내주셔서 진심으로 감사드립니다. 바로 본론으로 들어가겠습니다. | Thank you very much for taking the time to meet with me today despite your busy schedule. Without further ado, I’d like to get straight to the main topic. | |
| **B** | 본일은 바쁘신 중에 시간을 내주셔서 진심으로 감사드립니다. 조속히 본론으로 들어가겠습니다. | Thank you very much for taking the time out of your busy schedule today. Without further ado, let me get to the main topic. | |
| **C** | 바쁘신 와중에 시간을 내주셔서 진심으로 감사합니다. 바로 본론으로 들어가겠습니다. | Thank you very much for taking the time out of your busy schedule today. I'd like to get straight to the main topic. | |
| **D** | 오늘 바쁘신 중에 시간을 내주셔서 정말로 감사합니다. 바로 본론으로 들어가겠습니다. | Thank you very much for taking time out of your busy schedule today. Let me get straight to the main topic. | |
| **E** | 오늘은 바쁘신 와중에 시간을 내주셔서 진심으로 감사드립니다. 바로 본론으로 들어가겠습니다. | Thank you very much for taking the time out of your busy schedule today. Without further ado, let me get to the main topic. | |
| **F** | 바쁘신 와중에도 시간을 내주셔서 정말 감사합니다. 바로 본론으로 들어가겠습니다. | Thank you very much for taking the time out of your busy schedule today. Without further ado, let's get to the main topic. | |

## 9. 这个周末我们去爬山吧，听说那边的风景特别好，顺便还能吃顿火锅。

최종 턴 · 소스 zh-CN → zh-CN, zh-TW, ko, en

| | zh-TW | ko | en | 내 평가 |
|---|---|---|---|---|
| **A** | 這個週末我們去爬山吧，聽說那邊的風景特別好，順便還能吃頓火鍋。 | 이번 주말에 우리 등산 가자. 그쪽 풍경이 정말 좋다고 하던데, 겸사겸사 훠궈도 먹을 수 있어. | Let's go hiking this weekend. I heard the scenery over there is especially beautiful, and we can also grab a hot pot meal while we're at it. | |
| **B** | 這個週末我們去爬山吧，聽說那邊的風景特別好，順便還能吃頓火鍋。 | 이번 주말에 등산 가는 거 어때? 거기 경치가 정말 좋다고 하던데, 겸사겸사 훠궈도 먹고. | Let's go hiking this weekend. I heard the scenery there is especially good, and we can have hot pot while we're at it. | |
| **C** | 這個週末我們去爬山吧，聽說那邊的風景特別好，順便還能吃頓火鍋。 | 이번 주말에 우리 등산하러 가자, 거기 경치가 정말 좋다고 들었어, 겸사겸사 훠궈도 먹을 수 있어. | Let's go hiking this weekend; I heard the scenery there is really nice, and we can grab some hot pot along the way. | |
| **D** | 這個週末我們去爬山吧，聽說那邊的風景特別好，順便還能吃頓火鍋。 | 이번 주말에 우리 등산 가자, 저쪽 경치가 정말 좋다고 들었어, 겸사겸사 훠궈도 먹을 수 있어. | Let's go hiking this weekend. I heard the scenery there is really nice, and we can also grab hotpot while we're at it. | |
| **E** | 這個週末我們去爬山吧，聽說那邊的風景特別好，順便還能吃頓火鍋。 | 이번 주말에 우리 등산하러 가자. 거기 경치가 정말 좋다고 들었어. 가는 김에 훠궈도 먹을 수 있고. | Let’s go hiking this weekend. I heard the scenery there is especially beautiful, and we can grab hot pot while we’re at it. | |
| **F** | 這個週末我們去爬山吧，聽說那邊的風景特別好，順便還能吃頓火鍋。 | 이번 주말에 우리 등산하러 가자, 거기 경치가 특히 좋다고 들었어, 겸사겸사 훠궈도 먹을 수 있어. | Let's go hiking this weekend. I heard the scenery there is especially nice, and we can grab some hot pot while we're at it. | |

## 10. 我覺得這個方案還不錯，不過預算可能要再討論一下，你們覺得呢？

최종 턴 · 소스 zh-TW → zh-TW, zh-CN, ko

| | zh-CN | ko | 내 평가 |
|---|---|---|---|
| **A** | 我觉得这个方案还不错，不过预算可能要再讨论一下，你们觉得呢？ | 저는 이 방안이 괜찮다고 생각하는데, 예산은 다시 논의해야 할 것 같아요. 여러분은 어떻게 생각하세요? | |
| **B** | 我觉得这个方案还不错，不过预算可能要再讨论一下，你们觉得呢？ | 이 방안은 괜찮다고 생각하지만, 예산은 다시 논의해야 할 수도 있습니다. 여러분은 어떻게 생각하세요? | |
| **C** | 我觉得这个方案还不错，不过预算可能要再讨论一下，你们觉得呢？ | 이 방안은 괜찮다고 생각하지만 예산에 대해서는 좀 더 논의가 필요할 것 같아요. 어떻게 생각하세요? | |
| **D** | 我觉得这个方案还不错，不过预算可能要再讨论一下，你们觉得呢？ | 이 방안은 꽤 괜찮은 것 같아요. 다만 예산은 좀 더 논의해 봐야 할 것 같은데, 여러분은 어떻게 생각하세요？ | |
| **E** | 我觉得这个方案还不错，不过预算可能要再讨论一下，你们觉得呢？ | 저는 이 방안이 괜찮다고 생각하는데, 예산은 다시 논의해야 할 것 같아요. 여러분은 어떻게 생각하세요? | |
| **F** | 我觉得这个方案还不错，不过预算可能要再讨论一下，你们觉得呢？ | 이 방안은 괜찮은 것 같아요. 다만 예산은 다시 한번 논의해야 할 것 같은데, 여러분은 어떻게 생각하세요? | |

## 11. そんな답답해서 죽겠다고 내가 진짜로.

최종 턴 · 소스 ko → ko, ja, en

| | ko | ja | en | 내 평가 |
|---|---|---|---|---|
| **A** | 그렇게 답답해서 죽겠다고 내가 진짜로. | そんな답답해서 죽겠다고 내가 진짜로. | I'm so frustrated I could die, seriously. | |
| **B** | 그렇게 답답해서 죽겠다고 내가 진짜로. | そんな답답해서 죽겠다고 내가 진짜로. | I'm telling you, I'm so frustrated I could die. | |
| **C** | 그렇게 답답해서 죽겠다고 내가 진짜로. | そんな답답해서 죽겠다고 내가 진짜로. | I’m really dying from being so frustrated like that. | |
| **D** | 그렇게 답답해서 죽겠다고, 내가 진짜로. | そんなに息苦しくて死にそうだって、私、本当に。 | I’m telling you, I’m so frustrated I could die. | |
| **E** | 정말 답답해서 죽겠다고 내가 진짜로. | そんな 답답해서 死ぬほどだよ、本当に。 | I'm really frustrated to death, I swear. | |
| **F** | 그렇게 답답해서 죽겠다고 내가 진짜로. | そんなに焦れったくて死にそうだって、私は本当に。 | Honestly, I'm so frustrated I could die, that's really how I feel. | |

## 12. 이번 sprint에서 deadline 맞추려면 그 feature는 일단 빼고 가는 게 맞을 것 같아요.

최종 턴 · 소스 ko → ko, en, ja

| | ko | en | ja | 내 평가 |
|---|---|---|---|---|
| **A** | 이번 sprint에서 deadline 맞추려면 그 feature는 일단 빼고 가는 게 맞을 것 같아요. | To meet the deadline this sprint, I think we should drop that feature for now. | 今回のスプリントで締め切りに間に合わせるには、その機能はひとまず外して進めるのが正しいと思います。 | |
| **B** | 이번 sprint에서 deadline 맞추려면 그 feature는 일단 빼고 가는 게 맞을 것 같아요. | To meet the deadline in this sprint, I think it's right to leave that feature out for now. | 今回のsprintでdeadlineに間に合わせるなら、そのfeatureはいったん外して進めるのが正しいと思います。 | |
| **C** | 이번 스프린트에서 데드라인 맞추려면 그 기능은 일단 빼고 가는 게 맞을 것 같아요. | To meet the deadline in this sprint, I think it's right to leave that feature out for now. | 今回のスプリントで締め切りに間に合わせるには、その機能は一旦外して進めるのが良さそうです。 | |
| **D** | 이번 sprint에서 deadline 맞추려면 그 feature는 일단 빼고 가는 게 맞을 것 같아요. | To meet the deadline in this sprint, I think it's best to leave that feature out for now. | 今回のスプリントで締め切りに間に合わせるためには、その機能は一旦除外していくのが正しいと思います。 | |
| **E** | 이번 스프린트에서 마감일을 맞추려면 그 기능은 일단 빼고 가는 게 맞을 것 같아요. | I think we should leave that feature out for now to meet the deadline for this sprint. | このスプリントの期限に間に合わせるには、その機能はいったん外して進めるのがよさそうです。 | |
| **F** | 이번 sprint에서 deadline 맞추려면 그 feature는 일단 빼고 가는 게 맞을 것 같아요. | To meet the deadline in this sprint, I think it's right to leave that feature out for now. | 今回のsprintでdeadlineに間に合わせるなら、そのfeatureはいったん外して進むのが正しいと思います。 | |

## 13. 료카이데스, 스구니 우카가이마스.

최종 턴 · 소스 ko → ko, ja, en

| | ko | ja | en | 내 평가 |
|---|---|---|---|---|
| **A** | 알겠습니다. 바로 찾아뵙겠습니다. | 了解です。すぐに伺います。 | Understood. I’ll come right away. | |
| **B** | 료카이데스, 스구니 우카가이마스. | 了解です。すぐに伺います。 | Understood. I will visit you right away. | |
| **C** | 료카이데스, 스구니 우카가이마스. | 了解です、すぐにうかがいます。 | Understood, I'll visit right away. | |
| **D** | 료카이데스, 스구니 우카가이마스. | 了解です、すぐに伺います。 | Understood, I'll be right there. | |
| **E** | 료카이데스, 스구니 우카가이마스 | 了解です、すぐに伺います | Understood, I will inquire immediately. | |
| **F** | 료카이데스, 스구니 우카가이마스. | 了解です、すぐに伺います。 | Understood, I'll be right there. | |

## 14. ¿Dónde está la estación de metro más cercana? Creo que me perdí.

최종 턴 · 소스 ko → ko, en, ja

| | ko | en | ja | 내 평가 |
|---|---|---|---|---|
| **A** | 가장 가까운 지하철역이 어디에 있나요? 길을 잃은 것 같아요. | Where is the nearest subway station? I think I got lost. | 一番近い地下鉄の駅はどこですか？道に迷ったみたいです。 | |
| **B** | 가장 가까운 지하철역이 어디인가요? 제가 길을 잃은 것 같아요. | Where is the nearest metro station? I think I'm lost. | 最寄りの地下鉄駅はどこですか？道に迷ったようです。 | |
| **C** | 가장 가까운 지하철역이 어디예요? 길을 잃은 것 같아요. | Where is the nearest subway station? I think I got lost. | 一番近い地下鉄の駅はどこですか？道に迷ったようです。 | |
| **D** | 가장 가까운 지하철역이 어디예요? 길을 잃은 것 같아요. | Where is the nearest subway station? I think I'm lost. | 一番近い地下鉄の駅はどこですか？道に迷ったようです。 | |
| **E** | 가장 가까운 지하철역이 어디에 있나요? 길을 잃은 것 같아요. | Where is the nearest subway station? I think I’m lost. | 一番近い地下鉄の駅はどこですか？道に迷ったようです。 | |
| **F** | 가장 가까운 지하철 역이 어디에 있나요? 길을 잃은 것 같아요. | Where is the nearest metro station? I think I got lost. | 一番近い地下鉄の駅はどこですか？道に迷ったと思います。 | |

## 15. Anh ơi, cho em hỏi cái này bao nhiêu tiền vậy? Có giảm giá không anh?

최종 턴 · 소스 vi → vi, ko, en

| | ko | en | 내 평가 |
|---|---|---|---|
| **A** | 아저씨, 이거 얼마예요? 할인 되나요? | Excuse me, sir, how much is this? Is there a discount? | |
| **B** | 오빠, 이거 얼마예요? 할인돼요? | Excuse me, how much is this? Is there a discount? | |
| **C** | 오빠, 이거 얼마예요? 할인되나요? | Excuse me, how much is this? Is there a discount? | |
| **D** | 저기요, 이거 얼마예요? 할인되나요? | Excuse me, how much is this? Is there a discount? | |
| **E** | 저기요, 이거 얼마예요? 할인되나요? | Excuse me, how much is this? Is it on sale? | |
| **F** | 오빠, 이거 얼마예요? 할인 있어요? | Hey, can I ask how much this is? Is there a discount? | |

## 16. 근데 그거 걔가 먼저 시작한 거야.

최종 턴 · 소스 ko → ko, en, ja (직전 턴: “민수랑 지훈이 어제 왜 싸웠대?”)

| | en | ja | 내 평가 |
|---|---|---|---|
| **A** | But that one, he started it first. | でもそれ、あの子が先に始めたんだよ。 | |
| **B** | But he/she started that first. | でも、それは彼（彼女）が先に始めたことだよ。 | |
| **C** | But they started it first. | でも、それはあの人が先に始めたんだよ。 | |
| **D** | But he was the one who started that first. | でも、それはあの子が先に始めたことだよ。 | |
| **E** | But that was started by him first. | でも、それは彼が先に始めたんだ。 | |
| **F** | But that, he's the one who started it first. | でもそれ、あの子が先に始めたんだよ。 | |

## 17. 응 ㅇㅋ 이따 봐

최종 턴 · 소스 ko → ko, en, ja

| | ko | en | ja | 내 평가 |
|---|---|---|---|---|
| **A** | 응 ㅇㅋ 이따 봐 | Okay, see you later. | うん、オーケー、あとでね。 | |
| **B** | 응 ㅇㅋ 이따 봐 | Yeah, OK, see you later | うん、オッケー、また後でね | |
| **C** | 응 ㅇㅋ 이따 봐 | Yeah, okay, see you later | うん、オッケー、また後でね | |
| **D** | 응 ㅇㅋ 이따 봐 | Yeah, OK, see you later | うん、オッケー、また後でね | |
| **E** | 응 ㅇㅋ 이따 봐 | Yeah, okay. See you later. | うん、OK。後でね。 | |
| **F** | 응, 오케이. 이따 봐. | Yeah, okay. See you later. | うん、オッケー。またあとでね。 | |

## 18. 내일 아침에 공항 가는 길에 혹시

중간 턴(말이 안 끝남) · 소스 ko → en, ja

| | en | ja | 내 평가 |
|---|---|---|---|
| **A** | On the way to the airport tomorrow morning, by any chance | 明日の朝、空港へ行く途中で、もしかして | |
| **B** | On the way to the airport tomorrow morning, if by any chance... | 明日の朝、空港に向かう途中で、もし... | |
| **C** | On the way to the airport tomorrow morning, by any chance | 明日の朝、空港へ行く途中で、もしかしたら | |
| **D** | Maybe on the way to the airport tomorrow morning... | 明日の朝、空港へ行く途中に、もしかして… | |
| **E** | On the way to the airport tomorrow morning, by any chance | 明日の朝、空港へ行く途中で、もしかしたら | |
| **F** | On my way to the airport tomorrow morning, by any chance | 明日の朝、空港に向かう途中で、もしよろしければ | |

## 19. So what I was trying to say is that if we

중간 턴(말이 안 끝남) · 소스 en → ko, ja

| | ko | ja | 내 평가 |
|---|---|---|---|
| **A** | 그래서 제가 말하려던 것은 만약 우리가 | それで私が言おうとしていたのは、もし私たちが | |
| **B** | 그래서 제가 말하려던 건, 만약 우리가 | つまり私が言いたかったのは、もし私たちが | |
| **C** | 그래서 제가 말하려던 것은 만약 우리가 | それで私が言おうとしていたのは、もし私たちが | |
| **D** | 그러니까 제가 말하려던 건, 만약 우리가 | つまり、私が言おうとしていたのは、もし私たちが | |
| **E** | 그래서 제가 말하려던 것은 만약 우리가 | だから私が言おうとしていたのは、もし私たちが | |
| **F** | 그래서 제가 말하려고 했던 것은 만약 우리가 | それで私が言おうとしていたのは、もし私たちが | |

## 20. 明日の会議なんだけど、ちょっと

중간 턴(말이 안 끝남) · 소스 ja → ko, en

| | ko | en | 내 평가 |
|---|---|---|---|
| **A** | 내일 회의인데, 좀 | About tomorrow's meeting, just a bit— | |
| **B** | 내일 회의에 대해서인데, 잠깐 | About tomorrow's meeting, just a moment | |
| **C** | 내일 회의 말인데, 잠깐 | About tomorrow's meeting, just a moment | |
| **D** | 내일 회의 말인데, 좀 | About tomorrow's meeting, it's just a bit | |
| **E** | 내일 회의 말인데, 좀… | About tomorrow’s meeting, I was just… | |
| **F** | 내일 회의인데, 잠깐 | About tomorrow's meeting, just a bit | |

