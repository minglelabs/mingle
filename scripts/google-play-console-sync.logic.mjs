import { cloneMediaSnapshots } from "./google-play-console-media-snapshots.mjs";

export function shouldPersistSharedMediaSnapshots(args) {
  return args.selectedLocaleCount === args.totalLocaleCount;
}

export function buildUpdatedMediaSnapshots(existingSnapshots, planBundle, options) {
  const nextSnapshots = cloneMediaSnapshots(existingSnapshots);

  if (options.skipImages) {
    return nextSnapshots;
  }

  const shouldPersistShared = shouldPersistSharedMediaSnapshots({
    totalLocaleCount: planBundle.allUploadLocales.length,
    selectedLocaleCount: planBundle.plans.length,
  });

  if (shouldPersistShared && !options.skipIcon && planBundle.mediaSnapshots.current.icon) {
    nextSnapshots.icon = planBundle.mediaSnapshots.current.icon;
  }

  if (
    shouldPersistShared
    && !options.skipFeatureGraphic
    && planBundle.mediaSnapshots.current.featureGraphic
  ) {
    nextSnapshots.featureGraphic = planBundle.mediaSnapshots.current.featureGraphic;
  }

  if (!options.skipScreenshots) {
    for (const localePlan of planBundle.plans) {
      nextSnapshots.phoneScreenshots[localePlan.uploadLocale] =
        localePlan.mediaSnapshots.screenshotsCurrent;
    }
  }

  return nextSnapshots;
}
