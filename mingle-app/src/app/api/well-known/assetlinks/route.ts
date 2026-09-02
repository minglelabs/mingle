import { NextResponse } from "next/server";

const DEFAULT_PACKAGE_NAME = "com.minglelabs.mingle.rn";

function readFingerprints(): string[] {
  return (process.env.ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function GET() {
  const fingerprints = readFingerprints();
  const packageName = process.env.ANDROID_APP_LINK_PACKAGE_NAME?.trim() || DEFAULT_PACKAGE_NAME;
  const statements = fingerprints.length === 0
    ? []
    : [{
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: packageName,
          sha256_cert_fingerprints: fingerprints,
        },
      }];

  return NextResponse.json(statements, {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}
