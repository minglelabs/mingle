// Capture the per-language app screens for the store screenshots.
//
// The app's screens are the Next.js web app inside the native WebView, so each
// screen is loaded from a running devbox web server in headless Chrome at iPhone
// size (390x797 pt under the status bar, @3x). Posts and comments come back
// translated into the page's language, the same way the app shows them.
// Pages are loaded signed in as a local-only test account (store-shots@hashchat.test,
// password in .env.local, created in the devbox DB) so on-demand translations and
// people search work. The chat room needs real conversations, so it is drawn from chat.json with the
// app's bubble layout instead. Hash Rush is captured from its live site.
//
//   cd mingle-app/rn/store-screenshots && npm install
//   node capture.mjs [--base http://localhost:8538] [--only ko,en]
//
// Output: captures/<lang>/{translation,comments,chat,dm,voice,booking,search,hash-rush,hash-rush-maps}.png
// `--screens dm,voice,booking` (or chat) draws from JSON alone: no server, no sign-in.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const AVATARS = path.resolve(HERE, '../../public/avatars/animals');
const args = process.argv.slice(2);
const argValue = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const BASE = argValue('--base') || 'http://localhost:8538';
const ONLY = argValue('--only')?.split(',');
const SCREENS = argValue('--screens')?.split(','); // e.g. --screens hash-rush,hash-rush-maps
const HASH_RUSH = 'https://minglelabs.github.io/hash-rush/';

// caption language -> app route locale / Hash Rush language
const LANGS = {
  ko: 'ko', en: 'en', ja: 'ja', 'zh-cn': 'zh-CN', 'zh-tw': 'zh-TW', ar: 'ar', de: 'de', es: 'es',
  fr: 'fr', hi: 'hi', it: 'it', pt: 'pt', ru: 'ru', th: 'th', vi: 'vi',
};
const HASH_RUSH_LANG = { ko: 'ko', ja: 'ja', 'zh-cn': 'zh-Hans', 'zh-tw': 'zh-Hant' };

const NATIVE_QUERY = 'nativeUi=1&apiNamespace=ios%2Fv2.2.0&nativeClientVersion=2.2.0&nativeClientBuild=109';
// photo posts written in a language other than the viewer's, so the caption shows a translation
const FEED_POST = { default: 'rs-cmuwrpj9p003esh5c5m0mb54v', ja: 'rs-cmuwrn9lq001ash9ajhqlius5' }; // Tokyo train (ja) / pepper bun (zh-TW)
// a post written in another language than the viewer's (zh-CN -> ko comes back untranslated, so ko gets a ja post)
const TRANSLATE_POST = { default: 'rs-cmuwrmyrd0003sh5c719bjp4l', zh: 'rs-cmutserwb0002shgmkbx9cm8e', ko: 'rs-cmuwrpj9p003dsh5cikp2lqvo' };
const COMMENT_POST = 'rs-cmuwrn9lq0019sh9afs6cpgkt'; // photo: tteokbokki, 3 comments

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chat = JSON.parse(await fs.readFile(path.join(HERE, 'chat.json'), 'utf8'));
const dm = JSON.parse(await fs.readFile(path.join(HERE, 'dm.json'), 'utf8'));
// Screens drawn from JSON here; they need no devbox server and no sign-in.
const DRAWN_SCREENS = ['chat', 'dm', 'voice', 'booking'];
const NEEDS_SERVER = !SCREENS || SCREENS.some((name) => !DRAWN_SCREENS.includes(name) && !name.startsWith('hash-rush'));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--allow-file-access-from-files'],
});

