import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Root of src/app/api, resolved from this test's own location.
const API_ROOT = fileURLToPath(new URL(".", import.meta.url));

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

const NAMESPACE_TARGET_VERSION = "2.1.0";
// The previous minor namespace whose handlers 2.1.0 inherits unchanged.
const INHERITED_VERSION_DIR = "v2.0.0";

// Module specifiers a re-export file pulls from (`export { … } from "<spec>"`).
function reexportSpecifiers(filePath: string): string[] {
  const source = readFileSync(filePath, "utf8");
  return [...source.matchAll(/export\s*\{[^}]*\}\s*from\s*["']([^"']+)["']/g)].map((match) => match[1]);
}

// Route families that are NOT mirrored into a mobile namespace. This mirrors the
// long-standing convention (v2.0.0 never re-exported these) and is asserted
// explicitly here so the rule lives in code, not folklore:
//  - auth / native-auth: OAuth + native sign-in callbacks are host-absolute and
//    never called through a versioned namespace prefix.
//  - well-known: apple-app-site-association / assetlinks are fixed-path files
//    reached by the OS at the domain root, never under /api/{ns}.
//  - the bare `translate` and `messages` routes are legacy/never-namespaced;
//    only `translate/finalize` is a namespace target.
const EXCLUDED_TOP_LEVEL_SEGMENTS = new Set(["auth", "native-auth", "well-known", "ios", "android"]);
// Individual routes that are intentionally never mirrored into a mobile
// namespace. `account/delete` (a hard DELETE of the user record) has never been
// re-exported by ANY namespace, including v2.0.0 — the mobile app performs
// account removal through account/withdraw + account/deactivate instead. Keeping
// it out of the namespace preserves the long-standing contract; see the W3/V
// report's "contract gap" note.
const EXCLUDED_ROUTES = new Set(["translate", "messages", "account/delete"]);

function listRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listRouteFiles(full));
    } else if (entry === "route.ts") {
      out.push(full);
    }
  }
  return out;
}

// Collect the HTTP method identifiers a route.ts file exports, covering the two
// shapes used in this codebase: direct `export (async function|const) GET` and
// re-export `export { GET, POST } from "..."`.
function exportedHttpMethods(filePath: string): Set<HttpMethod> {
  const source = readFileSync(filePath, "utf8");
  const found = new Set<HttpMethod>();

  for (const method of HTTP_METHODS) {
    const directDecl = new RegExp(`export\\s+(?:async\\s+function|function|const|let|var)\\s+${method}\\b`);
    if (directDecl.test(source)) found.add(method);
  }

  for (const block of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const rawName of block[1].split(",")) {
      // Handle `GET` and `X as GET` — the *exported* name is what matters.
      const exportedName = rawName.includes(" as ")
        ? rawName.split(" as ")[1]
        : rawName;
      const name = exportedName.trim();
      if ((HTTP_METHODS as readonly string[]).includes(name)) {
        found.add(name as HttpMethod);
      }
    }
  }

  return found;
}

// The unversioned routes that must be mirrored into every mobile namespace.
function namespaceTargetRoutes(): string[] {
  const routes: string[] = [];
  for (const file of listRouteFiles(API_ROOT)) {
    const rel = relative(API_ROOT, file);
    const segments = rel.split("/");
    if (EXCLUDED_TOP_LEVEL_SEGMENTS.has(segments[0])) continue;
    const routePath = segments.slice(0, -1).join("/"); // drop trailing route.ts
    if (EXCLUDED_ROUTES.has(routePath)) continue;
    routes.push(routePath);
  }
  return routes.sort();
}

describe(`mingle-app v${NAMESPACE_TARGET_VERSION} namespace re-export guard`, () => {
  // 2.1.0 is a PURE mirror of the previous minor: it serves exactly what the
  // same platform's v2.0.0 namespace serves and nothing new (the posting feed
  // ships in 2.2.0, not here). So the routes this guard checks are the routes
  // that platform's v2.0.0 namespace actually has, not the full unversioned
  // route set — a route unique to a later release must NOT appear in v2.1.0.
  const allTargets = namespaceTargetRoutes();

  it("has namespace-target routes to check", () => {
    expect(allTargets.length).toBeGreaterThan(0);
  });

  for (const platform of ["ios", "android"] as const) {
    const inheritedRoot = join(API_ROOT, platform, INHERITED_VERSION_DIR);
    const targets = allTargets.filter((routePath) =>
      existsSync(join(inheritedRoot, routePath, "route.ts")),
    );

    describe(`${platform}/v${NAMESPACE_TARGET_VERSION}`, () => {
      it("mirrors every v2.0.0 route and adds none of its own", () => {
        expect(targets.length).toBeGreaterThan(0);
        // The v2.1.0 namespace must hold exactly the mirrored set — no extra
        // (e.g. posting) route.ts leaked in.
        const nsRoot = join(API_ROOT, platform, `v${NAMESPACE_TARGET_VERSION}`);
        const present = listRouteFiles(nsRoot)
          .map((file) => relative(nsRoot, file).split("/").slice(0, -1).join("/"))
          .sort();
        expect(present).toEqual([...targets].sort());
      });

      it.each(targets)("re-exports %s", (routePath) => {
        const reexport = join(API_ROOT, platform, `v${NAMESPACE_TARGET_VERSION}`, routePath, "route.ts");

        // Presence guard: a namespace-target route with no re-export fails here.
        let reexportMethods: Set<HttpMethod>;
        try {
          reexportMethods = exportedHttpMethods(reexport);
        } catch {
          throw new Error(
            `Missing re-export: ${platform}/v${NAMESPACE_TARGET_VERSION}/${routePath}/route.ts. ` +
              `Every namespace-target route must be re-exported into the ${platform} v${NAMESPACE_TARGET_VERSION} namespace.`,
          );
        }

        // Source guard: a route the same platform's v2.0.0 namespace already serves
        // is inherited from there (v2.0.0 pins several routes to platform
        // controllers that differ from the unversioned handler); a route new in
        // 2.1.0 comes from the unversioned handler.
        const inheritedFile = join(API_ROOT, platform, INHERITED_VERSION_DIR, routePath, "route.ts");
        const isInherited = existsSync(inheritedFile);
        const sourceFile = isInherited ? inheritedFile : join(API_ROOT, routePath, "route.ts");
        const sourceSpecifier = isInherited
          ? `@/app/api/${platform}/${INHERITED_VERSION_DIR}/${routePath}/route`
          : `@/app/api/${routePath}/route`;
        expect(
          reexportSpecifiers(reexport),
          `${platform}/v${NAMESPACE_TARGET_VERSION}/${routePath} must re-export from ${sourceSpecifier}`,
        ).toEqual([sourceSpecifier]);

        // Method-match guard: the re-export must expose exactly the source's
        // HTTP methods — no missing method, no stale extra method.
        expect(
          [...reexportMethods].sort(),
          `HTTP methods for ${platform}/v${NAMESPACE_TARGET_VERSION}/${routePath} must match ${sourceSpecifier}`,
        ).toEqual([...exportedHttpMethods(sourceFile)].sort());
      });
    });
  }
});
