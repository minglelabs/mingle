/**
 * One-off (2026-10-31): starter-feed candidate posts for the operator review
 * queue, written by hand to fill the 10 + 10 starter picks in
 * scripts/seed-starter-engagement.mts. Each goes in as state 'review', pinned
 * at the top of the queue in this order. Photos are not drawn: `imagePrompt`
 * only describes the photo. A post whose text the account already has is
 * skipped, so it is safe to run again. Without --apply it only prints.
 *
 *   railway run -- npx tsx scripts/starter-feed-candidates.mts [--apply]
 */
import { prisma } from '../src/lib/prisma'

type Candidate = { key: string; handle: string; language: string | null; topic: string; text: string; imagePrompt: string }

export const CANDIDATES: Candidate[] = [
  // ---- for Korean readers ----
  { key: 'ko1', handle: 'rina.sel', language: 'ko', topic: 'daily_moment',
    text: '어학당 친구가 찍어 줬어요📸\n한국 와서 처음으로 앞머리 잘랐는데… 어때요?\n솔직하게 말해 주세요ㅠㅠ',
    imagePrompt: '[self] A friend took it on a quiet Yeonnam-dong side street: a Japanese woman in her early twenties with freshly cut see-through bangs, a cream knit cardigan and a small shoulder bag, holding an iced latte, smiling a little shyly at the camera; parked bikes, café signs and power lines behind her.' },
  { key: 'ko2', handle: 'linxiao.sh', language: null, topic: 'work_study',
    text: '在上海的韩国烤肉店打工第三个月，老板说我用韩语点单比他还快😂\n有没有韩国朋友教我几句店里地道的说法？',
    imagePrompt: '[self] A coworker took it during a break in a Korean BBQ restaurant in Shanghai: a Chinese woman around twenty in a black apron and a ponytail, mid-laugh, holding meat tongs over a round grill, Korean menu posters on the wall behind.' },
  { key: 'ko3', handle: 'em.ldn', language: null, topic: 'language_learning',
    text: 'Ordered at a Korean café in London fully in Korean today.\nThe barista answered in Korean and I just… nodded and walked away 😭\nWhat do I even say when I don\'t understand?',
    imagePrompt: '[self] A friend took it outside a small Korean café in central London: a British university student around twenty with wavy brown hair and a beige trench coat, holding a takeaway cup, laughing with one hand over her mouth, the café window with Hangul lettering behind her.' },
  { key: 'ko4', handle: 'misaki.tkm', language: null, topic: 'culture_question',
    text: '韓ドラで見たポジャンマチャに行くのが夢で、新大久保で似たお店を見つけた🥹\n本場の雰囲気ってこんな感じですか？',
    imagePrompt: '[self] A front-camera selfie at night under the orange tarp of a pojangmacha-style stall in Shin-Okubo: a Japanese woman in her early twenties with a low bun and a navy coat, cheeks a little pink, a green soju bottle and a plate of tteokbokki on the plastic table, warm light and other customers blurred behind.' },
  { key: 'ko5', handle: 'lucas.frr', language: null, topic: 'daily_moment',
    text: '2 anos em Seul e finalmente fui num 찜질방 com o pessoal do trabalho.\nNinguém me avisou que a gente quebra o ovo cozido na testa 🥚😂',
    imagePrompt: '[friends] A front-camera group selfie in a Korean jjimjilbang: a Brazilian man in his mid-twenties with curly dark hair and two Korean coworkers, all in matching orange jjimjilbang uniforms with towels folded into sheep-head shapes, the Brazilian man holding a boiled egg to his forehead, the heated floor and other guests behind.' },
  { key: 'ko6', handle: 'yuxuan.w', language: null, topic: 'food',
    text: '研究室的韩国同学第一次吃我做的麻婆豆腐，辣到连说三遍「괜찮아요」，但手在抖😂\n韩国朋友们觉得四川菜到底有多辣？',
    imagePrompt: '[friends] Taken across a small dorm kitchen table in Seoul: a Chinese woman in her early twenties grinning next to two Korean labmates, one fanning his mouth with his hand and the other holding a cup of milk, a big bowl of red mapo tofu and rice bowls in front of them.' },
  { key: 'ko7', handle: 'sara.ueno', language: 'ko', topic: 'travel',
    text: '내년에 서울로 교환학생 가요!!\n지금 짐 싸는 연습 중… (아직 1년 남음)\n서울 겨울 진짜 추워요? 패딩 몇 개 필요해요?',
    imagePrompt: '[self] A mirror selfie in a small Osaka apartment room: a Japanese university student around twenty in an oversized black long puffer coat zipped to the chin, the phone at chest height so her excited face shows, an open suitcase on the floor with clothes piled in it.' },
  { key: 'ko8', handle: 'kaito.mz', language: null, topic: 'work_study',
    text: '最近お客さんのオーダーで一番多いのが「韓国アイドルみたいに」✂\n韓国の美容室、一回でいいから見学してみたい…おすすめのエリアどこですか？',
    imagePrompt: '[self] A coworker took it inside a bright Tokyo hair salon: a Japanese man in his mid-twenties with a soft two-block haircut and a black apron, holding scissors and a comb, smiling at the camera, salon mirrors and chairs behind him.' },
  // ---- for foreign readers ----
  { key: 'fo1', handle: 'dohyun.k', language: null, topic: 'daily_moment',
    text: '경복궁 앞에서 한복 입은 외국인 친구들 사진 찍어 주다가 오늘만 50장은 찍은 듯ㅋㅋ\n다음엔 나도 한복 입어 볼까 고민 중. 남자 한복 어색할까요?',
    imagePrompt: '[self] A friend took it in front of Gwanghwamun gate on a clear day: a Korean man in his mid-twenties in a denim jacket and white tee, laughing while holding up a friend\'s phone as if about to take a photo, tourists in colorful hanbok blurred behind him.' },
  { key: 'fo2', handle: 'haeun.log', language: null, topic: 'recommendation_request',
    text: '퇴근하고 연트럴파크 걷는 게 요즘 낙이에요🍂\n근처 사는 분들 동네 맛집 하나씩만 알려 주세요. 저도 하나 알려 드림!',
    imagePrompt: '[self] A friend took a candid on the Yeontral Park path in autumn: a Korean woman in her early twenties with shoulder-length hair, a camel coat and a tote bag, half turned toward the camera with a small smile, yellow ginkgo leaves on the path and people on benches behind.' },
  { key: 'fo3', handle: 'siwoo.j', language: null, topic: 'culture_question',
    text: '성수 회사 옥상에서 점심 10분 컷.\n외국인 동료가 한국 직장인 점심 너무 빨리 먹는다고 놀라던데, 다른 나라는 점심 보통 몇 분 먹어요?',
    imagePrompt: '[self] A coworker took it on an office rooftop in Seongsu at noon: a Korean man in his mid-twenties with round glasses and a grey sweatshirt, sitting on a low ledge holding a convenience-store triangle kimbap and an iced coffee, red-brick factory buildings and the city behind him.' },
  { key: 'fo4', handle: 'minji.k', language: null, topic: 'travel',
    text: '광주 양림동 골목 걷다가 친구랑 한 컷📷\n서울 말고 다른 도시 여행도 생각 중인 분들, 광주 오시면 제가 코스 짜 드릴게요!',
    imagePrompt: '[friends] Taken by a passer-by in a Yangnim-dong alley in Gwangju: a Korean woman around thirty with a short bob and a striped shirt posing side by side with a friend, both making peace signs, a colorful mural wall and an old brick church tower behind them.' },
]

