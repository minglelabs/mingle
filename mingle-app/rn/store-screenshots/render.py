#!/usr/bin/env python3
"""Render the App Store / Google Play screenshot set from captions.json.

Each slide is an HTML page (headline + phone frame around a real device capture)
rendered by headless Chrome, so every script (Arabic, Thai, Hindi, CJK) is shaped
by the browser. Output replaces the PNGs in
  appstore-connect-info/upload/<locale>/ and google-play-console-info/upload/<locale>/

Needs Google Chrome and pngquant. Run from anywhere:  python3 mingle-app/rn/store-screenshots/render.py [--only ko,en]
Captures are 1170x2532 iPhone screenshots in captures/ (taken on a device via Appium).
"""
import argparse
import html
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

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
.screen img{{width:100%;height:100%;display:block}}
.island{{position:absolute;left:50%;top:30px;width:290px;height:84px;margin-left:-145px;border-radius:42px;background:#000}}
</style></head><body>
<h1 id="t">{caption}</h1>
<div class="phone"><div class="screen"><img src="{img}"><div class="island"></div></div></div>
<script>
// lines never wrap; shrink the headline until the longest line fits the width
const t=document.getElementById('t');let s=118;
while(t.scrollWidth>t.clientWidth&&s>56){{s-=2;t.style.fontSize=s+'px';}}
</script></body></html>"""


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
                render(PAGE.format(
                    lang=lang, dir="rtl" if lang == "ar" else "ltr", W=W, H=H,
                    font=FONT.get(lang, '"SF Pro Display"'),
                    caption=html.escape(shot["caption"][lang]),
                    img=(HERE / shot["capture"]).as_uri(),
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
