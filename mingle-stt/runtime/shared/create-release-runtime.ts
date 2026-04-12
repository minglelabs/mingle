import type {
    MingleSttBehaviorProfile,
    MingleSttReleaseVariant,
} from '../../behavior-profile';

export type MingleSttModel =
    | 'gladia'
    | 'gladia-stt'
    | 'deepgram'
    | 'deepgram-multi'
    | 'fireworks'
    | 'soniox';

export type MingleSttClientConfig = {
    sample_rate: number;
    languages: string[];
    stt_model: MingleSttModel;
    api_namespace?: string;
    behavior_profile?: MingleSttBehaviorProfile;
    release_variant?: MingleSttReleaseVariant;
    lang_hints_strict?: boolean;
    soniox_language_hints?: string[];
    soniox_manual_finalize_silence_ms?: number;
};

export type MingleSttFinalTurnPayload = {
    text: string;
    language: string;
    speaker?: string;
    turn_id?: string;
} | null;

type ReadyPayloadInput = {
    sonioxLanguageHintsEnabled: boolean;
};

type StopRecordingAckInput = {
    finalizedTurns: MingleSttFinalTurnPayload[];
};

export type MingleSttReadyPayload = {
    status: 'ready';
    release_variant: MingleSttReleaseVariant;
    behavior_profile: MingleSttBehaviorProfile;
    soniox_language_hints_enabled: boolean;
};

export type MingleSttStopRecordingAckData = {
    release_variant: MingleSttReleaseVariant;
    behavior_profile: MingleSttBehaviorProfile;
    finalized: boolean;
    final_turn: MingleSttFinalTurnPayload;
    final_turns: MingleSttFinalTurnPayload[];
};

export type MingleSttConnectionStarters = {
    startGladia: (config: MingleSttClientConfig, enableTranslation: boolean) => void;
    startDeepgram: (config: MingleSttClientConfig) => void;
    startDeepgramMulti: (config: MingleSttClientConfig) => void;
    startFireworks: (config: MingleSttClientConfig) => void;
    startSoniox: (config: MingleSttClientConfig) => void;
};

export type MingleSttStopRecordingLifecycle = {
    setSonioxStopRequested: (nextValue: boolean) => void;
    finalizePendingTurnFromProvider: (() => Promise<MingleSttFinalTurnPayload>) | null;
    finalizeAllPendingTurnsFromProvider: (() => Promise<MingleSttFinalTurnPayload[]>) | null;
    sendForcedFinalTurn: (
        rawText: string,
        rawLanguage: string,
        rawSpeaker?: string,
    ) => MingleSttFinalTurnPayload;
    closeProviderSocket: () => void;
    sendStopRecordingAck: (data: MingleSttStopRecordingAckData) => void;
    scheduleClientCloseAfterAck: () => void;
    disposeSpeakerStates: () => void;
};

export type MingleSttReleaseRuntime = {
    readonly releaseVariant: MingleSttReleaseVariant;
    readonly behaviorLine: MingleSttBehaviorProfile;
    buildReadyPayload: (input: ReadyPayloadInput) => MingleSttReadyPayload;
    buildStopRecordingAckData: (input: StopRecordingAckInput) => MingleSttStopRecordingAckData;
    startConnectionForModel: (input: {
        config: MingleSttClientConfig;
        starters: MingleSttConnectionStarters;
    }) => void;
    handleStopRecording: (input: {
        pendingText: string;
        pendingLanguage: string;
        currentModel: MingleSttModel;
        lifecycle: MingleSttStopRecordingLifecycle;
    }) => void;
};

export function createReleaseRuntime(
    releaseVariant: MingleSttReleaseVariant,
    behaviorLine: MingleSttBehaviorProfile,
): MingleSttReleaseRuntime {
    const buildReadyPayload = ({ sonioxLanguageHintsEnabled }: ReadyPayloadInput): MingleSttReadyPayload => ({
        status: 'ready',
        release_variant: releaseVariant,
        behavior_profile: behaviorLine,
        soniox_language_hints_enabled: sonioxLanguageHintsEnabled,
    });

    const buildStopRecordingAckData = ({ finalizedTurns }: StopRecordingAckInput): MingleSttStopRecordingAckData => {
        const normalizedTurns = finalizedTurns.filter(
            (turn): turn is Exclude<MingleSttFinalTurnPayload, null> => Boolean(turn),
        );

        return {
            release_variant: releaseVariant,
            behavior_profile: behaviorLine,
            finalized: normalizedTurns.length > 0,
            final_turn: normalizedTurns[normalizedTurns.length - 1] || null,
            final_turns: normalizedTurns,
        };
    };

    return {
        releaseVariant,
        behaviorLine,
        buildReadyPayload,
        buildStopRecordingAckData,
        startConnectionForModel: ({ config, starters }) => {
            switch (config.stt_model) {
                case 'deepgram':
                    starters.startDeepgram(config);
                    return;
                case 'deepgram-multi':
                    starters.startDeepgramMulti(config);
                    return;
                case 'fireworks':
                    starters.startFireworks(config);
                    return;
                case 'soniox':
                    starters.startSoniox(config);
                    return;
                case 'gladia-stt':
                    starters.startGladia(config, false);
                    return;
                case 'gladia':
                default:
                    starters.startGladia(config, true);
            }
        },
        handleStopRecording: ({
            pendingText,
            pendingLanguage,
            currentModel,
            lifecycle,
        }) => {
            const cleanedPendingText = pendingText.trim();
            lifecycle.setSonioxStopRequested(currentModel === 'soniox');

            void (async () => {
                let finalizedTurns: MingleSttFinalTurnPayload[] = [];

                if (currentModel === 'soniox' && lifecycle.finalizeAllPendingTurnsFromProvider) {
                    finalizedTurns = await lifecycle.finalizeAllPendingTurnsFromProvider();
                } else if (cleanedPendingText) {
                    const finalizedTurn = lifecycle.sendForcedFinalTurn(pendingText, pendingLanguage);
                    finalizedTurns = finalizedTurn ? [finalizedTurn] : [];
                } else if (lifecycle.finalizePendingTurnFromProvider) {
                    const finalizedTurn = await lifecycle.finalizePendingTurnFromProvider();
                    finalizedTurns = finalizedTurn ? [finalizedTurn] : [];
                }

                lifecycle.closeProviderSocket();
                lifecycle.sendStopRecordingAck(
                    buildStopRecordingAckData({ finalizedTurns }),
                );
                lifecycle.scheduleClientCloseAfterAck();
                if (currentModel !== 'soniox') {
                    lifecycle.disposeSpeakerStates();
                }
            })();
        },
    };
}
