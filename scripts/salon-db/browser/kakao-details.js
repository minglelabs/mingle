// place.map.kakao.com 탭에서 실행. 리뷰 많은 순으로 상세(panel3)를 받아 collector-server에 보낸다.
// 멈추기: window.__salonDetailStop = true
(() => {
  const API = 'http://127.0.0.1:4777';
  const W = (ms) => new Promise((r) => setTimeout(r, ms + Math.random() * ms * 0.6));
  const keep = (d) => ({
    summary: d.summary,
    photos: d.photos && { counts: d.photos.counts, photos: (d.photos.photos || []).slice(0, 20) },
    kakaomap_review: d.kakaomap_review && {
      review_count: d.kakaomap_review.score_set?.review_count ?? d.kakaomap_review.review_count,
      average_score: d.kakaomap_review.score_set?.average_score ?? d.kakaomap_review.average_score,
      photo_count: d.kakaomap_review.score_set?.photo_count,
    },
    blog_review: d.blog_review && { review_count: d.blog_review.review_count },
    place_add_info: d.place_add_info && { tags: d.place_add_info.tags, facilities: d.place_add_info.facilities },
    menu: (d.menu?.menus?.items || []).map((m) => ({ name: m.name, price: m.price, price_text: m.price_text })),
    open_hours: d.open_hours,
    talk_channel: d.talk_channel,
  });

  window.__salonDetailStop = false;
  window.__salonDetailCount = 0;
  window.__salonDetailErrors = [];
  window.__salonDetail = (async () => {
    let fails = 0;
    for (;;) {
      if (window.__salonDetailStop) return 'stopped';
      let ids = [];
      try {
        ({ ids } = await fetch(`${API}/next-details?n=10`).then((r) => r.json()));
      } catch {
        await W(30000); // 서버 재시작 중
        continue;
      }
      if (!ids.length) {
        await W(30000); // 목록 수집이 더 채워질 때까지 대기
        continue;
      }
      for (const id of ids) {
        if (window.__salonDetailStop) return 'stopped';
        try {
          let data = null;
          const res = await fetch(`/places/panel3/${id}`, { headers: { pf: 'web' } });
          if (res.ok) {
            data = keep(await res.json());
            fails = 0;
          } else {
            window.__salonDetailErrors.push(`${id} ${res.status}`);
            if (++fails >= 5) {
              await W(10 * 60_000); // 연속 실패 → 10분 쉼
              fails = 0;
              continue;
            }
            if (res.status !== 404) continue;
          }
          await fetch(`${API}/details`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id, data }),
          });
          window.__salonDetailCount++;
        } catch (e) {
          window.__salonDetailErrors.push(`${id} ${e.message}`);
        }
        await W(1500);
      }
    }
  })();
  return 'started';
})();
