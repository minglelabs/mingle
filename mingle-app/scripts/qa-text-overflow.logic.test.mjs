import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOverflowExpression, scanTextOverflow, withLocalePath } from './qa-text-overflow.mjs';

// A tiny fake DOM: just the properties the scanner reads.
function el(tagName, { rect, style = {}, text = '', attrs = {}, scrollWidth, clientWidth, children = [] } = {}) {
  const element = {
    nodeType: 1,
    tagName,
    parentElement: null,
    children,
    childNodes: [...(text ? [{ nodeType: 3, textContent: text }] : []), ...children],
    style: { display: 'block', visibility: 'visible', opacity: '1', overflow: 'visible', overflowX: 'visible', textOverflow: 'clip', whiteSpace: 'normal', lineHeight: '20px', fontSize: '16px', ...style },
    scrollWidth: scrollWidth ?? rect.width,
    clientWidth: clientWidth ?? rect.width,
    scrollHeight: rect.height,
    clientHeight: rect.height,
    getBoundingClientRect: () => ({ left: rect.x, top: rect.y, width: rect.width, height: rect.height, right: rect.x + rect.width, bottom: rect.y + rect.height }),
    getAttribute: (name) => attrs[name] ?? null,
    hasAttribute: (name) => name in attrs,
    contains(other) {
      for (let current = other; current; current = current.parentElement) if (current === element) return true;
      return false;
    },
  };
  Object.defineProperty(element, 'textContent', {
    get: () => text + children.map((child) => child.textContent).join(''),
  });
  for (const child of children) child.parentElement = element;
  return element;
}

function scan(body) {
  const doc = { body, documentElement: { lang: 'vi' } };
  const win = { innerWidth: 390, innerHeight: 844, location: { pathname: '/vi/feed' }, getComputedStyle: (node) => node.style };
  return scanTextOverflow(doc, win);
}

const R = (x, y, width, height) => ({ x, y, width, height });

test('flags an ellipsised button label as a clipped control', () => {
  const label = el('SPAN', { rect: R(10, 10, 60, 20), text: 'Theo dõi lại', style: { overflow: 'hidden', textOverflow: 'ellipsis' }, scrollWidth: 95, clientWidth: 60 });
  const button = el('BUTTON', { rect: R(8, 8, 64, 24), children: [label] });
  const body = el('BODY', { rect: R(0, 0, 390, 844), children: [button] });
  const result = scan(body);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].kind, 'clipped');
  assert.equal(result.findings[0].control, true);
  assert.equal(result.findings[0].hiddenPx, 35);
});

test('flags text past the right edge of the viewport', () => {
  const title = el('H1', { rect: R(300, 10, 140, 24), text: 'Notificaciones' });
  const result = scan(el('BODY', { rect: R(0, 0, 390, 844), children: [title] }));
  assert.equal(result.findings[0].kind, 'offscreen');
  assert.equal(result.findings[0].pastPx, 50);
});

test('flags a label that sticks out of its button', () => {
  const label = el('SPAN', { rect: R(10, 10, 90, 20), text: 'Suivre en retour' });
  const button = el('BUTTON', { rect: R(8, 8, 70, 24), children: [label] });
  const result = scan(el('BODY', { rect: R(0, 0, 390, 844), children: [button] }));
  assert.equal(result.findings[0].kind, 'escapes-parent');
  assert.equal(result.findings[0].pastPx, 22);
});

test('flags a tab label that wraps onto two lines', () => {
  const tab = el('BUTTON', { rect: R(0, 0, 80, 44), text: 'Người theo dõi', attrs: { role: 'tab' } });
  const result = scan(el('BODY', { rect: R(0, 0, 390, 844), children: [tab] }));
  assert.equal(result.findings[0].kind, 'wrapped');
  assert.equal(result.findings[0].lines, 2);
});

test('flags overlapping sibling labels', () => {
  const a = el('SPAN', { rect: R(0, 0, 120, 20), text: 'Abonnements' });
  const b = el('SPAN', { rect: R(100, 0, 80, 20), text: 'Abonnés' });
  const row = el('DIV', { rect: R(0, 0, 390, 20), children: [a, b] });
  const result = scan(el('BODY', { rect: R(0, 0, 390, 844), children: [row] }));
  assert.equal(result.findings.filter((finding) => finding.kind === 'overlap').length, 1);
});

test('skips allowed truncation, hidden and sr-only text, and fitting labels', () => {
  const name = el('SPAN', { rect: R(0, 0, 60, 20), text: 'A very long display name', style: { overflow: 'hidden', textOverflow: 'ellipsis' }, scrollWidth: 200, clientWidth: 60, attrs: { 'data-qa-allow-truncate': '' } });
  const hidden = el('SPAN', { rect: R(0, 30, 600, 20), text: 'Hidden', style: { display: 'none' } });
  const srOnly = el('SPAN', { rect: R(0, 60, 1, 1), text: 'Screen reader only' });
  const ok = el('BUTTON', { rect: R(0, 90, 120, 44), text: 'Follow', style: { paddingTop: '12px', paddingBottom: '12px' } });
  const result = scan(el('BODY', { rect: R(0, 0, 390, 844), children: [name, hidden, srOnly, ok] }));
  assert.deepEqual(result.findings, []);
  assert.equal(result.scanned, 2);
});

test('the WebView expression is self-contained', () => {
  const expression = buildOverflowExpression({ maxFindings: 5 });
  assert.match(expression, /^\(function scanTextOverflow/);
  assert.match(expression, /\{"maxFindings":5\}\)$/);
});

test('swaps the locale segment of an app path', () => {
  assert.equal(withLocalePath('/ko/feed', 'vi'), '/vi/feed');
  assert.equal(withLocalePath('/zh-TW/mypage/follows', 'de'), '/de/mypage/follows');
  assert.equal(withLocalePath('/', 'es'), '/es');
});
