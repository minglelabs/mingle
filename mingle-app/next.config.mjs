import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  outputFileTracingRoot: appRoot,
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
    ];
  },
  turbopack: {
    root: appRoot,
  },
};

export default nextConfig;
