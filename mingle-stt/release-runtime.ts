import type {
    MingleSttBehaviorProfile,
    MingleSttReleaseVariant,
} from './behavior-profile';

type FinalTurnPayload = {
    text: string;
    language: string;
    speaker?: string;
} | null;

type ReadyPayloadInput = {
    behaviorProfile: MingleSttBehaviorProfile;
    sonioxLanguageHintsEnabled: boolean;
};

type StopRecordingAckInput = {
    behaviorProfile: MingleSttBehaviorProfile;
    finalizedTurn: FinalTurnPayload;
};

export type MingleSttReleaseRuntime = {
    readonly releaseVariant: MingleSttReleaseVariant;
    readonly behaviorLine: MingleSttBehaviorProfile;
    buildReadyPayload: (input: ReadyPayloadInput) => {
        status: 'ready';
        release_variant: MingleSttReleaseVariant;
        behavior_profile: MingleSttBehaviorProfile;
        soniox_language_hints_enabled: boolean;
    };
    buildStopRecordingAckData: (input: StopRecordingAckInput) => {
        release_variant: MingleSttReleaseVariant;
        behavior_profile: MingleSttBehaviorProfile;
        finalized: boolean;
        final_turn: FinalTurnPayload;
    };
};

function createReleaseRuntime(
    releaseVariant: MingleSttReleaseVariant,
    behaviorLine: MingleSttBehaviorProfile,
): MingleSttReleaseRuntime {
    return {
        releaseVariant,
        behaviorLine,
        buildReadyPayload: ({ behaviorProfile, sonioxLanguageHintsEnabled }) => ({
            status: 'ready',
            release_variant: releaseVariant,
            behavior_profile: behaviorProfile,
            soniox_language_hints_enabled: sonioxLanguageHintsEnabled,
        }),
        buildStopRecordingAckData: ({ behaviorProfile, finalizedTurn }) => ({
            release_variant: releaseVariant,
            behavior_profile: behaviorProfile,
            finalized: Boolean(finalizedTurn),
            final_turn: finalizedTurn,
        }),
    };
}

const releaseRuntimes: Record<MingleSttReleaseVariant, MingleSttReleaseRuntime> = {
    legacy_default_v1_0_11: createReleaseRuntime('legacy_default_v1_0_11', 'legacy_1_0_11'),
    ios_v1_0_11: createReleaseRuntime('ios_v1_0_11', 'legacy_1_0_11'),
    android_v1_0_11: createReleaseRuntime('android_v1_0_11', 'legacy_1_0_11'),
    ios_v1_1_0: createReleaseRuntime('ios_v1_1_0', 'v1_1_0'),
    android_v1_1_0: createReleaseRuntime('android_v1_1_0', 'v1_1_0'),
};

export function resolveMingleSttReleaseRuntime(
    releaseVariant: MingleSttReleaseVariant,
): MingleSttReleaseRuntime {
    return releaseRuntimes[releaseVariant];
}
