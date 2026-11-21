// 네이버 플레이스(모바일 웹)에서 카카오로 모은 미용실을 찾아 상세를 붙인다.
//   node naver-place.mjs            (LIMIT=100, HEADLESS=0 으로 창 보기)
// 매장마다: 목록 검색(이름 + 좌표) → 이름/주소 매칭 → /home 의 __APOLLO_STATE__ 에서
//   방문자 리뷰 수·평점, 블로그 리뷰 수, 네이버 예약 여부, 톡톡, 매장/디자이너 인스타, 메뉴, 편의시설, 사진
import { chromium } from 'playwright-core';
import { pool, sleep, LIMIT } from './db.mjs';
import { isMatch, instagramHandle } from './match.mjs';

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const jitter = (ms) => sleep(ms + Math.random() * ms);

const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADLESS !== '0' });
const page = await browser.newPage({ locale: 'ko-KR', userAgent: UA, viewport: { width: 420, height: 900 } });

async function apollo(url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__APOLLO_STATE__, null, { timeout: 15000 });
  return page.evaluate(() => window.__APOLLO_STATE__);
}

async function findPlace(s) {
  const x = s.lng || 127.0276;
  const y = s.lat || 37.4979;
  const q = s.lat ? s.name : `${s.district || ''} ${s.name}`;
  const st = await apollo(
    `https://m.place.naver.com/hairshop/list?query=${encodeURIComponent(q)}&x=${x}&y=${y}&clientX=${x}&clientY=${y}`,
  );
  const items = Object.entries(st)
    .filter(([k]) => k.startsWith('PlaceListBusinessesItem:'))
    .map(([, v]) => v);
  // roadAddress는 "부산대학로 39 2층"처럼 시/구가 빠져 있어 commonAddress("부산 금정구 장전동")에서 붙인다.
  return items.find((it) => {
    const prefix = (it.commonAddress || '').split(/\s+/).slice(0, 2).join(' ');
    return isMatch(s, {
      name: it.name,
      road: it.roadAddress ? `${prefix} ${it.roadAddress}` : null,
      jibun: `${it.commonAddress || ''} ${it.address || ''}`,
    });
  });
}

function deepFind(obj, key, out = []) {
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (k === key) out.push(v);
      deepFind(v, key, out);
    }
  }
  return out;
}

function summarize(st, id) {
  const base = st[`PlaceDetailBase:${id}`] || {};
  const all = JSON.stringify(st);
  const homepages = JSON.stringify(deepFind(st.ROOT_QUERY, 'homepages'));
  const shopIg = (homepages.match(/instagram\.com\/[A-Za-z0-9._]+/g) || []).map((u) => instagramHandle(u)).filter(Boolean);
  const stylists = Object.entries(st)
    .filter(([k]) => k.startsWith('Stylist:'))
    .map(([, v]) => ({ name: v.name, url: v.url, booking: v.bookingUrl }));
  const stylistIg = [...new Set(stylists.map((v) => instagramHandle(v.url)).filter(Boolean))];
  const menus = Object.entries(st)
    .filter(([k]) => k.startsWith('Menu:'))
    .map(([, v]) => ({ name: v.name, price: v.price }));
  const photos = Object.entries(st)
    .filter(([k]) => /TopPhotoItem|PhotoItem/.test(k))
    .map(([, v]) => ({ url: v.originalUrl, title: v.title, date: v.date }))
    .filter((p) => p.url)
    .slice(0, 20);
  const booking = /booking\.naver\.com/.test(all);
  return {
    base: {
      id,
      name: base.name,
      category: base.category,
      roadAddress: base.roadAddress,
      address: base.address,
      phone: base.phone,
      virtualPhone: base.virtualPhone,
      conveniences: base.conveniences,
      paymentInfo: base.paymentInfo,
      visitorReviewsTotal: base.visitorReviewsTotal,
      visitorReviewsScore: base.visitorReviewsScore,
      cafeBlogReviewsTotal: base.cafeBlogReviewsTotal,
      talktalkUrl: base.talktalkUrl,
      coordinate: base.coordinate,
    },
    homepages: JSON.parse(homepages || '[]'),
    shopIg: shopIg[0] || null,
    stylistIg,
    stylists,
    menus,
    photos,
    booking,
  };
}

async function save(s, id, d) {
  await pool.query(
    `UPDATE salons SET naver_place_id=$2, naver_url=$3, naver_visitor_reviews=$4, naver_score=$5,
       naver_blog_reviews=$6, naver_booking=$7, naver_talktalk=$8, stylist_instagrams=$9,
       instagram_handle=COALESCE(instagram_handle,$10), phone=COALESCE(phone,$11), raw_naver=$12,
       enriched_at = enriched_at || jsonb_build_object('naver', now()), updated_at=now()
     WHERE id=$1`,
    [s.id, id, `https://m.place.naver.com/hairshop/${id}/home`, d.base.visitorReviewsTotal ?? null,
     d.base.visitorReviewsScore ?? null, d.base.cafeBlogReviewsTotal ?? null, d.booking, d.base.talktalkUrl || null,
     d.stylistIg.length ? d.stylistIg : null, d.shopIg, d.base.phone || d.base.virtualPhone || null, d],
  );
  for (const p of d.photos) {
    await pool.query(
      `INSERT INTO salon_photos (salon_id, source, url, permalink, attribution) VALUES ($1,'naver',$2,$3,$4)
       ON CONFLICT DO NOTHING`,
      [s.id, p.url, `https://m.place.naver.com/hairshop/${id}/photo`, p.title || null],
    );
  }
}

const { rows } = await pool.query(
  `SELECT * FROM salons WHERE kakao_place_id IS NOT NULL AND NOT (enriched_at ? 'naver')
   ORDER BY blog_review_count DESC NULLS LAST, id ${LIMIT ? `LIMIT ${LIMIT}` : ''}`,
);
console.log(`naver: ${rows.length} salons`);
let hit = 0;
let errors = 0;
for (const [i, s] of rows.entries()) {
  try {
    const it = await findPlace(s);
    if (it) {
      await jitter(1200);
      const st = await apollo(`https://m.place.naver.com/hairshop/${it.id}/home`);
      await save(s, it.id, summarize(st, it.id));
      hit++;
    } else {
      await pool.query(
        `UPDATE salons SET enriched_at = enriched_at || jsonb_build_object('naver', now()) WHERE id=$1`,
        [s.id],
      );
    }
    errors = 0;
  } catch (e) {
    console.warn(`#${s.id} ${s.name}: ${e.message.split('\n')[0]}`);
    if (++errors >= 5) {
      console.warn('5 errors in a row, pausing 10 min');
      await sleep(10 * 60_000);
      errors = 0;
    }
  }
  if (i % 20 === 0) console.log(`${new Date().toLocaleTimeString()} ${i}/${rows.length} matched=${hit}`);
  await jitter(1500);
}
console.log(`done: matched ${hit}/${rows.length}`);
await browser.close();
await pool.end();
