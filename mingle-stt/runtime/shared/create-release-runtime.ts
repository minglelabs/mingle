import type {
    MingleSttBehaviorProfile,
    MingleSttReleaseVariant,
} from '../../behavior-profile';

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

export function createReleaseRuntime(
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
