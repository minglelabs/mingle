import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = path.resolve(__dirname, "..");

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) return listSourceFiles(fullPath);
    if (!/\.(ts|tsx)$/.test(entry) || /\.test\.(ts|tsx)$/.test(entry)) return [];
    return [fullPath];
  });
}

function readSource(relativePath: string): string {
  return readFileSync(path.join(SRC_ROOT, relativePath), "utf8");
}

const sourceFiles = listSourceFiles(SRC_ROOT).map((file) => ({
  relativePath: path.relative(SRC_ROOT, file).split(path.sep).join("/"),
  source: readFileSync(file, "utf8"),
}));

describe("native banner policy wiring", () => {
  it("sends native_set_banner_zone from the zone module only", () => {
    const senders = sourceFiles
      .filter(({ source }) => source.includes("native_set_banner_zone"))
      .map(({ relativePath }) => relativePath);

    expect(senders).toEqual(["lib/native-banner-zone.ts"]);
  });

  it("does not expose a way to post a banner zone around the arbiter", () => {
    const bypasses = sourceFiles
      .filter(({ source }) => /\bpostNativeBannerZone\b/.test(source))
      .map(({ relativePath }) => relativePath);

    expect(bypasses).toEqual([]);
  });

  it("re-syncs the banner zone on every route change from the root layout", () => {
    expect(readSource("app/layout.tsx")).toContain("<NativeBannerRouteGuard />");
    expect(readSource("components/native-banner-route-guard.tsx")).toContain("syncNativeBannerZone()");
  });

  it("hides the banner for every shared layered screen and overlay", () => {
    for (const relativePath of [
      "components/LivePhoneDemo/MessageMediaDialog.tsx",
      "components/LivePhoneDemo/MessageReactionParticipants.tsx",
      "components/invite-friends-screen.tsx",
      "components/native-conversation-share-overlay.tsx",
      "components/native-profile-link-overlay.tsx",
      "components/notification-screen.tsx",
    ]) {
      expect(readSource(relativePath), relativePath).toContain("useNativeBannerSuppression(");
    }
  });

  it("keeps the banner on the chat room surface and hides it for every other slide surface", () => {
    expect(readSource("components/slide-surface.tsx"))
      .toContain('useNativeBannerSuppression(open && role !== "main")');
  });
});
