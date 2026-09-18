import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function mapUploadLocaleToJsonLocale(uploadLocaleDirName: string): string {
  const normalized = uploadLocaleDirName.trim().toLowerCase();
  if (normalized.length === 0) {
    return normalized;
  }

  const explicit: Record<string, string> = {
    "en-us": "en",
    "zh-hans": "zh-cn",
    "zh-hant": "zh-tw",
    "de-de": "de",
    "es-es": "es",
    "fr-fr": "fr",
    "fr-ca": "fr",
    "pt-br": "pt",
    "pt-pt": "pt",
    "ar-sa": "ar",
  };

  return explicit[normalized] ?? normalized.split("-")[0];
}

function readPngDimensions(filePath: string): { width: number; height: number } {
  const buffer = fs.readFileSync(filePath);
  const signature = buffer.subarray(0, 8).toString("hex");
  const pngSignature = "89504e470d0a1a0a";

  if (signature !== pngSignature) {
    throw new Error(`Not a PNG file: ${filePath}`);
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

const configJsonPath = path.resolve(
  process.cwd(),
  "rn/google-play-console-info/google-play-console-info.i18n.json",
);
const workspaceRoot = path.dirname(configJsonPath);
const payload = JSON.parse(fs.readFileSync(configJsonPath, "utf8")) as {
  googlePlay?: {
    release?: {
      version?: unknown;
      defaultTrack?: unknown;
      defaultReleaseStatus?: unknown;
      changesNotSentForReview?: unknown;
      releaseName?: unknown;
      releaseNotes?: Record<string, unknown>;
    };
    appDetails?: {
      packageName?: unknown;
      defaultLanguage?: unknown;
      contactEmail?: unknown;
      contactPhone?: unknown;
      contactWebsite?: unknown;
    };
    assets?: {
      iconPath?: unknown;
      featureGraphicPath?: unknown;
      phoneScreenshotsDir?: unknown;
    };
    storeListing?: {
      defaultMetadataLocale?: unknown;
      title?: Record<string, unknown>;
      shortDescription?: Record<string, unknown>;
      fullDescription?: Record<string, unknown>;
      video?: Record<string, unknown>;
    };
    manualOnly?: {
      privacyPolicyUrl?: unknown;
      termsOfUseUrl?: unknown;
      foregroundServiceDisclosure?: unknown;
    };
  };
};

const androidBuildGradlePath = path.resolve(process.cwd(), "rn/android/app/build.gradle");
const androidBuildGradle = fs.readFileSync(androidBuildGradlePath, "utf8");

function readAndroidReleaseValue(pattern: RegExp): string {
  const match = androidBuildGradle.match(pattern);
  if (!match?.[1]) {
    throw new Error(`Missing Android release value for pattern: ${pattern}`);
  }
  return match[1];
}

describe("google-play-console-info contract", () => {
  it("tracks a default Play release configuration in the same JSON", () => {
    const release = payload.googlePlay?.release;

    expect(isNonEmptyString(release?.defaultTrack)).toBe(true);
    expect(release?.defaultReleaseStatus).toBe("completed");
    expect(release?.changesNotSentForReview).toBe(false);
    expect(isNonEmptyString(release?.releaseName)).toBe(true);
    expect(isNonEmptyString(release?.releaseNotes?.["en-US"])).toBe(true);
  });

  it("keeps Play release metadata aligned with the Android app version code", () => {
    const release = payload.googlePlay?.release;
    const appVersionName = readAndroidReleaseValue(/def appVersionName = "([^"]+)"/);
    const appVersionCode = readAndroidReleaseValue(/def appVersionCode = (\d+)/);

    expect(release?.version).toBe(appVersionName);
    expect(release?.releaseName).toBe(`${appVersionName} (${appVersionCode})`);
  });

  it("includes Play app details and screenshot workspace paths", () => {
    const appDetails = payload.googlePlay?.appDetails;
    const assets = payload.googlePlay?.assets;

    expect(isNonEmptyString(appDetails?.packageName)).toBe(true);
    expect(isNonEmptyString(appDetails?.defaultLanguage)).toBe(true);
    expect(isNonEmptyString(appDetails?.contactEmail)).toBe(true);
    expect(isNonEmptyString(appDetails?.contactWebsite)).toBe(true);
    expect(typeof appDetails?.contactPhone === "string").toBe(true);
    expect(isNonEmptyString(assets?.iconPath)).toBe(true);
    expect(isNonEmptyString(assets?.phoneScreenshotsDir)).toBe(true);
  });

  it("keeps a 512x512 Play icon asset in the workspace", () => {
    const iconPath = payload.googlePlay?.assets?.iconPath as string;
    const resolvedPath = path.resolve(workspaceRoot, iconPath);

    expect(fs.existsSync(resolvedPath)).toBe(true);

    const dimensions = readPngDimensions(resolvedPath);
    expect(dimensions.width).toBe(512);
    expect(dimensions.height).toBe(512);
  });

  it("keeps a Play feature graphic asset in the workspace", () => {
    const assets = payload.googlePlay?.assets;
    const featureGraphicPath = path.resolve(
      workspaceRoot,
      assets?.featureGraphicPath as string,
    );

    expect(isNonEmptyString(assets?.featureGraphicPath)).toBe(true);
    expect(fs.existsSync(featureGraphicPath)).toBe(true);

    const dimensions = readPngDimensions(featureGraphicPath);
    expect(dimensions.width).toBe(1024);
    expect(dimensions.height).toBe(500);
  });

  it("keeps listing text and screenshots aligned for every Play upload locale", () => {
    const assets = payload.googlePlay?.assets;
    const storeListing = payload.googlePlay?.storeListing;
    const screenshotRoot = path.resolve(
      workspaceRoot,
      assets?.phoneScreenshotsDir as string,
    );
    const uploadLocales = fs
      .readdirSync(screenshotRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(uploadLocales.length).toBeGreaterThan(0);

    for (const uploadLocale of uploadLocales) {
      const copyLocale = mapUploadLocaleToJsonLocale(uploadLocale);
      expect(
        isNonEmptyString(storeListing?.title?.[copyLocale]),
        `missing title for Play locale ${uploadLocale} (${copyLocale})`,
      ).toBe(true);
      expect(
        isNonEmptyString(storeListing?.shortDescription?.[copyLocale]),
        `missing shortDescription for Play locale ${uploadLocale} (${copyLocale})`,
      ).toBe(true);
      expect(
        isNonEmptyString(storeListing?.fullDescription?.[copyLocale]),
        `missing fullDescription for Play locale ${uploadLocale} (${copyLocale})`,
      ).toBe(true);

      if (copyLocale === "en") {
        expect(
          isNonEmptyString(storeListing?.video?.[copyLocale]),
          "missing Play listing video for the default locale",
        ).toBe(true);
      }

      const imageFiles = fs
        .readdirSync(path.join(screenshotRoot, uploadLocale), { withFileTypes: true })
        .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
        .map((entry) => entry.name)
        .filter((fileName) => /\.(png|jpg|jpeg)$/i.test(fileName));

      expect(
        imageFiles.length,
        `missing phone screenshots for Play locale: ${uploadLocale}`,
      ).toBeGreaterThan(0);
    }
  });

  it("tracks console-only Play policy fields in the same JSON", () => {
    const manualOnly = payload.googlePlay?.manualOnly;
    expect(isNonEmptyString(manualOnly?.privacyPolicyUrl)).toBe(true);
    expect(isNonEmptyString(manualOnly?.termsOfUseUrl)).toBe(true);
    expect(isNonEmptyString(manualOnly?.foregroundServiceDisclosure)).toBe(true);
  });
});
