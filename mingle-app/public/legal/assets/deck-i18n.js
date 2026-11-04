/*
 * English-by-default for decks written in Korean.
 *
 * The deck markup stays Korean. Unless the URL has ?lang=ko, this swaps every
 * Korean unit for its English version from window.DECK_EN before the deck's
 * own script runs (decks clone slides, so this must come first).
 *
 * Unit rules (same as the extraction script that built the dictionaries):
 * - block: element with Hangul text whose descendants are all inline tags and
 *   whose parent is not such a block. Key: textContent, whitespace collapsed.
 * - text: a Hangul text node outside any block. Key: trimmed text.
 * - attr: aria-label / alt / title / placeholder values.
 */
(function () {
  var params = new URLSearchParams(window.location.search);
  var lang = params.get("lang") === "ko" ? "ko" : "en";
  var root = document.documentElement;
  root.lang = lang;
  function done() {
    root.classList.remove("deck-i18n-pending");
    root.classList.add("deck-i18n-ready");
  }

  var dict = window.DECK_EN || { blocks: {}, texts: {}, attrs: {} };

  // The static <head> is English (link previews do not run JS), so Korean
  // only needs the title and meta tags put back.
  if (lang === "ko") {
    var back = {};
    Object.keys(dict.attrs || {}).forEach(function (ko) {
      back[dict.attrs[ko]] = ko;
    });
    document.querySelectorAll("meta[content]").forEach(function (meta) {
      var value = back[meta.getAttribute("content").replace(/\s+/g, " ").trim()];
      if (typeof value === "string") meta.setAttribute("content", value);
    });
    if (typeof back[document.title] === "string") document.title = back[document.title];
    done();
    return;
  }

  var blocks = dict.blocks || {};
  var texts = dict.texts || {};
  var attrs = dict.attrs || {};
  var INLINE = { SPAN: 1, BR: 1, STRONG: 1, EM: 1, B: 1, I: 1, SMALL: 1, SUP: 1, SUB: 1, MARK: 1, U: 1, S: 1, A: 1, IMG: 1, WBR: 1, CODE: 1 };
  var SKIP = { SCRIPT: 1, STYLE: 1, TEMPLATE: 1, svg: 1, SVG: 1 };
  var HANGUL = /[가-힣]/;

  function collapse(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  function allInline(el) {
    var all = el.getElementsByTagName("*");
    for (var i = 0; i < all.length; i += 1) {
      if (!INLINE[all[i].tagName]) return false;
    }
    return true;
  }

  function insideSkip(el) {
    for (var node = el; node; node = node.parentElement) {
      if (SKIP[node.tagName]) return true;
    }
    return false;
  }

  function isCandidate(el) {
    if (!el || el === document.body || insideSkip(el)) return false;
    if (INLINE[el.tagName] && el.tagName !== "A" && el.tagName !== "SPAN") return false;
    return HANGUL.test(el.textContent) && allInline(el);
  }

  var body = document.body;
  var candidates = [];
  var nodes = body.getElementsByTagName("*");
  for (var i = 0; i < nodes.length; i += 1) {
    var el = nodes[i];
    if (!isCandidate(el)) continue;
    var parent = el.parentElement;
    if (parent && parent !== body && HANGUL.test(parent.textContent) && allInline(parent) && !insideSkip(parent)) continue;
    candidates.push(el);
  }
  candidates.forEach(function (el) {
    var value = blocks[collapse(el.textContent)];
    if (typeof value === "string") el.innerHTML = value;
  });

  var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  var textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  textNodes.forEach(function (node) {
    if (!HANGUL.test(node.nodeValue) || insideSkip(node.parentElement)) return;
    var value = texts[collapse(node.nodeValue)];
    if (typeof value === "string") node.nodeValue = value;
  });

  ["aria-label", "alt", "title", "placeholder"].forEach(function (name) {
    document.querySelectorAll("[" + name + "]").forEach(function (el) {
      var value = attrs[collapse(el.getAttribute(name))];
      if (typeof value === "string") el.setAttribute(name, value);
    });
  });
  document.querySelectorAll("meta[content]").forEach(function (meta) {
    var value = attrs[collapse(meta.getAttribute("content"))];
    if (typeof value === "string") meta.setAttribute("content", value);
  });
  var title = attrs[collapse(document.title)];
  if (typeof title === "string") document.title = title;
  done();
})();