async function signIn() {
  const env = Object.fromEntries((await fs.readFile(path.join(HERE, '.env.local'), 'utf8'))
    .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  const p = await browser.newPage();
  await p.goto(`${BASE}/api/auth/csrf`);
  const status = await p.evaluate(async (email, password) => {
    const { csrfToken } = await (await fetch('/api/auth/csrf')).json();
    const body = new URLSearchParams({ email, password, csrfToken, json: 'true', callbackUrl: '/' });
    const res = await fetch('/api/auth/callback/email-password', { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    const session = await (await fetch('/api/auth/session')).json();
    return `${res.status} ${session?.user?.email || 'no session'}`;
  }, env.SHOTS_EMAIL, env.SHOTS_PASSWORD);
  await p.close();
  console.log('sign-in:', status);
}
if (NEEDS_SERVER) await signIn();

async function newPage(lang) {
  const p = await browser.newPage();
  await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
  await p.setExtraHTTPHeaders({ 'Accept-Language': lang });
  await p.setViewport({ width: 390, height: 797, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  // the first-visit "swipe up" hint has already been seen
  await p.evaluateOnNewDocument((k) => { try { localStorage.setItem(k, '1'); } catch {} }, 'mingle:feed-swipe-hint-done');
  return p;
}

// Post language buttons run [original, viewer's language, others...]. When the
// viewer's translation is not cached yet the original stays selected, so ask for it.
async function showViewerTranslation(p) {
  const clicked = await p.evaluate(() => {
    const flags = [...document.querySelectorAll('button[data-feed-action]')]
      .filter((b) => b.hasAttribute('aria-pressed') && b.getBoundingClientRect().width > 0);
    const mine = flags[1];
    if (!mine || mine.getAttribute('aria-pressed') === 'true') return false;
    mine.click();
    return true;
  });
  if (clicked) await sleep(9000);
}

async function capture(lang, dir, name, url, after, { translatePost = false } = {}) {
  if (SCREENS && !SCREENS.includes(name)) return;
  const p = await newPage(LANGS[lang]);
  // networkidle can wait forever on a busy dev server; load the DOM and give the feed time to fill
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await sleep(url.startsWith('file:') ? 600 : 9000);
  if (translatePost) await showViewerTranslation(p);
  if (after) await after(p);
  await p.screenshot({ path: path.join(dir, `${name}.png`) });
  await p.close();
  console.log(lang, name);
}

async function clickWhere(p, predicateSource) {
  const handle = await p.evaluateHandle((src) => {
    const match = new Function('el', `return (${src})(el)`);
    return [...document.querySelectorAll('button,[role=button],a,div')].find(
      (el) => el.getBoundingClientRect().width > 0 && match(el),
    );
  }, predicateSource);
  const el = handle.asElement();
  if (!el) throw new Error(`nothing to click for ${predicateSource}`);
  await el.click();
}

function chatHtml(lang) {
  const [a, b] = chat.partners[lang];
  const room = [lang, a, b];
  const speakers = [{ lang: a, avatar: 'rabbit.svg' }, { lang: b, avatar: 'elk.svg' }];
  const rel = new Intl.RelativeTimeFormat(LANGS[lang], { numeric: 'auto' });
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const bubbles = chat.lines.map((line, i) => {
    const speaker = speakers[i % 2];
    const order = [speaker.lang, ...room.filter((l) => l !== speaker.lang)];
    const rows = order.map((l, k) => `
      <div class="row${k === 0 ? ' original' : ''}">
        <span class="flag${l === lang ? ' mine' : ''}">${chat.flags[l]}${k === 0 ? '<i>”</i>' : ''}</span>
        <span class="text" dir="auto">${esc(line[l])}</span>
      </div>`).join('');
    return `
    <div class="msg">
      <img class="avatar" src="${pathToFileURL(path.join(AVATARS, speaker.avatar))}">
      <div class="bubble">${rows}</div>
      <div class="meta">${rel.format(-(4 - i) * 2, 'minute')}<br>${chat.collapse[lang]}</div>
    </div>`;
  }).join('');
  return `<!doctype html><html lang="${LANGS[lang]}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  *{box-sizing:border-box}
  html,body{margin:0;width:390px;height:797px;overflow:hidden;background:#F7F7F8;
    font-family:-apple-system,"SF Pro Text","Apple SD Gothic Neo","Hiragino Sans","PingFang SC","Geeza Pro","Kohinoor Devanagari","Thonburi",sans-serif;color:#111}
  header{height:52px;background:#fff;border-bottom:1px solid #EEE;display:flex;align-items:center;padding:0 14px;gap:10px}
  .back{font-size:26px;color:#333;width:22px}
  .title{font-size:16px;font-weight:600;max-width:96px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .pill{margin-left:6px;border:1px solid #E5E5E5;border-radius:14px;padding:6px 10px;display:flex;gap:10px;align-items:center;font-size:19px}
  .pill b{font-size:12px;color:#444}
  .icons{margin-left:auto;display:flex;gap:18px;color:#333}
  main{padding:14px 8px 0 12px;display:flex;flex-direction:column;gap:9px;height:647px;overflow:hidden}
  .msg{display:flex;align-items:flex-end;gap:8px}
  .avatar{width:36px;height:36px;border-radius:50%;background:#fff;border:1px solid #EEE;align-self:flex-start;padding:3px}
  .bubble{background:#fff;border:1px solid #E8E8E8;border-radius:16px;padding:2px 10px;max-width:258px;box-shadow:0 1px 2px rgba(0,0,0,.05)}
  .row{display:flex;gap:9px;padding:8px 0;font-size:14.5px;line-height:1.35;border-top:1px solid #EFEFEF}
  .row:first-child{border-top:0}
  .row.original .text{color:#111}
  .text{color:#333}
  .flag{position:relative;font-size:17px;line-height:1.1;flex:none;height:21px}
  .flag i{position:absolute;right:-6px;top:-6px;font-style:normal;font-weight:900;font-size:15px;color:#111}
  .flag.mine{border-bottom:2.5px solid #F5A400}
  .meta{font-size:10.5px;color:#9A9A9A;line-height:1.5;flex:none;width:44px}
  footer{position:absolute;bottom:0;left:0;right:0;height:96px;background:#fff;border-top:1px solid #EEE;display:flex;align-items:flex-start;padding:16px 22px 0;gap:18px;color:#555}
  .stat{font-size:12px;color:#8E8E8E;line-height:1.4;width:58px}
  .start{margin:0 auto;background:linear-gradient(90deg,#FFB400,#FF7A00);color:#fff;border-radius:24px;height:46px;width:112px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:17px;font-weight:600;box-shadow:0 6px 14px rgba(255,140,0,.3)}
  svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  </style></head><body>
  <header><span class="back">‹</span><span class="title">${esc(chat.title[lang])}</span>
    <span class="pill">${room.map((l) => chat.flags[l]).join('')}<b>⌄</b></span>
    <span class="icons"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><rect x="11" y="11" width="8" height="6" rx="1.5"/></svg>
    <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg></span></header>
  <main>${bubbles}</main>
  <footer><div class="stat">8m 34s<br>12 msgs</div>
    <svg viewBox="0 0 24 24" style="margin-top:8px"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/></svg>
    <div class="start"><svg viewBox="0 0 24 24" style="width:20px;height:20px"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>Start</div>
    <svg viewBox="0 0 24 24" style="margin-top:8px"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>
    <svg viewBox="0 0 24 24" style="margin-top:8px"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></svg>
  </footer></body></html>`;
}

// A room with one other person, as the viewer sees it: their lines on the left
// (their language, then the viewer's), the viewer's own on the right in the
// app's own-bubble tint (viewer's language, then theirs). `kind`:
//   dm      - typed chat with a friend
//   voice   - the same room while speaking: the last line is still being heard
//   booking - a booking call on speaker, the shop on the other side
// `call`: the same room during a voice talk (the app's voice call), drawn the
// way the voice talk build shows it (src/components/LivePhoneDemo/VoiceTalkPanel.tsx
// on feat/voicetalk-windows-livekit-mvp): the call panel under the top bar with
// the 8 seats (the speaker's avatar ringed by the soft gray ripple, each seat's
// language flag at its bottom left), "Mic on" in red and "Leave"; the room's
// talk under it, every line in both languages; the phone button bottom left in
// green with its dot. The panel's words exist in Korean and English only in
// that build, so every other language reads the English, as the app does.
const VOICE_TALK_COPY = {
  ko: { live: (n) => `보이스톡 · ${n}/8`, me: '나', empty: '빈 자리', micOn: '마이크 켜짐', leave: '나가기' },
  en: { live: (n) => `Voice talk · ${n}/8`, me: 'Me', empty: 'Empty', micOn: 'Mic on', leave: 'Leave' },
};
function voiceTalkPanel(lang, { partner, partnerName, partnerAvatar, meAvatar, speaking }) {
  const copy = lang === 'ko' ? VOICE_TALK_COPY.ko : VOICE_TALK_COPY.en;
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const seat = (who) => `
    <div class="vt-seat">
      <span class="vt-ring">
        ${who.speaking ? '<span class="vt-ripple r1"></span><span class="vt-ripple r2"></span><span class="vt-glow"></span>' : ''}
        <span class="vt-face"><img src="${pathToFileURL(path.join(AVATARS, who.avatar))}"></span>
        <span class="vt-flag">${chat.flags[who.lang]}</span>
      </span>
      <span class="vt-label">${esc(who.label)}</span>
    </div>`;
  const empty = `<div class="vt-seat"><span class="vt-ring"><span class="vt-face vt-empty"></span></span><span class="vt-label">${copy.empty}</span></div>`;
  const seats = [
    seat({ avatar: meAvatar, lang, label: copy.me, speaking: speaking === 'me' }),
    seat({ avatar: partnerAvatar, lang: partner, label: partnerName, speaking: speaking === 'friend' }),
    ...Array.from({ length: 6 }, () => empty),
  ].join('');
  const mic = '<svg viewBox="0 0 24 24" style="width:17px;height:17px"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  const phoneOff = '<svg viewBox="0 0 24 24" style="width:17px;height:17px"><path d="M10.7 13.3a16 16 0 0 0 3.4 2.6l1.3-1.3a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 4.2 2 2 0 0 1 5.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8.9 9.7"/><path d="M22 2 2 22"/></svg>';
  return `
  <div class="vt-panel">
    <div class="vt-top"><span class="vt-dot"><i></i><b></b></span><span class="vt-title">${copy.live(2)}</span>
      <svg viewBox="0 0 24 24" class="vt-chev"><path d="m18 15-6-6-6 6"/></svg></div>
    <div class="vt-grid">${seats}</div>
    <div class="vt-buttons" dir="ltr"><span class="vt-mic">${mic}${copy.micOn}</span><span class="vt-leave">${phoneOff}${copy.leave}</span></div>
  </div>`;
}
const VOICE_TALK_CSS = `
  .vt-panel{position:absolute;left:8px;right:8px;top:56px;z-index:5;background:rgba(255,255,255,.96);border:1px solid #F3F4F6;border-radius:16px;
    box-shadow:0 10px 28px rgba(15,23,42,.12);overflow:hidden}
  .vt-top{display:flex;align-items:center;gap:8px;padding:8px 12px}
  .vt-dot{position:relative;width:8px;height:8px;flex:none}
  .vt-dot i{position:absolute;inset:-3px;border-radius:50%;background:rgba(52,211,153,.35)}
  .vt-dot b{position:absolute;inset:0;border-radius:50%;background:#10B981}
  .vt-title{flex:1;font-size:14px;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .vt-chev{width:18px;height:18px;color:#6B7280;stroke-width:2.4}
  .vt-grid{display:grid;grid-template-columns:repeat(4,1fr);column-gap:8px;row-gap:10px;padding:4px 12px 8px}
  .vt-seat{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0}
  .vt-ring{position:relative;width:48px;height:48px;display:inline-flex}
  .vt-ripple{position:absolute;inset:0;border-radius:50%;background:rgba(148,163,184,.25)}
  .vt-ripple.r1{transform:scale(1.32);opacity:.55}
  .vt-ripple.r2{transform:scale(1.58);opacity:.3}
  .vt-glow{position:absolute;inset:-3px;border-radius:50%;background:rgba(203,213,225,.3)}
  .vt-face{position:relative;width:48px;height:48px;border-radius:50%;background:#FEF3C7;overflow:hidden;display:flex;align-items:center;justify-content:center}
  .vt-face img{width:40px;height:40px}
  .vt-empty{background:#F9FAFB;border:1px dashed #D1D5DB}
  .vt-flag{position:absolute;left:-2px;bottom:-2px;min-width:18px;height:18px;padding:0 2px;border-radius:9px;background:#fff;box-shadow:0 0 0 1px #E5E7EB;
    display:flex;align-items:center;justify-content:center;font-size:11px;line-height:1}
  .vt-label{width:100%;text-align:center;font-size:11.2px;font-weight:500;color:#4B5563;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .vt-buttons{display:flex;justify-content:center;gap:16px;border-top:1px solid #F3F4F6;padding:10px 12px}
  .vt-mic,.vt-leave{height:44px;min-width:124px;padding:0 20px;border-radius:22px;display:inline-flex;align-items:center;justify-content:center;gap:6px;
    font-size:13.8px;font-weight:600;white-space:nowrap}
  .vt-mic{background:#EF4444;color:#fff;box-shadow:0 1px 2px rgba(0,0,0,.08)}
  .vt-leave{background:#FFF1F2;color:#E11D48}
  .vt-phone{position:relative;color:#10B981;margin-top:4px}
  .vt-phone i{position:absolute;right:-3px;top:-2px;width:7px;height:7px;border-radius:50%;background:#10B981;box-shadow:0 0 0 2px #fff}
`;

function dmHtml(lang, kind, { call = false } = {}) {
  const partner = chat.partners[lang][0];
  const lines = dm[kind];
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const title = kind === 'booking' ? dm.bookingTitle[lang] : dm.friendName[partner];
  const avatar = kind === 'booking' ? 'squirrel.svg' : 'rabbit.svg';
  const listening = kind !== 'dm';
  const meAvatar = 'fox.svg';
  // In a call the last line is the one being spoken.
  const speaking = lines[lines.length - 1]?.by === 'me' ? 'me' : 'friend';
  const partnerName = kind === 'booking' ? dm.bookingTitle[lang] : dm.friendName[partner];
  const bubbles = lines.map((line) => {
    const mine = line.by === 'me';
    const order = mine ? [lang, partner] : [partner, lang];
    const shown = line.live ? order.slice(0, 1) : order;
    const rows = shown.map((l, k) => `
      <div class="row${k === 0 ? ' original' : ''}">
        <span class="flag${l === lang ? ' mine' : ''}">${chat.flags[l]}${k === 0 ? '<i>”</i>' : ''}</span>
        <span class="text" dir="auto">${esc(line.text[l])}${line.live ? '<b class="caret"></b>' : ''}</span>
      </div>`).join('');
    const pending = line.live ? '<div class="row"><span class="dots"><b></b><b></b><b></b></span></div>' : '';
    return mine
      ? `<div class="msg own"><div class="bubble">${rows}${pending}</div></div>`
      : `<div class="msg"><img class="avatar" src="${pathToFileURL(path.join(AVATARS, avatar))}"><div class="bubble">${rows}</div></div>`;
  }).join('');
  const micIcon = '<svg viewBox="0 0 24 24" style="width:20px;height:20px"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  const stopIcon = '<svg viewBox="0 0 24 24" style="width:18px;height:18px"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/></svg>';
  return `<!doctype html><html lang="${LANGS[lang]}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  *{box-sizing:border-box}
  html,body{margin:0;width:390px;height:797px;overflow:hidden;background:#F7F7F8;
    font-family:-apple-system,"SF Pro Text","Apple SD Gothic Neo","Hiragino Sans","PingFang SC","Geeza Pro","Kohinoor Devanagari","Thonburi",sans-serif;color:#111}
  header{height:52px;background:#fff;border-bottom:1px solid #EEE;display:flex;align-items:center;padding:0 14px;gap:10px}
  .back{font-size:26px;color:#333;width:22px}
  .title{font-size:16px;font-weight:600;max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .pill{margin-left:6px;border:1px solid #E5E5E5;border-radius:14px;padding:6px 10px;display:flex;gap:10px;align-items:center;font-size:19px}
  .pill b{font-size:12px;color:#444}
  .icons{margin-left:auto;display:flex;gap:18px;color:#333}
  main{padding:18px 12px 0 12px;display:flex;flex-direction:column;gap:14px;height:647px;overflow:hidden}
  .msg{display:flex;align-items:flex-start;gap:8px}
  .msg.own{justify-content:flex-end}
  .avatar{width:36px;height:36px;border-radius:50%;background:#fff;border:1px solid #EEE;padding:3px;flex:none}
  .bubble{background:#fff;border:1px solid #E8E8E8;border-radius:0 16px 16px 16px;padding:2px 12px;max-width:272px;box-shadow:0 1px 2px rgba(0,0,0,.05)}
  .own .bubble{background:#FFF8E6;border-color:#F6E3B0;border-radius:16px}
  .row{display:flex;gap:9px;padding:9px 0;font-size:15.5px;line-height:1.38;border-top:1px solid #EFEFEF}
  .own .row{border-top-color:#F3E4BC}
  .row:first-child{border-top:0}
  .row.original .text{color:#111}
  .text{color:#333}
  .flag{position:relative;font-size:17px;line-height:1.1;flex:none;height:21px}
  .flag i{position:absolute;right:-6px;top:-6px;font-style:normal;font-weight:900;font-size:15px;color:#111}
  .flag.mine{border-bottom:2.5px solid #F5A400}
  .caret{display:inline-block;width:3px;height:15px;margin-left:3px;border-radius:2px;background:#F5A400;vertical-align:-2px}
  .dots{display:flex;gap:4px;padding:5px 0 3px 30px}
  .dots b{width:5px;height:5px;border-radius:50%;background:#F5A400}
  footer{position:absolute;bottom:0;left:0;right:0;height:96px;background:#fff;border-top:1px solid #EEE;display:flex;align-items:flex-start;padding:16px 22px 0;gap:18px;color:#555}
  .stat{font-size:12px;color:#8E8E8E;line-height:1.4;width:58px}
  .start{margin:0 auto;background:linear-gradient(90deg,#FFB400,#FF7A00);color:#fff;border-radius:24px;height:46px;width:112px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:17px;font-weight:600;box-shadow:0 6px 14px rgba(255,140,0,.3)}
  .start.live{background:#1F2430;box-shadow:0 6px 14px rgba(31,36,48,.25)}
  svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  ${call ? `${VOICE_TALK_CSS} main{padding-top:274px}` : ''}
  </style></head><body>
  <header><span class="back">‹</span><span class="title">${esc(title)}</span>
    <span class="pill">${[lang, partner].map((l) => chat.flags[l]).join('')}<b>⌄</b></span>
    <span class="icons"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><rect x="11" y="11" width="8" height="6" rx="1.5"/></svg>
    <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg></span></header>
  ${call ? voiceTalkPanel(lang, { partner, partnerName, partnerAvatar: avatar, meAvatar, speaking }) : ''}
  <main>${bubbles}</main>
  <footer>${call
    ? '<span class="vt-phone"><svg viewBox="0 0 24 24" style="width:20px;height:20px"><path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 4.2 2 2 0 0 1 5.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L9 9.6a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z"/></svg><i></i></span>'
    : `<div class="stat">${listening ? '0m 42s' : '3m 10s'}<br>${lines.length} msgs</div>`}
    <svg viewBox="0 0 24 24" style="margin-top:8px"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/></svg>
    <div class="start${listening ? ' live' : ''}">${listening ? `${stopIcon}Stop` : `${micIcon}Start`}</div>
    <svg viewBox="0 0 24 24" style="margin-top:8px"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>
    <svg viewBox="0 0 24 24" style="margin-top:8px"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></svg>
  </footer></body></html>`;
}

async function hashRush(lang, dir, name, map) {
  if (SCREENS && !SCREENS.includes(name)) return;
  const p = await newPage(LANGS[lang]);
  const hl = HASH_RUSH_LANG[lang] || 'en';
  await p.goto(`${HASH_RUSH}?lang=${hl}`, { waitUntil: 'networkidle2', timeout: 120000 });
  await sleep(2500);
  await p.click(`#mapSel [data-map="${map}"]`); // the game remembers the last map, so always pick one
  await p.click('#start');
  await sleep(map === 'beach' ? 11000 : 13000); // bots spread out, someone grabs a seed
  await p.screenshot({ path: path.join(dir, `${name}.png`) });
  await p.close();
  console.log(lang, name);
}

for (const lang of Object.keys(LANGS)) {
  if (ONLY && !ONLY.includes(lang)) continue;
  const route = LANGS[lang];
  const dir = path.join(HERE, 'captures', lang);
  await fs.mkdir(dir, { recursive: true });
  const translatePost = lang.startsWith('zh') ? TRANSLATE_POST.zh : (TRANSLATE_POST[lang] || TRANSLATE_POST.default);

  await capture(lang, dir, 'translation', `${BASE}/${route}/feed?postId=${translatePost}&${NATIVE_QUERY}`, null, { translatePost: true });
  await capture(lang, dir, 'comments', `${BASE}/${route}/feed?postId=${COMMENT_POST}&${NATIVE_QUERY}`, async (p) => {
    // the comment button is the second round icon button on the active card
    await clickWhere(p, `(el) => el.tagName === 'BUTTON' && /comment|댓글|コメント|评论|評論|留言|comentario|commentaire|kommentar|commento|comentário|коммент|تعليق|टिप्पण|कमेंट|ความคิดเห็น|bình luận/i.test(el.getAttribute('aria-label') || '')`);
    await sleep(6000);
    // the three comments are Korean; languages without a stored translation ask for one
    if (lang !== 'ko') {
      const asked = await p.evaluate(() => {
        let n = 0;
        for (const item of document.querySelectorAll('[data-comment-id]')) {
          const toggle = item.querySelector('button[aria-live="polite"]');
          if (toggle && /[가-힣]/.test(item.textContent || '')) { toggle.click(); n += 1; }
        }
        return n;
      });
      if (asked) await sleep(10000);
    }
  });
  await capture(lang, dir, 'search', `${BASE}/${route}/connect?${NATIVE_QUERY}`, async (p) => {
    const input = await p.waitForSelector('input');
    await input.click();
    await input.type('ki');
    await p.keyboard.press('Enter');
    await sleep(6000);
    await p.evaluate(() => document.activeElement?.blur());
  });

  const tmp = path.join(os.tmpdir(), `hashchat-chat-${lang}.html`);
  await fs.writeFile(tmp, chatHtml(lang));
  await capture(lang, dir, 'chat', pathToFileURL(tmp).href);
  for (const kind of ['dm', 'voice', 'booking']) {
    const page = path.join(os.tmpdir(), `hashchat-${kind}-${lang}.html`);
    // 03: the voice talk call itself; 04 puts the booking call on a phone in its scene.
    await fs.writeFile(page, dmHtml(lang, kind, { call: kind !== 'dm' }));
    await capture(lang, dir, kind, pathToFileURL(page).href);
  }

  await hashRush(lang, dir, 'hash-rush', 'meadow');
  await hashRush(lang, dir, 'hash-rush-maps', 'beach');
}
await browser.close();
