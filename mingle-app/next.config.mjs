import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  outputFileTracingRoot: appRoot,
  // The Railway image ships only the traced standalone server, not the full
  // node_modules tree, so the image copies, exports and pulls much faster.
  output: process.env.MINGLE_NEXT_STANDALONE === "1" ? "standalone" : undefined,
  typescript: {
    // CI runs `tsc --noEmit` on every PR; the Railway build skips the repeat.
    ignoreBuildErrors: process.env.MINGLE_SKIP_BUILD_TYPECHECK === "1",
  },
  experimental: {
    staleTimes: {
      // How long a fully prefetched route stays usable without a server
      // round-trip. The native tab bar prefetches its tab roots (which carry no
      // server-loaded data) and relies on this so that a tab tap still commits
      // from memory after the app has sat in the background for hours.
      static: 60 * 60 * 24,
    },
    // Railway keeps .next/cache in a build cache mount (Dockerfile.railway), so
    // Turbopack recompiles only modules that changed since the last deploy.
    turbopackFileSystemCacheForBuild: process.env.MINGLE_TURBOPACK_BUILD_CACHE === "1",
  },
  async rewrites() {
    return [
      // Apps below 2.2.0 are force-updated: their own route trees are gone, but
      // they still ask their namespaced version-policy endpoint on launch. The
      // handler decides from the request body's clientVersion, not the URL, so
      // serving them from v2.2.0 returns the same force_update answer. Every
      // other pre-2.2.0 path is intentionally left to 404.
      {
        source: "/api/:platform(ios|android)/:version(v1\\.\\d+\\.\\d+|v2\\.[01]\\.\\d+)/client/version-policy",
        destination: "/api/:platform/v2.2.0/client/version-policy",
      },
      {
        source: "/.well-known/apple-app-site-association",
        destination: "/api/well-known/apple-app-site-association",
      },
      {
        source: "/.well-known/assetlinks.json",
        destination: "/api/well-known/assetlinks",
      },
      // 2.3.0 adds no server contract of its own (it ships the in-app purchase
      // store against the v2.2.0 routes), so it aliases the v2.2.0 tree too.
      // 2.3.1 (device-audio capture in earphone mode) adds none either.
      ...['ios', 'android'].flatMap(platform => [
        { source: `/api/${platform}/v2.3.1`, destination: `/api/${platform}/v2.2.0` },
        { source: `/api/${platform}/v2.3.1/:path*`, destination: `/api/${platform}/v2.2.0/:path*` },
      ]),
      ...['ios', 'android'].flatMap(platform => [
        { source: `/api/${platform}/v2.3.0`, destination: `/api/${platform}/v2.2.0` },
        { source: `/api/${platform}/v2.3.0/:path*`, destination: `/api/${platform}/v2.2.0/:path*` },
      ]),
      // 2.2.1 is a patch release: it keeps the v2.2.0 server contract while
      // using its own versioned namespace.
      ...['ios', 'android'].flatMap(platform => [
        { source: `/api/${platform}/v2.2.1`, destination: `/api/${platform}/v2.2.0` },
        { source: `/api/${platform}/v2.2.1/:path*`, destination: `/api/${platform}/v2.2.0/:path*` },
      ]),
    ];
  },
  turbopack: {
    root: appRoot,
  },
};

export default nextConfig;