async function main() {
  const apply = process.argv.includes('--apply')
  const users = await prisma.user.findMany({
    where: { handle: { in: CANDIDATES.map((c) => c.handle) }, isOperator: true, isDeleted: false },
    select: { id: true, handle: true },
  })
  const idOf = new Map(users.map((u) => [u.handle, u.id]))
  const missing = CANDIDATES.filter((c) => !idOf.has(c.handle)).map((c) => c.handle)
  if (missing.length) throw new Error(`missing accounts: ${missing.join(', ')}`)

  // Pinned above everything in the queue, in list order (a lower rank comes first).
  const [row] = await prisma.$queryRaw<Array<{ low: number | null }>>`
    SELECT LEAST((SELECT MIN(review_rank) FROM app.app_operator_accounts), (SELECT MIN(review_rank) FROM app.app_operator_post_reserve)) AS low`
  const low = Number(row?.low ?? 1)
  const ids: Record<string, string> = {}
  for (const [index, c] of CANDIDATES.entries()) {
    const operatorUserId = idOf.get(c.handle)!
    const existing = await prisma.operatorPostReserve.findFirst({ where: { operatorUserId, text: c.text }, select: { id: true } })
    if (existing) {
      ids[c.key] = existing.id
      console.log(c.key, c.handle, 'exists', existing.id)
      continue
    }
    const rank = low - CANDIDATES.length + index - 1
    if (!apply) {
      console.log(c.key, c.handle, 'would create, rank', rank)
      continue
    }
    const created = await prisma.operatorPostReserve.create({
      data: { operatorUserId, text: c.text, topic: c.topic, language: c.language, imagePrompt: c.imagePrompt, state: 'review', reviewRank: rank },
      select: { id: true },
    })
    ids[c.key] = created.id
    console.log(c.key, c.handle, 'created', created.id, 'rank', rank)
  }
  console.log(JSON.stringify(ids))
  await prisma.$disconnect()
}

void main()
