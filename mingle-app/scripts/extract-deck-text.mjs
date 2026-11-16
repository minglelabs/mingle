#!/usr/bin/env node
// Reads the slide decks the blog embeds and saves each slide's words as plain text,
// so the blog post pages carry the deck's content as HTML text (crawlers and AI
// assistants do not run the deck's JavaScript, which swaps the Korean markup to English).
//
//   node scripts/extract-deck-text.mjs [--base https://hashchat.minglelabs.app]
//
// Writes scripts/legal-blog-i18n/decks/<slug>.<lang>.json: [{ title, text }] per slide.
// Run it after a deck changes, then `node scripts/build-legal-blog.mjs`.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "../rn/store-screenshots/package.json"));
const puppeteer = require("puppeteer-core");

const args = process.argv.slice(2);
const base = args.includes("--base") ? args[args.indexOf("--base") + 1] : "https://hashchat.minglelabs.app";
const DECKS = [
  { slug: "ai-wrapper-business", deck: "/presentations/ai-beyond-wrapper-business" },
  { slug: "ai-wrapper-business-surfers-3rd", deck: "/presentations/surfers-3rd-ai-wrapper" },
  { slug: "hashchat-pitch-deck", deck: "/xr" },
  { slug: "hashchat-pitch-deck-short", deck: "/xr-short" },
  { slug: "virtually-deck", deck: "/xr-virtually" },
];
const LANGS = ["en", "ko"];
const outDir = path.join(here, "legal-blog-i18n/decks");
await fs.mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--window-size=1440,900"],
});
try {
  for (const { slug, deck } of DECKS) {
    for (const lang of LANGS) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await page.goto(`${base}${deck}?lang=${lang}`, { waitUntil: "networkidle0", timeout: 90000 });
      await page.waitForFunction(() => !document.documentElement.classList.contains("deck-i18n-pending"), { timeout: 15000 }).catch(() => {});
      const slides = await page.evaluate((lang) => {
        const clean = (s) => s.replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
        // Korean text left in the markup for the other language (quote translations) is not this page's.
        const foreign = (l) => lang !== "ko" && /[가-힣]/.test(l);
        const oneLine = (node) => {
          const c = node.cloneNode(true);
          c.querySelectorAll("br,div,span,p").forEach((n) => n.append(" "));
          return clean(c.textContent || "").replace(/\s+/g, " ");
        };
        const tops = [...document.querySelectorAll(".slide")].filter(
          (el) => el.classList.contains("slide") && !el.parentElement.closest(".slide"),
        );
        const out = tops.map((el) => {
          const copy = el.cloneNode(true);
          copy.querySelectorAll("script,style,svg,noscript,[aria-hidden='true'],.sr-only,.visually-hidden").forEach((n) => n.remove());
          // One line per block so headings, bullets and captions stay apart.
          copy.querySelectorAll("h1,h2,h3,h4,p,li,div,span,figcaption,td,th,dt,dd,br").forEach((n) => n.append("\n"));
          const lines = [];
          for (const line of clean(copy.textContent || "").split("\n")) {
            const l = line.trim();
            if (!l || /^\d{1,3}$/.test(l) || lines.includes(l) || foreign(l)) continue;
            lines.push(l);
          }
          const heading = el.querySelector("h1,h2,h3");
          const title = (heading && oneLine(heading)) || lines[0] || "";
          // Drop the heading's own broken-up lines from the body.
          const titleWords = title.replace(/\s+/g, "");
          const text = lines.filter((l) => l !== title && !titleWords.includes(l.replace(/\s+/g, ""))).join("\n");
          return { title, text };
        }).filter((s) => s.title || s.text);
        // Looping decks put a copy of the last slide before the first and of the first after the last.
        const same = (a, b) => a.title === b.title && a.text === b.text;
        if (out.length > 2 && out.slice(1).some((s) => same(s, out[0]))) out.shift();
        if (out.length > 2 && out.slice(0, -1).some((s) => same(s, out[out.length - 1]))) out.pop();
        return out;
      }, lang);
      await page.close();
      const file = path.join(outDir, `${slug}.${lang}.json`);
      await fs.writeFile(file, JSON.stringify(slides, null, 1) + "\n");
      const words = slides.reduce((n, s) => n + (s.title + " " + s.text).split(/\s+/).length, 0);
      console.log(`${slug}.${lang}: ${slides.length} slides, ~${words} words`);
    }
  }
} finally {
  await browser.close();
}
