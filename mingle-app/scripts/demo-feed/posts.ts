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
    photo: 'A grid notebook open on a café table with a first week of Korean practice in pencil: a few short words (안녕하세요, 감사합니다, 사랑해요, 친구) written over and over, clearly by an adult copying an unfamiliar script for the first time. The letters are wobbly and uneven: sizes jump around, syllables lean and drift off the grid, ㅇ drawn too big, ㄹ squashed, strokes too long, a few syllables erased and rewritten with grey smudges, one crossed out; nothing about it looks like a font or a textbook. An eraser and eraser crumbs beside it.',
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
  { slot: 'B1', handle: 'seoyun.daily', language: 'ko', existingPostId: 'cmvb31snm0004shx1uy1mp6i7' },
  {
    slot: 'B0', handle: 'taeyun.s', language: 'ko',
    text: '성수에서 전시 보고 커피 한 잔. 주말에 같이 전시 다닐 외국인 친구 구해요 🙂',
    photo: '[self] A friend took it across a window table at a bright Seongsu café on a sunny afternoon: he leans back with an iced coffee in one hand, looking out the window with a half smile, freshly shaved with clear, clean skin, his natural black hair loosely falling over the forehead, a plain white tee under an open navy overshirt. The café is airy and well lit by big windows, white walls and light wood; the window side of his face is brighter than the other, and the photo is a little soft and noisy like an ordinary phone shot.',
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
]
