// Google Places API (New) Text Search → 평점, 리뷰 수, 웹사이트, 매장 사진
// env: GOOGLE_MAPS_KEY
//      GOOGLE_WHERE  (선택) 비용 때문에 대상 줄이기. 예: "district IN ('강남구','마포구')"
//      LIMIT         (선택) 최대 건수
// 비용: 사진/평점 필드는 Enterprise SKU. 월 무료 한도를 넘으면 과금되니 LIMIT로 끊어서 실행.
// 사진은 photo name만 저장 (Google 약관: 이미지 자체 장기 저장 금지, 작성자 표기 필수).
//   보기: https://places.googleapis.com/v1/{url}/media?maxWidthPx=800&key=KEY
import { pool, need, sleep, pending, markEnriched, addPhoto } from './db.mjs';
import { isMatch, instagramHandle } from './match.mjs';

const KEY = need('GOOGLE_MAPS_KEY');
const FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.shortFormattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.websiteUri',
  'places.googleMapsUri',
  'places.photos',
].join(',');

async function search(s) {
  const body = { textQuery: `${s.name} ${s.road_address || s.jibun_address}`, languageCode: 'ko', pageSize: 3 };
  if (s.lat && s.lng) body.locationBias = { circle: { center: { latitude: s.lat, longitude: s.lng }, radius: 300 } };
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': FIELDS },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`google ${res.status}: ${await res.text()}`);
  return (await res.json()).places || [];
}

const rows = await pending('google', process.env.GOOGLE_WHERE || 'TRUE');
console.log(`google: ${rows.length} salons`);
let hit = 0;
for (const [i, s] of rows.entries()) {
  try {
    const places = await search(s);
    const p = places.find((p) =>
      isMatch(s, { name: p.displayName?.text, road: p.formattedAddress?.replace(/^대한민국\s*/, '') }),
    );
    if (p) {
      hit++;
      const handle = instagramHandle(p.websiteUri);
      await markEnriched(s.id, 'google', {
        google_place_id: p.id,
        google_url: p.googleMapsUri,
        google_rating: p.rating ?? null,
        google_review_count: p.userRatingCount ?? null,
        website: s.website || (handle ? null : p.websiteUri || null),
        instagram_handle: s.instagram_handle || handle,
        lat: s.lat ?? p.location?.latitude,
        lng: s.lng ?? p.location?.longitude,
      });
      for (const ph of (p.photos || []).slice(0, 10)) {
        const a = ph.authorAttributions?.[0];
        await addPhoto(s.id, {
          source: 'google',
          url: ph.name,
          permalink: p.googleMapsUri,
          attribution: a ? `${a.displayName} ${a.uri || ''}`.trim() : null,
        });
      }
    } else {
      await markEnriched(s.id, 'google');
    }
  } catch (e) {
    console.warn(`#${s.id} ${s.name}: ${e.message}`);
    if (/40[13]/.test(e.message)) break;
  }
  if (i % 100 === 0) console.log(`${i}/${rows.length} matched=${hit}`);
  await sleep(100);
}
console.log(`done: matched ${hit}/${rows.length}`);
await pool.end();
