#!/usr/bin/env node
// Builds a self-contained report.html for an agent QA run from <run>/results.json and the
// screenshots it references. Publish the output with the Artifact tool.
//
//   node scripts/qa-agent-report.mjs <run-dir>
//
// results.json:
// {
//   "environment": { "branch", "commit", "device", "ios", "server", "startedAt", "build" },
//   "summary": "two or three sentences",
//   "scenarios": [{
//     "id", "title", "verdict": "pass|concern|fail|blocked|manual",
//     "oracle": [{ "check", "status": "held|failed|unchecked", "note" }],
//     "findings": [{ "severity": "S0|S1|S2|S3", "taste": ["T12"], "summary", "repro", "evidence": ["..."] }],
//     "screenshots": [{ "file": "shots/x.png", "caption" }],
//     "translationScores": [{ "message", "language", "accuracy", "naturalness", "tone", "latency", "note" }],
//     "notes": ["..."]
//   }],
//   "manualChecklist": ["..."],
//   "coverageGaps": ["..."],
//   "toolingNotes": ["..."]
// }

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const VERDICTS = ['fail', 'concern', 'blocked', 'manual', 'pass'];
const VERDICT_LABEL = { pass: 'Pass', concern: 'Concern', fail: 'Fail', blocked: 'Blocked', manual: 'Manual' };
const SEVERITY_LABEL = { S0: 'S0 blocker', S1: 'S1 major', S2: 'S2 minor', S3: 'S3 nit' };
const MAX_IMAGE_PX = 640;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Inline `code` spans only; everything else stays plain text.
function inline(value) {
  return escapeHtml(value).replace(/`([^`]+)`/g, '<code>$1</code>');
}

function embedImage(runDir, file) {
  const source = path.resolve(runDir, file);
  if (!fs.existsSync(source)) return '';
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qa-report-')), 'shot.jpg');
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '72', '-Z', String(MAX_IMAGE_PX), source, '--out', tmp], { stdio: 'ignore' });
  const data = fs.readFileSync(tmp).toString('base64');
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  return `data:image/jpeg;base64,${data}`;
}

function verdictCounts(scenarios) {
  return VERDICTS.map((verdict) => [verdict, scenarios.filter((scenario) => scenario.verdict === verdict).length])
    .filter(([, count]) => count > 0);
}

function severityRank(severity) {
  return ['S0', 'S1', 'S2', 'S3'].indexOf(severity);
}

function renderScores(scores) {
  if (!scores?.length) return '';
  const rows = scores.map((score) => {
    const values = [score.accuracy, score.naturalness, score.tone, score.latency].map(Number);
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const passed = average >= 4 && values.every((value) => value > 2);
    return `<tr>
      <td class="msg"><span class="lang">${escapeHtml(score.language)}</span>${inline(score.message)}${score.note ? `<div class="note">${inline(score.note)}</div>` : ''}</td>
      ${values.map((value) => `<td class="num score s${value}">${value}</td>`).join('')}
      <td class="num avg ${passed ? 'ok' : 'bad'}">${average.toFixed(1)}</td>
    </tr>`;
  }).join('');
  return `<h4>Translation scores <span class="hint">1–5 · pass at average ≥ 4.0 with nothing ≤ 2</span></h4>
  <div class="table-wrap"><table class="scores">
    <thead><tr><th>Message</th><th>Accuracy</th><th>Natural</th><th>Tone</th><th>Latency</th><th>Avg</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function renderScenario(runDir, scenario) {
  const findings = [...(scenario.findings || [])].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  const oracle = (scenario.oracle || []).map((item) => `<li class="oracle-${escapeHtml(item.status)}"><span class="mark" aria-hidden="true"></span><span>${inline(item.check)}${item.note ? ` <span class="note">${inline(item.note)}</span>` : ''}</span></li>`).join('');
  const findingItems = findings.map((finding) => `<li class="finding sev-${escapeHtml(finding.severity)}">
      <div class="finding-head"><span class="sev">${escapeHtml(SEVERITY_LABEL[finding.severity] || finding.severity)}</span>${(finding.taste || []).map((rule) => `<span class="rule">${escapeHtml(rule)}</span>`).join('')}${finding.repro ? `<span class="repro">seen ${escapeHtml(finding.repro)}</span>` : ''}</div>
      <p>${inline(finding.summary)}</p>
      ${finding.evidence?.length ? `<ul class="evidence">${finding.evidence.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>` : ''}
    </li>`).join('');
  const shots = (scenario.screenshots || []).map((shot) => {
    const src = embedImage(runDir, shot.file);
    return src ? `<figure><img src="${src}" alt="${escapeHtml(shot.caption)}" loading="lazy"><figcaption>${inline(shot.caption)}</figcaption></figure>` : '';
  }).join('');
  const notes = (scenario.notes || []).map((note) => `<li>${inline(note)}</li>`).join('');
  return `<section class="scenario" id="${escapeHtml(scenario.id)}">
    <header class="scenario-head">
      <span class="verdict v-${escapeHtml(scenario.verdict)}">${escapeHtml(VERDICT_LABEL[scenario.verdict] || scenario.verdict)}</span>
      <div><h3>${inline(scenario.title)}</h3><p class="id">${escapeHtml(scenario.id)}</p></div>
    </header>
    ${findingItems ? `<h4>Findings</h4><ul class="findings">${findingItems}</ul>` : '<p class="clean">No findings.</p>'}
    ${oracle ? `<h4>Oracle checks</h4><ul class="oracle">${oracle}</ul>` : ''}
    ${renderScores(scenario.translationScores)}
    ${shots ? `<h4>Screens</h4><div class="shots">${shots}</div>` : ''}
    ${notes ? `<h4>Notes</h4><ul class="plain">${notes}</ul>` : ''}
  </section>`;
}

function render(runDir, results) {
  const env = results.environment || {};
  const scenarios = results.scenarios || [];
  const majors = scenarios.flatMap((scenario) => (scenario.findings || [])
    .filter((finding) => ['S0', 'S1'].includes(finding.severity))
    .map((finding) => ({ scenario, finding })));
  const counts = verdictCounts(scenarios).map(([verdict, count]) => `<span class="count v-${verdict}">${count} ${VERDICT_LABEL[verdict]}</span>`).join('');
  const list = (items) => (items?.length ? `<ul class="plain">${items.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>` : '<p class="clean">None.</p>');
  const checklist = results.manualChecklist?.length
    ? `<ul class="checklist">${results.manualChecklist.map((item, index) => `<li><input type="checkbox" id="manual-${index}"><label for="manual-${index}">${inline(item)}</label></li>`).join('')}</ul>`
    : '<p class="clean">Nothing left for a person.</p>';
  return `<title>Mingle QA ${escapeHtml(env.startedAt?.slice(0, 10) || '')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap">
<style>
/* Layout: one reading column of run summary → S0/S1 → scenario cards → manual checklist; cards hold findings, oracle, scores, screens. */
:root {
  --bg: #fbfaf7; --surface: #ffffff; --ink: #1f1b16; --muted: #6f675d; --line: #e7e1d8;
  --accent: #d9730d; --accent-soft: #fdf0e1;
  --pass: #2f7d4f; --pass-soft: #e6f3eb; --concern: #9a6a00; --concern-soft: #fbf1d6;
  --fail: #b8322a; --fail-soft: #fbe6e3; --blocked: #5d6470; --blocked-soft: #eceef1; --manual: #2f62a8; --manual-soft: #e5eef9;
  --font-body: "IBM Plex Sans KR", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #16130f; --surface: #1f1b16; --ink: #f1ece4; --muted: #a89f93; --line: #342e27;
  --accent: #f0943a; --accent-soft: #3a2614;
  --pass: #6cc28f; --pass-soft: #1b3326; --concern: #e3b54a; --concern-soft: #3a2f12;
  --fail: #f07a70; --fail-soft: #401c19; --blocked: #a9b0bb; --blocked-soft: #2a2e34; --manual: #7fb0ef; --manual-soft: #1b2a3f;
  color-scheme: dark; } }
:root[data-theme="dark"] {
  --bg: #16130f; --surface: #1f1b16; --ink: #f1ece4; --muted: #a89f93; --line: #342e27;
  --accent: #f0943a; --accent-soft: #3a2614;
  --pass: #6cc28f; --pass-soft: #1b3326; --concern: #e3b54a; --concern-soft: #3a2f12;
  --fail: #f07a70; --fail-soft: #401c19; --blocked: #a9b0bb; --blocked-soft: #2a2e34; --manual: #7fb0ef; --manual-soft: #1b2a3f;
  color-scheme: dark; }
body { background: var(--bg); color: var(--ink); font: 15px/1.6 var(--font-body); }
.wrap { max-width: 920px; margin: 0 auto; padding-inline: 20px; padding-block: 32px 64px; display: grid; gap: 28px; }
h1, h2, h3, h4 { text-wrap: balance; margin: 0; }
h1 { font-size: 1.9rem; font-weight: 700; letter-spacing: -0.01em; }
h2 { font-size: 1.15rem; font-weight: 600; }
h3 { font-size: 1.05rem; font-weight: 600; }
h4 { font-size: 0.78rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin-top: 18px; }
p { margin: 0; }
code { font: 0.85em var(--font-mono); background: var(--accent-soft); padding: 0.05em 0.35em; border-radius: 4px; overflow-wrap: anywhere; }
.eyebrow { font: 500 0.78rem var(--font-mono); color: var(--accent); letter-spacing: 0.04em; text-transform: uppercase; }
.masthead { display: grid; gap: 10px; }
.meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 6px 20px; font-size: 0.85rem; color: var(--muted); }
.meta b { color: var(--ink); font-weight: 500; display: block; overflow-wrap: anywhere; }
.summary { max-width: 65ch; font-size: 1rem; }
.counts { display: flex; flex-wrap: wrap; gap: 8px; }
.count, .verdict { font: 600 0.8rem var(--font-body); padding: 4px 10px; border-radius: 999px; white-space: nowrap; }
.v-pass { color: var(--pass); background: var(--pass-soft); }
.v-concern { color: var(--concern); background: var(--concern-soft); }
.v-fail { color: var(--fail); background: var(--fail-soft); }
.v-blocked { color: var(--blocked); background: var(--blocked-soft); }
.v-manual { color: var(--manual); background: var(--manual-soft); }
.majors { display: grid; gap: 8px; padding: 0; margin: 0; list-style: none; }
.majors li { display: grid; grid-template-columns: auto 1fr; gap: 10px; align-items: baseline; }
.majors a { color: var(--ink); text-decoration-color: var(--line); }
.scenario { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 20px; display: grid; gap: 8px; min-width: 0; }
.scenario-head { display: flex; gap: 12px; align-items: flex-start; }
.scenario-head > div { min-width: 0; }
.id { font: 0.8rem var(--font-mono); color: var(--muted); }
.findings, .oracle, .evidence, .plain, .checklist { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
.finding { border-left: 3px solid var(--line); padding: 2px 0 2px 12px; display: grid; gap: 4px; }
.sev-S0, .sev-S1 { border-left-color: var(--fail); }
.sev-S2 { border-left-color: var(--concern); }
.sev-S3 { border-left-color: var(--line); }
.finding-head { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 0.78rem; }
.sev { font-weight: 600; }
.sev-S0 .sev, .sev-S1 .sev { color: var(--fail); }
.sev-S2 .sev { color: var(--concern); }
.sev-S3 .sev { color: var(--muted); }
.rule { font-family: var(--font-mono); color: var(--accent); background: var(--accent-soft); border-radius: 4px; padding: 0 5px; }
.repro { color: var(--muted); }
.evidence { gap: 2px; font-size: 0.82rem; color: var(--muted); }
.evidence li::before { content: "↳ "; }
.oracle li { display: grid; grid-template-columns: 18px 1fr; gap: 8px; font-size: 0.92rem; }
.mark { width: 12px; height: 12px; border-radius: 50%; margin-top: 6px; border: 2px solid var(--muted); }
.oracle-held .mark { background: var(--pass); border-color: var(--pass); }
.oracle-failed .mark { background: var(--fail); border-color: var(--fail); }
.note { color: var(--muted); font-size: 0.85em; }
.clean { color: var(--muted); font-size: 0.92rem; }
.hint { text-transform: none; letter-spacing: 0; font-weight: 400; }
.table-wrap { overflow-x: auto; }
table.scores { border-collapse: collapse; width: 100%; font-size: 0.88rem; min-width: 520px; }
.scores th { text-align: left; font-weight: 500; color: var(--muted); border-bottom: 1px solid var(--line); padding: 6px 8px; }
.scores td { border-bottom: 1px solid var(--line); padding: 8px; vertical-align: top; }
.num { text-align: center; font-variant-numeric: tabular-nums; font-family: var(--font-mono); }
.score.s1, .score.s2 { color: var(--fail); font-weight: 600; }
.score.s3 { color: var(--concern); }
.avg.ok { color: var(--pass); font-weight: 600; }
.avg.bad { color: var(--fail); font-weight: 600; }
.lang { font: 500 0.72rem var(--font-mono); color: var(--accent); margin-right: 6px; text-transform: uppercase; }
.msg { min-width: 0; }
.shots { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
figure { margin: 0; display: grid; gap: 6px; }
figure img { width: 100%; border-radius: 10px; border: 1px solid var(--line); display: block; }
figcaption { font-size: 0.78rem; color: var(--muted); }
.checklist li { display: flex; gap: 10px; align-items: flex-start; }
.checklist input { margin-top: 5px; accent-color: var(--accent); }
.checklist label { cursor: pointer; }
section.block { display: grid; gap: 12px; }
footer { font-size: 0.82rem; color: var(--muted); border-top: 1px solid var(--line); padding-top: 16px; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
<main class="wrap">
  <header class="masthead">
    <p class="eyebrow">Agent QA · ${escapeHtml(env.device || 'iPhone')}</p>
    <h1>Mingle QA run</h1>
    <p class="summary">${inline(results.summary || '')}</p>
    <div class="counts">${counts}</div>
    <div class="meta">
      <span>Branch<b>${escapeHtml(env.branch)}</b></span>
      <span>Commit<b>${escapeHtml(env.commit)}</b></span>
      <span>Device<b>${escapeHtml(env.device)} · iOS ${escapeHtml(env.ios)}</b></span>
      <span>Build<b>${escapeHtml(env.build)}</b></span>
      <span>Server<b>${escapeHtml(env.server)}</b></span>
      <span>Started (UTC)<b>${escapeHtml(env.startedAt)}</b></span>
    </div>
  </header>
  <section class="block">
    <h2>Needs attention</h2>
    ${majors.length ? `<ul class="majors">${majors.map(({ scenario, finding }) => `<li><span class="verdict v-fail">${escapeHtml(finding.severity)}</span><a href="#${escapeHtml(scenario.id)}">${inline(finding.summary)}</a></li>`).join('')}</ul>` : '<p class="clean">No S0 or S1 findings.</p>'}
  </section>
  ${scenarios.map((scenario) => renderScenario(runDir, scenario)).join('\n')}
  <section class="block">
    <h2>Manual checklist</h2>
    ${checklist}
  </section>
  <section class="block">
    <h2>Coverage gaps</h2>
    ${list(results.coverageGaps)}
  </section>
  ${results.toolingNotes?.length ? `<section class="block"><h2>Run notes</h2>${list(results.toolingNotes)}</section>` : ''}
  <footer>Disagree with a verdict? Tell Claude which one and why. The matching rule in <code>mingle-app/qa/agent/taste.md</code> gets updated, so the next run judges the way you would.</footer>
</main>
`;
}

const runDir = process.argv[2];
if (!runDir) {
  console.error('usage: node scripts/qa-agent-report.mjs <run-dir>');
  process.exit(2);
}
const results = JSON.parse(fs.readFileSync(path.join(runDir, 'results.json'), 'utf8'));
const html = render(runDir, results);
const output = path.join(runDir, 'report.html');
fs.writeFileSync(output, html);
console.log(JSON.stringify({ output, bytes: Buffer.byteLength(html) }));
