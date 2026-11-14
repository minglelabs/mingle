#!/usr/bin/env node
// Static i18n audit: finds user-visible strings that bypass the copy/dictionary
// layer in the app's UI code (web + RN shell).
//
//   node scripts/i18n-audit.mjs            # report, exit 1 if new findings
//   node scripts/i18n-audit.mjs --json     # machine-readable
//   node scripts/i18n-audit.mjs --write-baseline
//
// Findings:
//   jsx-text       literal text between JSX tags
//   jsx-attr       literal aria-label / placeholder / title / alt / label prop
//   ko-en-ternary  `locale === "ko" ? "…" : "…"` style copy that only covers ko/en
//                  and is NOT a `dictionary.x ?? (…)` fallback
//   hangul-literal a string literal containing Hangul outside a copy table
//
// Accepted exceptions live in scripts/i18n-audit.baseline.json (by file + text),
// so the check fails only on new hardcoded copy.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(appRoot, "scripts/i18n-audit.baseline.json");

const SCAN_ROOTS = ["src/components", "src/app", "src/lib", "rn/src", "rn/App.tsx"];
const SKIP = [
  /\/admin\//, // internal operator tools, Korean only by design
  /\/app\/api\//,
  /\.test\.[jt]sx?$/,
  /\.stories\.[jt]sx?$/,
  /-copy\.[jt]sx?$/, // copy tables themselves
  /copy\.[jt]sx?$/,
  /\/i18n\//,
  /\/LivePhoneDemo\/.*copy/i,
  /\/legal\//,
  /\/dev\//,
  /\/qa\//,
  /Legacy\.tsx$/, /-legacy\.tsx$/, /\/web\/shared\//, // frozen old web bundles
  /\/posts\/post-admin-actions\.tsx$/, // shown to operators only
  /\/lib\/admin-/, // admin dashboards
  /\.fixtures?\.[jt]sx?$/,
  /chinese-script-data\.ts$/,
];
const TEXT_ATTRS = new Set(["aria-label", "placeholder", "title", "alt", "label", "ariaLabel", "accessibilityLabel"]);
const HANGUL = /[ㄱ-힝]/;
const LETTERS = /[A-Za-zÀ-ɏ぀-ヿ一-鿿ㄱ-힝]{2,}/;
// Text that is fine to hardcode: brand names, symbols, units.
const ALLOWED_TEXT = new Set(["Local and dev only", "HashChat", "Mingle", "Mingle Labs", "Google", "Apple", "Kakao", "LINE", "OK", "AI", "PRO", "Pro", "LIVE", "Beta", "BETA", "Ad", "AD", "ID", "URL", "QR", "TTS", "STT", "iOS", "Android", "AirPods", "GIF", "@", "·", "…"]);

function walkFiles(entry) {
  const abs = path.join(appRoot, entry);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return [abs];
  const out = [];
  for (const dirent of fs.readdirSync(abs, { withFileTypes: true })) {
    if (dirent.name === "node_modules" || dirent.name.startsWith(".")) continue;
    const child = path.join(entry, dirent.name);
    if (dirent.isDirectory()) out.push(...walkFiles(child));
    else if (/\.(tsx|ts)$/.test(dirent.name)) out.push(path.join(appRoot, child));
  }
  return out;
}

