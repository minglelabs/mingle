import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@/i18n/get-dictionary";
import {
  auditCopySources,
  auditLocaleTables,
  estimateWidthEm,
  findLongLabels,
  isLocaleKeyedTable,
  type CopySource,
  type I18nCoverageFinding,
} from "@/i18n/i18n-coverage.audit";
import baseline from "@/i18n/i18n-coverage.baseline.json";

// Every module that defines UI copy. Admin-only copy is Korean by design and
// is not collected.
// `import.meta.glob` is provided by Vite (vitest); typed here since the app
// tsconfig does not load vite/client.
type ViteGlob = (patterns: string[], options: { eager: true }) => Record<string, Record<string, unknown>>;
const modules = (import.meta as ImportMeta & { glob: ViteGlob }).glob([
  "/src/i18n/*.ts",
  "/src/components/**/*copy*.ts",
  "/src/components/**/*copy*.tsx",
  "/src/components/**/*.logic.ts",
  "/src/lib/*.ts",
  "!**/*.test.ts",
  "!**/i18n-coverage*.ts",
  "!/src/lib/admin-*.ts",
  "!/src/lib/*server*.ts",
], { eager: true });

function collectSources() {
  const resolvers: CopySource[] = [{ name: "dictionary", resolve: (locale) => getDictionary(locale) }];
  const tables: Array<{ name: string; table: Record<string, unknown> }> = [];
  for (const [file, exports] of Object.entries(modules)) {
    const short = file.replace(/^\/src\//, "");
    for (const [exportName, value] of Object.entries(exports as Record<string, unknown>)) {
      if (typeof value === "function" && /^(resolve|get)\w*Copy$/.test(exportName) && value.length <= 1) {
        resolvers.push({ name: `${short}#${exportName}`, resolve: (locale) => (value as (l: string) => unknown)(locale) });
      } else if (isLocaleKeyedTable(value)) {
        tables.push({ name: `${short}#${exportName}`, table: value });
      }
    }
  }
  return { resolvers, tables };
}

function findingKey(f: I18nCoverageFinding) {
  return `${f.kind}|${f.source}|${f.locale}|${f.path}`;
}

export function runI18nCoverageAudit() {
  const { resolvers, tables } = collectSources();
  const findings = [...auditCopySources(resolvers), ...auditLocaleTables(tables)];
  const unique = new Map(findings.map((f) => [findingKey(f), f]));
  return { resolvers: resolvers.length, tables: tables.length, findings: [...unique.values()] };
}

describe("i18n coverage across the 15 primary UI locales", () => {
  it("finds copy sources to audit", () => {
    const { resolvers, tables } = collectSources();
    expect(resolvers.length + tables.length).toBeGreaterThan(30);
  });

  it("has no untranslated strings beyond the accepted baseline", () => {
    const { findings } = runI18nCoverageAudit();
    const accepted = new Set(baseline.accepted);
    const fresh = findings.filter((f) => !accepted.has(findingKey(f)));
    if (process.env.I18N_AUDIT_DUMP) {
      console.log(JSON.stringify(findings, null, 1));
    }
    expect(fresh.map((f) => `${findingKey(f)} = ${JSON.stringify(f.value)}`)).toEqual([]);
  });
});

describe("long labels (watch list for the on-device overflow sweep)", () => {
  it("estimates CJK wider per character than Latin", () => {
    expect(estimateWidthEm("팔로잉")).toBe(3);
    expect(estimateWidthEm("Đang theo dõi")).toBeGreaterThan(estimateWidthEm("팔로잉") * 2);
  });

  it("ranks the labels that grow most against Korean", () => {
    const { resolvers } = collectSources();
    const labels = findLongLabels(resolvers);
    expect(labels.every((label) => label.vsKorean >= 1.8)).toBe(true);
    // `pnpm qa:i18n:long-labels` writes the list for the /qa agent.
    const out = process.env.I18N_LONG_LABELS_OUT;
    if (out) {
      fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
      fs.writeFileSync(out, `${JSON.stringify(labels, null, 2)}\n`);
    }
  });
});
