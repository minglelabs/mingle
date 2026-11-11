#!/usr/bin/env python3
"""Writes the two hand-written blog articles in every site language.

The English pages stay the source: public/legal/blogs/en/<slug>.html (kept out of the public
path so a ?lang= rewrite on /blogs/<slug> can fire; a file there would be served first). Their text is
cut into leaf blocks (headings, paragraphs, list items, table cells...) in document
order; scripts/legal-blog-i18n/articles/<slug>.<lang>.json holds each block's
translated inner HTML under the same index, plus the page's title and descriptions.
This script puts those back into a copy of the English page and writes
public/legal/blogs/<lang>/<slug>.html. Every page, English included, gets the site
header, footer, language picker and hreflang links from build-legal-blog.mjs.

To translate a changed article, print its blocks with --export, translate the
values (keys and HTML tags unchanged), and save them as <slug>.<lang>.json.

  pip install beautifulsoup4
  python3 mingle-app/scripts/localize-legal-blog-articles.py            # write pages
  python3 mingle-app/scripts/localize-legal-blog-articles.py --export   # print the English blocks
"""
import json
import re
import subprocess
import sys
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString

HERE = Path(__file__).resolve().parent
BLOGS = HERE.parent / "public" / "legal" / "blogs"
I18N = HERE / "legal-blog-i18n" / "articles"
SITE = "https://hashchat.minglelabs.app"
SLUGS = ["hashchat-social-network", "ai-translators-comparison"]
LANGS = ["en", "ko", "ja", "zh-cn", "zh-tw", "fr", "de", "es", "pt", "it", "ru", "ar", "hi", "th", "vi"]
LEAF = {"h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "td", "th", "figcaption", "caption", "summary", "dt", "dd", "blockquote", "button"}


def with_lang(path, lang):
    if lang == "en":
        return path
    base, _, frag = path.partition("#")
    return f"{base}{'&' if '?' in base else '?'}lang={lang}" + (f"#{frag}" if frag else "")


def has_text(el):
    return any(isinstance(c, NavigableString) and c.strip() for c in el.descendants)


def blocks(soup):
    """Leaf text blocks of the page outside the site header, scripts and styles, in order."""
    out = []

    def walk(el):
        for child in el.children:
            if isinstance(child, NavigableString):
                continue
            if child.name in ("script", "style", "svg", "select", "option") or (
                child.name == "header" and "site-header" in (child.get("class") or [])
            ):
                continue
            inner_blocks = child.find_all(LEAF)
            if child.name in LEAF and not inner_blocks:
                if has_text(child):
                    out.append(child)
                continue
            if not inner_blocks and has_text(child):
                out.append(child)
                continue
            if inner_blocks and any(isinstance(c, NavigableString) and c.strip() for c in child.children):
                out.extend(c for c in child.children if isinstance(c, NavigableString) and c.strip())
            walk(child)

    walk(soup.body)
    return out


def inner(el):
    return str(el) if isinstance(el, NavigableString) else el.decode_contents()


def set_inner(el, html):
    if isinstance(el, NavigableString):
        el.replace_with(NavigableString(html))
        return
    el.clear()
    for c in list(BeautifulSoup(html, "html.parser").contents):
        el.append(c)


def chrome(lang):
    out = subprocess.run(["node", str(HERE / "build-legal-blog.mjs"), "--chrome", lang], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def replace(old, html):
    old.replace_with(BeautifulSoup(html, "html.parser"))


def page(slug, lang, source):
    soup = BeautifulSoup(source, "html.parser")
    if lang != "en":
        tr = json.loads((I18N / f"{slug}.{lang}.json").read_text(encoding="utf-8"))
        for i, el in enumerate(blocks(soup)):
            if str(i) in tr["blocks"]:
                set_inner(el, tr["blocks"][str(i)])
        head = tr["head"]
        soup.title.string = head["title"]
        for attrs, key in (({"name": "description"}, "description"), ({"property": "og:description"}, "ogDescription"),
                           ({"name": "twitter:description"}, "ogDescription"), ({"property": "og:title"}, "title"),
                           ({"name": "twitter:title"}, "title")):
            tag = soup.find("meta", attrs=attrs)
            if tag is not None and head.get(key):
                tag["content"] = head[key]
        for ld in soup.find_all("script", attrs={"type": "application/ld+json"}):
            try:
                data = json.loads(ld.string)
            except (TypeError, ValueError):
                continue
            if isinstance(data, dict):
                data["headline"] = head["title"]
                data["description"] = head["description"]
                data["inLanguage"] = lang
                data["mainEntityOfPage"] = SITE + with_lang(f"/blogs/{slug}", lang)
                ld.string = "\n      " + json.dumps(data, ensure_ascii=False) + "\n    "
        # site links keep the reader's language
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if href.startswith("/") and not href.startswith("/assets") and "lang=" not in href:
                a["href"] = with_lang(href, lang)
    soup.html["lang"] = lang
    if lang == "ar":
        soup.html["dir"] = "rtl"
    url = SITE + with_lang(f"/blogs/{slug}", lang)
    for tag in soup.find_all("link", attrs={"rel": "canonical"}):
        tag["href"] = url
    for tag in soup.find_all("meta", attrs={"property": "og:url"}):
        tag["content"] = url
    for tag in soup.find_all("link", attrs={"rel": "alternate"}):
        tag.decompose()
    c = chrome(lang)
    soup.find("link", attrs={"rel": "canonical"}).insert_after(BeautifulSoup("\n" + c["alternates"][slug], "html.parser"))
    replace(soup.find("header", class_="site-header"), c["header"].strip())
    replace(soup.find("footer", class_="footer"), c["footer"].strip())
    picker = [s for s in soup.find_all("script") if s.string and "blog-language" in s.string]
    if picker:
        replace(picker[-1], c["script"].strip())
    return re.sub(r"\n{3,}", "\n\n", str(soup))


def main():
    if "--export" in sys.argv:
        for slug in SLUGS:
            soup = BeautifulSoup((BLOGS / "en" / f"{slug}.html").read_text(encoding="utf-8"), "html.parser")
            print(json.dumps({slug: {str(i): inner(b).strip() for i, b in enumerate(blocks(soup))}}, ensure_ascii=False, indent=1))
        return
    for slug in SLUGS:
        source = (BLOGS / "en" / f"{slug}.html").read_text(encoding="utf-8")
        for lang in LANGS:
            out = BLOGS / lang / f"{slug}.html"
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(page(slug, lang, source), encoding="utf-8")
            print("wrote", out.relative_to(BLOGS.parent))


if __name__ == "__main__":
    main()
