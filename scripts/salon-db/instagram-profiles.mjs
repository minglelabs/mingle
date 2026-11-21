// 인스타 프로필 수집 (별도 크롬 창, 처음 한 번 직접 로그인)
//   node instagram-profiles.mjs        MAX=200 (한 번 실행당 최대 프로필 수), GAP=30 (프로필 간 평균 초)
// 프로필 페이지를 열 때 앱이 받아오는 JSON 응답을 가로채서 저장한다:
//   이름, 소개글, 카테고리, 링크, 팔로워/팔로잉/게시물 수, 비즈니스 여부, 연락 방식,
//   최근 게시물 12개(사진, 좋아요·댓글 수, 캡션, 날짜) → 사진은 ~/salon-db/photos/ig/<salon_id>/ 에 파일로
// 챌린지/로그인 화면이 뜨면 즉시 멈춘다 (계정 보호).
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pool, sleep } from './db.mjs';

const MAX = Number(process.env.MAX || 200);
const GAP = Number(process.env.GAP || 30) * 1000;
// 수집 전용 크롬 프로필. 처음 한 번 이 창에서 직접 로그인하면 이후 유지된다.
const PROFILE_DIR = process.env.PROFILE_DIR || path.join(os.homedir(), 'salon-db', 'chrome-ig');
const PHOTO_DIR = path.join(os.homedir(), 'salon-db', 'photos', 'ig');

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  channel: 'chrome',
  headless: false,
  locale: 'ko-KR',
  viewport: { width: 1100, height: 900 },
});
const page = ctx.pages()[0] || (await ctx.newPage());

async function ensureLogin() {
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
  for (let i = 0; ; i++) {
    // 쿠키로 판단: 로그인 중 페이지가 이동해도 깨지지 않는다
    const loggedIn = (await ctx.cookies('https://www.instagram.com')).some((c) => c.name === 'sessionid' && c.value);
    if (loggedIn) return;
    if (i === 0) console.log('>>> 열린 크롬 창에서 인스타그램에 로그인해 주세요. 로그인되면 자동으로 시작합니다.');
    await sleep(5000);
  }
}

function deepCollect(obj, pred, out = []) {
  if (obj && typeof obj === 'object') {
    if (pred(obj)) out.push(obj);
    for (const v of Object.values(obj)) deepCollect(v, pred, out);
  }
  return out;
}

async function scrape(handle) {
  const jsons = [];
  const onResp = async (r) => {
    const u = r.url();
    if (!/graphql|\/api\/v1\//.test(u)) return;
    try {
      jsons.push(await r.json());
    } catch {}
  };
  page.on('response', onResp);
  try {
    await page.goto(`https://www.instagram.com/${handle}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (/challenge|accounts\/login|suspended/.test(page.url())) throw Object.assign(new Error('blocked'), { stop: true });
    await page
      .waitForSelector('main a[href*="/p/"] img, main a[href*="/reel/"] img, main h2, main span', { timeout: 15000 })
      .catch(() => {});
    await sleep(2500);
    const notFound = await page.evaluate(() => /페이지를 사용할 수 없습니다|Sorry, this page/.test(document.body.innerText));
    if (notFound) return { notFound: true };

    const users = jsons.flatMap((j) =>
      deepCollect(j, (o) => o.username?.toLowerCase?.() === handle.toLowerCase() && ('follower_count' in o || 'biography' in o)),
    );
    const user = Object.assign({}, ...users);
    const media = jsons
      .flatMap((j) => deepCollect(j, (o) => o.code && (o.image_versions2 || o.carousel_media) && o.taken_at))
      .filter((m, i, arr) => arr.findIndex((x) => x.code === m.code) === i)
      .slice(0, 12)
      .map((m) => {
        const img = (m.image_versions2 || m.carousel_media?.[0]?.image_versions2)?.candidates?.[0]?.url;
        return {
          code: m.code,
          url: `https://www.instagram.com/p/${m.code}/`,
          img,
          likes: m.like_count ?? null,
          comments: m.comment_count ?? null,
          caption: m.caption?.text?.slice(0, 500) ?? null,
          taken_at: m.taken_at ? new Date(m.taken_at * 1000).toISOString() : null,
          type: m.media_type,
        };
      });

    // JSON을 못 잡았을 때를 위한 화면 값
    const dom = await page.evaluate(() => {
      const hd = document.querySelector('header');
      const txt = hd?.innerText || '';
      const grab = (label) => (txt.match(new RegExp(`${label}\\s*([\\d,.]+\\s*[만천]?)`)) || [])[1] || null;
      return {
        text: txt.slice(0, 1500),
        posts: grab('게시물'),
        followers: grab('팔로워'),
        following: grab('팔로우'),
        links: [...(hd?.querySelectorAll('a') || [])].map((a) => a.href).filter((h) => !/instagram\.com/.test(h)),
        grid: [...document.querySelectorAll('main a[href*="/p/"], main a[href*="/reel/"]')]
          .slice(0, 12)
          .map((a) => ({ url: a.href, img: a.querySelector('img')?.src, alt: a.querySelector('img')?.alt })),
      };
    });
    return { user, media, dom };
  } finally {
    page.off('response', onResp);
  }
}