function isLocaleCompare(node) {
  // locale === "ko", isKorean, locale.startsWith("ko"), lang === 'ko'
  const text = node.getText();
  return /(locale|lang|language|uiLocale|appLocale)\w*\s*===?\s*["']ko["']/i.test(text)
    || /^is(Korean|Ko)\b/.test(text)
    || /\.startsWith\(\s*["']ko["']\s*\)/.test(text);
}

function isStringish(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node);
}

function insideNullishFallback(node) {
  // dictionary.foo ?? (locale === "ko" ? … : …)
  let current = node.parent;
  while (current && (ts.isParenthesizedExpression(current))) current = current.parent;
  return Boolean(current && ts.isBinaryExpression(current)
    && current.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
    && current.right.getStart() <= node.getStart());
}

const LOCALE_KEY = /^(ko|en|ja|zh-CN|zh-TW|zh|zh-Hans|zh-Hant|fr|de|es|pt|it|ru|ar|hi|th|vi)$/;

function isCopyTableLiteral(node) {
  // A string anywhere under a locale key ({ ko: { title: "…" } }) or a
  // ["ko", …] tuple is a copy table, not a hardcode.
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isPropertyAssignment(current) && LOCALE_KEY.test(current.name.getText().replace(/["']/g, ""))) return true;
    if (ts.isArrayLiteralExpression(current) && current.elements[0]
      && ts.isStringLiteral(current.elements[0]) && LOCALE_KEY.test(current.elements[0].text)) return true;
    if (ts.isCaseClause(current) && ts.isStringLiteral(current.expression) && LOCALE_KEY.test(current.expression.text)) return true;
  }
  return false;
}

function isNonUiContext(node) {
  // console.*, Error messages, analytics event names, test ids, classNames.
  let current = node.parent;
  for (let depth = 0; current && depth < 4; depth += 1, current = current.parent) {
    if (ts.isCallExpression(current)) {
      const callee = current.expression.getText();
      if (/^(console\.|logger\.|captureMingle|capture|track|log|debug|warn|new Error|Error|assert|expect|describe|it|test)/.test(callee)) return true;
    }
    if (ts.isNewExpression(current) && /Error$/.test(current.expression.getText())) return true;
    if (ts.isJsxAttribute(current)) {
      const attr = current.name.getText();
      if (!TEXT_ATTRS.has(attr)) return true;
    }
  }
  return false;
}

function scanFile(abs) {
  const rel = path.relative(appRoot, abs).split(path.sep).join("/");
  const source = fs.readFileSync(abs, "utf8");
  const sf = ts.createSourceFile(abs, source, ts.ScriptTarget.Latest, true, abs.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const findings = [];
  const push = (kind, node, text) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
    findings.push({ kind, file: rel, line: line + 1, text: text.replace(/\s+/g, " ").trim().slice(0, 120) });
  };

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const text = node.getText().replace(/\s+/g, " ").trim();
      if (text && LETTERS.test(text) && !ALLOWED_TEXT.has(text) && !/^\{.*\}$/.test(text)) push("jsx-text", node, text);
    } else if (ts.isJsxAttribute(node) && TEXT_ATTRS.has(node.name.getText()) && node.initializer) {
      const init = node.initializer;
      const lit = ts.isStringLiteral(init) ? init
        : (ts.isJsxExpression(init) && init.expression && isStringish(init.expression) ? init.expression : null);
      if (lit) {
        const text = lit.getText().slice(1, -1);
        const staticPart = (ts.isTemplateExpression(lit)
          ? [lit.head.text, ...lit.templateSpans.map((span) => span.literal.text)].join(" ")
          : lit.text).replace(/[^\p{L}\s]/gu, " ").trim();
        if (LETTERS.test(staticPart) && !ALLOWED_TEXT.has(staticPart) && !ALLOWED_TEXT.has(text)) push("jsx-attr", node, `${node.name.getText()}="${text}"`);
      }
    } else if (ts.isConditionalExpression(node) && isLocaleCompare(node.condition)
      && (isStringish(node.whenTrue) || isStringish(node.whenFalse))) {
      if (!insideNullishFallback(node)) push("ko-en-ternary", node, node.getText());
      return; // the branches are covered by this finding
    } else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && HANGUL.test(node.text)) {
      if (!isCopyTableLiteral(node) && !isNonUiContext(node) && !insideNullishFallback(node)) {
        // Skip strings inside a ko/en ternary handled above and locale-keyed tables.
        push("hangul-literal", node, node.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

function findingKey(f) {
  return `${f.kind}|${f.file}|${f.text}`;
}

const args = new Set(process.argv.slice(2));
const files = SCAN_ROOTS.flatMap(walkFiles).filter((abs) => !SKIP.some((re) => re.test(abs.split(path.sep).join("/"))));
const findings = files.flatMap(scanFile);

if (args.has("--write-baseline")) {
  const keys = [...new Set(findings.map(findingKey))].sort();
  fs.writeFileSync(baselinePath, `${JSON.stringify({ note: "Accepted hardcoded strings. Shrink this list; never grow it to silence new copy.", accepted: keys }, null, 2)}\n`);
  console.log(`Wrote ${keys.length} baseline entries to ${path.relative(appRoot, baselinePath)}`);
  process.exit(0);
}

const baseline = new Set(fs.existsSync(baselinePath) && !args.has("--all")
  ? JSON.parse(fs.readFileSync(baselinePath, "utf8")).accepted
  : []);
const fresh = findings.filter((f) => !baseline.has(findingKey(f)));

if (args.has("--json")) {
  console.log(JSON.stringify({ scannedFiles: files.length, total: findings.length, new: fresh }, null, 2));
} else {
  const byKind = {};
  for (const f of fresh) (byKind[f.kind] ??= []).push(f);
  for (const [kind, list] of Object.entries(byKind)) {
    console.log(`\n## ${kind} (${list.length})`);
    for (const f of list) console.log(`${f.file}:${f.line}  ${f.text}`);
  }
  console.log(`\nScanned ${files.length} files · ${findings.length} findings · ${fresh.length} not in baseline`);
}
process.exit(fresh.length > 0 ? 1 : 0);
