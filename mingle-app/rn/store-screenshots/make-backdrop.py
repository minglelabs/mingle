#!/usr/bin/env python3
"""Backgrounds for slides 02 and 03 that continue slide 01's photo.

The store shows the slides side by side, so 01 | 02 | 03 read as one strip.
The strip is hero/group.jpg, then its mirror image, then the photo again, so
every seam meets the same pixels. 02 starts sharp where 01 ends and softens
within a few hundred pixels; the phone covers most of it anyway, so it only has
to carry the colour and light across. Writes scenes/backdrop-02.jpg and -03.jpg.
"""
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps

HERE = Path(__file__).resolve().parent
hero = Image.open(HERE / "hero/group.jpg").convert("RGB")
w, h = hero.size
strip = Image.new("RGB", (w * 3, h))
strip.paste(hero, (0, 0))
strip.paste(ImageOps.mirror(hero), (w, 0))
strip.paste(hero, (w * 2, 0))

soft = strip.filter(ImageFilter.GaussianBlur(36))
# sharp at the 01|02 seam, fully soft 420 px into slide 02
ramp = Image.new("L", strip.size, 255)
px = ramp.load()
for x in range(w, w + 420):
    v = int(255 * (x - w) / 420)
    for y in range(h):
        px[x, y] = v
for x in range(0, w):
    for y in range(h):
        px[x, y] = 0
out = Image.composite(soft, strip, ramp)

for i, name in ((1, "backdrop-02.jpg"), (2, "backdrop-03.jpg")):
    out.crop((w * i, 0, w * (i + 1), h)).save(HERE / "scenes" / name, quality=88)
print("ok")
