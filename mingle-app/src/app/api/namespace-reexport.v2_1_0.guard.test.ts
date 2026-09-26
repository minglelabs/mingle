import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Root of src/app/api, resolved from this test's own location.
const API_ROOT = fileURLToPath(new URL(".", import.meta.url));

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

const NAMESPACE_TARGET_VERSION = "2.1.0";

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
  const targets = namespaceTargetRoutes();

  it("has namespace-target routes to check", () => {
    expect(targets.length).toBeGreaterThan(0);
  });

  for (const platform of ["ios", "android"] as const) {
    describe(`${platform}/v${NAMESPACE_TARGET_VERSION}`, () => {
      it.each(targets)("re-exports %s", (routePath) => {
        const bare = join(API_ROOT, routePath, "route.ts");
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

        // Method-match guard: the re-export must expose exactly the source's
        // HTTP methods — no missing method, no stale extra method.
        const bareMethods = exportedHttpMethods(bare);
        expect(
          [...reexportMethods].sort(),
          `HTTP methods for ${platform}/v${NAMESPACE_TARGET_VERSION}/${routePath} must match the unversioned route`,
        ).toEqual([...bareMethods].sort());
      });
    });
  }
});
