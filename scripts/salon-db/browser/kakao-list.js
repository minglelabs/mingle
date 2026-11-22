// map.kakao.com 탭에서 실행. collector-server에서 검색어를 받아 목록 34페이지까지 넘기며 보낸다.
// 멈추기: window.__salonListStop = true
(() => {
  const API = 'http://127.0.0.1:4777';
  const W = (ms) => new Promise((r) => setTimeout(r, ms + Math.random() * ms * 0.5));
  const $ = (s) => document.querySelector(s);
  const items = () =>
    [...document.querySelectorAll('#info\\.search\\.place\\.list > li')].map((li) => ({
      id: (li.querySelector('.moreview')?.href || '').split('/').pop(),
      name: li.querySelector('.link_name')?.innerText?.trim(),
      cat: li.querySelector('.subcategory')?.innerText?.trim(),
      rating: li.querySelector('.score .num')?.innerText,
      reviews: li.querySelector('.review')?.innerText,
      addr: li.querySelector('.addr p')?.innerText?.trim(),
      tel: li.querySelector('.phone')?.innerText?.trim(),
    }));
  const firstId = () => items()[0]?.id;
  async function waitChange(prev, ms = 6000) {
    const t = Date.now();
    while (Date.now() - t < ms) {
      await W(200);
      if (firstId() && firstId() !== prev) return true;
    }
    return false;
  }
  const post = (body) =>
    fetch(`${API}/places`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

  async function runQuery(query) {
    const prev = firstId();
    const input = $('#search\\.keyword\\.query');
    input.value = query;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    $('#search\\.keyword\\.submit').click();
    await waitChange(prev, 8000);
    await W(800);
    const total = $('#info\\.search\\.place\\.cnt')?.innerText || '0';
    const seen = new Set();
    let batch = items();
    batch.forEach((i) => seen.add(i.id));
    await post({ query, items: batch });
    const more = $('#info\\.search\\.place\\.more');
    if (more && more.offsetParent) {
      const p = firstId();
      more.click();
      await waitChange(p);
    }
    for (let guard = 0; guard < 40; guard++) {
      batch = items().filter((i) => !seen.has(i.id));
      batch.forEach((i) => seen.add(i.id));
      if (batch.length) await post({ query, items: batch });
      const act = $('#info\\.search\\.page a.ACTIVE');
      const nx = act?.nextElementSibling;
      const btn =
        nx && nx.tagName === 'A' && /^\d+$/.test(nx.innerText) && !nx.classList.contains('HIDDEN') && nx.offsetParent
          ? nx
          : $('#info\\.search\\.page\\.next:not(.disabled)');
      if (!btn || !btn.offsetParent) break;
      const p = firstId();
      btn.click();
      if (!(await waitChange(p))) break;
      await W(900);
    }
    await post({ query, items: [], done: true, total, seen: seen.size });
    return seen.size;
  }

  const log = (m) => { window.__salonListLog.push(m); if (window.__salonListLog.length > 50) window.__salonListLog.shift(); };
  window.__salonListStop = false;
  window.__salonListLog = [];
  window.__salonList = (async () => {
    for (;;) {
      if (window.__salonListStop) return 'stopped';
      let query;
      try {
        ({ query } = await fetch(`${API}/next-query`).then((r) => r.json()));
      } catch {
        await W(30000); // 서버 재시작 중
        continue;
      }
      if (!query) return 'all done';
      try {
        const n = await runQuery(query);
        log(`${new Date().toLocaleTimeString()} ${query} ${n}`);
      } catch (e) {
        log(`ERR ${query} ${e.message}`);
        await W(5000);
      }
      await W(2000);
    }
  })();
  return 'started';
})();
