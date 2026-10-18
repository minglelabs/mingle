/**
 * The 20 posts of the hand-planned demo feed, in the order a new reader
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
    slot: 'A1', handle: 'misaki.tkm', language: 'ja', place: 'Seoul, South Korea',
    text: '初めてのソウル旅行、3日目！明日どこ行けばいいか教えてください🙏',
    photo: '[self] A front-camera selfie in a narrow Seongsu-dong alley, red-brick warehouse walls and a small café sign behind her, the strap of a tote bag on her shoulder, a little tired from walking all day but happy.',
  },
  {
    slot: 'A2', handle: 'lari.souza', language: 'pt',
    text: 'Primeira semana escrevendo em coreano ✍️ Qual ficou mais feia? Podem ser sinceros 😭',
    photo: 'A Korean handwriting practice notebook with square grids open on a desk, rows of wobbly beginner hangul letters in pencil, an eraser and eraser crumbs beside it.',
  },
  { slot: 'A3', handle: 'seoyun.daily', language: 'ko', existingPostId: 'cmvb31snm0004shx1uy1mp6i7' },
  {
    slot: 'A4', handle: 'dan.in.seoul', language: 'en',
    text: '3 years in Seoul and my Korean is still ‘americano one please’ level 😅 Anyone want to correct my Korean?',
    photo: '[self] A front-camera selfie at a café window seat, an iced americano on the sill, the street outside a little overexposed, a slightly awkward grin.',
  },
  {
    slot: 'A5', handle: 'linxiao.sh', language: 'zh-CN',
    text: '背了一周的韩语单词，\'눈치\'到底怎么翻译成中文？',
    photo: 'A Korean vocabulary textbook open on a dorm desk with sticky notes on the pages, next to a brown sugar bubble milk tea with a wide straw.',
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
  { slot: 'B1', handle: 'seoyun.daily', language: 'ko', existingPostId: 'cmvb31snm0004shx1uy1mp6i7' },
  {
    slot: 'B2', handle: 'lari.souza', language: 'pt',
    text: 'Rio Han + frango frito no pôr do sol. Seul, você venceu 🍗',
    photo: '[self_faceless] A picnic mat at a Han River park at sunset: a box of Korean fried chicken and two cans of beer, her legs and sneakers on the mat, the river and a bridge glowing orange behind.',
  },
  {
    slot: 'B3', handle: 'junho.bsn', language: 'ko',
    text: '부산 여행 오는 분들, 현지인 맛집 물어보면 알려드려요 🌊',
    photo: 'Haeundae beach at sunset, the curve of the sand and the high-rise skyline behind it, a few people walking along the waterline.',
  },
  {
    slot: 'B4', handle: 'yuki_whsl', language: 'ja',
    text: '初めて韓国語だけで注文できた！\'아이스 아메리카노 한 잔 주세요\' 緊張した〜',
    photo: 'An iced americano in a plastic cup on a café counter with a small paper receipt and a round pager buzzer, the menu board out of focus behind.',
  },
  {
    slot: 'B5', handle: 'dohyun.k', language: 'ko',
    text: '한복 입고 가면 경복궁 입장 무료예요. 외국인 친구들 꼭 해봐요 👘',
    photo: '[friends] Him and two foreign friends, all in rented hanbok, posed in front of a palace gate at Gyeongbokgung, taken by a passerby, everyone squinting a little in the light.',
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
    photo: 'Japanese and English study notebooks open on a desk with handwritten notes in both languages, a pen and a can of coffee beside them.',
  },
]
