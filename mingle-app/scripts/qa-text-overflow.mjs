// Text overflow scanner for the agent QA (`qa-agent-device.mjs overflow`).
//
// Longer locales (vi, es, de, fr, ru, en…) make labels that fit in Korean, Japanese or Chinese
// spill out of their buttons, tabs and headers. `scanTextOverflow` runs inside the app's WebView
// (it is serialised with Function#toString, so it must stay self-contained: no imports, no
// closures over module scope) and reports every visible text element that:
//
//   clipped         its text is cut off (scrollWidth > clientWidth with overflow hidden / ellipsis)
//   offscreen       its text runs past the left or right edge of the viewport
//   escapes-parent  its text sticks out of its own box, of a parent that clips (overflow hidden),
//                   or of a control's box
//   wrapped         a control label (button, tab, nav link, badge, h1–h3 header) breaks onto 2+ lines
//   overlap         two sibling text elements in the same row overlap each other
//
// Every finding carries `control: true` when it is in a button, tab, link, header or nav bar,
// where the owner treats clipping as a bug (taste T16). Ellipsised names and body text are
// reported with `control: false`; the agent judges those from the screenshot.
// Elements (or ancestors) with `data-qa-allow-truncate` are skipped: use it for names and
// message previews that are meant to ellipsise.

