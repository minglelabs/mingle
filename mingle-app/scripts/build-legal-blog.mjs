#!/usr/bin/env node
// Builds the HashChat blog index and the slide-deck posts in public/legal/blogs, in 15 languages.
//
// English is the default. Each language's pages live in blogs/<lang>/ and the rewrites in
// public/legal/vercel.json serve them at /blogs/<slug>?lang=<lang>, so each language has its
// own static <head> (title, OG image) for link previews. Nothing may sit at
// blogs/<slug>.html itself except the two hand-written English articles: Vercel serves a
// matching file before any rewrite.
//
// The words live in scripts/legal-blog-i18n/<lang>.json (ui, author, decks, articles).
// The two articles' translations are made by scripts/localize-legal-blog-articles.py,
// which takes the site header and footer from `--chrome <lang>` here.
//
//   node mingle-app/scripts/build-legal-blog.mjs

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "public", "legal");
const SITE = "https://hashchat.minglelabs.app";

export const LANGS = [
  { code: "en", name: "English", flag: "🇺🇸", og: "en_US" },
  { code: "ko", name: "한국어", flag: "🇰🇷", og: "ko_KR" },
  { code: "ja", name: "日本語", flag: "🇯🇵", og: "ja_JP" },
  { code: "zh-cn", name: "简体中文", flag: "🇨🇳", og: "zh_CN" },
  { code: "zh-tw", name: "繁體中文", flag: "🇹🇼", og: "zh_TW" },
  { code: "fr", name: "Français", flag: "🇫🇷", og: "fr_FR" },
  { code: "de", name: "Deutsch", flag: "🇩🇪", og: "de_DE" },
  { code: "es", name: "Español", flag: "🇪🇸", og: "es_ES" },
  { code: "pt", name: "Português", flag: "🇧🇷", og: "pt_BR" },
  { code: "it", name: "Italiano", flag: "🇮🇹", og: "it_IT" },
  { code: "ru", name: "Русский", flag: "🇷🇺", og: "ru_RU" },
  { code: "ar", name: "العربية", flag: "🇸🇦", og: "ar_AR" },
  { code: "hi", name: "हिन्दी", flag: "🇮🇳", og: "hi_IN" },
  { code: "th", name: "ไทย", flag: "🇹🇭", og: "th_TH" },
  { code: "vi", name: "Tiếng Việt", flag: "🇻🇳", og: "vi_VN" },
];
const T = Object.fromEntries(LANGS.map(({ code }) => [code, JSON.parse(readFileSync(join(HERE, "legal-blog-i18n", `${code}.json`), "utf8"))]));
// the slide decks themselves exist in English and Korean only
const DECK_LANGS = new Set(["en", "ko"]);

const esc = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const withLang = (path, lang) => {
  if (lang === "en") return path;
  const [base, hash] = path.split("#");
  return `${base}${base.includes("?") ? "&" : "?"}lang=${lang}${hash ? `#${hash}` : ""}`;
};

const DECKS = [
  { slug: "ai-wrapper-business", deck: "/presentations/ai-beyond-wrapper-business", date: "2026-11-05",
    og: { en: "/presentations/assets/ai-beyond-wrapper-og-en.png?v=3", ko: "/presentations/assets/ai-beyond-wrapper-og.png?v=3" } },
  { slug: "ai-wrapper-business-surfers-3rd", deck: "/presentations/surfers-3rd-ai-wrapper", date: "2026-08-12",
    og: { en: "/presentations/assets/surfers-logo.png", ko: "/presentations/assets/surfers-logo.png" } },
  { slug: "hashchat-pitch-deck", deck: "/xr", date: "2026-09-01",
    og: { en: "/assets/og-image.png?v=20260416-2", ko: "/assets/og-image.png?v=20260416-2" } },
  { slug: "hashchat-pitch-deck-short", deck: "/xr-short", date: "2026-09-02",
    og: { en: "/assets/og-image.png?v=20260416-2", ko: "/assets/og-image.png?v=20260416-2" } },
  { slug: "virtually-deck", deck: "/xr-virtually", date: "2026-09-13",
    og: { en: "/assets/virtually-vtuber-cover.png", ko: "/assets/virtually-vtuber-cover.png" } },
];
const ogOf = (post, lang) => post.og[lang] ?? post.og.en;

