#!/usr/bin/env python3
"""Render the App Store / Google Play screenshot set from captions.json.

Each slide is an HTML page (headline + phone frame + iOS status bar around a capture
from capture.mjs)
rendered by headless Chrome, so every script (Arabic, Thai, Hindi, CJK) is shaped
by the browser. Output replaces the PNGs in
  appstore-connect-info/upload/<locale>/ and google-play-console-info/upload/<locale>/

Needs Google Chrome and pngquant. Run from anywhere:  python3 mingle-app/rn/store-screenshots/render.py [--only ko,en]
Captures are captures/<lang>/<screen>.png at 1170x2391 (390x797 pt @3x, the screen under the status bar).
"""
import argparse
import html
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
RN = HERE.parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
W, H = 1290, 2796
TARGETS = [RN / "appstore-connect-info/upload", RN / "google-play-console-info/upload"]

FONT = {
    "ko": '"Apple SD Gothic Neo"',
    "ja": '"Hiragino Sans"',
    "zh-cn": '"PingFang SC"',
    "zh-tw": '"PingFang TC"',
    "ar": '"Geeza Pro"',
    "th": '"Thonburi"',
    "hi": '"Kohinoor Devanagari"',
}

PAGE = """<!doctype html>
<html lang="{lang}" dir="{dir}"><head><meta charset="utf-8"><style>
html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden}}
body{{background:linear-gradient(180deg,#FFFBF0 0%,#FFF1CC 55%,#FDE3A0 100%);
  font-family:{font},-apple-system,"SF Pro Display","Helvetica Neue",sans-serif;}}
h1{{position:absolute;top:150px;left:60px;right:60px;margin:0;text-align:center;
  font-size:118px;line-height:1.16;font-weight:800;letter-spacing:-1px;color:#F29A0E;white-space:pre}}
.phone{{position:absolute;left:84px;top:560px;width:1122px;height:2440px;border-radius:150px;
  background:#1F2430;box-shadow:0 40px 90px rgba(120,80,0,.28)}}
.screen{{position:absolute;left:36px;top:36px;width:1050px;height:2272px;border-radius:118px;overflow:hidden;background:#000}}
.bar{{height:126px;background:{bar};color:{ink};position:relative;font-family:-apple-system,"SF Pro Text",sans-serif}}
.bar .time{{position:absolute;left:110px;top:40px;font-size:46px;font-weight:600;letter-spacing:-.5px}}
.bar .right{{position:absolute;right:92px;top:46px;display:flex;gap:16px;align-items:center}}
.bar svg{{fill:{ink}}}
.screen img{{width:100%;height:2146px;display:block}}
.island{{position:absolute;left:50%;top:30px;width:290px;height:84px;margin-left:-145px;border-radius:42px;background:#000}}
</style></head><body>
<h1 id="t">{caption}</h1>
<div class="phone"><div class="screen">
<div class="bar" dir="ltr"><span class="time">9:41</span><span class="right">
<svg width="48" height="30" viewBox="0 0 48 30"><rect x="0" y="20" width="8" height="10" rx="2"/><rect x="13" y="14" width="8" height="16" rx="2"/><rect x="26" y="7" width="8" height="23" rx="2"/><rect x="39" y="0" width="8" height="30" rx="2"/></svg>
<svg width="42" height="30" viewBox="0 0 42 30"><path d="M21 30l-6-7a8.5 8.5 0 0 1 12 0zM8 16a18 18 0 0 1 26 0l-4 4.5a12 12 0 0 0-18 0zM1 9a27.5 27.5 0 0 1 40 0l-4 4.5a21.5 21.5 0 0 0-32 0z"/></svg>
<svg width="70" height="32" viewBox="0 0 70 32"><rect x="1.5" y="1.5" width="60" height="29" rx="9" fill="none" stroke="{ink}" stroke-width="3" opacity=".45"/><rect x="6" y="6" width="51" height="20" rx="5"/><rect x="64" y="10" width="4.5" height="12" rx="2" opacity=".45"/></svg>
</span></div>
<img src="{img}"><div class="island"></div></div></div>
<script>
// lines never wrap; shrink the headline until the longest line fits the width
const t=document.getElementById('t');let s=118;
while(t.scrollWidth>t.clientWidth&&s>56){{s-=2;t.style.fontSize=s+'px';}}
</script></body></html>"""


def status_bar_colors(capture: Path) -> tuple[str, str]:
    """Bar background continues the page's top edge; ink is black or white for contrast."""
    im = Image.open(capture).convert("RGB")
    strip = im.crop((0, 0, im.width, 6)).resize((1, 1), Image.BOX)
    r, g, b = strip.getpixel((0, 0))
    ink = "#000" if (0.299 * r + 0.587 * g + 0.114 * b) > 150 else "#fff"
    return f"rgb({r},{g},{b})", ink


def render(html_text: str, out: Path, work: Path) -> None:
    page = work / "slide.html"
    page.write_text(html_text, encoding="utf-8")
    subprocess.run(
        [CHROME, "--headless=new", "--hide-scrollbars", "--force-device-scale-factor=1",
         f"--window-size={W},{H}", "--virtual-time-budget=3000", f"--screenshot={out}", page.as_uri()],
        check=True, capture_output=True,
    )
    # ~3 MB -> ~0.8 MB per slide with no visible loss (brew install pngquant)
    subprocess.run(["pngquant", "--quality=80-95", "--speed=1", "--force", "--ext=.png", str(out)], check=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="comma-separated caption languages (e.g. ko,en)")
    args = ap.parse_args()
    cfg = json.loads((HERE / "captions.json").read_text(encoding="utf-8"))
    only = set(args.only.split(",")) if args.only else None
    langs = sorted(set(cfg["uploadLocales"].values()))
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        rendered = {}
        for lang in langs:
            if only and lang not in only:
                continue
            for shot in cfg["shots"]:
                out = work / f"{lang}-{shot['id']}.png"
                capture = HERE / shot["capture"].format(lang=lang)
                bar, ink = status_bar_colors(capture)
                render(PAGE.format(
                    bar=bar, ink=ink,
                    lang=lang, dir="rtl" if lang == "ar" else "ltr", W=W, H=H,
                    font=FONT.get(lang, '"SF Pro Display"'),
                    caption=html.escape(shot["caption"][lang]),
                    img=capture.as_uri(),
                ), out, work)
                rendered[(lang, shot["id"])] = out
            print("rendered", lang)
        for locale, lang in cfg["uploadLocales"].items():
            if only and lang not in only:
                continue
            for target in TARGETS:
                d = target / locale
                d.mkdir(parents=True, exist_ok=True)
                for old in d.glob("*.png"):
                    old.unlink()
                for shot in cfg["shots"]:
                    shutil.copy(rendered[(lang, shot["id"])], d / f"{shot['id']}.png")
        print("done")


if __name__ == "__main__":
    main()
