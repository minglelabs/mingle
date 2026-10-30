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
      {
        source: "/.well-known/apple-app-site-association",
        destination: "/api/well-known/apple-app-site-association",
      },
      {
        source: "/.well-known/assetlinks.json",
        destination: "/api/well-known/assetlinks",
      },
      // Android 2.0.1 keeps the v2.0.0 server contract while using its own
      // versioned namespace, so existing production API behavior is preserved.
      {
        source: "/api/android/v2.0.1",
        destination: "/api/android/v2.0.0",
      },
      {
        source: "/api/android/v2.0.1/:path*",
        destination: "/api/android/v2.0.0/:path*",
      },
      // Android patch releases retain the same shared server contract.
      ...['2.0.2', '2.0.3', '2.0.4'].flatMap(version => [
        { source: `/api/android/v${version}`, destination: '/api/android/v2.0.0' },
        { source: `/api/android/v${version}/:path*`, destination: '/api/android/v2.0.0/:path*' },
      ]),
      // iOS 2.0.1 keeps the v2.0.0 server contract while using its own
      // versioned namespace, so existing production API behavior is preserved.
      {
        source: "/api/ios/v2.0.1",
        destination: "/api/ios/v2.0.0",
      },
      {
        source: "/api/ios/v2.0.1/:path*",
        destination: "/api/ios/v2.0.0/:path*",
      },
      // iOS 2.0.2 keeps the v2.0.0 server contract while using its own
      // versioned namespace, so existing production API behavior is preserved.
      {
        source: "/api/ios/v2.0.2",
        destination: "/api/ios/v2.0.0",
      },
      {
        source: "/api/ios/v2.0.2/:path*",
        destination: "/api/ios/v2.0.0/:path*",
      },
      // Preserve the prior beta namespace for device builds already installed.
      {
        source: "/api/ios/v2.0.3",
        destination: "/api/ios/v2.0.0",
      },
      {
        source: "/api/ios/v2.0.3/:path*",
        destination: "/api/ios/v2.0.0/:path*",
      },
      // iOS 2.0.4 keeps the v2.0.0 server contract while using its own
      // versioned namespace, so existing production API behavior is preserved.
      {
        source: "/api/ios/v2.0.4",
        destination: "/api/ios/v2.0.0",
      },
      {
        source: "/api/ios/v2.0.4/:path*",
        destination: "/api/ios/v2.0.0/:path*",
      },
      // 2.3.0 adds no server contract of its own (it ships the in-app purchase
      // store against the v2.2.0 routes), so it aliases the v2.2.0 tree too.
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
      // 2.1.1 is a patch release: it keeps the v2.1.0 server contract while
      // using its own versioned namespace.
      ...['ios', 'android'].flatMap(platform => [
        { source: `/api/${platform}/v2.1.1`, destination: `/api/${platform}/v2.1.0` },
        { source: `/api/${platform}/v2.1.1/:path*`, destination: `/api/${platform}/v2.1.0/:path*` },
      ]),
    ];
  },
  turbopack: {
    root: appRoot,
  },
};

export default nextConfig;
