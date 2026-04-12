import { describe, expect, it } from "vitest";

import { buildUpdatedMediaSnapshots } from "../../../scripts/google-play-console-sync.logic.mjs";

describe("google-play-console sync logic", () => {
  it("keeps shared media snapshots unchanged during partial language syncs", () => {
    const existingSnapshots = {
      icon: { path: "old-icon.png", sha256: "old-icon", sizeBytes: 100 },
      featureGraphic: { path: "old-graphic.png", sha256: "old-graphic", sizeBytes: 200 },
      phoneScreenshots: {
        ko: [{ path: "old-ko-1.png", sha256: "old-ko", sizeBytes: 10 }],
        "en-us": [{ path: "old-en-1.png", sha256: "old-en", sizeBytes: 20 }],
      },
    };

    const nextSnapshots = buildUpdatedMediaSnapshots(existingSnapshots, {
      allUploadLocales: ["ko", "en-us"],
      plans: [
        {
          uploadLocale: "ko",
          mediaSnapshots: {
            screenshotsCurrent: [{ path: "new-ko-1.png", sha256: "new-ko", sizeBytes: 11 }],
          },
        },
      ],
      mediaSnapshots: {
        current: {
          icon: { path: "new-icon.png", sha256: "new-icon", sizeBytes: 101 },
          featureGraphic: { path: "new-graphic.png", sha256: "new-graphic", sizeBytes: 201 },
        },
      },
    }, {
      skipImages: false,
      skipIcon: false,
      skipFeatureGraphic: false,
      skipScreenshots: false,
    });

    expect(nextSnapshots).toEqual({
      icon: { path: "old-icon.png", sha256: "old-icon", sizeBytes: 100 },
      featureGraphic: { path: "old-graphic.png", sha256: "old-graphic", sizeBytes: 200 },
      phoneScreenshots: {
        ko: [{ path: "new-ko-1.png", sha256: "new-ko", sizeBytes: 11 }],
        "en-us": [{ path: "old-en-1.png", sha256: "old-en", sizeBytes: 20 }],
      },
    });
  });

  it("updates shared media snapshots when all locales are included", () => {
    const nextSnapshots = buildUpdatedMediaSnapshots({
      icon: null,
      featureGraphic: null,
      phoneScreenshots: {},
    }, {
      allUploadLocales: ["ko", "en-us"],
      plans: [
        {
          uploadLocale: "ko",
          mediaSnapshots: {
            screenshotsCurrent: [{ path: "ko-1.png", sha256: "ko", sizeBytes: 11 }],
          },
        },
        {
          uploadLocale: "en-us",
          mediaSnapshots: {
            screenshotsCurrent: [{ path: "en-1.png", sha256: "en", sizeBytes: 12 }],
          },
        },
      ],
      mediaSnapshots: {
        current: {
          icon: { path: "icon.png", sha256: "icon", sizeBytes: 101 },
          featureGraphic: { path: "graphic.png", sha256: "graphic", sizeBytes: 201 },
        },
      },
    }, {
      skipImages: false,
      skipIcon: false,
      skipFeatureGraphic: false,
      skipScreenshots: false,
    });

    expect(nextSnapshots).toEqual({
      icon: { path: "icon.png", sha256: "icon", sizeBytes: 101 },
      featureGraphic: { path: "graphic.png", sha256: "graphic", sizeBytes: 201 },
      phoneScreenshots: {
        ko: [{ path: "ko-1.png", sha256: "ko", sizeBytes: 11 }],
        "en-us": [{ path: "en-1.png", sha256: "en", sizeBytes: 12 }],
      },
    });
  });
});
