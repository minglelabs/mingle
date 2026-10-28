#!/usr/bin/env python3
"""Resize branding/hashchat/hashchat-original.png into every app icon the project ships.

Run from the repo root:  python3 branding/hashchat/make-icons.py
Needs Pillow (pip install pillow).
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "branding/hashchat/hashchat-original.png"
RN = ROOT / "mingle-app/rn"

src = Image.open(SRC).convert("RGB")

# Flat background colour of the artwork (median of the border pixels), used to pad the round icons.
edge = [src.getpixel((x, y)) for x in range(0, src.width, 7) for y in (0, src.height - 1)]
edge += [src.getpixel((x, y)) for y in range(0, src.height, 7) for x in (0, src.width - 1)]
BG = tuple(sorted(c[i] for c in edge)[len(edge) // 2] for i in range(3))


def square(size: int) -> Image.Image:
    return src.resize((size, size), Image.LANCZOS)


def save(img: Image.Image, path: Path, mode: str = "RGB") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.convert(mode).save(path, optimize=True)


def round_icon(size: int) -> Image.Image:
    # Shrink the artwork so the hamster's ear stays inside the circle, then cut the circle.
    big = size * 4
    canvas = Image.new("RGB", (big, big), BG)
    inner = int(big * 0.82)
    art = src.resize((inner, inner), Image.LANCZOS)
    canvas.paste(art, ((big - inner) // 2, (big - inner) // 2))
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, big - 1, big - 1), fill=255)
    out = canvas.convert("RGBA")
    out.putalpha(mask)
    return out.resize((size, size), Image.LANCZOS)


# Brand master (1024, RGB)
save(square(1024), ROOT / "branding/hashchat/hashchat.png")

# iOS app icon: icon-<pt>@<n>x.png  ->  pt * n pixels
icon_dir = RN / "ios/mingle/Images.xcassets/AppIcon.appiconset"
for f in sorted(icon_dir.glob("icon-*.png")):
    name = f.stem[len("icon-"):]
    if name == "1024":
        px = 1024
    else:
        pt, scale = name.split("@")
        px = round(float(pt) * int(scale.rstrip("x")))
    save(square(px), f)  # RGB: App Store icons must have no alpha

# iOS launch screen logo (storyboard background is set to BG)
save(square(1024), RN / "ios/mingle/Images.xcassets/LaunchLogo.imageset/launch-logo.png", "RGBA")

# Android legacy launcher icons
for dpi, px in {"m": 48, "h": 72, "xh": 96, "xxh": 144, "xxxh": 192}.items():
    res = RN / f"android/app/src/main/res/mipmap-{dpi}dpi"
    save(square(px), res / "ic_launcher.png", "RGBA")
    round_icon(px).save(res / "ic_launcher_round.png", optimize=True)

# Google Play listing icon
save(square(512), RN / "google-play-console-info/assets/icon-512.png", "RGBA")

# Web
save(square(1024), ROOT / "mingle-app/public/mingle-icon.png", "RGBA")
for fav in ("mingle-app/src/app/favicon.ico", "mingle-landing/public/favicon.ico"):
    # these files are PNG data under an .ico name (as before), so Next.js/browsers keep working
    path = ROOT / fav
    square(512).convert("RGBA").save(path, format="PNG", optimize=True)

print("background colour:", "#%02X%02X%02X" % BG, "| storyboard rgb:", tuple(round(c / 255, 6) for c in BG))
