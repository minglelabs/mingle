// Address matching between the license record and a map result.
// "서울특별시 강남구 도산대로 123, 2층 (신사동)" → "강남구 도산대로 123"
export function roadKey(addr) {
  if (!addr) return null;
  const a = addr
    .replace(/\(.*?\)/g, ' ')
    .replace(/,.*$/, '')
    .replace(/^(서울특별시|서울시|서울|부산광역시|부산시|부산)\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const m = a.match(/^(\S+구)\s+(.+?(?:로|길))\s*(\d+(?:-\d+)?)/);
  return m ? `${m[1]} ${m[2].replace(/\s+/g, '')} ${m[3]}` : null;
}

export const normName = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[\s()\[\]·.,&'"\-_]/g, '')
    .replace(/(헤어샵|헤어살롱|헤어|미용실|살롱|hair|salon|점)$/g, '');

// Same road address, or names that contain each other within the same district.
export function isMatch(salon, cand) {
  const a = roadKey(salon.road_address);
  const b = roadKey(cand.road);
  if (a && b && a === b) return true;
  const n1 = normName(salon.name);
  const n2 = normName(cand.name);
  const sameGu = salon.district && (cand.road || cand.jibun || '').includes(salon.district);
  return Boolean(sameGu && n1 && n2 && (n1.includes(n2) || n2.includes(n1)));
}

export function instagramHandle(url) {
  const m = (url || '').match(/instagram\.com\/([A-Za-z0-9._]+)/);
  if (!m) return null;
  const h = m[1].replace(/\.$/, '');
  return ['p', 'reel', 'explore', 'stories', 'accounts'].includes(h) ? null : h;
}
