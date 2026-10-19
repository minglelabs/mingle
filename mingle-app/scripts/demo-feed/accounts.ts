/**
 * The accounts of the hand-planned demo feed: 10 posts shown to Korean users
 * (set A) and 10 shown to foreign users (set B). `nationality` decides the
 * look; `residence` is where the account says it lives, which for foreigners
 * living in Korea differs from the nationality. `existing` accounts were made
 * earlier and are only listed so the plan is complete.
 */
export type DemoAccount = {
  name: string
  handle: string
  gender: 'female' | 'male'
  age: number
  /** ISO 3166-1 alpha-2. */
  nationality: string
  residence: { country: string; city: string }
  primaryLanguage: string
  bio: string
  /** Which demo posts are theirs, e.g. 'A1'. */
  posts: string[]
  /** One of their posts is a selfie, so the profile photo must show the face it has to match. */
  needsFace?: boolean
  /** Text the image prompt must contain, for a look the plan fixes (e.g. 'white American'). */
  mustMention?: string
  /** The plan needs a face people stop scrolling for. */
  striking?: boolean
  /** Draws to skip: a photo staff rejected moves the account to its next draw. */
  redraws?: number
  existing?: boolean
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    name: '태윤', handle: 'taeyun.s', gender: 'male', age: 27, nationality: 'KR', residence: { country: 'KR', city: 'Seoul' }, primaryLanguage: 'ko',
    bio: '서울 토박이, 주말엔 카페랑 전시 다니는 사람. 영어·일본어 조금씩 공부 중이에요 :)',
    posts: ['B0'], needsFace: true, striking: true, redraws: 2,
  },
  {
    name: '莉奈', handle: 'rina.sel', gender: 'female', age: 23, nationality: 'JP', residence: { country: 'KR', city: 'Seoul' }, primaryLanguage: 'ja',
    bio: 'ソウルで語学留学中🇰🇷 カフェ巡りと韓国コスメが好き。日本語教えます！',
    posts: ['A0'], needsFace: true, striking: true, redraws: 11,
  },
  {
    name: '美咲', handle: 'misaki.tkm', gender: 'female', age: 24, nationality: 'JP', residence: { country: 'JP', city: 'Tokyo' }, primaryLanguage: 'ja',
    bio: '東京で事務やってます。韓ドラきっかけで韓国語勉強中🇰🇷 ソウルのおすすめ教えてほしいです',
    posts: ['A1'], needsFace: true,
  },
  {
    name: 'Larissa', handle: 'lari.souza', gender: 'female', age: 22, nationality: 'BR', residence: { country: 'KR', city: 'Seoul' }, primaryLanguage: 'pt',
    bio: 'Paulistana morando em Seul 🇧🇷🇰🇷 aprendendo coreano do zero. Te ensino português em troca!',
    posts: ['A2', 'B2'],
  },
  {
    name: '서윤', handle: 'seoyun', gender: 'female', age: 25, nationality: 'KR', residence: { country: 'KR', city: 'Seoul' }, primaryLanguage: 'ko',
    bio: '', posts: ['A3', 'B1'], existing: true,
  },
  {
    name: 'Daniel', handle: 'dan.in.seoul', gender: 'male', age: 29, nationality: 'US', residence: { country: 'KR', city: 'Seoul' }, primaryLanguage: 'en',
    bio: 'Chicago → Seoul, 3 years now. Korean still at "americano one please" level. Happy to help with English 🙌',
    posts: ['A4', 'B6'], needsFace: true, mustMention: 'white American',
  },
  {
    name: '林晓', handle: 'linxiao.sh', gender: 'female', age: 22, nationality: 'CN', residence: { country: 'CN', city: 'Shanghai' }, primaryLanguage: 'zh-CN',
    bio: '上海大学生，自学韩语中📚 想找韩国朋友一起练口语，可以教你中文～',
    posts: ['A5', 'B7'], redraws: 1,
  },
  {
    name: 'Yuki', handle: 'yuki_whsl', gender: 'female', age: 23, nationality: 'JP', residence: { country: 'KR', city: 'Seoul' }, primaryLanguage: 'ja',
    bio: 'ワーホリでソウル住み🇰🇷 韓国語はまだまだ🥲 日本語なら教えられます！',
    posts: ['A6', 'B4'],
  },
  {
    name: 'Mai', handle: 'mai.ngx', gender: 'female', age: 22, nationality: 'VN', residence: { country: 'VN', city: 'Ho Chi Minh City' }, primaryLanguage: 'vi',
    bio: 'Sài Gòn 🇻🇳 đang học tiếng Hàn, mê K-drama với đồ cay (dù ăn cay dở tệ 😭)',
    posts: ['A7'],
  },
  {
    name: '春香', handle: 'haruka_osk', gender: 'female', age: 25, nationality: 'JP', residence: { country: 'JP', city: 'Osaka' }, primaryLanguage: 'ja',
    bio: '大阪住み。韓国語3年目、好きな単語をノートに集めてます📒',
    posts: ['A8'],
  },
  {
    name: '민지', handle: 'minji', gender: 'female', age: 30, nationality: 'KR', residence: { country: 'KR', city: 'Seoul' }, primaryLanguage: 'ko',
    bio: '', posts: ['A9'], existing: true,
  },
  {
    name: '王雨萱', handle: 'yuxuan.w', gender: 'female', age: 24, nationality: 'CN', residence: { country: 'KR', city: 'Seoul' }, primaryLanguage: 'zh-CN',
    bio: '在首尔读研的成都人🌶️ 可以教中文，也想多练练韩语',
    posts: ['A10'],
  },
  {
    name: '준호', handle: 'junho.bsn', gender: 'male', age: 27, nationality: 'KR', residence: { country: 'KR', city: 'Busan' }, primaryLanguage: 'ko',
    bio: '부산 토박이🌊 해운대 근처 삽니다. 영어 공부 중이고 부산 맛집은 자신 있어요',
    posts: ['B3'],
  },
  {
    name: '도현', handle: 'dohyun.k', gender: 'male', age: 26, nationality: 'KR', residence: { country: 'KR', city: 'Seoul' }, primaryLanguage: 'ko',
    bio: '종로 근처 살아요. 외국인 친구들 서울 구경시켜주는 거 좋아함🏯 English OK',
    posts: ['B5'],
  },
  {
    name: 'Emily', handle: 'em.ldn', gender: 'female', age: 20, nationality: 'GB', residence: { country: 'GB', city: 'London' }, primaryLanguage: 'en',
    bio: 'London 🇬🇧 uni student. Learning Korean for the K-pop, staying for the food 🍜',
    posts: ['B8'],
  },
  {
    name: '彩花', handle: 'ayaka.sel', gender: 'female', age: 26, nationality: 'JP', residence: { country: 'KR', city: 'Seoul' }, primaryLanguage: 'ja',
    bio: 'ソウルで働いて1年目。韓国の会社文化に毎日びっくりしてます😂',
    posts: ['B9'],
  },
  {
    name: '지훈', handle: 'jihoon.lx', gender: 'male', age: 27, nationality: 'KR', residence: { country: 'KR', city: 'Seoul' }, primaryLanguage: 'ko',
    bio: '일본어·영어 공부 중🇯🇵🇺🇸 한국어 배우는 분들이랑 언어교환하고 싶어요. 편하게 말 걸어주세요!',
    posts: ['B10'],
  },
  // Ten more faces for the feed (2026-10): seven women and three men people stop scrolling for.
  {
    name: '하은', handle: 'haeun.log', gender: 'female', age: 24, nationality: 'KR', residence: { country: 'KR', city: 'Seoul' }, primaryLanguage: 'ko',
    bio: '연남동 사는 직장인. 퇴근하고 일본어 공부해요. 맛집 정보 교환 환영 🍜',
    posts: [], needsFace: true, striking: true,
  },
  {
    name: '紗良', handle: 'sara.ueno', gender: 'female', age: 22, nationality: 'JP', residence: { country: 'JP', city: 'Osaka' }, primaryLanguage: 'ja',
    bio: '大阪の大学生🎓 来年ソウルに交換留学予定！韓国語の友達ほしいです',
    posts: [], needsFace: true, striking: true, redraws: 1,
  },
  {
    name: '芷晴', handle: 'zhiqing.lin', gender: 'female', age: 23, nationality: 'TW', residence: { country: 'TW', city: 'Taipei' }, primaryLanguage: 'zh-TW',
    bio: '台北上班族，韓劇重度愛好者。想找韓國朋友練習口說 🙌',
    posts: [], needsFace: true, striking: true,
  },
  {
    name: 'Pim', handle: 'pim.chanya', gender: 'female', age: 24, nationality: 'TH', residence: { country: 'TH', city: 'Bangkok' }, primaryLanguage: 'th',
    bio: 'สาวกรุงเทพฯ ชอบเที่ยวเกาหลี 🇰🇷 กำลังเรียนภาษาเกาหลีอยู่ค่ะ',
    posts: [], needsFace: true, striking: true,
  },
  {
    name: 'Chloé', handle: 'chloe.mrt', gender: 'female', age: 25, nationality: 'FR', residence: { country: 'FR', city: 'Paris' }, primaryLanguage: 'fr',
    bio: 'Parisienne, graphiste. J\'apprends le coréen pour mon voyage à Séoul 🇰🇷',
    posts: [], needsFace: true, striking: true,
  },
  {
    name: 'Sofía', handle: 'sofi.alv', gender: 'female', age: 23, nationality: 'MX', residence: { country: 'MX', city: 'Mexico City' }, primaryLanguage: 'es',
    bio: 'CDMX 🇲🇽 fan del k-pop desde la prepa. Aprendo coreano y te enseño español',
    posts: [], needsFace: true, striking: true,
  },
  {
    name: 'Ava', handle: 'ava.kim.la', gender: 'female', age: 22, nationality: 'US', residence: { country: 'US', city: 'Los Angeles' }, primaryLanguage: 'en',
    bio: 'LA girl 🇺🇸 obsessed with Korean food and dramas. Learning Korean, happy to help with English!',
    posts: [], needsFace: true, striking: true,
  },
  {
    name: '시우', handle: 'siwoo.j', gender: 'male', age: 26, nationality: 'KR', residence: { country: 'KR', city: 'Seoul' }, primaryLanguage: 'ko',
    bio: '성수에서 일하는 디자이너. 영어 회화 같이 연습할 친구 찾아요 ☕',
    posts: [], needsFace: true, striking: true, redraws: 1,
  },
  {
    name: '海斗', handle: 'kaito.mz', gender: 'male', age: 25, nationality: 'JP', residence: { country: 'JP', city: 'Tokyo' }, primaryLanguage: 'ja',
    bio: '東京で美容師してます✂️ 韓国のヘアトレンドが好きで韓国語勉強中',
    posts: [], needsFace: true, striking: true,
  },
  {
    name: 'Lucas', handle: 'lucas.frr', gender: 'male', age: 26, nationality: 'BR', residence: { country: 'KR', city: 'Seoul' }, primaryLanguage: 'pt',
    bio: 'Carioca em Seul há 2 anos 🇧🇷🇰🇷 trabalho com marketing. Bora trocar idiomas?',
    posts: [], needsFace: true, striking: true,
  },
]
