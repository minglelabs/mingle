// The pictures on the cards between rounds: a hamster's face for the lobby and
// the title card, and the trophy. Copied from hash-rush src/client/main.js
// (drawAvatar, drawTrophy) at feat/g2-server-rooms 7004a49; in the page they
// live in main.js, which the app does not copy.

import { drawHamster, drawSeed } from './render.js';

// A face, 52 x 46 (or `size` wide), for the look of the seat it sits in.
export function drawAvatar(canvas, look, size = 52) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const k = size / 52;
  canvas.width = Math.round(52 * k * dpr);
  canvas.height = Math.round(46 * k * dpr);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(dpr * 1.25 * k, dpr * 1.25 * k);
  drawHamster(ctx, { x: 21, y: 19, fx: 0.4, fy: 0, moving: false, carrying: false, swing: null, look, t: 0 });
}

// A gold cup with a sunflower seed standing in it, rays turning behind and
// confetti coming down.
export function drawTrophy(canvas, time, won = 10) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = 300;
  const H = 250;
  if (canvas.width !== W * dpr) {
    canvas.width = W * dpr;
    canvas.height = H * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, 128);
  for (let i = 0; i < 12; i++) {
    ctx.rotate(Math.PI / 6);
    ctx.fillStyle = `rgba(255, 205, 60, ${i % 2 ? 0.34 : 0.16})`;
    ctx.save();
    ctx.rotate(time * 0.35);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-22, -150);
    ctx.lineTo(22, -150);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  ctx.save();
  ctx.translate(W / 2, 132 + Math.sin(time * 2.4) * 3);
  const gold = ctx.createLinearGradient(-60, 0, 60, 0);
  gold.addColorStop(0, '#c98a12');
  gold.addColorStop(0.35, '#ffe27a');
  gold.addColorStop(0.6, '#f6b92c');
  gold.addColorStop(1, '#b8770a');
  ctx.lineJoin = 'round';
  // handles
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#d99a1c';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * 52, -22, 22, side > 0 ? -Math.PI / 2 : Math.PI / 2, side > 0 ? Math.PI / 2 : (3 * Math.PI) / 2);
    ctx.stroke();
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#8a5a08';
  // the seed, standing in the cup
  drawSeed(ctx, 0, -76, 4.6, Math.sin(time * 1.7) * 0.12);
  // bowl
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.moveTo(-56, -52);
  ctx.lineTo(56, -52);
  ctx.quadraticCurveTo(54, 18, 12, 30);
  ctx.lineTo(12, 52);
  ctx.lineTo(-12, 52);
  ctx.lineTo(-12, 30);
  ctx.quadraticCurveTo(-54, 18, -56, -52);
  ctx.fill();
  ctx.stroke();
  // rim and base
  ctx.beginPath();
  ctx.roundRect(-62, -60, 124, 13, 6);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(-34, 50, 68, 12, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#6b4a2a';
  ctx.beginPath();
  ctx.roundRect(-46, 61, 92, 22, 6);
  ctx.fill();
  ctx.fillStyle = '#ffe27a';
  ctx.font = '800 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${won}`, 0, 77);
  // shine
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.beginPath();
  ctx.ellipse(-30, -22, 6, 20, 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const colors = ['#e5484d', '#3e63dd', '#f6b92c', '#30a46c', '#9b51e0', '#ff8fb1'];
  for (let i = 0; i < 46; i++) {
    const x = (i * 71.3 + Math.sin(time * 1.3 + i) * 14) % W;
    const y = (time * (46 + (i % 7) * 11) + i * 37) % (H + 20) - 10;
    ctx.save();
    ctx.translate((x + W) % W, y);
    ctx.rotate(time * (2 + (i % 5)) + i);
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(-4, -2.5, 8, 5);
    ctx.restore();
  }
}