export function scanTextOverflow(doc, win, options = {}) {
  const tolerance = options.tolerance ?? 1;
  const maxFindings = options.maxFindings ?? 80;
  const viewportWidth = win.innerWidth;
  const viewportHeight = win.innerHeight;
  const findings = [];
  const CONTROL_SELECTOR_TAGS = new Set(['BUTTON', 'A', 'H1', 'H2', 'H3', 'NAV', 'LABEL', 'SUMMARY']);
  const CONTROL_ROLES = new Set(['button', 'tab', 'link', 'menuitem', 'switch', 'heading', 'navigation', 'option']);

  const styleOf = (element) => win.getComputedStyle(element);
  const isHidden = (element) => {
    const style = styleOf(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return true;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) return true; // sr-only and collapsed nodes
    if (rect.bottom < 0 || rect.top > viewportHeight) return true; // scrolled out of view
    return false;
  };
  const ownText = (element) => {
    let text = '';
    for (const node of element.childNodes || []) {
      if (node.nodeType === 3) text += node.textContent || '';
    }
    return text.replace(/\s+/g, ' ').trim();
  };
  const closest = (element, test) => {
    for (let current = element; current && current.nodeType === 1; current = current.parentElement) {
      if (test(current)) return current;
    }
    return null;
  };
  const allowsTruncate = (element) => Boolean(closest(element, (node) => node.hasAttribute && node.hasAttribute('data-qa-allow-truncate')));
  const controlOf = (element) => closest(element, (node) => CONTROL_SELECTOR_TAGS.has(node.tagName)
    || CONTROL_ROLES.has((node.getAttribute && node.getAttribute('role')) || '')
    || node.tagName === 'HEADER');
  const describe = (element) => {
    const parts = [element.tagName.toLowerCase()];
    const testId = element.getAttribute && (element.getAttribute('data-testid') || element.getAttribute('aria-label'));
    if (testId) parts.push(`[${testId.slice(0, 40)}]`);
    const control = controlOf(element);
    if (control && control !== element) {
      const controlId = control.getAttribute && (control.getAttribute('data-testid') || control.getAttribute('aria-label'));
      parts.push(`in ${control.tagName.toLowerCase()}${controlId ? `[${controlId.slice(0, 40)}]` : ''}`);
    }
    return parts.join(' ');
  };
  // Rendered lines of the element's own text: distinct line boxes from a Range when the engine
  // has one, otherwise the content height (minus padding) over the line height.
  const countLines = (element, style) => {
    if (typeof doc.createRange === 'function') {
      const tops = [];
      for (const node of element.childNodes || []) {
        if (node.nodeType !== 3 || !(node.textContent || '').trim()) continue;
        const range = doc.createRange();
        range.selectNodeContents(node);
        for (const box of range.getClientRects()) {
          if (box.width < 1) continue;
          if (!tops.some((top) => Math.abs(top - box.top) < 3)) tops.push(box.top);
        }
      }
      return tops.length;
    }
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.25 || 16;
    const content = element.getBoundingClientRect().height - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0);
    return Math.max(1, Math.round(content / lineHeight));
  };
  // Where the element's own text is actually painted (it can extend past the element's box).
  const textBounds = (element) => {
    const box = element.getBoundingClientRect();
    if (typeof doc.createRange !== 'function') return box;
    let left = Infinity;
    let right = -Infinity;
    for (const node of element.childNodes || []) {
      if (node.nodeType !== 3 || !(node.textContent || '').trim()) continue;
      const range = doc.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      if (rect.width < 1) continue;
      left = Math.min(left, rect.left);
      right = Math.max(right, rect.right);
    }
    return Number.isFinite(left) ? { left, right } : box;
  };
  const round = (rect) => ({ x: Math.round(rect.left), y: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) });
  const push = (kind, element, extra = {}) => {
    if (findings.length >= maxFindings) return;
    const control = Boolean(controlOf(element));
    findings.push({ kind, control, text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80), where: describe(element), rect: round(element.getBoundingClientRect()), ...extra });
  };

  const textElements = [];
  const walk = (element) => {
    if (!element || element.nodeType !== 1) return;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'svg'].includes(element.tagName)) return;
    if (isHidden(element)) return;
    if (ownText(element) && /\p{L}/u.test(ownText(element))) textElements.push(element);
    for (const child of element.children || []) walk(child);
  };
  walk(doc.body);

  for (const element of textElements) {
    if (allowsTruncate(element)) continue;
    const rect = element.getBoundingClientRect();
    const style = styleOf(element);

    // clipped: the element itself cuts its text.
    const clipsX = style.overflow === 'hidden' || style.overflowX === 'hidden' || style.textOverflow === 'ellipsis';
    if (clipsX && element.scrollWidth > element.clientWidth + tolerance) {
      push('clipped', element, { hiddenPx: element.scrollWidth - element.clientWidth });
      continue;
    }
    if (style.webkitLineClamp && style.webkitLineClamp !== 'none' && element.scrollHeight > element.clientHeight + tolerance) {
      push('clipped', element, { hiddenPx: element.scrollHeight - element.clientHeight, lineClamp: true });
      continue;
    }

    // offscreen: the painted text runs past the viewport edge.
    const painted = textBounds(element);
    const extentLeft = Math.min(rect.left, painted.left);
    const extentRight = Math.max(rect.right, painted.right);
    if (extentRight > viewportWidth + tolerance || extentLeft < -tolerance) {
      push('offscreen', element, { pastPx: Math.round(Math.max(extentRight - viewportWidth, -extentLeft)) });
      continue;
    }

    // spills: the text is wider than the element's own box (nothing clips it, so it paints outside).
    const spill = Math.max(painted.right - rect.right, rect.left - painted.left);
    if (spill > tolerance + 1) {
      push('escapes-parent', element, { pastPx: Math.round(spill), parent: 'own box' });
      continue;
    }

    // escapes-parent: sticks out of a clipping ancestor or of its control's box.
    const control = controlOf(element);
    const box = closest(element.parentElement, (node) => {
      if (node === doc.body) return false;
      const nodeStyle = styleOf(node);
      return node === control || nodeStyle.overflow === 'hidden' || nodeStyle.overflowX === 'hidden';
    });
    if (box && box !== element) {
      const boxRect = box.getBoundingClientRect();
      const past = Math.max(extentRight - boxRect.right, boxRect.left - extentLeft);
      if (past > tolerance + 1) {
        push('escapes-parent', element, { pastPx: Math.round(past), parent: describe(box) });
        continue;
      }
    }

    // wrapped: a control label on two or more lines.
    if (control && style.whiteSpace !== 'pre-line' && style.whiteSpace !== 'pre-wrap') {
      const lines = countLines(element, style);
      if (lines >= 2) push('wrapped', element, { lines });
    }
  }

  // overlap: sibling text elements in the same row that overlap.
  for (let i = 0; i < textElements.length; i += 1) {
    const a = textElements[i];
    const ra = a.getBoundingClientRect();
    for (let j = i + 1; j < textElements.length; j += 1) {
      const b = textElements[j];
      if (a.contains && (a.contains(b) || b.contains(a))) continue;
      if (a.parentElement !== b.parentElement && a.parentElement?.parentElement !== b.parentElement?.parentElement) continue;
      const rb = b.getBoundingClientRect();
      const overlapX = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const overlapY = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (overlapX > 2 && overlapY > 2) push('overlap', a, { with: describe(b), withText: (b.textContent || '').trim().slice(0, 40) });
    }
  }

  return {
    url: String(win.location && win.location.pathname),
    locale: String(doc.documentElement && doc.documentElement.lang),
    viewport: { width: viewportWidth, height: viewportHeight },
    scanned: textElements.length,
    controlFindings: findings.filter((finding) => finding.control).length,
    findings,
  };
}

/** The WebView expression `qa-agent-device.mjs overflow` evaluates. */
export function buildOverflowExpression(options = {}) {
  return `(${scanTextOverflow.toString()})(document, window, ${JSON.stringify(options)})`;
}

/** Swaps the locale segment of an app path: /ko/feed → /vi/feed. */
export function withLocalePath(pathname, locale) {
  const parts = pathname.split('/');
  if (parts.length > 1 && /^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(parts[1])) {
    parts[1] = locale;
    return parts.join('/');
  }
  return `/${locale}${pathname === '/' ? '' : pathname}`;
}
