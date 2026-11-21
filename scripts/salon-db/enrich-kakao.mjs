// 카카오 로컬 키워드 검색 API → 전화번호, 좌표, 카카오맵 URL
// env: KAKAO_REST_KEY   (무료 일 100,000건)
import { pool, need, sleep, pending, markEnriched } from './db.mjs';
import { isMatch } from './match.mjs';

const KEY = need('KAKAO_REST_KEY');

async function search(query) {
  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?size=15&query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KEY}` } });
  if (res.status === 429) {
    await sleep(60_000);
    return search(query);
  }
  if (!res.ok) throw new Error(`kakao ${res.status}: ${await res.text()}`);
  return (await res.json()).documents;
}

const rows = await pending('kakao');
console.log(`kakao: ${rows.length} salons`);
let hit = 0;
for (const [i, s] of rows.entries()) {
  try {
    const docs = await search(`${s.city} ${s.district || ''} ${s.name}`);
    const d = docs.find((d) => isMatch(s, { name: d.place_name, road: d.road_address_name, jibun: d.address_name }));
    if (d) {
      hit++;
      await markEnriched(s.id, 'kakao', {
        kakao_place_id: d.id,
        kakao_url: d.place_url,
        phone: s.phone || d.phone || null,
        lat: Number(d.y),
        lng: Number(d.x),
      });
    } else {
      await markEnriched(s.id, 'kakao');
    }
  } catch (e) {
    console.warn(`#${s.id} ${s.name}: ${e.message}`);
  }
  if (i % 200 === 0) console.log(`${i}/${rows.length} matched=${hit}`);
  await sleep(60);
}
console.log(`done: matched ${hit}/${rows.length}`);
await pool.end();
