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


HERO_PAGE = """<!doctype html>
<html lang="{lang}" dir="{dir}"><head><meta charset="utf-8"><style>
html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden}}
body{{background:url("{img}") center/cover no-repeat;font-family:{font},-apple-system,"SF Pro Display","Helvetica Neue",sans-serif}}
body::before{{content:"";position:absolute;inset:0 0 auto 0;height:900px;background:linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,0))}}
h1{{position:absolute;top:210px;left:60px;right:60px;margin:0;text-align:center;font-size:132px;line-height:1.14;font-weight:800;
  letter-spacing:-1px;color:#fff;white-space:pre;text-shadow:0 6px 30px rgba(0,0,0,.35)}}
</style></head><body><h1 id="t">{caption}</h1>
<script>
const t=document.getElementById('t');let s=132;
while(t.scrollWidth>t.clientWidth&&s>56){{s-=2;t.style.fontSize=s+'px';}}
</script></body></html>"""


# 04: a composed scene. Two photos fill the slide, one above, one below,
# blending into each other (photos with no words in them, so every language
# shares them): the places people book abroad. The phone leans in on its screen
# from capture.mjs, and the conversation's lines float beside it as the app's
# bubbles: each speaker's own words, then the other's language under them. Mine
# are tinted like the app's own bubbles. "lines" names the list in dm.json;
# "cardsTop" keeps the cards under the call panel.
BOOKING_PAGE = """<!doctype html>
<html lang="{lang}" dir="{dir}"><head><meta charset="utf-8"><style>
html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden}}
body{{background:#2A1A0C url("{bg}") center top/{W}px auto no-repeat;font-family:{font},-apple-system,"SF Pro Display","Helvetica Neue",sans-serif;perspective:2600px}}
.below{{position:absolute;left:0;right:0;bottom:0;height:1500px;background:url("{bg2}") center/cover no-repeat;
  -webkit-mask-image:linear-gradient(180deg,transparent 0,#000 420px);mask-image:linear-gradient(180deg,transparent 0,#000 420px);z-index:0}}
body::before{{content:"";position:absolute;inset:0;z-index:1;background:
  linear-gradient(180deg,rgba(24,14,4,.62) 0%,rgba(24,14,4,.30) 24%,rgba(24,14,4,0) 40%,rgba(24,14,4,0) 70%,rgba(24,14,4,.38) 100%)}}
h1{{position:absolute;top:170px;left:60px;right:60px;margin:0;text-align:center;font-size:118px;line-height:1.16;font-weight:800;
  letter-spacing:-1px;color:#fff;white-space:pre;text-shadow:0 6px 30px rgba(0,0,0,.45);z-index:4}}
.phone{{position:absolute;left:250px;top:610px;width:1122px;height:2440px;border-radius:150px;background:#1F2430;
  transform-origin:0 0;transform:scale(.66) rotateY(-14deg) rotateZ(5deg);
  box-shadow:-40px 60px 120px rgba(0,0,0,.45),inset 0 0 0 6px #343A48;z-index:2}}
.screen{{position:absolute;left:36px;top:36px;width:1050px;height:2272px;border-radius:118px;overflow:hidden;background:#000}}
.bar{{height:126px;background:{bar};color:{ink};position:relative;font-family:-apple-system,"SF Pro Text",sans-serif}}
.bar .time{{position:absolute;left:110px;top:40px;font-size:46px;font-weight:600}}
.screen img{{width:100%;height:2146px;display:block}}
.island{{position:absolute;left:50%;top:30px;width:290px;height:84px;margin-left:-145px;border-radius:42px;background:#000}}
.cards{{position:absolute;inset:0;z-index:3}}
.card{{position:absolute;width:680px;box-sizing:border-box;padding:26px 32px;border-radius:40px;background:rgba(255,255,255,.97);
  border:2px solid #ECE7DD;box-shadow:0 34px 70px rgba(30,18,4,.38),0 6px 16px rgba(30,18,4,.16)}}
.card.me{{background:rgba(255,248,230,.98);border-color:#F6E3B0}}
.card.l{{left:40px;transform:rotateY(10deg) rotateZ(-2.5deg)}}
.card.r{{right:40px;transform:rotateY(-10deg) rotateZ(2deg)}}
.row{{display:flex;gap:22px;align-items:flex-start}}
.row + .row{{margin-top:16px;padding-top:16px;border-top:2px solid rgba(0,0,0,.07)}}
.flag{{position:relative;flex:none;font-size:40px;line-height:1.15}}
.flag i{{position:absolute;right:-14px;top:-14px;font-style:normal;font-weight:900;font-size:36px;color:#111}}
.flag.mine{{border-bottom:6px solid #F5A400}}
.text{{flex:1;min-width:0;font-size:var(--fs,46px);line-height:1.32;color:#111;font-weight:600}}
.tr .text{{font-size:calc(var(--fs,46px) * .86);font-weight:500;color:#444}}
</style></head><body>
<div class="below"></div>
<h1 id="t">{caption}</h1>
<div class="phone"><div class="screen"><div class="bar" dir="ltr"><span class="time">9:41</span></div>
<img src="{img}"><div class="island"></div></div></div>
<div class="cards">{cards}</div>
<script>
const t=document.getElementById('t');let s=118;
while(t.scrollWidth>t.clientWidth&&s>56){{s-=2;t.style.fontSize=s+'px';}}
// the four cards stack down the slide; long lines shrink until they fit their band
const cards=[...document.querySelectorAll('.card')];
// under the phone's call panel, so its seats and buttons stay in view
const top0={top0}, band={band}, gap=26;
cards.forEach((c,i)=>{{let fs=40;c.style.setProperty('--fs',fs+'px');
  while(c.offsetHeight>band-gap&&fs>26){{fs-=2;c.style.setProperty('--fs',fs+'px');}}
  c.style.top=(top0+i*band)+'px';}});
</script></body></html>"""


