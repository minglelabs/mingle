import type { MingleSttReleaseVariant } from './behavior-profile';
import legacyV1011Runtime from './runtime/legacy/v1.0.11';
import defaultV110Runtime from './runtime/default/v1.1.0';
import defaultV111Runtime from './runtime/default/v1.1.1';
import iosV1011Runtime from './runtime/ios/v1.0.11';
import androidV1011Runtime from './runtime/android/v1.0.11';
import iosV110Runtime from './runtime/ios/v1.1.0';
import androidV110Runtime from './runtime/android/v1.1.0';
import iosV111Runtime from './runtime/ios/v1.1.1';
import androidV111Runtime from './runtime/android/v1.1.1';

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
    default_v1_1_0: defaultV110Runtime,
    default_v1_1_1: defaultV111Runtime,
    ios_v1_0_11: iosV1011Runtime,
    android_v1_0_11: androidV1011Runtime,
    ios_v1_1_0: iosV110Runtime,
    android_v1_1_0: androidV110Runtime,
    ios_v1_1_1: iosV111Runtime,
    android_v1_1_1: androidV111Runtime,
} satisfies Record<MingleSttReleaseVariant, typeof legacyV1011Runtime>;

export function resolveMingleSttReleaseRuntime(
    releaseVariant: MingleSttReleaseVariant,
) {
    return releaseRuntimes[releaseVariant];
}
