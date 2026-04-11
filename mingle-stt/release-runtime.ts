import type { MingleSttReleaseVariant } from './behavior-profile';
import legacyV1011Runtime from './runtime/legacy/v1.0.11';
import iosV1011Runtime from './runtime/ios/v1.0.11';
import androidV1011Runtime from './runtime/android/v1.0.11';
import iosV110Runtime from './runtime/ios/v1.1.0';
import androidV110Runtime from './runtime/android/v1.1.0';

export type {
    MingleSttClientConfig,
    MingleSttConnectionStarters,
    MingleSttFinalTurnPayload,
    MingleSttModel,
    MingleSttReleaseRuntime,
    MingleSttStopRecordingLifecycle,
} from './runtime/shared/create-release-runtime';

const releaseRuntimes = {
    legacy_default_v1_0_11: legacyV1011Runtime,
    ios_v1_0_11: iosV1011Runtime,
    android_v1_0_11: androidV1011Runtime,
    ios_v1_1_0: iosV110Runtime,
    android_v1_1_0: androidV110Runtime,
} satisfies Record<MingleSttReleaseVariant, typeof legacyV1011Runtime>;

export function resolveMingleSttReleaseRuntime(
    releaseVariant: MingleSttReleaseVariant,
) {
    return releaseRuntimes[releaseVariant];
}
