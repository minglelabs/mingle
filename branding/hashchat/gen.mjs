import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const BG = '#FCC140', INK = '#474747';
function hamster(cx, cy, s, rot) {
  // Hash Rush drawHamster (fur/ear/belly/paw of LOOKS[0]), facing left, paws up.
  const fur='#f7b558', ear='#e3963b', belly='#fff4dc', paw='#f3c9a0';
  const lx=-2.6, ly=-1.6;
  return `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${s})">
    <ellipse cx="-7" cy="13" rx="4.2" ry="2.6" fill="${paw}" stroke="${INK}" stroke-width="1.2"/>
    <ellipse cx="7" cy="13" rx="4.2" ry="2.6" fill="${paw}" stroke="${INK}" stroke-width="1.2"/>
    ${[-1,1].map(k=>`<circle cx="${k*10.5}" cy="-12.5" r="5.6" fill="${ear}" stroke="${INK}" stroke-width="1.6"/><circle cx="${k*10.5}" cy="-12.2" r="3" fill="#f7b6b6"/>`).join('')}
    <ellipse cx="0" cy="0" rx="16" ry="14.5" fill="${fur}" stroke="${INK}" stroke-width="1.8"/>
    <ellipse cx="${lx*0.4}" cy="5.5" rx="10" ry="7.5" fill="${belly}"/>
    <circle cx="${-9+lx*0.6}" cy="${2.5+ly*0.5}" r="3" fill="rgba(255,130,150,0.55)"/>
    <circle cx="${9+lx*0.6}" cy="${2.5+ly*0.5}" r="3" fill="rgba(255,130,150,0.55)"/>
    <circle cx="${-5.5+lx}" cy="${-3+ly}" r="2.3" fill="#2a1c14"/><circle cx="${5.5+lx}" cy="${-3+ly}" r="2.3" fill="#2a1c14"/>
    <circle cx="${-4.8+lx}" cy="${-3.8+ly}" r="0.9" fill="#fff"/><circle cx="${6.2+lx}" cy="${-3.8+ly}" r="0.9" fill="#fff"/>
    <ellipse cx="${lx*1.1}" cy="${0.8+ly}" rx="1.6" ry="1.2" fill="#e58a8a"/>
    <path d="M${lx*1.1-2.4} ${3+ly} q1.2 1.6 2.4 -0.4 q1.2 2 2.4 0.4" fill="none" stroke="#7a4a3a" stroke-width="1"/>
    <path d="M${lx*1.1-1} ${3.6+ly} h2 v1.6 h-2z" fill="#fff" stroke="#7a4a3a" stroke-width="0.5"/>
    <ellipse cx="-15.5" cy="-1" rx="3.4" ry="2.6" fill="${paw}" stroke="${INK}" stroke-width="1.2" transform="rotate(-50 -15.5 -1)"/>
    <ellipse cx="-14" cy="6" rx="3.4" ry="2.6" fill="${paw}" stroke="${INK}" stroke-width="1.2" transform="rotate(-20 -14 6)"/>
  </g>`;
}
function svg(glyph) {
  const W = 66;
  // Bites out of the bottom-right of the right stroke.
  const bites = [[720,700,16],[724,728,16],[658,778,19],[686,790,19],[712,770,16]];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs><mask id="bite" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><rect width="1024" height="1024" fill="#fff"/>${bites.map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="#000"/>`).join('')}</mask></defs>
  <rect width="1024" height="1024" fill="${BG}"/>
  <g fill="none" stroke="${glyph}" stroke-width="${W}" stroke-linecap="round">
    <path d="M352 252 Q338 520 352 772"/>
    <path d="M238 486 Q520 466 798 452"/>
    <path d="M232 568 Q510 574 790 594"/>
    <g mask="url(#bite)"><path d="M640 250 Q662 500 692 752"/></g>
  </g>
  ${[[640,830,9],[610,858,7],[676,870,6],[630,896,5],[748,690,6]].map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${glyph}"/>`).join('')}
  ${hamster(800, 800, 4.6, -12)}
</svg>`;
}
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
for (const [name, g] of [['white', '#ffffff'], ['ink', INK]]) {
  fs.writeFileSync(`hashchat-${name}.svg`, svg(g));
  await p.setContent(`<body style="margin:0">${svg(g)}</body>`);
  await p.screenshot({ path: `hashchat-${name}.png` });
}
await b.close();
