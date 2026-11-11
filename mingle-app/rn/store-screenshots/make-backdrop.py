#!/usr/bin/env python3
"""Backgrounds for slides 02 and 03 that continue slide 01's street.

The store shows the slides side by side, so 01 | 02 | 03 read as one strip.
scenes/street-original.png is a wide sunset street drawn with the ChatGPT pool
from slide 01's photo; its right part (the street running on past the friends,
no faces in it) is scaled to the slide height and fills 02 and 03. The store
puts a small gap between screenshots, so the strip only has to carry the same
sky, horizon and light across; the phone covers most of these slides anyway. Writes scenes/backdrop-02.jpg and -03.jpg.
"""
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
LEFT = 0.478  # where the street starts in street-original.png, as a share of its width

hero = Image.open(HERE / "hero/group.jpg").convert("RGB")
w, h = hero.size
street = Image.open(HERE / "scenes/street-original.png").convert("RGB")
part = street.crop((int(street.width * LEFT), 0, street.width, street.height))
part = part.resize((round(part.width * h / part.height), h), Image.LANCZOS)
part = part.crop((0, 0, w * 2, h)) if part.width >= w * 2 else part.resize((w * 2, h), Image.LANCZOS)

for i, name in ((0, "backdrop-02.jpg"), (1, "backdrop-03.jpg")):
    part.crop((w * i, 0, w * (i + 1), h)).save(HERE / "scenes" / name, quality=88)
print("ok", part.size)
