import { createServer } from 'http';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { WebSocket, WebSocketServer } from 'ws';
import fetch from 'node-fetch';
import { config as loadDotenv } from 'dotenv';
import {
    evaluateEndpointMarkerDecision,
    stripEndpointMarkers,
    SilenceTimerStrategy,
} from './segmentation-strategy';
import {
    buildSonioxFinalizeRequestCohort,
    buildSonioxDebugTokenRuns,
    buildSonioxPendingSignature,
    formatSonioxDebugTokenRun,
    getNextTurnDetectedLang,
    mergeDetectedLang,
    normalizeDetectedLang,
    normalizeSpeaker,
    shouldUseTokenLanguageForCurrentTurn,
} from './soniox-language';
import {
    resolveMingleSttBehaviorProfile,
    resolveMingleSttReleaseVariant,
    type MingleSttBehaviorProfile,
    type MingleSttReleaseVariant,
} from './behavior-profile';
import { resolveMingleSttReleaseRuntime } from './release-runtime';

const envCandidates = ['.env.local', '.env'];
for (const filename of envCandidates) {
    const fullPath = resolve(process.cwd(), filename);
    if (!existsSync(fullPath)) continue;
    loadDotenv({ path: fullPath });
}

const PORT = parseInt(process.env.PORT || '3001', 10);
const GLADIA_API_URL = 'https://api.gladia.io/v2/live';
const DEEPGRAM_WS_URL = 'wss://api.deepgram.com/v1/listen';
const FIREWORKS_WS_URL = 'wss://audio-streaming.api.fireworks.ai/v1/audio/transcriptions/streaming';
const SONIOX_WS_URL = 'wss://stt-rt.soniox.com/transcribe-websocket';
const SONIOX_MANUAL_FINALIZE_SILENCE_MS_DEFAULT = 500;
const SONIOX_MANUAL_FINALIZE_SILENCE_MS_MIN = 500;
const SONIOX_MANUAL_FINALIZE_SILENCE_MS_MAX = 3000;
const SONIOX_MANUAL_FINALIZE_COOLDOWN_MS = (() => {
    const raw = Number(process.env.SONIOX_MANUAL_FINALIZE_COOLDOWN_MS || '1200');
    if (!Number.isFinite(raw)) return 1200;
    return Math.max(300, Math.min(5000, Math.floor(raw)));
})();
const SONIOX_USE_LANGUAGE_HINTS = ['1', 'true', 'yes', 'on'].includes(
    (process.env.SONIOX_USE_LANGUAGE_HINTS || '').trim().toLowerCase(),
);
const SONIOX_DEBUG_TOKEN_LOGS = (() => {
    const raw = (process.env.SONIOX_DEBUG_TOKEN_LOGS || '').trim().toLowerCase();
    if (raw) {
        return ['1', 'true', 'yes', 'on'].includes(raw);
    }
    return process.env.NODE_ENV !== 'production';
})();

const server = createServer();
const wss = new WebSocketServer({ server });

interface ClientConfig {
    sample_rate: number;
    languages: string[];
    stt_model: 'gladia' | 'gladia-stt' | 'deepgram' | 'deepgram-multi' | 'fireworks' | 'soniox';
    api_namespace?: string;
    behavior_profile?: MingleSttBehaviorProfile;
    release_variant?: MingleSttReleaseVariant;
    lang_hints_strict?: boolean;
    soniox_language_hints?: string[];
    soniox_manual_finalize_silence_ms?: number;
}

interface FinalTurnPayload {
    text: string;
    language: string;
    speaker?: string;
}

let connectionCounter = 0;

