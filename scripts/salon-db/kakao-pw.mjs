// 카카오맵 수집을 내 크롬 탭 대신 헤드리스 크롬에서 돌린다 (백그라운드 탭 타이머 지연·확장 연결 끊김 없음).
//   node kakao-pw.mjs list       → browser/kakao-list.js 를 map.kakao.com 에서 실행 (검색어 다 끝나면 종료)
//   node kakao-pw.mjs details    → browser/kakao-details.js 를 place.map.kakao.com 에서 실행 (계속)
// 페이지가 127.0.0.1:4777 로 보내는 요청은 Playwright가 대신 전달한다 (로컬 네트워크 권한 팝업 없음).
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';

const mode = process.argv[2] || 'list';
const API = 'http://127.0.0.1:4777';
const src = await fs.readFile(new URL(`./browser/kakao-${mode}.js`, import.meta.url), 'utf8');

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--disk-cache-size=1', '--disable-gpu'],
});
const page = await browser.newPage({ locale: 'ko-KR', viewport: { width: 1280, height: 900 } });
await page.route(`${API}/**`, async (route) => {
  const req = route.request();
  try {
    const res = await fetch(req.url(), { method: req.method(), headers: { 'content-type': 'application/json' }, body: req.postData() || undefined });
    await route.fulfill({ status: res.status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: await res.text() });
  } catch {
    await route.abort();
  }
});
// 수집에 필요 없는 이미지·폰트는 받지 않음
await page.route(/\.(png|jpe?g|gif|webp|woff2?|svg)(\?|$)/, (r) => r.abort());

await page.goto(mode === 'list' ? 'https://map.kakao.com/' : 'https://place.map.kakao.com/1415611436', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
console.log(new Date().toLocaleTimeString(), mode, await page.evaluate(src));
// 진행 로그를 1분마다 출력, 러너가 끝나면 종료
for (;;) {
  await page.waitForTimeout(60_000);
  const st = await page.evaluate(() => ({
    log: (window.__salonListLog || window.__salonDetailErrors || []).slice(-1)[0],
    n: window.__salonDetailCount,
    done: window.__salonListDone,
  }));
  console.log(new Date().toLocaleTimeString(), JSON.stringify(st));
  if (st.done) break;
}
await browser.close();
