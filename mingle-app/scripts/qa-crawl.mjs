// In-WebView helpers for `qa-agent-device.mjs crawl`: find every tappable control on a screen,
// tap it, and tell whether a new state (sheet, menu, dialog, tab, screen) opened, so the overflow
// scanner can run on every layer of the UI, not only on screens reachable by URL.
//
// Like scanTextOverflow, each helper is serialised with Function#toString and must stay
// self-contained (no imports, no closures over module scope).

/**
 * Visible tappable controls, each with a CSS path that is stable across locales (the DOM shape
 * does not change with the language) and the label used to skip risky ones.
 */
export function collectTapTargets(doc, win, options = {}) {
  const max = options.max ?? 60;
  const width = win.innerWidth;
  const height = win.innerHeight;
  const selector = 'button, [role="button"], [role="tab"], [role="menuitem"], [role="option"], a[href], summary, [data-testid][onclick]';
  const pathOf = (element) => {
    const parts = [];
    for (let node = element; node && node !== doc.body; node = node.parentElement) {
      const parent = node.parentElement;
      if (!parent) break;
      const index = Array.prototype.indexOf.call(parent.children, node) + 1;
      parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${index})`);
    }
    return `body > ${parts.join(' > ')}`;
  };
  // The top layer: the fixed panel or dialog under the middle of the screen (or the page).
  const isLayer = (node) => {
    if (!node || node === doc.body) return false;
    const role = node.getAttribute && node.getAttribute('role');
    return role === 'dialog' || win.getComputedStyle(node).position === 'fixed';
  };
  let topLayer = doc.elementFromPoint(width / 2, height / 2);
  while (topLayer && topLayer !== doc.body && !isLayer(topLayer)) topLayer = topLayer.parentElement;
  if (!topLayer) topLayer = doc.body;
  const visible = (element) => {
    const style = win.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0 || style.pointerEvents === 'none') return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return false;
    if (rect.right <= 0 || rect.left >= width) return false;
    // Below or above the fold: reachable by scrolling when it is in the top layer.
    if (rect.bottom <= 0 || rect.top >= height) return topLayer.contains(element);
    // Covered by another layer (a sheet over the page): only the top layer is tappable.
    const x = Math.min(width - 1, Math.max(0, rect.left + rect.width / 2));
    const y = Math.min(height - 1, Math.max(0, rect.top + rect.height / 2));
    const hit = doc.elementFromPoint(x, y);
    return Boolean(hit && (hit === element || element.contains(hit) || hit.contains(element)));
  };
  const targets = [];
  const seen = new Set();
  for (const element of doc.querySelectorAll(selector)) {
    if (targets.length >= max) break;
    if (element.disabled || element.getAttribute('aria-disabled') === 'true') continue;
    if (element.closest('nextjs-portal')) continue;
    if (!visible(element)) continue;
    // Nested controls: keep the outermost one.
    if (element.parentElement && element.parentElement.closest(selector) && seen.has(pathOf(element.parentElement.closest(selector)))) continue;
    const path = pathOf(element);
    if (seen.has(path)) continue;
    seen.add(path);
    const href = element.getAttribute('href') || '';
    targets.push({
      path,
      label: [element.getAttribute('aria-label'), element.getAttribute('title'), (element.textContent || '').replace(/\s+/g, ' ').trim()].filter(Boolean).join(' | ').slice(0, 80),
      testId: element.getAttribute('data-testid') || '',
      role: element.getAttribute('role') || element.tagName.toLowerCase(),
      href,
      external: Boolean(href) && (/^(mailto:|tel:|sms:)/.test(href) || (/^https?:/.test(href) && !href.startsWith(win.location.origin)) || element.getAttribute('target') === '_blank'),
      hasFileInput: Boolean(element.querySelector('input[type="file"]')) || (element.tagName === 'LABEL' && Boolean(element.control && element.control.type === 'file')),
    });
  }
  return targets;
}

/** A fingerprint of what is on screen: changes when a sheet, menu, tab or screen opens. */
export function screenFingerprint(doc, win) {
  const text = (doc.body && doc.body.innerText || '').replace(/\d+/g, '#').replace(/\s+/g, ' ').slice(0, 6000);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  const layers = doc.querySelectorAll('[role="dialog"], [aria-modal="true"], [role="menu"], [role="listbox"]').length;
  return { path: win.location.pathname + win.location.search, historyLength: win.history.length, layers, hash };
}

/** Taps the control at `path` (a CSS path from collectTapTargets). */
export function tapTarget(doc, path) {
  // Portals and toasts come and go at the top of <body>, which shifts the first steps of the path.
  // When the exact path misses, relax the position of the top one, two, then three steps and take
  // the match only if it is unique.
  let element = doc.querySelector(path);
  const parts = path.split(' > ');
  for (let relax = 1; !element && relax <= 3 && relax < parts.length; relax += 1) {
    const loose = parts.map((part, index) => (index >= 1 && index <= relax ? part.replace(/:nth-child\(\d+\)/, '') : part)).join(' > ');
    const matches = doc.querySelectorAll(loose);
    if (matches.length === 1) element = matches[0];
  }
  if (!element) return false;
  element.scrollIntoView({ block: 'center', inline: 'nearest' });
  element.click();
  return true;
}

// Controls the crawler never taps: they change data, leave the app or hand off to native UI
// (permission prompts, the share sheet, purchases, Picture in Picture, the QR camera, the audio
// route) that the WebView scan cannot see or undo.
// Matched against the label in the discovery locale (Korean) plus test ids and aria labels.
export const RISKY_TARGET = new RegExp([
  '로그아웃', '탈퇴', '삭제', '지우기', '차단', '해제', '신고하기', '제출', '(?<!초대권 )보내기', '전송', '게시하기', '게시(?!물)', '올리기', '저장', '완료', '확인', '동의', '적용',
  '팔로우', '팔로잉', '맞팔', '좋아요', '구매', '결제', '충전', '구독', '복원', '카메라', '사진', '앨범', '갤러리', '연락처', '동기화',
  '마이크', '말하기', '말해', '녹음', '통화', '나가기', '숨기기', '보관', '공유', '복사', '다운로드', '업로드', '재생', '알림 허용', '권한',
  'logout', 'log out', 'sign out', 'delete', 'remove', 'block', 'submit', 'send', 'save', 'purchase', 'buy', 'camera', 'photo',
  '정보 등록(?!해)', '등록하기', '추가하기', '새 대화방', '만들기', '작은 창', 'QR', '스캔', '스피커', 'picture', 'speaker', 'scan', '^start\\b', '^stop\\b', '시작하기',
  'microphone', 'record', 'share', 'copy', 'download', 'upload', 'follow',
].join('|'), 'i');

// Screens whose names contain a risky word but only list things (blocked users, archive, trash).
const SAFE_TARGET = /차단한 사용자|보관함|휴지통|숨긴 글|blocked users|archive|trash/i;

export function isRiskyTarget(target) {
  if (target.external || target.hasFileInput) return true;
  if (SAFE_TARGET.test(target.label)) return false;
  if (target.role === 'tab') return false; // switching tabs never changes data
  if (target.role === 'switch' || target.role === 'checkbox' || target.role === 'radio') return true;
  return RISKY_TARGET.test(`${target.label} ${target.testId}`);
}

export const buildCollectExpression = (options = {}) => `(${collectTapTargets.toString()})(document, window, ${JSON.stringify(options)})`;
export const buildFingerprintExpression = () => `(${screenFingerprint.toString()})(document, window)`;
export const buildTapExpression = (path) => `(${tapTarget.toString()})(document, ${JSON.stringify(path)})`;

/** True when tapping opened something new (not the same screen with the same text). */
export function openedNewState(before, after) {
  if (!before || !after) return false;
  return before.path !== after.path || before.layers !== after.layers || before.hash !== after.hash;
}
