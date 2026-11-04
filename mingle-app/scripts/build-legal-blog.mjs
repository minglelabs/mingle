#!/usr/bin/env node
// Builds the HashChat blog index and the slide-deck posts in public/legal/blogs.
//
// English is the default. Pages live in blogs/en/ and blogs/ko/ and the rewrites in
// public/legal/vercel.json serve them at /blogs/<slug> (Korean for ?lang=ko), so each
// language has its own static <head> (title, OG image) for link previews. Nothing may
// sit at blogs/<slug>.html itself: Vercel serves a matching file before any rewrite.
//
//   node mingle-app/scripts/build-legal-blog.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "legal");
const SITE = "https://translator.minglelabs.app";

const esc = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const withLang = (path, lang) => {
  if (lang !== "ko") return path;
  const [base, hash] = path.split("#");
  return `${base}${base.includes("?") ? "&" : "?"}lang=ko${hash ? `#${hash}` : ""}`;
};

const UI = {
  en: {
    nav: { problem: "Problem", product: "Product", proof: "Proof", vision: "Vision", blog: "Blog", legal: "Legal" },
    footerCopy: "© Mingle Labs. Built for conversations across languages.",
    footerRenamed: "HashChat was formerly called Mingle.",
    privacy: "Privacy",
    terms: "Terms",
    blogEyebrow: "HashChat Blog",
    blogTitle: "Notes on real-time AI translation.",
    blogLede: "Product thinking, comparisons, talks and field notes for people building conversations across languages. HashChat was formerly called Mingle.",
    latestEyebrow: "Latest",
    latestTitle: "Talks, decks and product stories.",
    latestLede: "Slide decks from our talks and pitches, plus the story of how Mingle became HashChat and a live comparison of AI translators.",
    indexMetaTitle: "HashChat Blog - AI translation for live conversations",
    indexMetaDescription: "Read HashChat's (formerly Mingle) notes on AI translation, real-time voice captions, multilingual conversation products, and our talks.",
    by: "By",
    fullscreen: "View full screen",
    otherLang: "한국어로 보기",
    keyHint: "Click the slides, then use the arrow keys, wheel or swipe. Add #number to the full-screen link to jump to a slide.",
    readDeck: "View the slides",
    activate: "Click to use the slides",
    deckLabel: "Slides",
    backToBlog: "All posts",
    englishOnly: "",
  },
  ko: {
    nav: { problem: "문제", product: "제품", proof: "반응", vision: "비전", blog: "Blog", legal: "Legal" },
    footerCopy: "© Mingle Labs. Built for conversations across languages.",
    footerRenamed: "HashChat의 이전 이름은 Mingle입니다.",
    privacy: "Privacy",
    terms: "Terms",
    blogEyebrow: "HashChat 블로그",
    blogTitle: "실시간 AI 통번역 이야기.",
    blogLede: "언어가 다른 사람들의 대화를 만드는 팀의 제품 생각, 비교 글, 발표 자료와 현장 기록입니다. HashChat의 이전 이름은 Mingle입니다.",
    latestEyebrow: "최신 글",
    latestTitle: "발표 자료와 제품 이야기.",
    latestLede: "발표와 피칭에 쓴 슬라이드, Mingle이 HashChat이 된 이야기, AI 번역기 비교 글을 모았습니다.",
    indexMetaTitle: "HashChat 블로그 - 실시간 대화를 위한 AI 통번역",
    indexMetaDescription: "HashChat(구 Mingle)의 AI 통번역, 실시간 음성 자막, 다국어 대화 제품에 관한 글과 발표 자료를 읽어보세요.",
    by: "작성",
    fullscreen: "전체 화면으로 보기",
    otherLang: "View in English",
    keyHint: "슬라이드를 클릭한 뒤 방향키·휠·스와이프로 넘기세요. 전체 화면 주소 끝에 #번호를 붙이면 해당 장으로 바로 갑니다.",
    readDeck: "슬라이드 보기",
    activate: "클릭해서 슬라이드 넘기기",
    deckLabel: "발표 자료",
    backToBlog: "전체 글",
    englishOnly: " (영어)",
  },
};

