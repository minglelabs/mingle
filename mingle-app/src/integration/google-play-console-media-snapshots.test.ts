import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildFileMediaSnapshot,
  buildScreenshotMediaSnapshot,
  mediaSnapshotsEqual,
  normalizeMediaSnapshots,
} from "../../../scripts/google-play-console-media-snapshots.mjs";

const configJsonPath = path.resolve(
  process.cwd(),
  "rn/google-play-console-info/google-play-console-info.i18n.json",
);
const workspaceRoot = path.dirname(configJsonPath);
const payload = JSON.parse(fs.readFileSync(configJsonPath, "utf8")) as {
  googlePlay?: {
    assets?: {
      iconPath?: string;
      featureGraphicPath?: string;
      phoneScreenshotsDir?: string;
    };
    mediaSnapshots?: unknown;
  };
};

function listImageFiles(directoryPath: string): string[] {
  return fs
    .readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .filter((fileName) => /\.(png|jpg|jpeg)$/i.test(fileName))
    .sort((left, right) => left.localeCompare(right, "en"));
}

describe("google-play-console media snapshots", () => {
  it("keeps uploaded media snapshots aligned with the local Play asset workspace", () => {
    const assets = payload.googlePlay?.assets;
    const iconPath = path.resolve(workspaceRoot, assets?.iconPath ?? "");
    const featureGraphicPath = path.resolve(workspaceRoot, assets?.featureGraphicPath ?? "");
    const screenshotRoot = path.resolve(workspaceRoot, assets?.phoneScreenshotsDir ?? "");
    const uploadLocales = fs
      .readdirSync(screenshotRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right, "en"));

    const expectedSnapshots = {
      icon: buildFileMediaSnapshot(iconPath, workspaceRoot),
      featureGraphic: buildFileMediaSnapshot(featureGraphicPath, workspaceRoot),
      phoneScreenshots: Object.fromEntries(
        uploadLocales.map((uploadLocale) => {
          const localeDir = path.join(screenshotRoot, uploadLocale);
          const screenshotPaths = listImageFiles(localeDir).map((fileName) =>
            path.join(localeDir, fileName),
          );
          return [uploadLocale, buildScreenshotMediaSnapshot(screenshotPaths, workspaceRoot)];
        }),
      ),
    };

    expect(
      mediaSnapshotsEqual(
        normalizeMediaSnapshots(payload.googlePlay?.mediaSnapshots),
        expectedSnapshots,
      ),
    ).toBe(true);
  });
});