// Every slide's words as plain HTML text under the deck, so readers, search engines and AI
// assistants get the content without running the deck. Made by scripts/extract-deck-text.mjs.
const SLIDE_TEXT_TITLE = {
  en: "Slide text", ko: "슬라이드 내용", ja: "スライドの内容", "zh-cn": "幻灯片内容", "zh-tw": "投影片內容",
  fr: "Texte des diapositives", de: "Folientext", es: "Texto de las diapositivas", pt: "Texto dos slides",
  it: "Testo delle slide", ru: "Текст слайдов", ar: "نص الشرائح", hi: "स्लाइड का पाठ", th: "ข้อความในสไลด์",
  vi: "Nội dung các trang trình bày",
};
const deckText = (slug, lang) =>
  JSON.parse(readFileSync(join(HERE, "legal-blog-i18n", "decks", `${slug}.${DECK_LANGS.has(lang) ? lang : "en"}.json`), "utf8"));

function slideTextSection(post, lang) {
  const slides = deckText(post.slug, lang);
  const t = T[lang].ui;
  const note = DECK_LANGS.has(lang) || !t.deckLanguageNote ? "" : `\n            <p class="deck-transcript-note">${esc(t.deckLanguageNote)}</p>`;
  const items = slides.map((s, i) => {
    const lines = s.text ? `\n                <p>${s.text.split("\n").map(esc).join("<br />")}</p>` : "";
    return `              <li>\n                <h3><span>${i + 1}.</span> ${esc(s.title)}</h3>${lines}\n              </li>`;
  });
  return `        <section class="deck-transcript" aria-labelledby="deck-transcript-title">
          <div class="section-inner">
            <details>
              <summary><h2 id="deck-transcript-title">${esc(SLIDE_TEXT_TITLE[lang] ?? SLIDE_TEXT_TITLE.en)}</h2></summary>${note}
            <ol${DECK_LANGS.has(lang) ? "" : ' lang="en"'}>
${items.join("\n")}
            </ol>
            </details>
          </div>
        </section>`;
}

// Hand-written English articles (blogs/<slug>.html); their translations sit in blogs/<lang>/<slug>.html.
const ARTICLES = [
  { slug: "hashchat-social-network", date: "2026-11-02",
    logos: ["logo-mingle.png", "logo-line.png", "logo-wechat.jpg", "logo-hellotalk.png", "logo-instagram.png", "logo-discord.png"] },
  { slug: "ai-translators-comparison", date: "2026-04-20",
    logos: ["logo-mingle.png", "logo-google-translate.jpg", "logo-apple-translate.jpg", "logo-microsoft-translator.png", "logo-papago.jpg", "logo-deepl.png"] },
];

export function siteHeader(lang, current) {
  const t = T[lang].ui.nav;
  const link = (href, label, extra = "") => `<a${extra} href="${esc(withLang(href, lang))}">${esc(label)}</a>`;
  const options = LANGS.map(
    (l) => `              <option value="${l.code}"${l.code === lang ? " selected" : ""}>${l.flag} ${esc(l.name)}</option>`,
  ).join("\n");
  return `    <header class="site-header">
      <nav class="nav" aria-label="HashChat site navigation">
        <a class="brand" href="${esc(withLang("/", lang))}" aria-label="HashChat home">
          <img src="/assets/site/hashchat-icon.png" alt="" />
          <span>HashChat</span>
        </a>
        <div class="nav-actions">
          <div class="nav-links">
            ${link("/#how", t.how)}
            ${link("/#features", t.features)}
            ${link("/#translate", t.translate)}
            ${link("/#uses", t.uses)}
            ${link("/blogs", t.blog, current === "blog" ? ' class="nav-legal is-current" aria-current="page"' : ' class="nav-legal"')}
            ${link("/legal", t.legal, ' class="nav-legal"')}
          </div>
          <label class="language-picker">
            <span aria-hidden="true">🌐</span>
            <select id="blog-language" aria-label="Language">
${options}
            </select>
          </label>
        </div>
      </nav>
    </header>`;
}

// Keeps the picker in step with ?lang= and switches pages on change.
export const LANGUAGE_SCRIPT = `    <script>
      (function () {
        var select = document.getElementById("blog-language");
        if (!select) return;
        select.addEventListener("change", function () {
          var url = new URL(window.location.href);
          if (select.value === "en") url.searchParams.delete("lang");
          else url.searchParams.set("lang", select.value);
          window.location.href = url.toString();
        });
      })();
    </script>`;

export function footer(lang) {
  const t = T[lang].ui;
  return `    <footer class="footer">
      <div class="footer-inner">
        <span>${esc(t.footerCopy)} ${esc(t.footerRenamed)}</span>
        <div class="footer-links">
          <a href="${esc(withLang("/blogs", lang))}">${esc(t.nav.blog)}</a>
          <a href="/privacy-policy">${esc(t.privacy)}</a>
          <a href="/terms-of-use">${esc(t.terms)}</a>
          <a href="/legal">Legal</a>
        </div>
      </div>
    </footer>`;
}

