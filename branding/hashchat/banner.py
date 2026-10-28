#!/usr/bin/env python3
"""Render the wide brand images (Play feature graphic, web og-image) from hashchat-original.png.

Run from the repo root: python3 branding/hashchat/banner.py   (needs Google Chrome and pngquant)
"""
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOGO = (ROOT / "branding/hashchat/hashchat-original.png").as_uri()
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

PAGE = """<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;width:{w}px;height:{h}px;overflow:hidden;background:#FCC12F;
  font-family:-apple-system,"SF Pro Display","Helvetica Neue",sans-serif;color:#2B2B2B}}
img{{position:absolute;left:{lx}px;top:{ly}px;width:{ls}px;height:{ls}px}}
.t{{position:absolute;left:{tx}px;top:0;bottom:0;right:{pad}px;display:flex;flex-direction:column;justify-content:center}}
h1{{margin:0;font-size:{h1}px;font-weight:800;letter-spacing:-0.02em;line-height:1}}
p{{margin:{gap}px 0 0;font-size:{p}px;font-weight:600;line-height:1.25;color:#4A3B12;white-space:nowrap}}
</style></head><body><img src="{logo}"><div class="t"><h1>HashChat</h1>
<p>Posts and chats from everywhere,<br>translated for you</p></div></body></html>"""

TARGETS = [
    # (output, width, height, logo size, text left, h1, p, gap)
    ("mingle-app/rn/google-play-console-info/assets/feature-graphic.png", 1024, 500, 480, 480, 96, 32, 18),
    ("mingle-app/public/og-image.png", 2400, 1260, 1180, 1150, 210, 70, 40),
    ("mingle-landing/public/og-image.png", 2400, 1260, 1180, 1150, 210, 70, 40),
]

with tempfile.TemporaryDirectory() as tmp:
    for out, w, h, ls, tx, h1, p, gap in TARGETS:
        page = Path(tmp) / "b.html"
        page.write_text(PAGE.format(w=w, h=h, lx=-int(ls * 0.06), ly=(h - ls) // 2, ls=ls, tx=tx,
                                    pad=int(w * 0.04), h1=h1, p=p, gap=gap, logo=LOGO), encoding="utf-8")
        dest = ROOT / out
        subprocess.run([CHROME, "--headless=new", "--hide-scrollbars", "--force-device-scale-factor=1",
                        f"--window-size={w},{h}", "--virtual-time-budget=2000", f"--screenshot={dest}", page.as_uri()],
                       check=True, capture_output=True)
        subprocess.run(["pngquant", "--quality=85-98", "--speed=1", "--force", "--ext=.png", str(dest)], check=True)
        print(out)