wss.on('connection', (clientWs) => {
    const connId = ++connectionCounter;
    const connectedAt = Date.now();
    console.log(`[conn:${connId}] client connected`);

    let sttWs: WebSocket | null = null;
    let isClientConnected = true;
    let abortController: AbortController | null = null;
    let currentModel: 'gladia' | 'gladia-stt' | 'deepgram' | 'deepgram-multi' | 'fireworks' | 'soniox' = 'gladia';
    let behaviorProfile: MingleSttBehaviorProfile = 'legacy_1_0_11';
    let releaseVariant: MingleSttReleaseVariant = 'legacy_default_v1_0_11';
    let releaseRuntime = resolveMingleSttReleaseRuntime(releaseVariant);
    let selectedLanguages: string[] = [];
    let finalizePendingTurnFromProvider: (() => Promise<FinalTurnPayload | null>) | null = null;
    let sonioxStopRequested = false;
    let disposeSonioxSpeakerStates: (() => void) | null = null;
    const gladiaApiKey = process.env.GLADIA_API_KEY;
    const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
    const fireworksApiKey = process.env.FIREWORKS_API_KEY;
    const sonioxApiKey = process.env.SONIOX_API_KEY;

    const cleanup = () => {
        isClientConnected = false;

        if (abortController) {
            abortController.abort();
            abortController = null;
        }

        if (sttWs) {
            if (sttWs.readyState === WebSocket.OPEN || sttWs.readyState === WebSocket.CONNECTING) {
                sttWs.close();
            }
            sttWs = null;
        }
        disposeSonioxSpeakerStates?.();
        disposeSonioxSpeakerStates = null;
    };

    const sendReadyStatus = () => {
        if (clientWs.readyState !== WebSocket.OPEN) return;
        clientWs.send(JSON.stringify(
            releaseRuntime.buildReadyPayload({
                behaviorProfile,
                sonioxLanguageHintsEnabled: SONIOX_USE_LANGUAGE_HINTS,
            }),
        ));
    };

    const buildStopRecordingAckDataForReleaseVariant = (
        finalizedTurn: FinalTurnPayload | null,
    ) => {
        switch (releaseVariant) {
            case 'legacy_default_v1_0_11':
            case 'ios_v1_0_11':
            case 'android_v1_0_11':
            case 'ios_v1_1_0':
            case 'android_v1_1_0':
            default:
                return releaseRuntime.buildStopRecordingAckData({
                    behaviorProfile,
                    finalizedTurn,
                });
        }
    };

    const startConnectionForModel = (config: ClientConfig) => {
        if (currentModel === 'deepgram') {
            void startDeepgramConnection(config);
        } else if (currentModel === 'deepgram-multi') {
            void startDeepgramMultiConnection(config);
        } else if (currentModel === 'fireworks') {
            void startFireworksConnection(config);
        } else if (currentModel === 'soniox') {
            void startSonioxConnection(config);
        } else if (currentModel === 'gladia-stt') {
            void startGladiaConnection(config, false);
        } else {
            void startGladiaConnection(config, true);
        }
    };

    // Keep the release dispatch explicit even where the concrete provider wiring is
    // still shared. This is the seam where legacy 1.0.11 and 1.1.0 STT lifecycle
    // can safely diverge without regressing already deployed clients.
    const startConnectionForReleaseVariant = (config: ClientConfig) => {
        switch (releaseVariant) {
            case 'legacy_default_v1_0_11':
            case 'ios_v1_0_11':
            case 'android_v1_0_11':
                startConnectionForModel(config);
                return;
            case 'ios_v1_1_0':
            case 'android_v1_1_0':
                startConnectionForModel(config);
                return;
            default:
                startConnectionForModel(config);
        }
    };

    // ===== GLADIA 연결 =====
    const startGladiaConnection = async (config: ClientConfig, enableTranslation = true) => {
        if (!gladiaApiKey) {
            console.error("GLADIA_API_KEY environment variable not set!");
            clientWs.close(1011, "Server configuration error: Gladia API key not found.");
            return;
        }

        try {
            abortController = new AbortController();
            
            const requestBody: Record<string, unknown> = {
                sample_rate: config.sample_rate,
                encoding: 'wav/pcm',
                bit_depth: 16,
                channels: 1,
                model: 'solaria-1',
                language_config: {
                    languages: config.languages,
                    code_switching: config.languages.length > 1,
                },
                endpointing: 0.05,
                maximum_duration_without_endpointing: 15,
                messages_config: {
                    receive_partial_transcripts: true,
                },
            };

            if (enableTranslation) {
                requestBody.realtime_processing = {
                    translation: true,
                    translation_config: {
                        target_languages: config.languages,
                        model: 'enhanced',
                    },
                };
            }

            const response = await fetch(GLADIA_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-gladia-key': gladiaApiKey,
                },
                body: JSON.stringify(requestBody),
                signal: abortController.signal,
            });

            if (!isClientConnected) {
                return;
            }

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`Failed to get Gladia URL: ${response.status} ${response.statusText} - ${errorBody}`);
            }

            const data = await response.json() as { url?: string };
            const gladiaWsUrl = data.url;

            if (!gladiaWsUrl) {
                throw new Error('No url in Gladia response');
            }

            if (!isClientConnected) {
                return;
            }

            sttWs = new WebSocket(gladiaWsUrl);

            sttWs.onopen = () => {
                if (isClientConnected) {
                    sendReadyStatus();
                } else {
                    sttWs?.close();
                }
            };

            sttWs.onmessage = (event) => {
                if (isClientConnected) {
                    const raw = event.data.toString();
                    clientWs.send(raw);
                }
            };

            sttWs.onerror = (error) => {
                console.error('Gladia WebSocket error:', error);
                if (isClientConnected) {
                    clientWs.close();
                }
            };

            sttWs.onclose = () => {
                if (isClientConnected) {
                    clientWs.close();
                }
            };

        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                return;
            }
            console.error('Error starting Gladia connection:', error);
            if (isClientConnected) {
                clientWs.close(1011, 'Failed to connect to transcription service.');
            }
        }
    };

    // ===== DEEPGRAM 연결 =====
    const startDeepgramConnection = async (config: ClientConfig) => {
        if (!deepgramApiKey) {
            console.error("DEEPGRAM_API_KEY environment variable not set!");
            clientWs.close(1011, "Server configuration error: Deepgram API key not found.");
            return;
        }

        try {
            // Deepgram 언어 코드 매핑 (일부 언어는 다른 형식 필요)
            const langMap: Record<string, string> = {
                'en': 'en-US',
                'ko': 'ko',
                'zh': 'zh-CN',
                'ja': 'ja',
                'es': 'es',
                'fr': 'fr',
                'de': 'de',
                'ru': 'ru',
                'pt': 'pt-BR',
                'ar': 'ar',
                'hi': 'hi',
                'vi': 'vi',
                'it': 'it',
                'id': 'id',
                'tr': 'tr',
                'pl': 'pl',
                'nl': 'nl',
                'sv': 'sv',
                'th': 'th',
                'ms': 'ms',
            };

            const primaryLang = langMap[config.languages[0]] || 'en-US';
            
            // Deepgram WebSocket URL 생성
            const wsUrl = new URL(DEEPGRAM_WS_URL);
            wsUrl.searchParams.set('model', 'nova-3');  // 최신 모델 - 더 높은 정확도 + 다국어 코드 스위칭
            wsUrl.searchParams.set('encoding', 'linear16');
            wsUrl.searchParams.set('sample_rate', config.sample_rate.toString());
            wsUrl.searchParams.set('channels', '1');
            wsUrl.searchParams.set('interim_results', 'true');
            wsUrl.searchParams.set('punctuate', 'true');
            wsUrl.searchParams.set('smart_format', 'true');
            wsUrl.searchParams.set('endpointing', '100'); // ms
            
            // 항상 첫 번째 선택된 언어로 지정 (detect_language는 스트리밍에서 400 에러 유발)
            wsUrl.searchParams.set('language', primaryLang);

            sttWs = new WebSocket(wsUrl.toString(), {
                headers: {
                    'Authorization': `Token ${deepgramApiKey}`,
                },
            });

            sttWs.onopen = () => {
                if (isClientConnected) {
                    sendReadyStatus();
                } else {
                    sttWs?.close();
                }
            };

            sttWs.onmessage = (event) => {
                if (isClientConnected) {
                    try {
                        const msg = JSON.parse(event.data.toString());

                        if (msg.type === 'Results' || msg.channel) {
                            const channel = msg.channel;
                            const alternatives = channel?.alternatives;
                            if (alternatives && alternatives.length > 0) {
                                const transcript = alternatives[0].transcript;
                                const isFinal = msg.is_final;
                                const detectedLang = alternatives[0].detected_language ||
                                                     channel?.detected_language ||
                                                     msg.metadata?.detected_language ||
                                                     config.languages[0] || 'en';

                                if (transcript) {
                                    const gladiaStyleMsg = {
                                        type: 'transcript',
                                        data: {
                                            is_final: isFinal,
                                            utterance: {
                                                text: transcript,
                                                language: detectedLang,
                                            },
                                        },
                                    };
                                    clientWs.send(JSON.stringify(gladiaStyleMsg));
                                }
                            }
                        }
                    } catch (parseError) {
                        console.error('Error parsing Deepgram message:', parseError);
                    }
                }
            };

            sttWs.onerror = (error) => {
                console.error('Deepgram WebSocket error:', error);
                if (isClientConnected) {
                    clientWs.close();
                }
            };

            sttWs.onclose = () => {
                if (isClientConnected) {
                    clientWs.close();
                }
            };

        } catch (error) {
            console.error('Error starting Deepgram connection:', error);
            if (isClientConnected) {
                clientWs.close(1011, 'Failed to connect to Deepgram transcription service.');
            }
        }
    };

    // ===== DEEPGRAM MULTI 연결 (다국어 코드 스위칭) =====
    const startDeepgramMultiConnection = async (config: ClientConfig) => {
        if (!deepgramApiKey) {
            console.error("DEEPGRAM_API_KEY environment variable not set!");
            clientWs.close(1011, "Server configuration error: Deepgram API key not found.");
            return;
        }

        try {
            // Deepgram WebSocket URL 생성 - multi 언어 모드
            const wsUrl = new URL(DEEPGRAM_WS_URL);
            wsUrl.searchParams.set('model', 'nova-3');
            wsUrl.searchParams.set('encoding', 'linear16');
            wsUrl.searchParams.set('sample_rate', config.sample_rate.toString());
            wsUrl.searchParams.set('channels', '1');
            wsUrl.searchParams.set('interim_results', 'true');
            wsUrl.searchParams.set('punctuate', 'true');
            wsUrl.searchParams.set('smart_format', 'true');
            wsUrl.searchParams.set('endpointing', '100');

            // multi 언어 모드: 여러 언어를 자동 감지하여 전사
            wsUrl.searchParams.set('language', 'multi');

            sttWs = new WebSocket(wsUrl.toString(), {
                headers: {
                    'Authorization': `Token ${deepgramApiKey}`,
                },
            });

            sttWs.onopen = () => {
                if (isClientConnected) {
                    sendReadyStatus();
                } else {
                    sttWs?.close();
                }
            };

            sttWs.onmessage = (event) => {
                if (isClientConnected) {
                    try {
                        const msg = JSON.parse(event.data.toString());

                        if (msg.type === 'Results' || msg.channel) {
                            const channel = msg.channel;
                            const alternatives = channel?.alternatives;
                            if (alternatives && alternatives.length > 0) {
                                const transcript = alternatives[0].transcript;
                                const isFinal = msg.is_final;

                                const words = alternatives[0].words;
                                let detectedLang = 'multi';

                                if (alternatives[0]?.languages && alternatives[0].languages.length > 0) {
                                    detectedLang = alternatives[0].languages[0];
                                } else if (channel?.languages && channel.languages.length > 0) {
                                    detectedLang = channel.languages[0];
                                } else if (words && words.length > 0 && words[0].language) {
                                    detectedLang = words[0].language;
                                }

                                if (transcript) {
                                    const gladiaStyleMsg = {
                                        type: 'transcript',
                                        data: {
                                            is_final: isFinal,
                                            utterance: {
                                                text: transcript,
                                                language: detectedLang,
                                            },
                                        },
                                    };
                                    clientWs.send(JSON.stringify(gladiaStyleMsg));
                                }
                            }
                        }
                    } catch (parseError) {
                        console.error('Error parsing Deepgram Multi message:', parseError);
                    }
                }
            };

            sttWs.onerror = (error) => {
                console.error('Deepgram Multi WebSocket error:', error);
                if (isClientConnected) {
                    clientWs.close();
                }
            };

            sttWs.onclose = () => {
                if (isClientConnected) {
                    clientWs.close();
                }
            };

        } catch (error) {
            console.error('Error starting Deepgram Multi connection:', error);
            if (isClientConnected) {
                clientWs.close(1011, 'Failed to connect to Deepgram Multi transcription service.');
            }
        }
    };

    // ===== FIREWORKS 연결 =====
    const startFireworksConnection = async (config: ClientConfig) => {
        if (!fireworksApiKey) {
            console.error("FIREWORKS_API_KEY environment variable not set!");
            clientWs.close(1011, "Server configuration error: Fireworks API key not found.");
            return;
        }

        try {
            // Fireworks URL 생성
            const wsUrl = new URL(FIREWORKS_WS_URL);
            
            // Fireworks 언어 코드 매핑
            const langMap: Record<string, string> = {
                'en': 'en', 'ko': 'ko', 'zh': 'zh', 'ja': 'ja',
                'es': 'es', 'fr': 'fr', 'de': 'de', 'ru': 'ru',
                'pt': 'pt', 'it': 'it'
            };
            // 1순위 언어 사용
            const language = langMap[config.languages[0]] || 'en';
            
            // 최신 V2 모델 사용 (더 빠르고 정확함)
            wsUrl.searchParams.set('model', 'fireworks-asr-large');
            wsUrl.searchParams.set('language', language);
            wsUrl.searchParams.set('response_format', 'verbose_json');
            wsUrl.searchParams.set('sample_rate', config.sample_rate.toString()); // 필수: 클라이언트 샘플 레이트(48000 등) 전달

            sttWs = new WebSocket(wsUrl.toString(), {
                headers: {
                    'Authorization': `Bearer ${fireworksApiKey}`,
                },
            });

            sttWs.onopen = () => {
                if (isClientConnected) {
                    sendReadyStatus();
                } else {
                    sttWs?.close();
                }
            };

            sttWs.onmessage = (event) => {
                if (isClientConnected) {
                    try {
                        const msg = JSON.parse(event.data.toString());
                        const text = msg.text || '';
                        const isFinal = msg.is_final || false;

                        if (text) {
                            const gladiaStyleMsg = {
                                type: 'transcript',
                                data: {
                                    is_final: isFinal,
                                    utterance: {
                                        text: text,
                                        language: language,
                                    },
                                },
                            };
                            clientWs.send(JSON.stringify(gladiaStyleMsg));
                        }
                    } catch (e) {
                        console.error('Error parsing Fireworks msg:', e);
                    }
                }
            };

            sttWs.onerror = (error) => {
                console.error('Fireworks WebSocket error:', error);
                if (isClientConnected) {
                    clientWs.close();
                }
            };

            sttWs.onclose = () => {
                if (isClientConnected) {
                    clientWs.close();
                }
            };

        } catch (error) {
            console.error('Error starting Fireworks connection:', error);
            if (isClientConnected) {
                clientWs.close(1011, 'Failed to connect to Fireworks service.');
            }
        }
    };

    // ===== SONIOX 연결 (다국어 실시간, 토큰 기반, 발화자 분리) =====
    const startSonioxConnection = async (config: ClientConfig) => {
        if (!sonioxApiKey) {
            console.error("SONIOX_API_KEY environment variable not set!");
            clientWs.close(1011, "Server configuration error: Soniox API key not found.");
            return;
        }

        try {
            sttWs = new WebSocket(SONIOX_WS_URL);
            const sonioxManualFinalizeSilenceMs = (() => {
                const raw = Number(config.soniox_manual_finalize_silence_ms);
                if (!Number.isFinite(raw)) return SONIOX_MANUAL_FINALIZE_SILENCE_MS_DEFAULT;
                return Math.max(
                    SONIOX_MANUAL_FINALIZE_SILENCE_MS_MIN,
                    Math.min(SONIOX_MANUAL_FINALIZE_SILENCE_MS_MAX, Math.floor(raw)),
                );
            })();
            type SonioxToken = {
                text?: unknown;
                start_ms?: unknown;
                end_ms?: unknown;
                is_final?: unknown;
                language?: unknown;
                speaker?: unknown;
            };
            type SonioxSpeakerState = {
                speaker: string;
                providerFinalizedText: string;
                providerFinalizedEndMs: number;
                latestNonFinalText: string;
                latestNonFinalIsProvisionalCarry: boolean;
                currentSnapshotText: string;
                currentSnapshotEndMs: number;
                lastConsumedEndMs: number;
                detectedLang: string;
                strategy: SilenceTimerStrategy;
            };
            type SonioxFinalizeRequest = {
                requestId: number;
                requestedAtMs: number;
                speakers: Map<string, {
                    speaker: string;
                    snapshotText: string;
                    snapshotTextLen: number;
                    snapshotEndMs: number;
                    detectedLang: string;
                }>;
            };
            type SonioxSpeakerFrameUpdate = {
                speaker: string;
                finalDeltaText: string;
                nonFinalText: string;
                maxFinalTokenEndMs: number;
                maxSeenTokenEndMs: number;
                lastDetectedLang: string | null;
                hasProgressTokenBeyondWatermark: boolean;
                hasTimestampedProgressBeyondWatermark: boolean;
            };

            const speakerStates = new Map<string, SonioxSpeakerState>();
            let globalFinalizeTimer: ReturnType<typeof setTimeout> | null = null;
            let globalFinalizeLastProgressAtMs = 0;
            let globalFinalizeLastSentAtMs = 0;
            let lastGlobalPendingSignature = '';
            let activeFinalizeRequest: SonioxFinalizeRequest | null = null;
            let finalizeRequestSeq = 0;
            sonioxStopRequested = false;

            const parseTokenTimeMs = (raw: unknown): number | null => {
                if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
                return raw;
            };
            const isTokenBeyondWatermark = (
                tokenStartMs: number | null,
                tokenEndMs: number | null,
                watermarkMs: number,
            ): boolean => {
                if (tokenEndMs !== null) return tokenEndMs > watermarkMs;
                if (tokenStartMs !== null) return tokenStartMs > watermarkMs;
                return true;
            };
            const isTokenTimestampedBeyondWatermark = (
                tokenStartMs: number | null,
                tokenEndMs: number | null,
                watermarkMs: number,
            ): boolean => {
                if (tokenEndMs !== null) return tokenEndMs > watermarkMs;
                if (tokenStartMs !== null) return tokenStartMs > watermarkMs;
                return false;
            };
            const composeTurnText = (finalText: string, nonFinalText: string): string =>
                `${finalText || ''}${nonFinalText || ''}`.trim();
            const buildPendingTurnSnapshots = () => (
                Array.from(speakerStates.values()).map((state) => ({
                    speaker: state.speaker,
                    currentSnapshotText: state.currentSnapshotText,
                    currentSnapshotEndMs: state.currentSnapshotEndMs,
                    detectedLang: state.detectedLang,
                }))
            );
            const clearGlobalFinalizeTimer = () => {
                if (globalFinalizeTimer) {
                    clearTimeout(globalFinalizeTimer);
                    globalFinalizeTimer = null;
                }
            };
            const resetGlobalFinalizeScheduler = () => {
                clearGlobalFinalizeTimer();
                globalFinalizeLastProgressAtMs = 0;
                globalFinalizeLastSentAtMs = 0;
                lastGlobalPendingSignature = '';
                activeFinalizeRequest = null;
            };
            const updateGlobalPendingSignature = () => {
                const nextSignature = buildSonioxPendingSignature(buildPendingTurnSnapshots());
                if (!nextSignature) {
                    lastGlobalPendingSignature = '';
                    globalFinalizeLastProgressAtMs = 0;
                    return { hasPending: false, changed: false };
                }

                const changed = nextSignature !== lastGlobalPendingSignature;
                if (changed) {
                    lastGlobalPendingSignature = nextSignature;
                    globalFinalizeLastProgressAtMs = Date.now();
                }

                return { hasPending: true, changed };
            };
            const scheduleGlobalFinalizeCheck = (delayMs: number) => {
                clearGlobalFinalizeTimer();
                globalFinalizeTimer = setTimeout(() => {
                    globalFinalizeTimer = null;
                    maybeTriggerGlobalFinalize();
                }, Math.max(1, delayMs));
            };
            const maybeTriggerGlobalFinalize = () => {
                if (sonioxStopRequested) return;

                const { hasPending } = updateGlobalPendingSignature();
                if (!hasPending) {
                    clearGlobalFinalizeTimer();
                    return;
                }

                if (activeFinalizeRequest) return;

                const now = Date.now();
                if (globalFinalizeLastProgressAtMs <= 0) {
                    globalFinalizeLastProgressAtMs = now;
                }

                const elapsedSinceProgress = now - globalFinalizeLastProgressAtMs;
                if (elapsedSinceProgress < sonioxManualFinalizeSilenceMs) {
                    scheduleGlobalFinalizeCheck(sonioxManualFinalizeSilenceMs - elapsedSinceProgress);
                    return;
                }

                const elapsedSinceLastFinalize = now - globalFinalizeLastSentAtMs;
                if (globalFinalizeLastSentAtMs > 0 && elapsedSinceLastFinalize < SONIOX_MANUAL_FINALIZE_COOLDOWN_MS) {
                    scheduleGlobalFinalizeCheck(SONIOX_MANUAL_FINALIZE_COOLDOWN_MS - elapsedSinceLastFinalize);
                    return;
                }

                if (!sttWs || sttWs.readyState !== WebSocket.OPEN) return;

                const cohort = buildSonioxFinalizeRequestCohort(buildPendingTurnSnapshots());
                if (cohort.length === 0) {
                    clearGlobalFinalizeTimer();
                    return;
                }

                activeFinalizeRequest = {
                    requestId: ++finalizeRequestSeq,
                    requestedAtMs: now,
                    speakers: new Map(cohort.map((entry) => [entry.speaker, entry])),
                };
                globalFinalizeLastSentAtMs = now;

                try {
                    sttWs.send(JSON.stringify({ type: 'finalize' }));
                } catch (error) {
                    activeFinalizeRequest = null;
                    console.error('Soniox manual finalize send failed:', error);
                    scheduleGlobalFinalizeCheck(SONIOX_MANUAL_FINALIZE_COOLDOWN_MS);
                }
            };
            const refreshGlobalFinalizeScheduling = () => {
                const { hasPending } = updateGlobalPendingSignature();
                if (!hasPending) {
                    clearGlobalFinalizeTimer();
                    return;
                }

                if (activeFinalizeRequest) return;

                const now = Date.now();
                if (globalFinalizeLastProgressAtMs <= 0) {
                    globalFinalizeLastProgressAtMs = now;
                }
                const elapsedSinceProgress = now - globalFinalizeLastProgressAtMs;
                const elapsedSinceLastFinalize = globalFinalizeLastSentAtMs > 0
                    ? now - globalFinalizeLastSentAtMs
                    : Number.POSITIVE_INFINITY;
                const waitForProgress = Math.max(0, sonioxManualFinalizeSilenceMs - elapsedSinceProgress);
                const waitForCooldown = Number.isFinite(elapsedSinceLastFinalize)
                    ? Math.max(0, SONIOX_MANUAL_FINALIZE_COOLDOWN_MS - elapsedSinceLastFinalize)
                    : 0;

                if (waitForProgress === 0 && waitForCooldown === 0) {
                    maybeTriggerGlobalFinalize();
                    return;
                }

                scheduleGlobalFinalizeCheck(Math.max(waitForProgress, waitForCooldown));
            };

            const emitTranscript = (
                text: string,
                language: string,
                isFinal: boolean,
                speaker?: string,
            ): FinalTurnPayload | null => {
                const cleanedText = text.trim();
                const cleanedLang = (language || '').trim() || 'unknown';
                const cleanedSpeaker = (speaker || '').trim() || 'unknown';
                if (!cleanedText) return null;

                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify({
                        type: 'transcript',
                        data: {
                            is_final: isFinal,
                            utterance: {
                                text: cleanedText,
                                language: cleanedLang,
                                speaker: cleanedSpeaker,
                            },
                        },
                    }));
                }

                return {
                    text: cleanedText,
                    language: cleanedLang,
                    speaker: cleanedSpeaker,
                };
            };

            const disposeSpeakerState = (state: SonioxSpeakerState) => {
                state.strategy.resetState();
                state.strategy.dispose();
            };

            const resetSpeakerTurn = (state: SonioxSpeakerState) => {
                state.providerFinalizedText = '';
                state.providerFinalizedEndMs = -1;
                state.latestNonFinalText = '';
                state.latestNonFinalIsProvisionalCarry = false;
                state.currentSnapshotText = '';
                state.currentSnapshotEndMs = -1;
                state.detectedLang = 'unknown';
                state.strategy.resetState();
            };

            const finalizeSpeakerTurn = (speaker: string): FinalTurnPayload | null => {
                const state = speakerStates.get(speaker);
                if (!state) return null;
                const merged = composeTurnText(state.providerFinalizedText, state.latestNonFinalText);
                if (!merged) {
                    resetSpeakerTurn(state);
                    return null;
                }

                const payload = emitTranscript(
                    merged,
                    state.detectedLang,
                    true,
                    state.speaker,
                );
                if (state.currentSnapshotEndMs > state.lastConsumedEndMs) {
                    state.lastConsumedEndMs = state.currentSnapshotEndMs;
                }
                resetSpeakerTurn(state);
                return payload;
            };

            const flushAllSpeakerTurns = (): FinalTurnPayload | null => {
                let lastPayload: FinalTurnPayload | null = null;
                for (const speaker of Array.from(speakerStates.keys())) {
                    const payload = finalizeSpeakerTurn(speaker);
                    if (payload) {
                        lastPayload = payload;
                    }
                }
                return lastPayload;
            };

            const getSpeakerState = (rawSpeaker: string): SonioxSpeakerState => {
                const speaker = rawSpeaker.trim() || 'unknown';
                const existing = speakerStates.get(speaker);
                if (existing) return existing;

                const strategy = new SilenceTimerStrategy({
                    silenceMs: sonioxManualFinalizeSilenceMs,
                    cooldownMs: SONIOX_MANUAL_FINALIZE_COOLDOWN_MS,
                    sendFinalizeCommand: () => undefined,
                    onCarryExpiry: () => {
                        if (sonioxStopRequested) return;
                        const state = speakerStates.get(speaker);
                        if (!state) return;
                        if (
                            state.latestNonFinalIsProvisionalCarry
                            && state.latestNonFinalText.trim()
                            && !state.providerFinalizedText.trim()
                        ) {
                            finalizeSpeakerTurn(speaker);
                            refreshGlobalFinalizeScheduling();
                        }
                    },
                });
                const state: SonioxSpeakerState = {
                    speaker,
                    providerFinalizedText: '',
                    providerFinalizedEndMs: -1,
                    latestNonFinalText: '',
                    latestNonFinalIsProvisionalCarry: false,
                    currentSnapshotText: '',
                    currentSnapshotEndMs: -1,
                    lastConsumedEndMs: -1,
                    detectedLang: 'unknown',
                    strategy,
                };
                speakerStates.set(speaker, state);
                return state;
            };

            disposeSonioxSpeakerStates = () => {
                resetGlobalFinalizeScheduler();
                for (const state of speakerStates.values()) {
                    disposeSpeakerState(state);
                }
                speakerStates.clear();
            };

            finalizePendingTurnFromProvider = async () => {
                const payload = flushAllSpeakerTurns();
                resetGlobalFinalizeScheduler();
                return payload;
            };

            sttWs.onopen = () => {
                const sonioxLanguageHints = (
                    Array.isArray(config.soniox_language_hints) && config.soniox_language_hints.length > 0
                        ? config.soniox_language_hints
                        : config.languages
                )
                    .filter((language): language is string => typeof language === 'string')
                    .map((language) => language.trim())
                    .filter(Boolean);
                const sonioxConfig = {
                    api_key: sonioxApiKey,
                    model: 'stt-rt-v4',
                    audio_format: 'pcm_s16le',
                    sample_rate: config.sample_rate,
                    num_channels: 1,
                    enable_endpoint_detection: false,
                    enable_language_identification: true,
                    enable_speaker_diarization: true,
                };
                if (SONIOX_USE_LANGUAGE_HINTS && sonioxLanguageHints.length > 0) {
                    Object.assign(sonioxConfig, {
                        language_hints: sonioxLanguageHints,
                        language_hints_strict: config.lang_hints_strict !== false,
                    });
                }
                sttWs!.send(JSON.stringify(sonioxConfig));

                if (isClientConnected) {
                    sendReadyStatus();
                } else {
                    sttWs?.close();
                }
            };

            sttWs.onmessage = (event) => {
                if (!isClientConnected) return;

                try {
                    const msg = JSON.parse(event.data.toString());

                    if (msg.error_code) {
                        console.error(`[Soniox] Error: ${msg.error_code} - ${msg.error_message}`);
                        return;
                    }

                    // 오디오 처리 시간을 클라이언트에 전송
                    if (msg.final_audio_proc_ms !== undefined || msg.total_audio_proc_ms !== undefined) {
                        const usageMsg = {
                            type: 'usage',
                            data: {
                                final_audio_sec: (msg.final_audio_proc_ms || 0) / 1000,
                                total_audio_sec: (msg.total_audio_proc_ms || 0) / 1000,
                                finished: !!msg.finished,
                            },
                        };
                        clientWs.send(JSON.stringify(usageMsg));
                    }

                    if (msg.finished) {
                        return;
                    }
                    const tokens = (Array.isArray(msg.tokens) ? msg.tokens : []) as SonioxToken[];
                    if (tokens.length === 0) {
                        return;
                    }
                    if (SONIOX_DEBUG_TOKEN_LOGS) {
                        for (const run of buildSonioxDebugTokenRuns(tokens)) {
                            console.log(formatSonioxDebugTokenRun(run));
                        }
                    }
                    let hasEndpointToken = false;
                    let endpointMarkerText = '';
                    const speakerFrameUpdates = new Map<string, SonioxSpeakerFrameUpdate>();
                    const getSpeakerFrameUpdate = (speaker: string): SonioxSpeakerFrameUpdate => {
                        const existing = speakerFrameUpdates.get(speaker);
                        if (existing) return existing;
                        const created: SonioxSpeakerFrameUpdate = {
                            speaker,
                            finalDeltaText: '',
                            nonFinalText: '',
                            maxFinalTokenEndMs: -1,
                            maxSeenTokenEndMs: -1,
                            lastDetectedLang: null,
                            hasProgressTokenBeyondWatermark: false,
                            hasTimestampedProgressBeyondWatermark: false,
                        };
                        speakerFrameUpdates.set(speaker, created);
                        return created;
                    };

                    for (const token of tokens) {
                        const tokenText = typeof token.text === 'string' ? token.text : '';
                        if (!tokenText) continue;
                        const tokenStartMs = parseTokenTimeMs(token.start_ms);
                        const tokenEndMs = parseTokenTimeMs(token.end_ms);

                        const isEndpointMarkerToken = /<\/?(?:end|fin)>/i.test(tokenText);
                        if (isEndpointMarkerToken) {
                            hasEndpointToken = true;
                            if (!endpointMarkerText) {
                                endpointMarkerText = tokenText;
                            }
                            continue;
                        }

                        const tokenLanguage = normalizeDetectedLang(token.language);
                        const tokenSpeaker = normalizeSpeaker(token.speaker);

                        const speakerState = getSpeakerState(tokenSpeaker);

                        const includeByWatermark = isTokenBeyondWatermark(
                            tokenStartMs,
                            tokenEndMs,
                            speakerState.lastConsumedEndMs,
                        );
                        if (!includeByWatermark) continue;

                        const frameUpdate = getSpeakerFrameUpdate(tokenSpeaker);
                        if (tokenLanguage !== 'unknown') {
                            frameUpdate.lastDetectedLang = tokenLanguage;
                        }
                        if (includeByWatermark) {
                            frameUpdate.hasProgressTokenBeyondWatermark = true;
                            if (isTokenTimestampedBeyondWatermark(
                                tokenStartMs,
                                tokenEndMs,
                                speakerState.lastConsumedEndMs,
                            )) {
                                frameUpdate.hasTimestampedProgressBeyondWatermark = true;
                            }
                        }
                        let tokenCanUpdateDetectedLang = false;
                        if (token.is_final === true) {
                            const includeByProviderFinalizedWatermark = isTokenBeyondWatermark(
                                tokenStartMs,
                                tokenEndMs,
                                speakerState.providerFinalizedEndMs,
                            );
                            if (includeByProviderFinalizedWatermark) {
                                frameUpdate.finalDeltaText += tokenText;
                                tokenCanUpdateDetectedLang = shouldUseTokenLanguageForCurrentTurn({
                                    includeByTurnWatermark: includeByWatermark,
                                    isFinalToken: true,
                                    includeByProviderFinalizedWatermark,
                                });
                                if (tokenEndMs !== null && tokenEndMs > frameUpdate.maxFinalTokenEndMs) {
                                    frameUpdate.maxFinalTokenEndMs = tokenEndMs;
                                }
                            }
                        } else {
                            frameUpdate.nonFinalText += tokenText;
                            tokenCanUpdateDetectedLang = shouldUseTokenLanguageForCurrentTurn({
                                includeByTurnWatermark: includeByWatermark,
                                isFinalToken: false,
                                includeByProviderFinalizedWatermark: false,
                            });
                        }
                        if (tokenCanUpdateDetectedLang) {
                            frameUpdate.lastDetectedLang = mergeDetectedLang(frameUpdate.lastDetectedLang || 'unknown', tokenLanguage);
                        }
                        if (tokenEndMs !== null && tokenEndMs > frameUpdate.maxSeenTokenEndMs) {
                            frameUpdate.maxSeenTokenEndMs = tokenEndMs;
                        }
                    }

                    const finalizeRequestForFrame = hasEndpointToken ? activeFinalizeRequest : null;
                    if (hasEndpointToken && finalizeRequestForFrame) {
                        for (const [speaker, requestSpeaker] of finalizeRequestForFrame.speakers.entries()) {
                            const state = speakerStates.get(speaker);
                            if (!state) continue;
                            if (speakerFrameUpdates.has(speaker)) continue;
                            speakerFrameUpdates.set(speaker, {
                                speaker: requestSpeaker.speaker,
                                finalDeltaText: '',
                                nonFinalText: '',
                                maxFinalTokenEndMs: -1,
                                maxSeenTokenEndMs: state.currentSnapshotEndMs,
                                lastDetectedLang: null,
                                hasProgressTokenBeyondWatermark: false,
                                hasTimestampedProgressBeyondWatermark: false,
                            });
                        }
                    }

                    for (const frameUpdate of speakerFrameUpdates.values()) {
                        const speakerState = getSpeakerState(frameUpdate.speaker);
                        const previousMergedSnapshot = speakerState.currentSnapshotText;
                        const previousNonFinalText = speakerState.latestNonFinalText;
                        if (frameUpdate.lastDetectedLang) {
                            speakerState.detectedLang = mergeDetectedLang(
                                speakerState.detectedLang,
                                frameUpdate.lastDetectedLang,
                            );
                        }

                        if (
                            speakerState.latestNonFinalIsProvisionalCarry
                            && previousNonFinalText.trim()
                            && frameUpdate.hasTimestampedProgressBeyondWatermark
                        ) {
                            speakerState.strategy.clearCarryExpiryTimer();
                            const carryRaw = stripEndpointMarkers(previousNonFinalText).trim();
                            const incomingClean = stripEndpointMarkers(
                                `${stripEndpointMarkers(frameUpdate.finalDeltaText)}${frameUpdate.nonFinalText}`,
                            ).trim();
                            if (carryRaw) {
                                if (incomingClean.startsWith(carryRaw)) {
                                    speakerState.latestNonFinalIsProvisionalCarry = false;
                                } else {
                                    const carryPrefix = carryRaw.replace(/[.!?]+\s*$/, '').trim();
                                    if (carryPrefix) {
                                        speakerState.providerFinalizedText = speakerState.providerFinalizedText
                                            ? `${carryPrefix} ${speakerState.providerFinalizedText}`
                                            : carryPrefix;
                                    }
                                    speakerState.latestNonFinalIsProvisionalCarry = false;
                                }
                            }
                        }
                        if (frameUpdate.finalDeltaText) {
                            speakerState.providerFinalizedText = `${speakerState.providerFinalizedText}${frameUpdate.finalDeltaText}`;
                        }
                        if (frameUpdate.maxFinalTokenEndMs > speakerState.providerFinalizedEndMs) {
                            speakerState.providerFinalizedEndMs = frameUpdate.maxFinalTokenEndMs;
                        }
                        if (frameUpdate.nonFinalText) {
                            if (speakerState.latestNonFinalIsProvisionalCarry) {
                                const prevCarry = previousNonFinalText.trim();
                                const incoming = frameUpdate.nonFinalText.trim();
                                const hasProgress = incoming.length > prevCarry.length || !incoming.startsWith(prevCarry);
                                if (hasProgress) {
                                    speakerState.latestNonFinalIsProvisionalCarry = false;
                                }
                            }
                            speakerState.latestNonFinalText = frameUpdate.nonFinalText;
                        } else if (!speakerState.latestNonFinalIsProvisionalCarry) {
                            speakerState.latestNonFinalText = '';
                        }
                        speakerState.currentSnapshotText = composeTurnText(
                            speakerState.providerFinalizedText,
                            speakerState.latestNonFinalText,
                        );
                        if (frameUpdate.maxSeenTokenEndMs > speakerState.currentSnapshotEndMs) {
                            speakerState.currentSnapshotEndMs = frameUpdate.maxSeenTokenEndMs;
                        }

                        const mergedSnapshot = speakerState.currentSnapshotText;
                        const previousMergedTextForIdle = stripEndpointMarkers(previousMergedSnapshot);
                        const mergedTextForIdle = stripEndpointMarkers(mergedSnapshot);
                        const transcriptChanged = mergedTextForIdle !== previousMergedTextForIdle;
                        const hasPendingTranscript = mergedSnapshot.length > 0
                            && !(speakerState.latestNonFinalIsProvisionalCarry && !speakerState.providerFinalizedText.trim());

                        const requestSpeaker = finalizeRequestForFrame?.speakers.get(frameUpdate.speaker) || null;
                        const decision = requestSpeaker
                            ? evaluateEndpointMarkerDecision({
                                finalizedText: speakerState.providerFinalizedText,
                                latestNonFinalText: speakerState.latestNonFinalText,
                                mergedSnapshot,
                                hasEndpointToken,
                                endpointMarkerText,
                                hasProgressTokenBeyondWatermark: frameUpdate.hasProgressTokenBeyondWatermark,
                                finalizeSnapshotTextLen: requestSpeaker.snapshotTextLen,
                                hadPendingTextBeforeFrame: previousMergedSnapshot.length > 0,
                            })
                            : { action: 'none' as const };

                        if (decision.action === 'finalize') {
                            const finalizedDetectedLang = speakerState.detectedLang;
                            const finalizedText = stripEndpointMarkers(decision.text).trim();
                            const finalizedEndMs = requestSpeaker?.snapshotEndMs ?? speakerState.currentSnapshotEndMs;
                            const carryEndMs = speakerState.currentSnapshotEndMs;
                            if (finalizedText) {
                                emitTranscript(
                                    decision.text,
                                    finalizedDetectedLang,
                                    true,
                                    speakerState.speaker,
                                );
                            }
                            if (finalizedEndMs > speakerState.lastConsumedEndMs) {
                                speakerState.lastConsumedEndMs = finalizedEndMs;
                            }
                            resetSpeakerTurn(speakerState);

                            if (decision.carryText) {
                                speakerState.detectedLang = getNextTurnDetectedLang(
                                    finalizedDetectedLang,
                                    decision.carryText,
                                );
                                speakerState.latestNonFinalText = decision.carryText;
                                speakerState.latestNonFinalIsProvisionalCarry = true;
                                speakerState.currentSnapshotText = composeTurnText('', decision.carryText);
                                speakerState.currentSnapshotEndMs = carryEndMs;
                                speakerState.strategy.scheduleCarryExpiry();
                                emitTranscript(
                                    decision.carryText,
                                    speakerState.detectedLang,
                                    false,
                                    speakerState.speaker,
                                );
                            }
                            continue;
                        }

                        if (transcriptChanged && hasPendingTranscript) {
                            emitTranscript(
                                mergedSnapshot,
                                speakerState.detectedLang,
                                false,
                                speakerState.speaker,
                            );
                        }
                    }

                    if (finalizeRequestForFrame) {
                        activeFinalizeRequest = null;
                    }
                    refreshGlobalFinalizeScheduling();

                } catch (parseError) {
                    console.error('Error parsing Soniox message:', parseError);
                }
            };

            sttWs.onerror = (error) => {
                console.error('Soniox WebSocket error:', error);
                if (isClientConnected) {
                    clientWs.close();
                }
            };

            sttWs.onclose = () => {
                // stop_recording 경로가 아니면 남은 텍스트를 마지막 발화로 플러시
                if (isClientConnected && !sonioxStopRequested) {
                    void (async () => {
                        await finalizePendingTurnFromProvider?.();
                        if (clientWs.readyState === WebSocket.OPEN) {
                            clientWs.close();
                        }
                    })();
                }
                disposeSonioxSpeakerStates?.();
                disposeSonioxSpeakerStates = null;
            };

        } catch (error) {
            console.error('Error starting Soniox connection:', error);
            if (isClientConnected) {
                clientWs.close(1011, 'Failed to connect to Soniox service.');
            }
        }
    };

    const sendForcedFinalTurn = (
        rawText: string,
        rawLanguage: string,
        rawSpeaker?: string,
    ): FinalTurnPayload | null => {
        const text = (rawText || '').trim();
        const language = (rawLanguage || '').trim() || 'unknown';
        const speaker = (rawSpeaker || '').trim() || 'unknown';
        if (!text) return null;

        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
                type: 'transcript',
                data: {
                    is_final: true,
                    utterance: {
                        text,
                        language,
                        speaker,
                    },
                },
            }));
        }

        return { text, language, speaker };
    };

    // ===== 클라이언트 메시지 핸들러 =====
    clientWs.onmessage = (event) => {
        const message = event.data.toString();
        let data: any;
        try {
            data = JSON.parse(message);
        } catch {
            return;
        }

        if (data?.type === 'stop_recording') {
            const pendingText = (data?.data?.pending_text || '').toString();
            const pendingLang = data?.data?.pending_language || 'unknown';
            const cleanedPendingText = pendingText.trim();
            sonioxStopRequested = currentModel === 'soniox';

            let finalizedTurn: FinalTurnPayload | null = null;

            // User-initiated stop: finalize what the user currently sees.
            if (currentModel === 'soniox' && finalizePendingTurnFromProvider) {
                void finalizePendingTurnFromProvider();
            } else if (cleanedPendingText) {
                finalizedTurn = sendForcedFinalTurn(pendingText, pendingLang);
            } else if (finalizePendingTurnFromProvider) {
                // Synchronous path: just emit transcript, no async translation.
                void finalizePendingTurnFromProvider();
            }

            if (sttWs && (sttWs.readyState === WebSocket.OPEN || sttWs.readyState === WebSocket.CONNECTING)) {
                sttWs.close();
            }

            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({
                    type: 'stop_recording_ack',
                    data: buildStopRecordingAckDataForReleaseVariant(finalizedTurn),
                }));
                // Close client socket after ack.
                setTimeout(() => {
                    if (clientWs.readyState === WebSocket.OPEN) {
                        clientWs.close();
                    }
                }, 50);
            }
            if (currentModel !== 'soniox') {
                disposeSonioxSpeakerStates?.();
                disposeSonioxSpeakerStates = null;
            }
            return;
        }

        if (data.sample_rate) {
            const normalizedLanguages = Array.isArray(data.languages)
                ? data.languages
                    .filter((language): language is string => typeof language === 'string')
                    .map((language) => language.trim())
                    .filter(Boolean)
                : [];
            const apiNamespace = typeof data.api_namespace === 'string'
                ? data.api_namespace.trim()
                : '';
            const clientConfig = {
                ...data,
                api_namespace: apiNamespace,
                behavior_profile: resolveMingleSttBehaviorProfile(apiNamespace),
                release_variant: resolveMingleSttReleaseVariant(apiNamespace),
                languages: normalizedLanguages,
            } as ClientConfig;

            currentModel = clientConfig.stt_model || 'gladia';
            behaviorProfile = clientConfig.behavior_profile || 'legacy_1_0_11';
            releaseVariant = clientConfig.release_variant || 'legacy_default_v1_0_11';
            releaseRuntime = resolveMingleSttReleaseRuntime(releaseVariant);
            selectedLanguages = normalizedLanguages;
            finalizePendingTurnFromProvider = null;
            sonioxStopRequested = false;
            console.log(
                `[conn:${connId}] config release=${releaseVariant} profile=${behaviorProfile} namespace=${apiNamespace || '-'} model=${currentModel} langs=${selectedLanguages.join(',')}`,
            );
            
            startConnectionForReleaseVariant(clientConfig);
        } else if (sttWs && sttWs.readyState === WebSocket.OPEN) {
            // 오디오 프레임 전송
            if (currentModel === 'deepgram' || currentModel === 'deepgram-multi' || currentModel === 'fireworks' || currentModel === 'soniox') {
                // Deepgram, Fireworks, Soniox는 바이너리 데이터를 직접 전송해야 함 (Gladia/Gladia-STT는 JSON 형식)
                if (data.type === 'audio_chunk' && data.data?.chunk) {
                    const pcmData = Buffer.from(data.data.chunk, 'base64');
                    sttWs.send(pcmData);
                }
            } else {
                // Gladia는 JSON 형식 그대로 전송
                sttWs.send(message);
            }
        }
    };

    clientWs.onclose = (event) => {
        const durationSec = ((Date.now() - connectedAt) / 1000).toFixed(1);
        console.log(`[conn:${connId}] client disconnected code=${event.code} duration=${durationSec}s model=${currentModel} langs=${selectedLanguages.join(',')}`);
        cleanup();
    };
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[stt-server] listening on 0.0.0.0:${PORT}`);
    console.log(
        `[stt-server] soniox_finalize_tuning defaultSilenceMs=${SONIOX_MANUAL_FINALIZE_SILENCE_MS_DEFAULT} cooldownMs=${SONIOX_MANUAL_FINALIZE_COOLDOWN_MS} useLanguageHints=${SONIOX_USE_LANGUAGE_HINTS} debugTokenLogs=${SONIOX_DEBUG_TOKEN_LOGS}`,
    );
});