# 02, 03: the app screen stays the subject. The phone stands upright and full size
# as on the plain slides, over a background that carries slide 01's photo on
# across the strip (make-backdrop.py), with 01's top shade so the white headline
# reads the same and the seams meet.
PHOTO_PAGE = """<!doctype html>
<html lang="{lang}" dir="{dir}"><head><meta charset="utf-8"><style>
html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden}}
body{{background:#1A140E url("{bg}") center/cover no-repeat;font-family:{font},-apple-system,"SF Pro Display","Helvetica Neue",sans-serif}}
body::before{{content:"";position:absolute;inset:0 0 auto 0;height:900px;background:linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,0))}}
h1{{position:absolute;top:150px;left:60px;right:60px;margin:0;text-align:center;font-size:118px;line-height:1.16;font-weight:800;
  letter-spacing:-1px;color:#fff;white-space:pre;text-shadow:0 6px 30px rgba(0,0,0,.35)}}
.phone{{position:absolute;left:84px;top:560px;width:1122px;height:2440px;border-radius:150px;
  background:#1F2430;box-shadow:0 50px 120px rgba(0,0,0,.45),inset 0 0 0 6px #343A48}}
.screen{{position:absolute;left:36px;top:36px;width:1050px;height:2272px;border-radius:118px;overflow:hidden;background:#000}}
.bar{{height:126px;background:{bar};color:{ink};position:relative;font-family:-apple-system,"SF Pro Text",sans-serif}}
.bar .time{{position:absolute;left:110px;top:40px;font-size:46px;font-weight:600;letter-spacing:-.5px}}
.screen img{{width:100%;height:2146px;display:block}}
.island{{position:absolute;left:50%;top:30px;width:290px;height:84px;margin-left:-145px;border-radius:42px;background:#000}}
</style></head><body>
<h1 id="t">{caption}</h1>
<div class="phone"><div class="screen"><div class="bar" dir="ltr"><span class="time">9:41</span></div>
<img src="{img}"><div class="island"></div></div></div>
<script>
const t=document.getElementById('t');let s=118;
while(t.scrollWidth>t.clientWidth&&s>56){{s-=2;t.style.fontSize=s+'px';}}
</script></body></html>"""


