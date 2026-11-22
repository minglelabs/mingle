// 병원 웹사이트 첫 화면(+ 필요하면 연락처 페이지 1개)에서 연락 채널을 찾는다.
//   node clinic-websites.mjs        (LIMIT=500, 동시 3곳, 사이트 robots.txt 가 막으면 건너뜀)
// 찾는 것: 인스타, 카카오톡 채널, 이메일, 전화, 유튜브·블로그·라인·위챗·왓츠앱, 외국어 페이지(영/중/일)
import { pool, sleep } from './db.mjs';
import { instagramHandle } from './match.mjs';

const LIMIT = Number(process.env.LIMIT || 500);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

async function get(url, ms = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'ko-KR,ko;q=0.9' }, redirect: 'follow', signal: ctl.signal });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !/html|text/.test(type)) return { status: r.status, url: r.url, html: '' };
    return { status: r.status, url: r.url, html: (await r.text()).slice(0, 2_000_000) };
  } finally {
    clearTimeout(t);
  }
}

// robots.txt 의 "User-agent: *" 묶음이 루트 경로를 막는지
async function robotsBlocked(origin) {
  try {
    const { html } = await get(`${origin}/robots.txt`, 8000);
    let star = false;
    for (const line of html.split(/\r?\n/)) {
      const [k, ...v] = line.split(':');
      const key = k.trim().toLowerCase();
      const val = v.join(':').trim();
      if (key === 'user-agent') star = val === '*';
      else if (star && key === 'disallow' && val === '/') return true;
    }
  } catch {}
  return false;
}

const uniq = (a) => [...new Set(a.filter(Boolean))];
function extract(html, base) {
  const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => {
    try {
      return new URL(m[1].replace(/&amp;/g, '&'), base).href;
    } catch {
      return null;
    }
  });
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const all = uniq([...hrefs, ...(html.match(/https?:\/\/[^\s"'<>\\)]+/g) || [])]);
  const pick = (re) => uniq(all.filter((u) => u && re.test(u)));
  const emails = uniq((text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).concat(
    hrefs.filter((h) => h?.startsWith('mailto:')).map((h) => h.slice(7).split('?')[0]),
  )).filter((e) => !/\.(png|jpe?g|gif|webp|svg)$/i.test(e) && !/example|sentry|wixpress|domain\.com/i.test(e));
  const phones = uniq((text.match(/0\d{1,2}[-.\s)]\d{3,4}[-.\s]\d{4}|1[5-8]\d{2}-\d{4}/g) || []).map((p) => p.replace(/[.\s)]/g, '-')));
  const langs = [];
  if (/hreflang=["']?en|\/en\/|lang=en|>\s*(English|ENG|EN)\s*</i.test(html)) langs.push('en');
  if (/hreflang=["']?zh|\/(cn|zh)\/|lang=(zh|cn)|>\s*(中文|中国语|CHN|CN)\s*</i.test(html)) langs.push('zh');
  if (/hreflang=["']?ja|\/(jp|ja)\/|lang=(ja|jp)|>\s*(日本語|JPN|JP)\s*</i.test(html)) langs.push('ja');
  return {
    instagram: uniq(pick(/instagram\.com\//).map(instagramHandle)),
    kakao_channel: pick(/pf\.kakao\.com\/_|open\.kakao\.com\//),
    youtube: pick(/youtube\.com\/(@|c\/|channel\/|user\/)/),
    blog: pick(/blog\.naver\.com\/[^/?#]+/),
    line: pick(/line\.me\//),
    wechat: /wechat|微信/i.test(html) ? ['mentioned'] : [],
    whatsapp: pick(/wa\.me\/|whatsapp\.com\//),
    booking: pick(/booking\.naver\.com|map\.naver\.com|talk\.naver\.com/),
    contact_pages: pick(/contact|location|map|오시는|찾아오|상담|counsel/i).filter((u) => u.startsWith(base.split('/').slice(0, 3).join('/'))),
    emails,
    phones,
    langs,
  };
}

const { rows } = await pool.query(
  `SELECT id, name, website FROM salons
   WHERE kind <> 'hair' AND website IS NOT NULL AND NOT (enriched_at ? 'website')
   ORDER BY blog_review_count DESC NULLS LAST, id LIMIT $1`,
  [LIMIT],
);
console.log(`websites: ${rows.length}`);
let done = 0;
async function worker(queue) {
  for (const s of queue) {
    let info = { error: null };
    try {
      const url = /^https?:/.test(s.website) ? s.website : `http://${s.website}`;
      const origin = new URL(url).origin;
      if (await robotsBlocked(origin)) info = { robots: 'blocked' };
      else {
        const home = await get(url);
        info = { status: home.status, final: home.url, ...extract(home.html, home.url) };
        // 첫 화면에 연락처가 없으면 연락처/오시는길 페이지 하나만 더 본다
        if (!info.emails.length && !info.kakao_channel.length && info.contact_pages[0]) {
          await sleep(1000);
          const c = await get(info.contact_pages[0]);
          const more = extract(c.html, c.url);
          for (const k of ['instagram', 'kakao_channel', 'emails', 'phones', 'line', 'whatsapp', 'langs'])
            info[k] = uniq([...(info[k] || []), ...more[k]]);
        }
      }
    } catch (e) {
      info.error = e.name === 'AbortError' ? 'timeout' : e.message.slice(0, 200);
    }
    await pool.query(
      `UPDATE salons SET website_links=$2,
         instagram_handle=COALESCE(instagram_handle,$3), email=COALESCE(email,$4), kakao_channel=COALESCE(kakao_channel,$5),
         foreign_langs=$6, enriched_at = enriched_at || jsonb_build_object('website', now()), updated_at=now()
       WHERE id=$1`,
      [s.id, info, info.instagram?.[0] || null, info.emails?.[0] || null, info.kakao_channel?.[0] || null,
       info.langs?.length ? info.langs : null],
    );
    if (++done % 25 === 0) console.log(`${new Date().toLocaleTimeString()} ${done}/${rows.length}`);
    await sleep(500);
  }
}
const lanes = [[], [], []];
rows.forEach((r, i) => lanes[i % 3].push(r));
await Promise.all(lanes.map(worker));
console.log(`done ${done}`);
await pool.end();