export function alternates(path) {
  return [
    ...LANGS.map((l) => `    <link rel="alternate" hreflang="${l.code}" href="${esc(SITE + withLang(path, l.code))}" />`),
    `    <link rel="alternate" hreflang="x-default" href="${esc(SITE + path)}" />`,
  ].join("\n");
}

function head({ lang, title, description, path, image, type = "website", extra = "" }) {
  const url = SITE + withLang(path, lang);
  const imageUrl = image.startsWith("http") ? image : SITE + image;
  const og = LANGS.find((l) => l.code === lang).og;
  return `<!doctype html>
<html lang="${lang}"${lang === "ar" ? ' dir="rtl"' : ""}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <link rel="canonical" href="${esc(url)}" />
${alternates(path)}
    <meta property="og:site_name" content="HashChat" />
    <meta property="og:locale" content="${og}" />
    <meta property="og:type" content="${type}" />
    <meta property="og:url" content="${esc(url)}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:image" content="${esc(imageUrl)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${esc(imageUrl)}" />
    <link rel="icon" href="/assets/site/hashchat-icon.png" />
    <link rel="stylesheet" href="/assets/blog.css" />
    <link rel="stylesheet" href="/assets/site-header.css" />
${extra}  </head>`;
}

function deckPost(post, lang) {
  const t = T[lang].ui;
  const c = T[lang].decks[post.slug];
  const path = `/blogs/${post.slug}`;
  const deckUrl = DECK_LANGS.has(lang) ? withLang(post.deck, lang) : post.deck;
  const ld = {
    "@context": "https://schema.org",
    "@type": "PresentationDigitalDocument",
    name: c.title,
    description: c.description,
    inLanguage: lang,
    datePublished: post.date,
    url: SITE + withLang(path, lang),
    image: SITE + ogOf(post, lang),
    author: { "@type": "Person", name: lang === "ko" ? "남형걸" : "Hyeongkeol Nam" },
    publisher: { "@type": "Organization", name: "Mingle Labs", url: "https://minglelabs.app/" },
  };
  const extra = `    <script type="application/ld+json">${JSON.stringify(ld)}</script>\n`;
  const note = DECK_LANGS.has(lang) || !t.deckLanguageNote ? "" : `\n              <span>${esc(t.deckLanguageNote)}</span>`;
  return `${head({ lang, title: `${c.title} - HashChat Blog`, description: c.description, path, image: ogOf(post, lang), type: "article", extra })}
  <body>
${siteHeader(lang, "blog")}

    <main>
      <article>
        <section class="deck-post-hero">
          <div class="section-inner">
            <p class="eyebrow">${esc(c.kind)} · ${esc(t.deckLabel)}</p>
            <h1>${esc(c.title)}</h1>
            <p class="deck-post-meta">${esc(T[lang].author)} · ${esc(c.dateLabel)}</p>
            <p class="deck-post-lede">${esc(c.description)}</p>
          </div>
        </section>
        <section aria-label="${esc(t.deckLabel)}">
          <div class="section-inner">
            <div class="deck-frame">
              <iframe
                id="deck-frame"
                src="${esc(deckUrl)}"
                title="${esc(c.title)}"
                loading="lazy"
                allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
                allowfullscreen
              ></iframe>
              <button class="deck-shield" id="deck-shield" type="button" aria-controls="deck-frame">
                <span>${esc(t.activate)}</span>
              </button>
            </div>
            <div class="deck-actions">
              <a href="${esc(deckUrl)}" target="_blank" rel="noopener">${esc(t.fullscreen)} ↗</a>${note}
              <span>${esc(t.keyHint)}</span>
            </div>
          </div>
        </section>
        <section class="deck-post-body">
          <div class="section-inner">
${c.body.map((p) => `            <p>${esc(p)}</p>`).join("\n")}
          </div>
        </section>
${slideTextSection(post, lang)}
        <section class="deck-post-body">
          <div class="section-inner">
            <p><a href="${esc(withLang("/blogs", lang))}">← ${esc(t.backToBlog)}</a></p>
          </div>
        </section>
      </article>
    </main>
${footer(lang)}
${LANGUAGE_SCRIPT}
    <script>
      (function () {
        // The deck turns pages on wheel, swipe and arrow keys. Until the reader
        // clicks it, a shield keeps the wheel scrolling the page; the click hands
        // focus to the deck so the arrow keys work right away.
        var frame = document.getElementById("deck-frame");
        var shield = document.getElementById("deck-shield");
        var box = frame.parentElement;
        function focusDeck() {
          try {
            frame.contentWindow.focus();
          } catch (error) {
            frame.focus();
          }
        }
        shield.addEventListener("click", function () {
          box.classList.add("is-active");
          focusDeck();
        });
        box.addEventListener("mouseleave", function () {
          box.classList.remove("is-active");
        });
        document.addEventListener("keydown", function (event) {
          if (event.key === "Escape") box.classList.remove("is-active");
        });
        frame.addEventListener("load", function () {
          try {
            frame.contentWindow.document.addEventListener("pointerdown", focusDeck);
          } catch (error) {}
        });

        // Below this width the decks switch to their phone layout, which does not
        // fit a 16:9 box. Render them at a desktop size and scale the whole slide down.
        var BASE_WIDTH = 1280;
        function fit() {
          var width = box.clientWidth;
          if (width >= 900) {
            frame.style.width = "";
            frame.style.height = "";
            frame.style.transform = "";
            return;
          }
          frame.style.width = BASE_WIDTH + "px";
          frame.style.height = (BASE_WIDTH * 9) / 16 + "px";
          frame.style.transform = "scale(" + width / BASE_WIDTH + ")";
        }
        fit();
        if (window.ResizeObserver) new ResizeObserver(fit).observe(box);
        else window.addEventListener("resize", fit);
      })();
    </script>
  </body>
</html>
`;
}