def scene_cards(lang: str, lines: list, chat: dict) -> str:
    partner = chat["partners"][lang][0]
    out = []
    for i, line in enumerate(lines):
        mine = line["by"] == "me"
        order = [lang, partner] if mine else [partner, lang]
        rows = []
        for k, code in enumerate(order):
            flag_class = "flag mine" if code == lang else "flag"
            quote = "<i>”</i>" if k == 0 else ""
            rows.append(f'<div class="row{" tr" if k else ""}"><span class="{flag_class}">{chat["flags"][code]}{quote}</span>'
                        f'<span class="text" dir="auto">{html.escape(line["text"][code])}</span></div>')
        # mine on the right, the shop's on the left (mirrored for Arabic)
        side = ("r" if mine else "l") if lang != "ar" else ("l" if mine else "r")
        out.append(f'<div class="card {side}{" me" if mine else ""}">{"".join(rows)}</div>')
    return "".join(out)


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
    cmd = [CHROME, "--headless=new", "--hide-scrollbars", "--force-device-scale-factor=1",
           f"--window-size={W},{H}", "--virtual-time-budget=3000", f"--screenshot={out}", page.as_uri()]
    # headless Chrome sometimes exits non-zero at teardown after writing the file,
    # and now and then writes nothing; trust the file, and try again without one
    for attempt in range(3):
        out.unlink(missing_ok=True)
        subprocess.run(cmd, capture_output=True)
        if out.exists() and out.stat().st_size > 0:
            break
    else:
        raise RuntimeError(f"Chrome could not render {out.name}")
    # ~3 MB -> ~0.8 MB per slide with no visible loss (brew install pngquant)
    subprocess.run(["pngquant", "--quality=80-95", "--speed=1", "--force", "--ext=.png", str(out)], check=True)


