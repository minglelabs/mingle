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
    formatSonioxDebugTokenRun,
    getNextTurnDetectedLang,
    hasPendingSonioxTurnText,
    mergeDetectedLang,
    normalizeDetectedLang,
    normalizeSpeaker,
    shouldUseTokenLanguageForCurrentTurn,
} from './soniox-language';
import {
    parseMingleSttReleaseVariant,
    resolveMingleSttBehaviorProfile,
    resolveMingleSttReleaseVariant,
    type MingleSttBehaviorProfile,
    type MingleSttReleaseVariant,
} from './behavior-profile';
import {
    resolveMingleSttReleaseRuntime,
    type MingleSttClientConfig,
    type MingleSttConnectionStarters,
    type MingleSttFinalTurnPayload,
    type MingleSttModel,
    type MingleSttStopRecordingLifecycle,
} from './release-runtime';

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

let connectionCounter = 0;

function classifySonioxUpstreamError(errorCode: unknown, errorMessage: unknown): string {
    const code = String(errorCode || '').trim();
    const message = String(errorMessage || '').trim().toLowerCase();

    if (code === '408') return 'upstream_timeout';
    if (code === '400' && message.includes('audio is too long')) return 'audio_too_long';
    if (code === '400') return 'bad_request';
    return 'upstream_error';
}