const toNum = (s) => {
  if (s == null) return null;
  if (typeof s === 'number') return s;
  const n = parseFloat(String(s).replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  return Math.round(/만/.test(s) ? n * 10000 : /천/.test(s) ? n * 1000 : n);
};

async function download(salonId, i, url) {
  if (!url) return null;
  try {
    const res = await page.request.get(url, { timeout: 20000 });
    if (!res.ok()) return null;
    const dir = path.join(PHOTO_DIR, String(salonId));
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${String(i).padStart(2, '0')}.jpg`);
    await fs.writeFile(file, await res.body());
    return file;
  } catch {
    return null;
  }
}

await ensureLogin();
const { rows } = await pool.query(
  `SELECT id, name, instagram_handle FROM salons
   WHERE instagram_handle IS NOT NULL AND raw_instagram IS NULL
   ORDER BY coalesce(naver_visitor_reviews,0) + coalesce(blog_review_count,0) DESC, id LIMIT $1`,
  [MAX],
);
console.log(`instagram: ${rows.length} profiles`);
for (const [i, s] of rows.entries()) {
  try {
    const r = await scrape(s.instagram_handle);
    if (r.notFound) {
      await pool.query(`UPDATE salons SET raw_instagram='{"notFound":true}' WHERE id=$1`, [s.id]);
    } else {
      const u = r.user;
      const posts = r.media.length ? r.media : r.dom.grid.map((g) => ({ url: g.url, img: g.img, caption: g.alt }));
      await pool.query(
        `UPDATE salons SET instagram_full_name=$2, instagram_bio=$3, instagram_category=$4, instagram_external_url=$5,
           instagram_followers=$6, instagram_following=$7, instagram_posts=$8, instagram_is_business=$9,
           instagram_contact=$10, raw_instagram=$11,
           enriched_at = enriched_at || jsonb_build_object('instagram', now()), updated_at=now()
         WHERE id=$1`,
        [s.id, u.full_name ?? null, u.biography ?? null, u.category ?? u.category_name ?? null,
         u.external_url ?? r.dom.links[0] ?? null,
         toNum(u.follower_count ?? r.dom.followers), toNum(u.following_count ?? r.dom.following),
         toNum(u.media_count ?? r.dom.posts), u.is_business ?? u.is_business_account ?? null,
         u.business_contact_method ?? null,
         { user: u, bio_links: u.bio_links, email: u.public_email, phone: u.public_phone_number || u.contact_phone_number, posts, header: r.dom.text }],
      );
      for (const [n, p] of posts.entries()) {
        const local = await download(s.id, n, p.img);
        await pool.query(
          `INSERT INTO salon_photos (salon_id, source, url, permalink, attribution, taken_at, local_path)
           VALUES ($1,'instagram',$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
          [s.id, p.url, p.url, p.likes != null ? `likes ${p.likes} · comments ${p.comments}` : null, p.taken_at || null, local],
        );
      }
      console.log(`${new Date().toLocaleTimeString()} ${i + 1}/${rows.length} @${s.instagram_handle} followers=${toNum(u.follower_count ?? r.dom.followers)} posts=${posts.length}`);
    }
  } catch (e) {
    console.warn(`@${s.instagram_handle}: ${e.message}`);
    if (e.stop) {
      console.warn('챌린지/로그인 화면 감지 → 중단. 창에서 확인 후 다시 실행하세요.');
      break;
    }
  }
  await sleep(GAP * (0.6 + Math.random() * 0.8));
}
await ctx.close();
await pool.end();
