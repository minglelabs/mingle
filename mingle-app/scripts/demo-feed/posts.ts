/**
 * The posts of the hand-planned demo feed, in the order a new reader
 * sees them: set A for Korean readers, set B for everyone else. A post
 * written earlier is referenced by id; the others are published by
 * `publish-posts.ts`. `photo` is the stored photo description (a kind tag
 * as in post-photo.ts, then the scene); `place` is where the photo was
 * taken when that is not the account's home city (a trip).
 */
export type DemoPost = {
  slot: string
  handle: string
  /** The language the text is written in. */
  language: string
  text?: string
  photo?: string
  place?: string
  /** A post that already exists. */
  existingPostId?: string
}

export const DEMO_POSTS: readonly DemoPost[] = [
  {
    slot: 'A0', handle: 'rina.sel', language: 'ja',
    text: '韓国の美容室で初めて髪切ってもらった！似合ってる？💇‍♀️',
    photo: '[self] A mirror selfie in a Seoul hair salon right after the cut, taken in the mirror at her station, standing a little to one side of it: along the right edge of the picture the mirror ends in a thin silver edge, and past it the real salon wall and the next station are visible, unreflected; the shelf of products below the mirror, the phone held at chest height in the reflection. A fresh shoulder-length layered cut with see-through bangs, just blow-dried, a cream knit top. She is laughing at herself with her mouth open and eyes crinkled, head tipped slightly back, her free hand lifting the ends of her new hair; a stylist sweeping the floor behind her.',
  },
  {
    slot: 'A1', handle: 'misaki.tkm', language: 'ja', place: 'Seoul, South Korea',
    text: '初めてのソウル旅行、3日目！明日どこ行けばいいか教えてください🙏',
    photo: '[self] A friend took it from across a Seongsu-dong alley: she is mid-step with a paper shopping bag on one arm, glancing sideways at a shop window rather than at the camera, hair tied up, a long beige trench coat and jeans; her whole body is in the frame, small against the red-brick buildings.',
  },
  {
    slot: 'A2', handle: 'lari.souza', language: 'pt',
    text: 'Primeira semana escrevendo em coreano ✍️ Qual ficou mais feia? Podem ser sinceros 😭',
    photo: 'A grid notebook open on a café table with a first week of Korean practice in pencil: a few short words (안녕하세요, 감사합니다, 사랑해요, 친구) written over and over, clearly by an adult copying an unfamiliar script for the first time. The letters are wobbly and uneven: sizes jump around, syllables lean and drift off the grid, ㅇ drawn too big, ㄹ squashed, strokes too long, one syllable crossed out; nothing about it looks like a font or a textbook. Clean pages with no eraser marks, a mechanical pencil beside the notebook.',
  },
  { slot: 'A3', handle: 'seoyun.daily', language: 'ko', existingPostId: 'cmvb31snm0004shx1uy1mp6i7' },
  {
    slot: 'A4', handle: 'dan.in.seoul', language: 'en',
    text: '3 years in Seoul and my Korean is still ‘americano one please’ level 😅 Anyone want to correct my Korean?',
    photo: '[self] A friend took it across the table at a Korean barbecue place: he holds tongs over the grill and laughs at something off camera, looking down at the meat, in a grey beanie and an olive work jacket, no glasses today, a few days of stubble; smoke, side dishes and a green soju bottle in front of him.',
  },
  { slot: 'A6', handle: 'yuki_whsl', language: 'ja', text: '\'괜찮아\'って何でこんなに意味が多いの？ 大丈夫？ いらない？ 本当に？' },
  {
    slot: 'A7', handle: 'mai.ngx', language: 'vi',
    text: 'Lần đầu ăn 불닭 mà khóc luôn 😭 Sao người Hàn ngày nào cũng ăn được vậy?? 🔥',
    photo: '[self_faceless] Close shot of her hand lifting glossy red spicy noodles with chopsticks out of a black instant noodle cup, a carton of milk and a crumpled tissue on the table.',
  },
  {
    slot: 'A8', handle: 'haruka_osk', language: 'ja',
    text: '韓国語で一番好きな単語は\'설레다\'。日本語にぴったりの言葉がない',
    photo: 'A small vocabulary notebook open on a café table, the Korean word 설레다 written large in pen (exactly these three Hangul syllables: 설 레 다, nothing else as the main word) with a short Japanese note beside it, a highlighter and a latte next to it.',
  },
  { slot: 'A9', handle: 'minji.k', language: 'ko', text: '영어 단어 100개 외우고 뒤돌면 90개 까먹음 ㅋㅋ 다들 어떻게 외워요?' },
  {
    slot: 'A10', handle: 'yuxuan.w', language: 'zh-CN',
    text: '韩国朋友一见面就问\'밥 먹었어?\'，原来是在打招呼！',
    photo: '[friends] A front-camera selfie of her and a Korean friend at a Korean restaurant table crowded with banchan, a stew bubbling in a stone pot and rice bowls, both mid-laugh.',
  },
  {
    slot: 'A5', handle: 'linxiao.sh', language: 'zh-CN',
    text: '背了一周的韩语单词，\'눈치\'到底怎么翻译成中文？',
    photo: 'A Korean vocabulary textbook lying open on a dorm desk, shot from a low side angle so the printed pages recede and the small print is soft and unreadable, colorful sticky notes sticking out of the edges; a brown sugar bubble milk tea with a wide straw sharp in the foreground.',
  },
  {
    slot: 'A11', handle: 'rina.sel', language: 'ja',
    text: '初めての漢江ピクニック🧺 コンビニのラーメン、なんでこんなに美味しいの？',
    photo: '[self] A friend took it from a few steps away at Banpo Hangang Park on a clear autumn afternoon: she sits cross-legged on a picnic mat on the grass, holding a paper bowl of convenience-store ramen with chopsticks halfway to her mouth, laughing with her eyes squeezed shut because the friend just said something; a light beige cardigan over a white tee, hair half tied up with a claw clip. Beside her a crumpled convenience-store bag, a can of soda and a phone on the mat; people on other mats and the river behind, the bridge soft in the distance. Daylight from a high sun, no sunset.',
  },
  {
    slot: 'A12', handle: 'em.ldn', language: 'en',
    text: 'Booked my first trip to Seoul for December!! 🇰🇷 Say something nice to me in Korean so I can practise reading it 🥹',
    photo: '[self] A front-camera selfie at arm\'s length on a London street on a drizzly afternoon: she grins with her nose a little scrunched, raindrops on her hair, a black puffer jacket zipped up to her chin and a cream knit scarf; a red double-decker bus soft behind her, wet pavement, grey sky.',
  },
  {
    slot: 'A13', handle: 'ayaka.sel', language: 'ja',
    text: '会社の同期と退勤後チメク🍗🍺 韓国語の冗談がやっとわかるようになってきた！',
    photo: '[friends] A slightly crooked front-camera selfie at a crowded Korean fried chicken pub after work: her and two Korean coworkers (a woman and a man in office clothes, lanyards still on) squeezed into the frame around a small table with a tray of fried chicken, a pitcher of beer and pickled radish; everyone mid-laugh, one coworker half cut off at the edge. Warm ceiling lights, a busy room behind them.',
  },
  {
    slot: 'A14', handle: 'yuxuan.w', language: 'zh-CN',
    text: '第一次去韩国汗蒸幕！韩国朋友教我把毛巾叠成羊角头🐑 好可爱',
    photo: '[friends] A front-camera selfie in the common hall of a Korean jjimjilbang: her and a Korean friend in the matching orange jjimjilbang T-shirts and shorts, each wearing a towel folded into the little sheep-horn shape on the head, sitting on the heated floor, both laughing; a boiled egg and a cup of sikhye in front of them, other guests lying on mats behind.',
  },
  {
    slot: 'A15', handle: 'lari.souza', language: 'pt',
    text: 'Fui no noraebang pela primeira vez e errei a letra inteira kkkkk Qual música coreana eu treino pra próxima? 🎤',
    photo: '[friends] A friend snapped it from the sofa inside a small Korean noraebang room: she stands holding a microphone, singing with her eyes closed and one arm thrown up, a tambourine in a friend\'s hand at the edge of the frame; the room is dim with colored disco light spots on the walls, the lyrics screen a bright soft blur behind her, a bit of motion blur on her raised hand.',
  },
  { slot: 'B1', handle: 'seoyun.daily', language: 'ko', existingPostId: 'cmvb31snm0004shx1uy1mp6i7' },
  {
    slot: 'B0', handle: 'taeyun.s', language: 'ko',
    text: '성수에서 전시 보고 커피 한 잔. 주말에 같이 전시 다닐 외국인 친구 구해요 🙂',
    photo: '[self] A friend took it standing a few steps away in a bright Seongsu café on a weekday afternoon, a vertical full-body shot from slightly above, the friend standing: white-painted brick walls, one wall covered with old framed photos and vintage license plates, a white ceiling with bare warm bulbs and a wooden ceiling fan, open shelves of cups behind the counter where a barista in a black tee works with his back turned. He sits sideways on a black metal-and-wood chair with a curved armrest, legs crossed, body turned toward a light wooden table where an iced americano sits on a leather coaster next to his wallet; one hand reaches toward the cup without lifting it, the other holds his phone low on his lap. He looks down at the table, profile three-quarters to the camera, a calm, unposed face, his lips closed. Black hair in a neat, slightly long two-block cut with the fringe falling over the forehead, a fitted black short-sleeve knit tee, a thin silver necklace, a black leather watch, light-blue wide denim jeans. Light from the windows mixed with the warm bulbs, the room bright and airy; a corner of another customer cut off at the left edge. An ordinary iPhone shot by a friend.',
  },
  {
    slot: 'B2', handle: 'lari.souza', language: 'pt',
    text: 'Rio Han + frango frito no pôr do sol. Seul, você venceu 🍗',
    photo: '[self_faceless] A picnic mat at Yeouido Hangang Park at sunset, looking west downstream: the sun is going down over the river beyond the bridges to the west, the sky orange; a box of Korean fried chicken and two cans of beer, her legs stretched out on the mat in sneakers (each leg ending in its own correct foot), people sitting on the grass. No Lotte World Tower anywhere in the frame (it stands far to the east, away from the sunset).',
  },
  {
    slot: 'B3', handle: 'junho.bsn', language: 'ko',
    text: '부산 여행 오는 분들, 현지인 맛집 물어보면 알려드려요 🌊',
    photo: 'Haeundae beach in the early evening after the sun has gone down behind the city (Haeundae faces east, so there is no sun over the sea): the sky over the water is soft blue and pale pink, the curve of the sand and the high-rise skyline with the first lights on, a few people walking along the waterline.',
  },
  {
    slot: 'B4', handle: 'yuki_whsl', language: 'ja',
    text: '初めて韓国語だけで注文できた！\'아이스 아메리카노 한 잔 주세요\' 緊張した〜',
    photo: 'An iced americano in a plastic cup on a café counter with a small paper receipt and a round pager buzzer, the menu board out of focus behind.',
  },
  {
    slot: 'B5', handle: 'dohyun.k', language: 'ko',
    text: '한복 입고 가면 경복궁 입장 무료예요. 외국인 친구들 꼭 해봐요 👘',
    photo: '[friends] A slightly crooked front-camera selfie at arm\'s length of him and two foreign friends in rented hanbok in front of a Gyeongbokgung gate, in harsh midday sun: everyone squints, skin plain and matte with no shine, hair blown around by wind, hard shadows under the eyes and nose; one friend is half cut off at the edge, one is mid-laugh with the mouth open, he squints with both eyes against the sun (no wink, no smirk); nobody is posing well. Tourists walk through the background.',
  },
  { slot: 'B6', handle: 'dan.in.seoul', language: 'en', text: '3 years living in Seoul. Things I still can’t get used to: 1) people running for the bus at 2am 2) delivery in 15 min 3) no trash cans anywhere' },
  {
    slot: 'B7', handle: 'linxiao.sh', language: 'zh-CN', place: 'Seoul, South Korea',
    text: '第一次来首尔，明洞的鸡蛋糕太好吃了！还有什么必吃的？',
    photo: '[self_faceless] Her hand holding a fresh gyeranppang (egg bread) in a paper sleeve on a busy Myeongdong street, food stalls and the crowd behind.',
  },
  {
    slot: 'B8', handle: 'em.ldn', language: 'en', place: 'Seoul, South Korea',
    text: 'Tried a pojangmacha in Seoul tonight. Fish cake soup at 11pm hits different 🍢',
    photo: 'Inside a pojangmacha tent at night: a plate of tteokbokki and fish cake skewers in a paper cup of broth on a plastic table, steam rising, orange tarp walls around.',
  },
  { slot: 'B9', handle: 'ayaka.sel', language: 'ja', text: 'ソウルで働いて1年。会食で自分のグラスに自分で注いだら、部長に止められた😅' },
  {
    slot: 'B10', handle: 'jihoon.lx', language: 'ko',
    text: '일본어/영어 공부 중이에요. 한국어 배우는 분들 저랑 언어 교환해요 🙋‍♂️',
    photo: 'His study notebook open on a café table: a page of Japanese and English vocabulary jotted in a hurry by a Korean guy in his twenties, in blue ballpoint with a few red corrections: slanted, uneven, cramped toward the margin, some words crossed out and rewritten, arrows between words, a couple of circled ones, a highlighter streak, the bottom of the page still empty. A plain unbranded can of coffee and a pen beside it; a textbook behind it is out of focus.',
  },
  {
    slot: 'B11', handle: 'seoyun.daily', language: 'ko',
    text: '벚꽃 말고 은행나무 보러 오세요. 지금 서울 제일 예쁠 때예요 🍂',
    photo: '[self] A friend took it from a few steps away on the Deoksugung stone-wall road in late October: she walks under yellow ginkgo trees and has just turned back toward the camera, smiling with her lips closed, one hand tucking hair behind her ear; a camel coat over a cream knit and a long skirt, a small shoulder bag. Yellow leaves on the path, a few people walking behind, the old stone wall to one side. Soft afternoon daylight.',
  },
  {
    slot: 'B12', handle: 'taeyun.s', language: 'ko',
    text: '한강에서 따릉이 타다가 한 컷 🚲 주말에 같이 탈 외국인 친구 구해요',
    photo: '[self] A friend took it from a few steps away on the riverside bike path at Yeouido Hangang Park on a sunny afternoon: he stands next to a green public rental bike, one hand on the handlebar, laughing and looking slightly off camera, a little out of breath; a plain white tee and black track pants, a cap pushed back a bit. Cyclists and runners passing behind, the river and the bridges beyond. High sun, no sunset.',
  },
  {
    slot: 'B13', handle: 'dohyun.k', language: 'ko',
    text: '주말에 북한산 올라갔는데 외국인 등산객 진짜 많더라고요. 다음에 같이 갈 사람? ⛰️',
    photo: '[self] A friend took it from a few steps below on the bare granite near the Bukhansan summit on a clear midday: he sits on the rock with his forearms on his knees, grinning and squinting in the sun, a little windblown; a navy windbreaker, a small hiking backpack, a water bottle beside him. Seoul spreads out far below behind him, hazy toward the horizon, other hikers resting on the rocks.',
  },
  {
    slot: 'B14', handle: 'minji.k', language: 'ko',
    text: '퇴근하고 망원시장에서 떡볶이 + 튀김. 외국인 친구들 오면 여기 꼭 데려가요',
    photo: '[self_faceless] Her hand holding a paper cup of tteokbokki with a toothpick stuck in a rice cake, at a busy stall in Mangwon Market in the early evening; a plate of mixed fried snacks on the steel counter, steam over the big flat pan of red sauce behind, the stall\'s hanging bulbs and the market crowd soft in the background.',
  },
  {
    slot: 'B15', handle: 'jihoon.lx', language: 'ko',
    text: '퇴근길 성수동. 요즘 일본어로 혼잣말하면서 걸어요 ㅋㅋ 같이 연습할 분?',
    photo: '[self] A friend took it from a few steps away on a Seongsu-dong street in the early evening after work: he walks toward the camera with one hand in his coat pocket and earbuds in, looking down with a small private smile; a charcoal wool coat over a grey hoodie, a tote bag on his shoulder. Red-brick buildings and shop lights coming on behind, people walking past, the sky already dim blue.',
  },
]