wss.on('connection', (clientWs) => {
    const connId = ++connectionCounter;
    const connectedAt = Date.now();
    console.log(`[conn:${connId}] client connected`);

    let sttWs: WebSocket | null = null;
    let isClientConnected = true;
    let abortController: AbortController | null = null;
    let currentModel: MingleSttModel = 'gladia';
    let behaviorProfile: MingleSttBehaviorProfile = 'legacy_1_0_11';
    let releaseVariant: MingleSttReleaseVariant = 'legacy_default_v1_0_11';
    let releaseRuntime = resolveMingleSttReleaseRuntime(releaseVariant);
    let apiNamespace = '';
    let selectedLanguages: string[] = [];
    let lastSonioxUpstreamError: { code: string; category: string } | null = null;
    let finalizePendingTurnFromProvider: (() => Promise<MingleSttFinalTurnPayload>) | null = null;
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
                sonioxLanguageHintsEnabled: SONIOX_USE_LANGUAGE_HINTS,
            }),
        ));
    };

    // ===== GLADIA 연결 =====
    const startGladiaConnection = async (config: MingleSttClientConfig, enableTranslation = true) => {
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
    const startDeepgramConnection = async (config: MingleSttClientConfig) => {
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
    const startDeepgramMultiConnection = async (config: MingleSttClientConfig) => {
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
    const startFireworksConnection = async (config: MingleSttClientConfig) => {
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
    const startSonioxConnection = async (config: MingleSttClientConfig) => {
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
                lastProgressAtMs: number;
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
                timeout?: ReturnType<typeof setTimeout>;
                resolve?: (payload: MingleSttFinalTurnPayload) => void;
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
            let globalFinalizeLastSentAtMs = 0;
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
                    lastProgressAtMs: state.lastProgressAtMs,
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
                globalFinalizeLastSentAtMs = 0;
                if (activeFinalizeRequest?.timeout) {
                    clearTimeout(activeFinalizeRequest.timeout);
                }
                activeFinalizeRequest?.resolve?.(null);
                activeFinalizeRequest = null;
            };
            const scheduleGlobalFinalizeCheck = (delayMs: number) => {
                clearGlobalFinalizeTimer();
                globalFinalizeTimer = setTimeout(() => {
                    globalFinalizeTimer = null;
                    maybeTriggerGlobalFinalize();
                }, Math.max(1, delayMs));
            };
            const buildIdleFinalizeCohort = (now: number) => (
                buildSonioxFinalizeRequestCohort(buildPendingTurnSnapshots(), {
                    idleBeforeMs: now - sonioxManualFinalizeSilenceMs,
                })
            );
            const nextGlobalFinalizeDelayMs = (now: number): number | null => {
                const pendingProgressAtTimes = buildPendingTurnSnapshots()
                    .filter((snapshot) => hasPendingSonioxTurnText(snapshot.currentSnapshotText))
                    .map((snapshot) => snapshot.lastProgressAtMs)
                    .filter((value): value is number => (
                        typeof value === 'number'
                        && Number.isFinite(value)
                        && value > 0
                    ));
                if (pendingProgressAtTimes.length === 0) return null;

                const waitForSpeakerSilence = Math.min(
                    ...pendingProgressAtTimes.map((lastProgressAtMs) => (
                        Math.max(0, sonioxManualFinalizeSilenceMs - (now - lastProgressAtMs))
                    )),
                );
                const waitForCooldown = globalFinalizeLastSentAtMs > 0
                    ? Math.max(0, SONIOX_MANUAL_FINALIZE_COOLDOWN_MS - (now - globalFinalizeLastSentAtMs))
                    : 0;

                return Math.max(waitForSpeakerSilence, waitForCooldown);
            };
            const maybeTriggerGlobalFinalize = () => {
                if (sonioxStopRequested) return;

                const now = Date.now();
                const wait = nextGlobalFinalizeDelayMs(now);
                if (wait === null) {
                    clearGlobalFinalizeTimer();
                    return;
                }

                if (activeFinalizeRequest) return;
                if (wait > 0) {
                    scheduleGlobalFinalizeCheck(wait);
                    return;
                }

                if (!sttWs || sttWs.readyState !== WebSocket.OPEN) return;

                const cohort = buildIdleFinalizeCohort(now);
                if (cohort.length === 0) {
                    const nextWait = nextGlobalFinalizeDelayMs(now);
                    if (nextWait === null) clearGlobalFinalizeTimer();
                    else scheduleGlobalFinalizeCheck(nextWait);
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
            const completeActiveFinalizeRequest = (payload: MingleSttFinalTurnPayload) => {
                const request = activeFinalizeRequest;
                if (!request) return;
                if (request.timeout) {
                    clearTimeout(request.timeout);
                }
                activeFinalizeRequest = null;
                request.resolve?.(payload);
            };
            const forceProviderFinalizeAllSpeakerTurns = async (): Promise<MingleSttFinalTurnPayload> => {
                const cohort = buildSonioxFinalizeRequestCohort(buildPendingTurnSnapshots());
                if (cohort.length === 0) return null;
                if (!sttWs || sttWs.readyState !== WebSocket.OPEN) {
                    return flushAllSpeakerTurns();
                }

                const now = Date.now();
                if (activeFinalizeRequest?.timeout) {
                    clearTimeout(activeFinalizeRequest.timeout);
                }
                globalFinalizeLastSentAtMs = now;

                return await new Promise<MingleSttFinalTurnPayload>((resolve) => {
                    const requestId = ++finalizeRequestSeq;
                    const timeout = setTimeout(() => {
                        if (activeFinalizeRequest?.requestId !== requestId) return;
                        activeFinalizeRequest = null;
                        resolve(flushAllSpeakerTurns());
                    }, Math.max(1200, sonioxManualFinalizeSilenceMs + 700));

                    activeFinalizeRequest = {
                        requestId,
                        requestedAtMs: now,
                        speakers: new Map(cohort.map((entry) => [entry.speaker, entry])),
                        timeout,
                        resolve,
                    };

                    try {
                        sttWs!.send(JSON.stringify({ type: 'finalize' }));
                    } catch (error) {
                        clearTimeout(timeout);
                        activeFinalizeRequest = null;
                        console.error('Soniox stop finalize send failed:', error);
                        resolve(flushAllSpeakerTurns());
                    }
                });
            };
            const refreshGlobalFinalizeScheduling = () => {
                const now = Date.now();
                const wait = nextGlobalFinalizeDelayMs(now);
                if (wait === null) {
                    clearGlobalFinalizeTimer();
                    return;
                }

                if (activeFinalizeRequest) return;
                if (wait === 0) {
                    maybeTriggerGlobalFinalize();
                    return;
                }

                scheduleGlobalFinalizeCheck(wait);
            };

            const emitTranscript = (
                text: string,
                language: string,
                isFinal: boolean,
                speaker?: string,
            ): MingleSttFinalTurnPayload => {
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
                state.lastProgressAtMs = 0;
                state.detectedLang = 'unknown';
                state.strategy.resetState();
            };

            const finalizeSpeakerTurn = (speaker: string): MingleSttFinalTurnPayload => {
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

            const flushAllSpeakerTurns = (): MingleSttFinalTurnPayload => {
                let lastPayload: MingleSttFinalTurnPayload = null;
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
                    lastProgressAtMs: 0,
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
                const payload = await forceProviderFinalizeAllSpeakerTurns();
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
                        const errorCode = String(msg.error_code || '').trim();
                        const errorMessage = String(msg.error_message || '').trim();
                        const errorCategory = classifySonioxUpstreamError(errorCode, errorMessage);
                        lastSonioxUpstreamError = { code: errorCode, category: errorCategory };
                        const durationSec = ((Date.now() - connectedAt) / 1000).toFixed(1);
                        console.error(
                            `[conn:${connId}] soniox_upstream_error code=${errorCode || '-'} category=${errorCategory} duration=${durationSec}s namespace=${apiNamespace || '-'} message=${JSON.stringify(errorMessage)}`,
                        );
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

                    let lastFinalizedPayloadForFrame: MingleSttFinalTurnPayload = null;
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
                        if (hasPendingTranscript && (transcriptChanged || speakerState.lastProgressAtMs <= 0)) {
                            speakerState.lastProgressAtMs = Date.now();
                        } else if (!mergedTextForIdle.trim()) {
                            speakerState.lastProgressAtMs = 0;
                        }

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
                                const payload = emitTranscript(
                                    decision.text,
                                    finalizedDetectedLang,
                                    true,
                                    speakerState.speaker,
                                );
                                if (payload) {
                                    lastFinalizedPayloadForFrame = payload;
                                }
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
                        completeActiveFinalizeRequest(lastFinalizedPayloadForFrame);
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
    ): MingleSttFinalTurnPayload => {
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

    const connectionStarters: MingleSttConnectionStarters = {
        startGladia: (config, enableTranslation) => {
            void startGladiaConnection(config, enableTranslation);
        },
        startDeepgram: (config) => {
            void startDeepgramConnection(config);
        },
        startDeepgramMulti: (config) => {
            void startDeepgramMultiConnection(config);
        },
        startFireworks: (config) => {
            void startFireworksConnection(config);
        },
        startSoniox: (config) => {
            void startSonioxConnection(config);
        },
    };

    const buildStopRecordingLifecycle = (): MingleSttStopRecordingLifecycle => ({
        setSonioxStopRequested: (nextValue) => {
            sonioxStopRequested = nextValue;
        },
        finalizePendingTurnFromProvider,
        sendForcedFinalTurn,
        closeProviderSocket: () => {
            if (sttWs && (sttWs.readyState === WebSocket.OPEN || sttWs.readyState === WebSocket.CONNECTING)) {
                sttWs.close();
            }
        },
        sendStopRecordingAck: (ackData) => {
            if (clientWs.readyState !== WebSocket.OPEN) return;
            clientWs.send(JSON.stringify({
                type: 'stop_recording_ack',
                data: ackData,
            }));
        },
        scheduleClientCloseAfterAck: () => {
            setTimeout(() => {
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.close();
                }
            }, 50);
        },
        disposeSpeakerStates: () => {
            disposeSonioxSpeakerStates?.();
            disposeSonioxSpeakerStates = null;
        },
    });

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
            releaseRuntime.handleStopRecording({
                pendingText: (data?.data?.pending_text || '').toString(),
                pendingLanguage: data?.data?.pending_language || 'unknown',
                currentModel,
                lifecycle: buildStopRecordingLifecycle(),
            });
            return;
        }

        if (data.sample_rate) {
            const normalizedLanguages = Array.isArray(data.languages)
                ? data.languages
                    .filter((language): language is string => typeof language === 'string')
                    .map((language) => language.trim())
                    .filter(Boolean)
                : [];
            const nextApiNamespace = typeof data.api_namespace === 'string'
                ? data.api_namespace.trim()
                : '';
            const requestedReleaseVariant = typeof data.release_variant === 'string'
                ? parseMingleSttReleaseVariant(data.release_variant)
                : null;
            const resolvedReleaseVariant = nextApiNamespace
                ? resolveMingleSttReleaseVariant(nextApiNamespace)
                : requestedReleaseVariant || 'legacy_default_v1_0_11';
            const resolvedReleaseRuntime = resolveMingleSttReleaseRuntime(resolvedReleaseVariant);
            const clientConfig = {
                ...data,
                api_namespace: nextApiNamespace,
                behavior_profile: nextApiNamespace
                    ? resolveMingleSttBehaviorProfile(nextApiNamespace)
                    : resolvedReleaseRuntime.behaviorLine,
                release_variant: resolvedReleaseVariant,
                languages: normalizedLanguages,
            } as MingleSttClientConfig;

            currentModel = clientConfig.stt_model || 'gladia';
            behaviorProfile = clientConfig.behavior_profile || 'legacy_1_0_11';
            releaseVariant = clientConfig.release_variant || 'legacy_default_v1_0_11';
            releaseRuntime = resolvedReleaseRuntime;
            apiNamespace = nextApiNamespace;
            selectedLanguages = normalizedLanguages;
            lastSonioxUpstreamError = null;
            finalizePendingTurnFromProvider = null;
            sonioxStopRequested = false;
            console.log(
                `[conn:${connId}] config release=${releaseVariant} profile=${behaviorProfile} namespace=${apiNamespace || '-'} model=${currentModel} langs=${selectedLanguages.join(',')}`,
            );

            releaseRuntime.startConnectionForModel({
                config: clientConfig,
                starters: connectionStarters,
            });
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
        const sonioxErrorFields = lastSonioxUpstreamError
            ? ` soniox_error_code=${lastSonioxUpstreamError.code || '-'} soniox_error_category=${lastSonioxUpstreamError.category}`
            : '';
        console.log(`[conn:${connId}] client disconnected code=${event.code} duration=${durationSec}s model=${currentModel} namespace=${apiNamespace || '-'} langs=${selectedLanguages.join(',')}${sonioxErrorFields}`);
        cleanup();
    };
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[stt-server] listening on 0.0.0.0:${PORT}`);
    console.log(
        `[stt-server] soniox_finalize_tuning defaultSilenceMs=${SONIOX_MANUAL_FINALIZE_SILENCE_MS_DEFAULT} cooldownMs=${SONIOX_MANUAL_FINALIZE_COOLDOWN_MS} useLanguageHints=${SONIOX_USE_LANGUAGE_HINTS} debugTokenLogs=${SONIOX_DEBUG_TOKEN_LOGS}`,
    );
});
