// Renders the HashChat logo: a hash drawn like an H, the Hash Rush hamster
// gnawing the bottom of the right stroke with its front teeth.
// npm i --no-save playwright && npx playwright install chromium && node gen.mjs
//   ->  hashchat.svg, hashchat.png (1024)
import { chromium } from 'playwright';
import fs from 'fs';

const BG = '#FCC140', INK = '#474747';
// Hash Rush LOOKS[0]
const FUR = '#f7b558', EAR = '#e3963b', BELLY = '#fff4dc', PAW = '#f3c9a0';

const W = 66;            // stroke width
const S = 6.4;           // hamster scale (game units -> px)
const C = [828, 776];    // hamster centre
const ROT = 4;           // head leaning into the stroke

// Three-quarter view facing left, so the mouth sits on the stroke's edge.
// Ears, feet, body, face.
const back = `
  <circle cx="-5" cy="-13.5" r="5.4" fill="${EAR}" stroke="${INK}" stroke-width="1.4"/>
  <circle cx="-5" cy="-13.2" r="2.9" fill="#f7b6b6"/>
  <circle cx="11.5" cy="-11.5" r="5.6" fill="${EAR}" stroke="${INK}" stroke-width="1.4"/>
  <circle cx="11.5" cy="-11.2" r="3" fill="#f7b6b6"/>
  <ellipse cx="-4" cy="13.6" rx="4.2" ry="2.6" fill="${PAW}" stroke="${INK}" stroke-width="1.2"/>
  <ellipse cx="9" cy="13.4" rx="4.2" ry="2.6" fill="${PAW}" stroke="${INK}" stroke-width="1.2"/>
  <ellipse cx="0" cy="0" rx="16" ry="14.5" fill="${FUR}" stroke="${INK}" stroke-width="1.4"/>
  <ellipse cx="-3" cy="6" rx="10" ry="7.5" fill="${BELLY}"/>
  <ellipse cx="-10" cy="2.6" rx="5.6" ry="5" fill="${BELLY}"/>
  <ellipse cx="6" cy="3.4" rx="5.4" ry="4.6" fill="${BELLY}"/>
  <circle cx="-8" cy="1.6" r="2.4" fill="rgba(255,130,150,0.55)"/>
  <circle cx="8.5" cy="1.8" r="2.6" fill="rgba(255,130,150,0.55)"/>
  <circle cx="-7.6" cy="-4.4" r="2.3" fill="#2a1c14"/><circle cx="-6.9" cy="-5.2" r="0.9" fill="#fff"/>
  <circle cx="2.6" cy="-4.8" r="2.3" fill="#2a1c14"/><circle cx="3.3" cy="-5.6" r="0.9" fill="#fff"/>
  `;

// Muzzle with the two front teeth sunk into the stroke, paws holding on.
const front = `
  <ellipse cx="-17.4" cy="1.8" rx="4.8" ry="3.9" fill="${BELLY}" stroke="${INK}" stroke-width="0.9"/>
  <ellipse cx="-19.6" cy="0.4" rx="1.5" ry="1.1" fill="#e58a8a"/>
  <path d="M-22.6 2.6 q1.4 1.2 2.6 0 q1.2 1.2 2.6 0" fill="none" stroke="#7a4a3a" stroke-width="0.8"/>
  <rect x="-22.6" y="2.8" width="2.5" height="4.4" rx="0.7" fill="#fff" stroke="${INK}" stroke-width="0.7"/>
  <rect x="-20" y="2.8" width="2.5" height="4.4" rx="0.7" fill="#fff" stroke="${INK}" stroke-width="0.7"/>
  <ellipse cx="-18.6" cy="-5.2" rx="3" ry="2.3" fill="${PAW}" stroke="${INK}" stroke-width="1" transform="rotate(-30 -18.6 -5.2)"/>
  <ellipse cx="-18" cy="9.8" rx="3" ry="2.3" fill="${PAW}" stroke="${INK}" stroke-width="1" transform="rotate(20 -18 9.8)"/>`;

function svg() {
  const ham = (body) => `<g transform="translate(${C[0]} ${C[1]}) rotate(${ROT}) scale(${S})">${body}</g>`;
  // Bitten through: tooth marks show on the stroke's far (left) edge.
  const bites = [[656, 772, 12], [655, 796, 12], [722, 748, 10], [726, 822, 10]];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs><mask id="bite" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><rect width="1024" height="1024" fill="#fff"/>
  ${bites.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#000"/>`).join('')}</mask></defs>
  <rect width="1024" height="1024" fill="${BG}"/>
  <g transform="translate(-40 0)">
  <g fill="none" stroke="${INK}" stroke-width="${W}" stroke-linecap="round">
    <path d="M352 252 Q338 520 352 772"/>
    <path d="M238 486 Q520 466 798 452"/>
    <path d="M232 568 Q510 574 790 594"/>
  </g>
  <path d="M640 250 Q662 520 694 806" fill="none" stroke="${INK}" stroke-width="${W}" stroke-linecap="round" mask="url(#bite)"/>
  ${ham(back)}
  ${ham(front)}
  ${[[620, 840, 7], [604, 868, 6], [636, 884, 5], [700, 880, 6]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}"/>`).join('')}
  </g>
</svg>`;
}

const out = svg();
fs.writeFileSync('hashchat.svg', out);
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
await p.setContent(`<body style="margin:0">${out}</body>`);
await p.screenshot({ path: 'hashchat.png' });
await b.close();
