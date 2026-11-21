// 행정안전부_생활_미용업 조회서비스 (data.go.kr 15154918) → salons
// 전국 전체를 페이지로 받아 주소가 서울/부산인 곳만 넣는다 (폐업 포함, status로 구분).
// env: DATA_GO_KR_KEY (일반 인증키, Decoding 값)
import { pool, need, sleep } from './db.mjs';

const KEY = need('DATA_GO_KR_KEY');
const BASE = 'https://apis.data.go.kr/1741000/beauty_salons/info';
const ROWS = 1000;

// Field names differ between API versions; take the first one present.
const pick = (o, ...ks) => {
  for (const k of ks) {
    for (const key of [k, k.toLowerCase(), k.toUpperCase()]) {
      if (o[key] !== undefined && o[key] !== null && String(o[key]).trim() !== '') return String(o[key]).trim();
    }
  }
  return null;
};

function findRows(json) {
  if (Array.isArray(json) && json.length && typeof json[0] === 'object') return json;
  if (json && typeof json === 'object') {
    for (const v of Object.values(json)) {
      const r = findRows(v);
      if (r) return r;
    }
  }
  return null;
}

function findTotal(json) {
  const s = JSON.stringify(json).match(/"total_?count"\s*:\s*"?(\d+)/i);
  return s ? Number(s[1]) : null;
}

const toDate = (s) => {
  const d = (s || '').replace(/\D/g, '');
  return d.length >= 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null;
};

function cityOf(addr) {
  if (!addr) return null;
  if (/^서울/.test(addr)) return '서울';
  if (/^부산/.test(addr)) return '부산';
  return null;
}

async function fetchPage(page) {
  const url = `${BASE}?serviceKey=${encodeURIComponent(KEY)}&pageNo=${page}&numOfRows=${ROWS}&returnType=json`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      const json = JSON.parse(text);
      if (/SERVICE_KEY|LIMITED|ERROR/i.test(JSON.stringify(json).slice(0, 300)) && !findRows(json)) {
        throw new Error(text.slice(0, 300));
      }
      return json;
    } catch (e) {
      if (attempt >= 4) throw e;
      console.warn(`page ${page} retry ${attempt}: ${e.message}`);
      await sleep(2000 * attempt);
    }
  }
}

let page = Number(process.env.START_PAGE || 1);
let total = null;
let kept = 0;
for (;;) {
  const json = await fetchPage(page);
  if (page === 1 || total === null) {
    total = findTotal(json);
    const sample = findRows(json)?.[0];
    if (sample) console.log('fields:', Object.keys(sample).join(', '));
  }
  const rows = findRows(json) || [];
  if (!rows.length) break;
  for (const r of rows) {
    const road = pick(r, 'RDNWHLADDR', 'ROAD_NM_ADDR', 'roadNmAddr', 'rdnWhlAddr');
    const jibun = pick(r, 'SITEWHLADDR', 'LOTNO_ADDR', 'lotnoAddr', 'siteWhlAddr');
    const city = cityOf(road) || cityOf(jibun);
    if (!city) continue;
    const addr = road || jibun;
    const mgt = pick(r, 'MGTNO', 'MNG_NO', 'mngNo', 'mgtNo');
    const name = pick(r, 'BPLCNM', 'BPLC_NM', 'bplcNm');
    if (!mgt || !name) continue;
    await pool.query(
      `INSERT INTO salons (mgt_no, name, city, district, road_address, jibun_address, biz_type,
                           license_date, status, tm_x, tm_y, phone, raw_public)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (mgt_no) DO UPDATE SET
         name = EXCLUDED.name, road_address = EXCLUDED.road_address, jibun_address = EXCLUDED.jibun_address,
         biz_type = EXCLUDED.biz_type, status = EXCLUDED.status, raw_public = EXCLUDED.raw_public,
         phone = COALESCE(salons.phone, EXCLUDED.phone), updated_at = now()`,
      [
        mgt,
        name,
        city,
        addr.split(/\s+/)[1] || null,
        road,
        jibun,
        pick(r, 'UPTAENM', 'BZSTAT_SE_NM', 'bzstatSeNm', 'uptaeNm'),
        toDate(pick(r, 'APVPERMYMD', 'LCPMT_YMD', 'lcpmtYmd', 'apvPermYmd')),
        pick(r, 'DTLSTATENM', 'TRDSTATENM', 'DTL_SALS_STTS_NM', 'SALS_STTS_NM', 'dtlSalsSttsNm', 'salsSttsNm', 'trdStateNm'),
        Number(pick(r, 'X', 'CRD_INFO_X', 'crdInfoX')) || null,
        Number(pick(r, 'Y', 'CRD_INFO_Y', 'crdInfoY')) || null,
        pick(r, 'SITETEL', 'TELNO', 'telno', 'siteTel'),
        r,
      ],
    );
    kept++;
  }
  console.log(`page ${page}${total ? `/${Math.ceil(total / ROWS)}` : ''} kept=${kept}`);
  if (rows.length < ROWS) break;
  page++;
  await sleep(150);
}
const { rows } = await pool.query(
  `SELECT city, count(*) FILTER (WHERE status ~ '영업|정상') open, count(*) total FROM salons GROUP BY city`,
);
console.table(rows);
await pool.end();