# 08: a statement slide with no phone: the headline, a large "no entry" badge,
# the three kinds of users who are banned, and a line on how reporting works.
STATEMENT_PAGE = """<!doctype html>
<html lang="{lang}" dir="{dir}"><head><meta charset="utf-8"><style>
html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden}}
body{{background:linear-gradient(180deg,#FFFBF0 0%,#FFF1CC 55%,#FDE3A0 100%);
  font-family:{font},-apple-system,"SF Pro Display","Helvetica Neue",sans-serif;color:#1F2430}}
h1{{position:absolute;top:220px;left:60px;right:60px;margin:0;text-align:center;
  font-size:112px;line-height:1.2;font-weight:800;letter-spacing:-1px;color:#1F2430;white-space:pre}}
.badge{{position:absolute;left:50%;top:760px;width:760px;height:760px;margin-left:-380px}}
.points{{position:absolute;left:80px;right:80px;top:1660px;display:flex;flex-direction:column;gap:44px;align-items:center}}
.point{{display:flex;align-items:center;justify-content:center;gap:36px;min-width:760px;padding:34px 56px;border-radius:999px;background:#fff;
  box-shadow:0 18px 40px rgba(120,80,0,.14);font-size:84px;font-weight:800}}
.point s{{text-decoration:none;position:relative}}
.point s::after{{content:"";position:absolute;left:-8px;right:-8px;top:52%;height:12px;border-radius:6px;background:#EF4444}}
.x{{flex:none;width:92px;height:92px;border-radius:50%;background:#EF4444;color:#fff;display:flex;align-items:center;justify-content:center;font-size:62px;font-weight:900}}
.note{{position:absolute;left:90px;right:90px;bottom:250px;text-align:center;font-size:60px;line-height:1.35;font-weight:700;color:#7A5A1A}}
</style></head><body>
<h1 id="t">{caption}</h1>
<svg class="badge" viewBox="0 0 200 200" aria-hidden="true">
  <path d="M100 14 L170 40 V96 C170 140 140 172 100 188 C60 172 30 140 30 96 V40 Z" fill="#F29A0E"/>
  <path d="M100 30 L156 51 V96 C156 131 133 157 100 171 C67 157 44 131 44 96 V51 Z" fill="#FFF8E6"/>
  <circle cx="100" cy="88" r="20" fill="#1F2430"/>
  <path d="M64 146 C66 120 82 110 100 110 C118 110 134 120 136 146 Z" fill="#1F2430"/>
  <circle cx="100" cy="104" r="62" fill="none" stroke="#EF4444" stroke-width="13"/>
  <line x1="57" y1="61" x2="143" y2="147" stroke="#EF4444" stroke-width="13" stroke-linecap="round"/>
</svg>
<div class="points">{points}</div>
<div class="note">{note}</div>
<script>
const t=document.getElementById('t');let s=112;
while(t.scrollWidth>t.clientWidth&&s>56){{s-=2;t.style.fontSize=s+'px';}}
</script></body></html>"""


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
        dm = json.loads((HERE / "dm.json").read_text(encoding="utf-8"))
        chat = json.loads((HERE / "chat.json").read_text(encoding="utf-8"))
        for lang in langs:
            if only and lang not in only:
                continue
            for shot in cfg["shots"]:
                out = work / f"{lang}-{shot['id']}.png"
                if shot.get("fullBleed"):
                    render(HERO_PAGE.format(
                        lang=lang, dir="rtl" if lang == "ar" else "ltr", W=W, H=H,
                        font=FONT.get(lang, '"SF Pro Display"'),
                        caption=html.escape(shot["caption"][lang]),
                        img=(HERE / shot["fullBleed"]).as_uri(),
                    ), out, work)
                    rendered[(lang, shot["id"])] = out
                    continue
                if shot.get("statement"):
                    statement = shot["statement"]
                    points = "".join(
                        f'<div class="point"><span class="x">✕</span><s>{html.escape(word)}</s></div>'
                        for word in statement["points"][lang]
                    )
                    render(STATEMENT_PAGE.format(
                        lang=lang, dir="rtl" if lang == "ar" else "ltr", W=W, H=H,
                        font=FONT.get(lang, '"SF Pro Display"'),
                        caption=html.escape(shot["caption"][lang]),
                        points=points,
                        note=html.escape(statement["note"][lang]),
                    ), out, work)
                    rendered[(lang, shot["id"])] = out
                    continue
                capture = HERE / shot["capture"].format(lang=lang)
                bar, ink = status_bar_colors(capture)
                if shot.get("photo"):
                    render(PHOTO_PAGE.format(
                        bar=bar, ink=ink, lang=lang, dir="rtl" if lang == "ar" else "ltr", W=W, H=H,
                        font=FONT.get(lang, '"SF Pro Display"'),
                        caption=html.escape(shot["caption"][lang]),
                        bg=(HERE / shot["photo"]).as_uri(),
                        img=capture.as_uri(),
                    ), out, work)
                    rendered[(lang, shot["id"])] = out
                    continue
                if shot.get("scene"):
                    scene = shot["scene"]
                    # A viewer can have its own lines (the Korean viewer talks with a foreign friend).
                    lines = (dm.get("viewerOverrides", {}).get(lang, {}).get(scene["lines"]) or dm[scene["lines"]])[: scene.get("count", 4)]
                    band = scene.get("band", 370)
                    render(BOOKING_PAGE.format(
                        bar=bar, ink=ink, lang=lang, dir="rtl" if lang == "ar" else "ltr", W=W, H=H,
                        font=FONT.get(lang, '"SF Pro Display"'),
                        caption=html.escape(shot["caption"][lang]),
                        bg=(HERE / scene["background"][0]).as_uri(),
                        bg2=(HERE / scene["background"][1]).as_uri(),
                        img=capture.as_uri(),
                        cards=scene_cards(lang, lines, chat),
                        top0=scene.get("cardsTop", 1290), band=band,
                    ), out, work)
                    rendered[(lang, shot["id"])] = out
                    continue
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
