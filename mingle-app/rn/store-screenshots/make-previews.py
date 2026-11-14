"""Builds previews/<nn>-<lang>.jpg: one sheet per language with its slides side by side, from the uploaded PNGs."""
import json
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
UPLOAD = HERE.parent / "appstore-connect-info/upload"
HEIGHT = 778
# Numbered in this order (Korean and Japanese first, as before).
ORDER = ["ko", "en", "ja", "zh-cn", "zh-tw", "ar", "de", "es", "fr", "hi", "it", "pt", "ru", "th", "vi"]


def main() -> None:
    cfg = json.loads((HERE / "captions.json").read_text())
    locale_of = {lang: locale for locale, lang in cfg["uploadLocales"].items()}
    ids = [shot["id"] for shot in cfg["shots"]]
    for old in (HERE / "previews").glob("*.jpg"):
        old.unlink()
    langs = [lang for lang in ORDER if lang in locale_of] + sorted(set(locale_of) - set(ORDER))
    for index, lang in enumerate(langs):
        slides = [Image.open(UPLOAD / locale_of[lang] / f"{shot}.png").convert("RGB") for shot in ids]
        slides = [im.resize((round(im.width * HEIGHT / im.height), HEIGHT)) for im in slides]
        sheet = Image.new("RGB", (sum(im.width for im in slides), HEIGHT), "white")
        x = 0
        for im in slides:
            sheet.paste(im, (x, 0))
            x += im.width
        sheet.save(HERE / "previews" / f"{index + 1:02d}-{lang}.jpg", quality=82)
        print("preview", lang)


if __name__ == "__main__":
    main()