const AUTHOR = { en: "Hyeongkeol Nam, Mingle Labs", ko: "밍글랩스 남형걸" };

const DECKS = [
  {
    slug: "ai-wrapper-business",
    deck: "/presentations/ai-beyond-wrapper-business",
    date: "2026-11-05",
    og: { en: "/presentations/assets/ai-beyond-wrapper-og-en.png", ko: "/presentations/assets/ai-beyond-wrapper-og.png" },
    en: {
      kind: "Talk",
      dateLabel: "November 5, 2026",
      title: "The AI Wrapper Business: Where It Stands Today",
      description: "Case studies of AI wrapper businesses, and a strategy for what comes next.",
      body: [
        "Slides from a talk on AI wrapper software: products that take a user experience that already existed and automate it with AI. The 94 slides walk through vibe coding and agents, character chat, note-taking, AI diet tracking, aggregators, study helpers and more, asking which wrappers held up against Big Tech and which were swept away.",
        "The last part looks at the moats a software business can build and how a wrapper can avoid staying just a wrapper.",
      ],
    },
    ko: {
      kind: "발표",
      dateLabel: "2026년 11월 5일",
      title: "AI 래퍼 SW 산업 현황 살펴보기",
      description: "AI 래퍼의 사례를 소개하고, 미래 전략을 제안합니다.",
      body: [
        "이미 존재하던 유저 경험을 AI로 자동화하는 AI 래퍼 SW 산업을 살펴본 발표 자료입니다. 바이브 코딩과 에이전트, 캐릭터 챗, 노트테이킹, AI 식단 관리, 애그리게이터, 학습 도우미 등 94장에 걸쳐 어떤 래퍼가 빅테크의 쓰나미를 버텼고 어떤 곳이 쓸려 갔는지 정리했습니다.",
        "마지막 장에서는 SW 사업이 가질 수 있는 해자와, AI 래퍼가 래퍼로만 남지 않기 위한 전략을 다룹니다.",
      ],
    },
  },
  {
    slug: "ai-wrapper-business-surfers-3rd",
    deck: "/presentations/surfers-3rd-ai-wrapper",
    date: "2026-08-12",
    og: { en: "/presentations/assets/surfers-logo.png", ko: "/presentations/assets/surfers-logo.png" },
    en: {
      kind: "Talk",
      dateLabel: "August 12, 2026",
      title: "The AI Wrapper Business: Surfers Cohort 3 Edition",
      description: "The first, longer version of our AI wrapper talk, given to Surfers Cohort 3.",
      body: [
        "The first version of our AI wrapper talk, given to Surfers Cohort 3. Its 165 slides go deeper into each field: vibe coding, character chat and its three phases, note-taking, AI diet tracking, aggregators such as OpenRouter, and AI study helpers.",
        "The deck was written in Korean and is shown here in English by default. Switch to Korean for the original.",
      ],
    },
    ko: {
      kind: "발표",
      dateLabel: "2026년 8월 12일",
      title: "AI 래퍼 SW 산업 현황 살펴보기 (Surfers 3기)",
      description: "Surfers 3기에서 발표한 AI 래퍼 발표의 첫 번째, 확장판입니다.",
      body: [
        "Surfers 3기에서 발표한 AI 래퍼 발표의 첫 버전입니다. 165장에 걸쳐 바이브 코딩, 캐릭터 챗과 세 단계의 변화, 노트테이킹, AI 식단 관리, OpenRouter 같은 애그리게이터, AI 학습 도우미를 더 자세히 다룹니다.",
      ],
    },
  },
  {
    slug: "hashchat-pitch-deck",
    deck: "/xr",
    date: "2026-09-01",
    og: { en: "/assets/og-image.png?v=20260416-2", ko: "/assets/og-image.png?v=20260416-2" },
    en: {
      kind: "Pitch deck",
      dateLabel: "Updated September 1, 2026",
      title: "HashChat Pitch Deck: A Voice Messenger Without Language Barriers",
      description: "Why we are building HashChat, who it is for, and how a live interpreter grows into an AI-native social network.",
      body: [
        "Our full pitch deck. It starts from a simple problem: people want to make friends abroad, but the language gets in the way, and today's translators were never built for social conversation.",
        "It covers early user reactions on HelloTalk, our three-stage strategy from a solo live translator to a voice messenger and then a social platform, and the target verticals in the appendix.",
      ],
    },
    ko: {
      kind: "피치덱",
      dateLabel: "2026년 9월 1일 업데이트",
      title: "HashChat 피치덱: 언어 장벽 없는 음성 메신저",
      description: "HashChat을 왜 만드는지, 누구를 위한 것인지, 실시간 통번역이 어떻게 AI 네이티브 SNS로 성장하는지 담았습니다.",
      body: [
        "HashChat의 전체 피치덱입니다. 외국인과 친해지고 싶지만 언어 장벽을 넘기 힘들고, 기존 통번역 서비스는 소셜링에 쓰기 어렵다는 문제에서 출발합니다.",
        "헬로톡 유저들의 초기 반응, 혼자 쓰는 실시간 번역기에서 음성 메신저와 소셜 플랫폼으로 가는 세 단계 전략, 부록의 타겟 버티컬까지 담았습니다.",
      ],
    },
  },
  {
    slug: "hashchat-pitch-deck-short",
    deck: "/xr-short",
    date: "2026-09-02",
    og: { en: "/assets/og-image.png?v=20260416-2", ko: "/assets/og-image.png?v=20260416-2" },
    en: {
      kind: "Pitch deck",
      dateLabel: "Updated September 1, 2026",
      title: "HashChat Pitch Deck: The Short Version",
      description: "The chicken-and-egg problem of language exchange, and how live interpretation removes one side of it.",
      body: [
        "A shorter version of our pitch deck. Language exchange apps are stuck on a chicken-and-egg problem: you want friends abroad, and you want to learn their language. HashChat removes one side of it with live interpretation, so you can talk without a shared language.",
        "It also covers the add-on caption and in-person interpretation demand we found, and our first goal: winning over K-Friends users.",
      ],
    },
    ko: {
      kind: "피치덱",
      dateLabel: "2026년 9월 1일 업데이트",
      title: "HashChat 피치덱 (요약본)",
      description: "언어교환 서비스의 닭과 달걀 문제, 그리고 실시간 통번역으로 그중 하나를 없애는 방법.",
      body: [
        "HashChat 피치덱의 요약본입니다. 언어교환 서비스는 외국인 친구를 사귀고 싶은 마음과 외국어를 배우고 싶은 마음 사이의 닭과 달걀 문제에 갇혀 있습니다. HashChat은 실시간 통번역으로 그중 하나를 아예 해소해, 외국어를 못해도 대화가 통하게 만듭니다.",
        "애드온 자막과 오프라인 통번역 수요, 그리고 첫 번째 목표인 K프렌즈 유저 흡수까지 담았습니다.",
      ],
    },
  },
  {
    slug: "virtually-deck",
    deck: "/xr-virtually",
    date: "2026-09-13",
    og: { en: "/assets/virtually-vtuber-cover.png", ko: "/assets/virtually-vtuber-cover.png" },
    en: {
      kind: "Pitch deck",
      dateLabel: "September 13, 2026",
      title: "Virtually: VTuber Live Streaming, Powered by Generative AI",
      description: "From a single image to a live interactive broadcast.",
      body: [
        "The deck for Virtually, our generative AI tool for VTubers. It shows how a single character image can become a live, interactive broadcast, and where Virtually fits in the VTuber ecosystem.",
        "The deck is also available in Japanese and Chinese from the language buttons in the bottom-left corner of the slides.",
      ],
    },
    ko: {
      kind: "피치덱",
      dateLabel: "2026년 9월 13일",
      title: "Virtually: 버튜버 라이브를 AI로 쉽고 간단하게",
      description: "이미지 한 장으로 시작하는 인터랙티브 라이브 방송.",
      body: [
        "생성형 AI로 버튜버 라이브를 쉽게 만드는 Virtually의 발표 자료입니다. 캐릭터 이미지 한 장이 어떻게 실시간 인터랙티브 방송이 되는지, 그리고 버튜버 생태계에서 Virtually가 어디에 서 있는지 보여줍니다.",
        "슬라이드 왼쪽 아래 언어 버튼으로 일본어와 중국어로도 볼 수 있습니다.",
      ],
    },
  },
];

