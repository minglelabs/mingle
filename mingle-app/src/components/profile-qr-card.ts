import * as QRCode from "qrcode";

// Instagram-style profile QR: rounded gradient dots, rounded finder eyes, app icon in the center.
const QR_GRADIENT_STOPS: Array<[number, string]> = [
  [0, "#1295e8"],
  [0.52, "#3569ed"],
  [1, "#7338f2"],
];
const APP_ICON_SRC = "/mingle-icon.png";
const APP_NAME = "HashChat";
const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', 'Noto Sans KR', sans-serif";

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function makeGradient(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): CanvasGradient {
  const gradient = ctx.createLinearGradient(x, y + size, x + size, y);
  for (const [offset, color] of QR_GRADIENT_STOPS) gradient.addColorStop(offset, color);
  return gradient;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  newPath = true,
) {
  const radius = Math.min(r, w / 2, h / 2);
  if (newPath) ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawRoundedImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  size: number,
  radius: number,
) {
  ctx.save();
  roundRectPath(ctx, x, y, size, size, radius);
  ctx.clip();
  ctx.drawImage(image, x, y, size, size);
  ctx.restore();
}

/** Draws the styled QR code (no quiet zone) into the square at (x, y). */
function drawStyledQr(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  icon: HTMLImageElement | null,
) {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: "H" });
  const count = modules.size;
  const cell = size / count;
  const isFinder = (row: number, col: number) =>
    (row < 7 && col < 7) || (row < 7 && col >= count - 7) || (row >= count - 7 && col < 7);

  // Keep the center clear for the app icon (H level tolerates it comfortably).
  const logoCells = Math.ceil(count * 0.24) | 1;
  const logoStart = (count - logoCells) / 2;
  const inLogo = (row: number, col: number) =>
    icon != null
    && row >= logoStart - 0.5 && row < logoStart + logoCells + 0.5
    && col >= logoStart - 0.5 && col < logoStart + logoCells + 0.5;

  ctx.save();
  ctx.fillStyle = makeGradient(ctx, x, y, size);

  ctx.beginPath();
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (!modules.get(row, col) || isFinder(row, col) || inLogo(row, col)) continue;
      const cx = x + (col + 0.5) * cell;
      const cy = y + (row + 0.5) * cell;
      ctx.moveTo(cx + cell * 0.43, cy);
      ctx.arc(cx, cy, cell * 0.43, 0, Math.PI * 2);
    }
  }
  ctx.fill();

  // Rounded finder eyes: outer ring + inner rounded square.
  const eyes: Array<[number, number]> = [[0, 0], [0, count - 7], [count - 7, 0]];
  for (const [row, col] of eyes) {
    const ex = x + col * cell;
    const ey = y + row * cell;
    roundRectPath(ctx, ex, ey, cell * 7, cell * 7, cell * 2.2);
    roundRectPath(ctx, ex + cell, ey + cell, cell * 5, cell * 5, cell * 1.5, false);
    ctx.fill("evenodd");
    roundRectPath(ctx, ex + cell * 2, ey + cell * 2, cell * 3, cell * 3, cell * 1);
    ctx.fill();
  }
  ctx.restore();

  if (icon) {
    const logoSize = logoCells * cell * 0.92;
    const lx = x + (size - logoSize) / 2;
    const ly = y + (size - logoSize) / 2;
    ctx.save();
    ctx.fillStyle = "#ffffff";
    roundRectPath(ctx, lx - cell * 0.4, ly - cell * 0.4, logoSize + cell * 0.8, logoSize + cell * 0.8, logoSize * 0.26);
    ctx.fill();
    ctx.restore();
    drawRoundedImage(ctx, icon, lx, ly, logoSize, logoSize * 0.22);
  }
}

/** Styled QR alone, for the on-screen card. */
export async function renderStyledQrDataUrl(value: string, size = 720): Promise<string> {
  const icon = await loadImage(APP_ICON_SRC);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  drawStyledQr(ctx, value, 0, 0, size, icon);
  return canvas.toDataURL("image/png");
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) trimmed = trimmed.slice(0, -1);
  return `${trimmed}…`;
}

/** Shareable image: gradient background, white card with QR + handle, HashChat branding at the bottom. */
export async function renderProfileQrCardDataUrl(params: {
  value: string;
  handle: string;
  name: string;
}): Promise<string> {
  const icon = await loadImage(APP_ICON_SRC);
  const width = 1080;
  const height = 1440;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");

  // Background
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#1295e8");
  bg.addColorStop(0.52, "#3569ed");
  bg.addColorStop(1, "#7338f2");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Card
  const cardX = 150;
  const cardY = 200;
  const cardW = width - cardX * 2;
  const cardH = 900;
  ctx.save();
  ctx.shadowColor = "rgba(22, 50, 140, 0.28)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  ctx.fillStyle = "#ffffff";
  roundRectPath(ctx, cardX, cardY, cardW, cardH, 56);
  ctx.fill();
  ctx.restore();

  const qrSize = 600;
  const qrX = (width - qrSize) / 2;
  const qrY = cardY + 90;
  drawStyledQr(ctx, params.value, qrX, qrY, qrSize, icon);

  // Handle (gradient text) + name
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const primary = params.handle || params.name;
  ctx.font = `700 54px ${FONT_STACK}`;
  ctx.fillStyle = makeGradient(ctx, cardX + 80, qrY + qrSize + 40, cardW - 160);
  ctx.fillText(fitText(ctx, primary, cardW - 100), width / 2, qrY + qrSize + 110);
  if (params.handle && params.name) {
    ctx.font = `500 34px ${FONT_STACK}`;
    ctx.fillStyle = "#6b7280";
    ctx.fillText(fitText(ctx, params.name, cardW - 100), width / 2, qrY + qrSize + 165);
  }

  // Branding: icon + app name
  ctx.font = `700 44px ${FONT_STACK}`;
  const iconSize = 72;
  const gap = 20;
  const labelWidth = ctx.measureText(APP_NAME).width;
  const brandWidth = (icon ? iconSize + gap : 0) + labelWidth;
  const brandX = (width - brandWidth) / 2;
  const brandCenterY = cardY + cardH + (height - cardY - cardH) / 2;
  if (icon) drawRoundedImage(ctx, icon, brandX, brandCenterY - iconSize / 2, iconSize, 18);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(APP_NAME, brandX + (icon ? iconSize + gap : 0), brandCenterY + 2);

  return canvas.toDataURL("image/png");
}
