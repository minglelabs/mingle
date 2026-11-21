// 네이버 검색 API(지역) → 홈페이지 링크(대부분 인스타그램/예약 링크)로 인스타 핸들 확보
// env: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET   (무료 일 25,000건)
import { pool, need, sleep, pending, markEnriched } from './db.mjs';
import { isMatch, instagramHandle } from './match.mjs';

const ID = need('NAVER_CLIENT_ID');
const SECRET = need('NAVER_CLIENT_SECRET');

async function search(query) {
  const url = `https://openapi.naver.com/v1/search/local.json?display=5&query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'X-Naver-Client-Id': ID, 'X-Naver-Client-Secret': SECRET } });
  if (res.status === 429) {
    await sleep(30_000);
    return search(query);
  }
  if (!res.ok) throw new Error(`naver ${res.status}: ${await res.text()}`);
  return (await res.json()).items;
}

const rows = await pending('naver');
console.log(`naver: ${rows.length} salons`);
let hit = 0;
let ig = 0;
for (const [i, s] of rows.entries()) {
  try {
    const items = await search(`${s.district || s.city} ${s.name}`);
    const it = items.find((it) =>
      isMatch(s, { name: it.title.replace(/<[^>]+>/g, ''), road: it.roadAddress, jibun: it.address }),
    );
    if (it) {
      hit++;
      const handle = instagramHandle(it.link);
      if (handle) ig++;
      await markEnriched(s.id, 'naver', {
        instagram_handle: s.instagram_handle || handle,
        website: s.website || (handle ? null : it.link || null),
        naver_url: `https://map.naver.com/p/search/${encodeURIComponent(`${s.district || ''} ${s.name}`.trim())}`,
        phone: s.phone || it.telephone || null,
      });
    } else {
      await markEnriched(s.id, 'naver');
    }
  } catch (e) {
    console.warn(`#${s.id} ${s.name}: ${e.message}`);
  }
  if (i % 200 === 0) console.log(`${i}/${rows.length} matched=${hit} instagram=${ig}`);
  await sleep(110); // 초당 10건 제한
}
console.log(`done: matched ${hit}, instagram ${ig} / ${rows.length}`);
await pool.end();