// English-only posts that already exist as hand-written pages.
const ARTICLES = [
  {
    slug: "hashchat-social-network",
    logos: ["logo-mingle.png", "logo-line.png", "logo-wechat.jpg", "logo-hellotalk.png", "logo-instagram.png", "logo-discord.png"],
    meta: { en: "Product story - November 2, 2026", ko: "제품 이야기 - 2026년 11월 2일" },
    title: "HashChat: the social network without language barriers",
    description:
      "How Mingle became HashChat: a translated feed, profiles that show who you want to meet, and chats with a live interpreter built in, compared with LINE, WeChat, WhatsApp, HelloTalk, and more.",
    link: { en: "Read the story", ko: "글 읽기 (영어)" },
    date: "2026-11-02",
  },
  {
    slug: "ai-translators-comparison",
    logos: ["logo-mingle.png", "logo-google-translate.jpg", "logo-apple-translate.jpg", "logo-microsoft-translator.png", "logo-papago.jpg", "logo-deepl.png"],
    meta: { en: "Comparison - Updated April 20, 2026", ko: "비교 - 2026년 4월 20일 업데이트" },
    title: "AI Translators Comparison",
    description:
      "A practical table-first guide to price, platform coverage, language coverage, live captions, transcripts, automatic switching, background translation, and external app audio capture.",
    link: { en: "Read the comparison", ko: "비교 글 읽기 (영어)" },
    date: "2026-04-20",
  },
];

