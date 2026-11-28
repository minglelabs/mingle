// Instagram Graph API Business Discovery → 팔로워 수, 게시물 수, 최근 사진 12장
// 공개 비즈니스/크리에이터 계정만 조회됨 (개인 계정은 null).
// env: IG_USER_ID       내 인스타 비즈니스 계정 ID
//      IG_ACCESS_TOKEN  instagram_basic 권한이 있는 장기 토큰
// 제한: 앱 기준 시간당 약 200건 → 자동으로 쉬어감.
import { pool, need, sleep, pending, markEnriched, addPhoto } from './db.mjs';

const IG_USER = need('IG_USER_ID');
const TOKEN = need('IG_ACCESS_TOKEN');
const V = process.env.GRAPH_VERSION || 'v21.0';

async function discover(handle) {
  const fields = `business_discovery.username(${handle}){username,followers_count,media_count,media.limit(12){media_type,media_url,thumbnail_url,permalink,timestamp}}`;
  const url = `https://graph.facebook.com/${V}/${IG_USER}?fields=${encodeURIComponent(fields)}&access_token=${TOKEN}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) {
    if ([4, 17, 32, 613].includes(json.error.code)) {
      console.log('rate limited, waiting 15 min');
      await sleep(15 * 60_000);
      return discover(handle);
    }
    if (json.error.code === 110 || /does not exist|cannot be found/i.test(json.error.message)) return null;
    throw new Error(json.error.message);
  }
  return json.business_discovery;
}

const rows = await pending('instagram', 'instagram_handle IS NOT NULL');
console.log(`instagram: ${rows.length} salons with a handle`);
let ok = 0;
for (const [i, s] of rows.entries()) {
  try {
    const bd = await discover(s.instagram_handle);
    if (bd) {
      ok++;
      await markEnriched(s.id, 'instagram', { instagram_followers: bd.followers_count, instagram_posts: bd.media_count });
      for (const m of bd.media?.data || []) {
        const url = m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url;
        if (url) await addPhoto(s.id, { source: 'instagram', url, permalink: m.permalink, taken_at: m.timestamp });
      }
    } else {
      await markEnriched(s.id, 'instagram');
    }
  } catch (e) {
    console.warn(`#${s.id} @${s.instagram_handle}: ${e.message}`);
  }
  if (i % 50 === 0) console.log(`${i}/${rows.length} ok=${ok}`);
  await sleep(1000);
}
console.log(`done: ${ok}/${rows.length}`);
await pool.end();
