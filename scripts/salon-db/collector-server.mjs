// 브라우저(카카오맵 탭)에서 도는 수집 스크립트가 결과를 보내는 로컬 서버.
//   node collector-server.mjs      → http://127.0.0.1:4777
// browser/kakao-list.js, browser/kakao-details.js 가 이 서버에서 할 일을 받아 가고 결과를 POST 한다.
import http from 'node:http';
import { pool } from './db.mjs';

const PORT = Number(process.env.COLLECTOR_PORT || 4777);
const leases = new Map(); // place id → lease expiry (ms)

const cityOf = (a) => (/^서울/.test(a || '') ? '서울' : /^부산/.test(a || '') ? '부산' : null);
const guOf = (a) => (a || '').split(/\s+/)[1] || null;
const num = (s) => {
  const n = Number(String(s ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && String(s ?? '').match(/\d/) ? n : null;
};

// 검색 결과 한 건의 종류. 병원 검색이면 카테고리로 성형외과/피부과(미용의원 포함)를 가른다.
function kindOf(query, it) {
  const cat = it.cat || '';
  if (!/성형외과|피부과/.test(query || '')) return /미용실|헤어/.test(cat) ? 'hair' : null;
  if (/성형외과/.test(cat)) return 'plastic';
  if (/피부과/.test(cat)) return 'derm';
  // 미용의원: 카테고리는 미용·피부관리·두피 등인데 이름이 의원/병원/클리닉
  if (/미용|피부관리|두피|탈모|비만/.test(cat) && /의원|병원|클리닉|메디/.test(it.name || '')) return 'derm';
  return null;
}

const routes = {
  async 'GET /stats'() {
    const { rows } = await pool.query(`
      SELECT (SELECT count(*) FROM crawl_queries WHERE status='done') queries_done,
             (SELECT count(*) FROM crawl_queries) queries_total,
             count(*) FILTER (WHERE kakao_place_id IS NOT NULL) places,
             count(*) FILTER (WHERE raw_kakao IS NOT NULL) details,
             count(*) FILTER (WHERE instagram_handle IS NOT NULL) instagram,
             count(*) FILTER (WHERE kind<>'hair') clinics,
             count(*) FILTER (WHERE kind<>'hair' AND raw_kakao IS NOT NULL) clinic_details
      FROM salons`);
    return rows[0];
  },

  async 'GET /next-query'() {
    const { rows } = await pool.query(`
      UPDATE crawl_queries SET status='running', started_at=now()
      WHERE query = (SELECT query FROM crawl_queries
                     WHERE status='todo' OR (status='running' AND started_at < now() - interval '15 minutes')
                     ORDER BY query LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING query`);
    return { query: rows[0]?.query ?? null };
  },

  async 'POST /places'(body) {
    let kept = 0;
    for (const it of body.items || []) {
      const city = cityOf(it.addr);
      const kind = kindOf(body.query, it);
      if (!it.id || !city || !kind) continue;
      await pool.query(
        `INSERT INTO salons (kakao_place_id, kakao_url, name, category, city, district, road_address, phone,
                             kakao_rating, blog_review_count, status, kind)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'영업/정상',$11)
         ON CONFLICT (kakao_place_id) DO UPDATE SET
           name=EXCLUDED.name, category=EXCLUDED.category, road_address=EXCLUDED.road_address,
           phone=COALESCE(EXCLUDED.phone, salons.phone), kakao_rating=EXCLUDED.kakao_rating,
           blog_review_count=COALESCE(EXCLUDED.blog_review_count, salons.blog_review_count), updated_at=now()`,
        [it.id, `https://place.map.kakao.com/${it.id}`, it.name, it.cat, city, guOf(it.addr), it.addr,
         it.tel || null, num(it.rating), num(it.reviews), kind],
      );
      kept++;
    }
    if (body.query && body.done) {
      await pool.query(
        `UPDATE crawl_queries SET status='done', total=$2, collected=$3, finished_at=now() WHERE query=$1`,
        [body.query, num(body.total), body.seen ?? null],
      );
    }
    return { kept };
  },

  async 'GET /next-details'(_, url) {
    const n = Math.min(Number(url.searchParams.get('n') || 10), 50);
    const now = Date.now();
    const { rows } = await pool.query(
      `SELECT kakao_place_id FROM salons
       WHERE kakao_place_id IS NOT NULL AND raw_kakao IS NULL
       ORDER BY (kind <> 'hair') DESC, blog_review_count DESC NULLS LAST, id LIMIT $1`,
      [n + leases.size],
    );
    const ids = rows.map((r) => r.kakao_place_id).filter((id) => !(leases.get(id) > now)).slice(0, n);
    ids.forEach((id) => leases.set(id, now + 10 * 60_000));
    return { ids };
  },

  async 'POST /details'(body) {
    const { id, data: d } = body;
    leases.delete(id);
    const { rows } = await pool.query('SELECT id FROM salons WHERE kakao_place_id=$1', [id]);
    if (!rows[0]) return { ok: false };
    const salonId = rows[0].id;
    if (!d) {
      await pool.query(`UPDATE salons SET raw_kakao='{"error":true}'::jsonb WHERE id=$1`, [salonId]);
      return { ok: true };
    }
    const s = d.summary || {};
    const homes = [...new Set(JSON.stringify([s.homepages, s.related_links]).match(/https?:[^"\\]+/g) || [])];
    const ig = homes.map((h) => (h.match(/instagram\.com\/([A-Za-z0-9._]+)/) || [])[1]).find(
      (h) => h && !['p', 'reel', 'explore', 'stories', 'accounts'].includes(h),
    );
    const website = (s.homepages || []).find((h) => typeof h === 'string' && !/instagram\.com/.test(h)) || null;
    const phones = (s.phone_numbers || []).map((p) => p.tel).filter(Boolean);
    await pool.query(
      `UPDATE salons SET
         name=COALESCE($2,name), category=COALESCE($3,category), road_address=COALESCE($4,road_address),
         jibun_address=COALESCE($5,jibun_address), lat=$6, lng=$7,
         phone=COALESCE($8,phone), instagram_handle=COALESCE($9,instagram_handle), website=COALESCE($10,website),
         kakao_rating=COALESCE($11,kakao_rating), kakao_review_count=$12,
         blog_review_count=COALESCE($13,blog_review_count), photo_count=$14, tags=$15, status=$16, raw_kakao=$17,
         enriched_at = enriched_at || jsonb_build_object('kakao_detail', now()), updated_at=now()
       WHERE id=$1`,
      [salonId, s.name, s.category?.name, s.address?.road || null, s.address?.jibun || null,
       s.point?.lat ?? null, s.point?.lon ?? null, phones.join(', ') || null, ig || null, website,
       d.kakaomap_review?.average_score ?? null, d.kakaomap_review?.review_count ?? null,
       d.blog_review?.review_count ?? null, d.photos?.counts?.total ?? null, d.place_add_info?.tags || null,
       s.status === 'Y' ? '영업/정상' : `kakao:${s.status ?? '?'}`, d],
    );
    for (const p of (d.photos?.photos || []).slice(0, 20)) {
      if (!p.url) continue;
      await pool.query(
        `INSERT INTO salon_photos (salon_id, source, url, permalink, attribution, taken_at)
         VALUES ($1,'kakao',$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [salonId, p.url.replace(/^http:/, 'https:'), `https://place.map.kakao.com/${id}`, p.title || p.type || null,
         p.registered_at ? `${p.registered_at}+09` : null],
      );
    }
    return { ok: true, instagram: ig || null };
  },
};

http
  .createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') return res.end();
    const url = new URL(req.url, 'http://x');
    const fn = routes[`${req.method} ${url.pathname}`];
    if (!fn) {
      res.statusCode = 404;
      return res.end('{}');
    }
    try {
      let body = '';
      for await (const c of req) body += c;
      const out = await fn(body ? JSON.parse(body) : {}, url);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(out));
    } catch (e) {
      console.error(e);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: e.message }));
    }
  })
  .listen(PORT, '127.0.0.1', () => console.log(`collector on http://127.0.0.1:${PORT}`));