export function siteHeader(lang, current) {
  const t = UI[lang].nav;
  const link = (href, label, extra = "") =>
    `<a${extra} href="${esc(withLang(href, lang))}">${esc(label)}</a>`;
  return `    <header class="site-header">
      <nav class="nav" aria-label="HashChat site navigation">
        <a class="brand" href="${esc(withLang("/", lang))}" aria-label="HashChat home">
          <img src="/assets/mingle-icon.png" alt="" />
          <span>HashChat</span>
        </a>
        <div class="nav-actions">
          <div class="nav-links">
            ${link("/#problem", t.problem)}
            ${link("/#product", t.product)}
            ${link("/#proof", t.proof)}
            ${link("/#vision", t.vision)}
            ${link("/blogs", t.blog, current === "blog" ? ' class="nav-legal is-current" aria-current="page"' : ' class="nav-legal"')}
            ${link("/legal", t.legal, ' class="nav-legal"')}
          </div>
          <label class="language-picker">
            <span aria-hidden="true">🌐</span>
            <select id="blog-language" aria-label="Language">
              <option value="en"${lang === "en" ? " selected" : ""}>🇺🇸 English</option>
              <option value="ko"${lang === "ko" ? " selected" : ""}>🇰🇷 한국어</option>
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
          if (select.value === "ko") url.searchParams.set("lang", "ko");
          else url.searchParams.delete("lang");
          window.location.href = url.toString();
        });
      })();
    </script>`;

function footer(lang) {
  const t = UI[lang];
  return `    <footer class="footer">
      <div class="footer-inner">
        <span>${esc(t.footerCopy)} ${esc(t.footerRenamed)}</span>
        <div class="footer-links">
          <a href="${esc(withLang("/blogs", lang))}">Blog</a>
          <a href="/privacy-policy">${esc(t.privacy)}</a>
          <a href="/terms-of-use">${esc(t.terms)}</a>
          <a href="/legal">Legal</a>
        </div>
      </div>
    </footer>`;
}

function head({ lang, title, description, path, image, type = "website", extra = "" }) {
  const url = SITE + withLang(path, lang);
  const imageUrl = image.startsWith("http") ? image : SITE + image;
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <link rel="canonical" href="${esc(url)}" />
    <link rel="alternate" hreflang="en" href="${esc(SITE + path)}" />
    <link rel="alternate" hreflang="ko" href="${esc(SITE + withLang(path, "ko"))}" />
    <link rel="alternate" hreflang="x-default" href="${esc(SITE + path)}" />
    <meta property="og:site_name" content="HashChat" />
    <meta property="og:locale" content="${lang === "ko" ? "ko_KR" : "en_US"}" />
    <meta property="og:type" content="${type}" />
    <meta property="og:url" content="${esc(url)}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:image" content="${esc(imageUrl)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${esc(imageUrl)}" />
    <link rel="icon" href="/assets/mingle-icon.png" />
    <link rel="stylesheet" href="/assets/blog.css" />
    <link rel="stylesheet" href="/assets/site-header.css" />
${extra}  </head>`;
}

function deckPost(post, lang) {
  const t = UI[lang];
  const c = post[lang];
  const path = `/blogs/${post.slug}`;
  const deckUrl = withLang(post.deck, lang);
  const other = lang === "ko" ? "en" : "ko";
  const ld = {
    "@context": "https://schema.org",
    "@type": "PresentationDigitalDocument",
    name: c.title,
    description: c.description,
    inLanguage: lang,
    datePublished: post.date,
    url: SITE + withLang(path, lang),
    image: SITE + post.og[lang],
    author: { "@type": "Person", name: lang === "ko" ? "남형걸" : "Hyeongkeol Nam" },
    publisher: { "@type": "Organization", name: "Mingle Labs", url: "https://minglelabs.app/" },
  };
  const extra = `    <script type="application/ld+json">${JSON.stringify(ld)}</script>\n`;
  return `${head({ lang, title: `${c.title} - HashChat Blog`, description: c.description, path, image: post.og[lang], type: "article", extra })}
  <body>
${siteHeader(lang, "blog")}

    <main>
      <article>
        <section class="deck-post-hero">
          <div class="section-inner">
            <p class="eyebrow">${esc(c.kind)} · ${esc(t.deckLabel)}</p>
            <h1>${esc(c.title)}</h1>
            <p class="deck-post-meta">${esc(AUTHOR[lang])} · ${esc(c.dateLabel)}</p>
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
              <a href="${esc(deckUrl)}" target="_blank" rel="noopener">${esc(t.fullscreen)} ↗</a>
              <a href="${esc(withLang(path, other))}" hreflang="${other}">${esc(t.otherLang)}</a>
              <span>${esc(t.keyHint)}</span>
            </div>
          </div>
        </section>
        <section class="deck-post-body">
          <div class="section-inner">
${c.body.map((p) => `            <p>${esc(p)}</p>`).join("\n")}
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
  const t = UI[lang];
  const deckCards = DECKS.map((post) => {
    const c = post[lang];
    return `            <a class="post-card" href="${esc(withLang(`/blogs/${post.slug}`, lang))}">
              <div class="post-visual post-visual--cover" aria-hidden="true">
                <img src="${esc(post.og[lang])}" alt="" loading="lazy" />
              </div>
              <div class="post-copy">
                <p class="post-meta">${esc(c.kind)} - ${esc(c.dateLabel)}</p>
                <h3>${esc(c.title)}</h3>
                <p>${esc(c.description)}</p>
                <span class="post-link">${esc(t.readDeck)}</span>
              </div>
            </a>`;
  });
  const articleCards = ARTICLES.map(
    (a) => `            <a class="post-card" href="/blogs/${a.slug}">
              <div class="post-visual" aria-hidden="true">
                <div class="logo-cloud">
${a.logos.map((logo) => `                  <span><img src="/assets/${logo}" alt="" /></span>`).join("\n")}
                </div>
              </div>
              <div class="post-copy">
                <p class="post-meta">${esc(a.meta[lang])}</p>
                <h3>${esc(a.title)}</h3>
                <p>${esc(a.description)}</p>
                <span class="post-link">${esc(a.link[lang])}</span>
              </div>
            </a>`,
  );
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
export { DECKS, ARTICLES };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  write("blogs/en/index.html", blogIndex("en"));
  write("blogs/ko/index.html", blogIndex("ko"));
  for (const post of DECKS) {
    write(`blogs/en/${post.slug}.html`, deckPost(post, "en"));
    write(`blogs/ko/${post.slug}.html`, deckPost(post, "ko"));
  }
}
