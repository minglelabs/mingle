import { describe, expect, it } from "vitest";

import { GET } from "./route";

const DEFAULT_APP_ID = "3RFBMN8TKZ.com.minglelabs.mingle.rn";

type AppleAppSiteAssociation = {
  applinks: {
    details: Array<{
      appID: string;
      appIDs: string[];
      paths: string[];
      components: Array<Record<string, string>>;
    }>;
  };
};

async function readAssociation(): Promise<AppleAppSiteAssociation> {
  const response = GET();
  expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
  return (await response.json()) as AppleAppSiteAssociation;
}

describe("apple-app-site-association", () => {
  it("declares the app ID in both appID and appIDs", async () => {
    const association = await readAssociation();
    const [detail] = association.applinks.details;

    const expectedAppId = process.env.IOS_ASSOCIATED_DOMAINS_APP_ID?.trim() || DEFAULT_APP_ID;
    expect(detail.appID).toBe(expectedAppId);
    expect(detail.appIDs).toEqual([expectedAppId]);
  });

  // The /s/ share link regression: universal links only open the app for
  // paths listed here, so /s/ must appear in exactly the same places /p/
  // does, in both the legacy `paths` array and the modern `components`.
  it("lists /s/ wherever /p/ appears", async () => {
    const association = await readAssociation();

    for (const detail of association.applinks.details) {
      const profilePaths = detail.paths.filter((value) => value.startsWith("/p/"));
      const sharePaths = detail.paths.filter((value) => value.startsWith("/s/"));
      expect(sharePaths).toHaveLength(profilePaths.length);
      expect(detail.paths).toContain("/p/*");
      expect(detail.paths).toContain("/s/*");

      const componentPaths = detail.components.map((component) => component["/"]);
      expect(componentPaths).toContain("/p/*");
      expect(componentPaths).toContain("/s/*");
      expect(componentPaths.filter((value) => value?.startsWith("/s/"))).toHaveLength(
        componentPaths.filter((value) => value?.startsWith("/p/")).length,
      );
    }
  });

  it("gives the /s/ entry the same component shape as /p/", async () => {
    const association = await readAssociation();
    const [detail] = association.applinks.details;

    const profileComponent = detail.components.find((component) => component["/"] === "/p/*");
    const shareComponent = detail.components.find((component) => component["/"] === "/s/*");

    expect(profileComponent).toBeDefined();
    expect(shareComponent).toBeDefined();
    expect(Object.keys(shareComponent ?? {}).sort()).toEqual(
      Object.keys(profileComponent ?? {}).sort(),
    );
  });
});
