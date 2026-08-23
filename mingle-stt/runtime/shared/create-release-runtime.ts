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

export type MingleSttFinalizeSource =
    | 'soniox_manual'
    | 'soniox_endpoint'
    | 'server_idle_snapshot'
    | 'server_stop_fallback'
    | 'server_timeout_fallback'
    | 'server_provider_close_fallback'
    | 'server_carry_expiry';

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
    stt_segmentation_mode?: string;
};

export type MingleSttFinalTurnPayload = {
    text: string;
    language: string;
    speaker?: string;
    finalize_source?: MingleSttFinalizeSource;
} | null;

type ReadyPayloadInput = {
    sonioxLanguageHintsEnabled: boolean;
};

type StopRecordingAckInput = {
    finalizedTurn: MingleSttFinalTurnPayload;
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
    finalizePendingTurnFromProvider: ((fallbackSource?: MingleSttFinalizeSource) => Promise<MingleSttFinalTurnPayload>) | null;
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

    const buildStopRecordingAckData = ({ finalizedTurn }: StopRecordingAckInput): MingleSttStopRecordingAckData => ({
        release_variant: releaseVariant,
        behavior_profile: behaviorLine,
        finalized: Boolean(finalizedTurn),
        final_turn: finalizedTurn,
    });

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
            const usesGracefulProviderFinalize = behaviorLine === 'v1_1_3';

            if (!usesGracefulProviderFinalize) {
                lifecycle.setSonioxStopRequested(currentModel === 'soniox');

                let finalizedTurn: MingleSttFinalTurnPayload = null;

                if (currentModel === 'soniox' && lifecycle.finalizePendingTurnFromProvider) {
                    void lifecycle.finalizePendingTurnFromProvider();
                } else if (cleanedPendingText) {
                    finalizedTurn = lifecycle.sendForcedFinalTurn(pendingText, pendingLanguage);
                } else if (lifecycle.finalizePendingTurnFromProvider) {
                    void lifecycle.finalizePendingTurnFromProvider();
                }

                lifecycle.closeProviderSocket();
                lifecycle.sendStopRecordingAck(
                    buildStopRecordingAckData({ finalizedTurn }),
                );
                lifecycle.scheduleClientCloseAfterAck();
                if (currentModel !== 'soniox') {
                    lifecycle.disposeSpeakerStates();
                }
                return;
            }

            void (async () => {
                lifecycle.setSonioxStopRequested(currentModel === 'soniox');

                let finalizedTurn: MingleSttFinalTurnPayload = null;

                try {
                    if (currentModel === 'soniox' && lifecycle.finalizePendingTurnFromProvider) {
                        finalizedTurn = await lifecycle.finalizePendingTurnFromProvider();
                        if (!finalizedTurn && cleanedPendingText) {
                            finalizedTurn = lifecycle.sendForcedFinalTurn(pendingText, pendingLanguage);
                        }
                    } else if (cleanedPendingText) {
                        finalizedTurn = lifecycle.sendForcedFinalTurn(pendingText, pendingLanguage);
                    } else if (lifecycle.finalizePendingTurnFromProvider) {
                        finalizedTurn = await lifecycle.finalizePendingTurnFromProvider();
                    }
                } catch {
                    if (cleanedPendingText) {
                        finalizedTurn = lifecycle.sendForcedFinalTurn(pendingText, pendingLanguage);
                    }
                }

                lifecycle.closeProviderSocket();
                lifecycle.sendStopRecordingAck(
                    buildStopRecordingAckData({ finalizedTurn }),
                );
                lifecycle.scheduleClientCloseAfterAck();
                if (currentModel !== 'soniox') {
                    lifecycle.disposeSpeakerStates();
                }
            })();
        },
    };
}
