import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.SALON_DB_URL || 'postgresql://localhost/salon_db',
});

export function need(key) {
  const v = process.env[key];
  if (!v) {
    console.error(`missing env ${key}`);
    process.exit(1);
  }
  return v;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const LIMIT = Number(process.env.LIMIT || 0) || null;

// Update columns and stamp enriched_at[source], so reruns skip finished rows.
export async function markEnriched(id, source, patch = {}) {
  const keys = Object.keys(patch);
  const sets = keys.map((k, i) => `${k} = $${i + 3}`).join(', ');
  await pool.query(
    `UPDATE salons SET ${sets ? sets + ',' : ''}
       enriched_at = enriched_at || jsonb_build_object($2::text, now()),
       updated_at = now()
     WHERE id = $1`,
    [id, source, ...keys.map((k) => patch[k])],
  );
}

export async function addPhoto(salonId, p) {
  await pool.query(
    `INSERT INTO salon_photos (salon_id, source, url, permalink, attribution, taken_at)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
    [salonId, p.source, p.url, p.permalink ?? null, p.attribution ?? null, p.taken_at ?? null],
  );
}

// Rows still missing a given enrichment, open salons only.
export async function pending(source, extraWhere = 'TRUE') {
  const { rows } = await pool.query(
    `SELECT * FROM salons
     WHERE NOT (enriched_at ? $1) AND status ~ '영업|정상' AND ${extraWhere}
     ORDER BY id ${LIMIT ? `LIMIT ${LIMIT}` : ''}`,
    [source],
  );
  return rows;
}