function blogIndex(lang) {
  const t = T[lang].ui;
  const deckCards = DECKS.map((post) => {
    const c = T[lang].decks[post.slug];
    return `            <a class="post-card" href="${esc(withLang(`/blogs/${post.slug}`, lang))}">
              <div class="post-visual post-visual--cover" aria-hidden="true">
                <img src="${esc(ogOf(post, lang))}" alt="" loading="lazy" />
              </div>
              <div class="post-copy">
                <p class="post-meta">${esc(c.kind)} - ${esc(c.dateLabel)}</p>
                <h3>${esc(c.title)}</h3>
                <p>${esc(c.description)}</p>
                <span class="post-link">${esc(t.readDeck)}</span>
              </div>
            </a>`;
  });
  const articleCards = ARTICLES.map((a) => {
    const c = T[lang].articles[a.slug];
    return `            <a class="post-card" href="${esc(withLang(`/blogs/${a.slug}`, lang))}">
              <div class="post-visual" aria-hidden="true">
                <div class="logo-cloud">
${a.logos.map((logo) => `                  <span><img src="/assets/${logo}" alt="" /></span>`).join("\n")}
                </div>
              </div>
              <div class="post-copy">
                <p class="post-meta">${esc(c.meta)}</p>
                <h3>${esc(c.title)}</h3>
                <p>${esc(c.description)}</p>
                <span class="post-link">${esc(c.link)}</span>
              </div>
            </a>`;
  });
  const cards = [...DECKS.map((p, i) => ({ date: p.date, html: deckCards[i] })), ...ARTICLES.map((a, i) => ({ date: a.date, html: articleCards[i] }))]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((card) => card.html)
    .join("\n");
  return `${head({ lang, title: t.indexMetaTitle, description: t.indexMetaDescription, path: "/blogs", image: "/assets/og-image.png?v=20260420-1" })}
  <body>
${siteHeader(lang, "blog")}

    <main>
      <section class="hero" aria-labelledby="blog-title">
        <div class="section-inner">
          <p class="eyebrow">${esc(t.blogEyebrow)}</p>
          <h1 id="blog-title">${esc(t.blogTitle)}</h1>
          <p>${esc(t.blogLede)}</p>
        </div>
      </section>
      <section class="section" aria-labelledby="latest-posts">
        <div class="section-inner">
          <div class="section-heading">
            <p class="eyebrow">${esc(t.latestEyebrow)}</p>
            <h2 id="latest-posts">${esc(t.latestTitle)}</h2>
            <p>${esc(t.latestLede)}</p>
          </div>
          <div class="post-list">
${cards}
          </div>
        </div>
      </section>
    </main>
${footer(lang)}
${LANGUAGE_SCRIPT}
  </body>
</html>
`;
}

function write(relPath, content) {
  const file = join(ROOT, relPath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  console.log("wrote", relPath);
}

export const DECK_SLUGS = DECKS.map((post) => post.slug);
export const ARTICLE_SLUGS = ARTICLES.map((a) => a.slug);
export { DECKS, ARTICLES };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--chrome");
  if (i > 0) {
    // the header, footer and picker script for the article localizer
    const lang = process.argv[i + 1];
    process.stdout.write(JSON.stringify({ header: siteHeader(lang, "blog"), footer: footer(lang), script: LANGUAGE_SCRIPT, alternates: { "hashchat-social-network": alternates("/blogs/hashchat-social-network"), "ai-translators-comparison": alternates("/blogs/ai-translators-comparison") } }));
  } else {
    for (const { code } of LANGS) {
      write(`blogs/${code}/index.html`, blogIndex(code));
      for (const post of DECKS) write(`blogs/${code}/${post.slug}.html`, deckPost(post, code));
    }
  }
}
