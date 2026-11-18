"""HashChat wordmark: the name alone, wide, in Pretendard Black.

Writes next to this file:
  hashchat-wordmark.svg          ink (#333) on transparent, text as outlines
  hashchat-wordmark-white.svg    white on transparent
  hashchat-wordmark.png / -white.png / -on-yellow.png   2400 px wide
Usage: python3 make-wordmark.py
"""
import os

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.expanduser('~/Library/Fonts/Pretendard-Black.otf')
WORD = 'HashChat'
INK, WHITE, YELLOW = '#333333', '#FFFFFF', '#FCC22F'
TRACKING = -0.02  # em: tighter than the font default, it reads as one mark
PAD = 0.12        # em of clear space around the letters


def outlines():
    """SVG path data in font units (y down), plus the tight bounding box."""
    font = TTFont(FONT)
    gs, cmap = font.getGlyphSet(), font.getBestCmap()
    upm = font['head'].unitsPerEm
    hmtx = font['hmtx']
    x, parts = 0.0, []
    xmin = ymin = float('inf')
    xmax = ymax = float('-inf')
    for i, ch in enumerate(WORD):
        name = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[name].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))
        parts.append(pen.getCommands())
        bp = BoundsPen(gs)
        gs[name].draw(bp)
        if bp.bounds:
            bx0, by0, bx1, by1 = bp.bounds
            xmin, xmax = min(xmin, x + bx0), max(xmax, x + bx1)
            ymin, ymax = min(ymin, -by1), max(ymax, -by0)
        x += hmtx[name][0] + (TRACKING * upm if i < len(WORD) - 1 else 0)
    return ' '.join(parts), (xmin, ymin, xmax, ymax), upm


def write_svg(path_d, box, upm, fill, name):
    pad = PAD * upm
    x0, y0, x1, y1 = box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad
    w, h = x1 - x0, y1 - y0
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:.0f} {y0:.0f} {w:.0f} {h:.0f}" '
           f'width="{w / upm * 100:.0f}" height="{h / upm * 100:.0f}" role="img" aria-label="HashChat">'
           f'<path fill="{fill}" d="{path_d}"/></svg>\n')
    open(os.path.join(HERE, name), 'w').write(svg)
    return w / h


def write_png(fg, bg, name, width=2400):
    """Raster from the same font and tracking, cropped to the letters plus PAD; bg None = transparent."""
    size = 1000
    font = ImageFont.truetype(FONT, size)
    layer = Image.new('L', (size * len(WORD), size * 2), 0)
    d = ImageDraw.Draw(layer)
    x = size * 0.2
    for c in WORD:
        d.text((x, size * 0.4), c, font=font, fill=255)
        x += font.getlength(c) + TRACKING * size
    x0, y0, x1, y1 = layer.getbbox()
    pad = int(PAD * size)
    mask = layer.crop((x0 - pad, y0 - pad, x1 + pad, y1 + pad))
    img = Image.new('RGBA', mask.size, (0, 0, 0, 0) if bg is None else bg)
    img.paste(Image.new('RGBA', mask.size, fg), (0, 0), mask)
    img.resize((width, round(width * mask.size[1] / mask.size[0])), Image.LANCZOS).save(os.path.join(HERE, name))


if __name__ == '__main__':
    path_d, box, upm = outlines()
    ratio = write_svg(path_d, box, upm, INK, 'hashchat-wordmark.svg')
    write_svg(path_d, box, upm, WHITE, 'hashchat-wordmark-white.svg')
    write_png(INK, None, 'hashchat-wordmark.png')
    write_png(WHITE, None, 'hashchat-wordmark-white.png')
    write_png(INK, YELLOW, 'hashchat-wordmark-on-yellow.png')
    print('ratio %.2f : 1' % ratio)
