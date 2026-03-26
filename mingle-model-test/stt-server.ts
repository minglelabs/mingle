import { createServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import fetch from 'node-fetch';
import 'dotenv/config';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createSpeechmaticsJWT } from '@speechmatics/auth';
import {
    RealtimeClient,
    type AddPartialTranscript,
    type AddTranscript,
} from '@speechmatics/real-time-client';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const PORT = 3001;
const GLADIA_API_URL = 'https://api.gladia.io/v2/live';
const DEEPGRAM_WS_URL = 'wss://api.deepgram.com/v1/listen';
const FIREWORKS_WS_URL = 'wss://audio-streaming.api.fireworks.ai/v1/audio/transcriptions/streaming';
const SONIOX_WS_URL = 'wss://stt-rt.soniox.com/transcribe-websocket';
const ELEVENLABS_WS_URL = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';
const SPEECHMATICS_JWT_TTL_SEC = 60;

const server = createServer();
const wss = new WebSocketServer({ server });
type SttModel =
    | 'gladia'
    | 'gladia-stt'
    | 'deepgram'
    | 'deepgram-multi'
    | 'fireworks'
    | 'chirp-3'
    | 'soniox'
    | 'elevenlabs'
    | 'speechmatics';

type TranslateModel = 'gpt-5-nano' | 'claude-haiku-4-5' | 'gemini-2.5-flash-lite' | 'gemini-3-flash-preview';

interface ClientConfig {
    sample_rate: number;
    languages: string[];
    stt_model: SttModel;
    translate_model?: TranslateModel;
    translation_enabled?: boolean;
    lang_hints_strict?: boolean;
}

interface SpeechmaticsSessionConfig {
    language: string;
    domain?: string;
    fallbackLanguage: string;
    note?: string;
}

const speechmaticsLanguageMap: Record<string, string> = {
    en: 'en',
    ko: 'ko',
    th: 'th',
    zh: 'cmn',
    ja: 'ja',
    es: 'es',
    fr: 'fr',
    de: 'de',
    ru: 'ru',
    pt: 'pt',
    ar: 'ar',
    hi: 'hi',
    vi: 'vi',
    it: 'it',
    id: 'id',
    tr: 'tr',
    pl: 'pl',
    nl: 'nl',
    sv: 'sv',
    ms: 'ms',
};

const normalizeSpeechmaticsLanguage = (language: string) => (
    language === 'cmn' ? 'zh' : language
);

const resolveSpeechmaticsSessionConfig = (languages: string[]): SpeechmaticsSessionConfig => {
    const unique = [...new Set(languages.filter(Boolean))];
    const normalized = unique.map((lang) => speechmaticsLanguageMap[lang] || lang);
    const has = (lang: string) => normalized.includes(lang);

    if (normalized.length === 2 && has('ar') && has('en')) {
        return {
            language: 'ar_en',
            fallbackLanguage: 'ar_en',
            note: 'Using Speechmatics bilingual Arabic-English pack.',
        };
    }

    if (normalized.length === 2 && has('es') && has('en')) {
        return {
            language: 'es',
            domain: 'bilingual-en',
            fallbackLanguage: 'es_en',
            note: 'Using Speechmatics bilingual Spanish-English pack.',
        };
    }

    if (normalized.length === 2 && has('cmn') && has('en')) {
        return {
            language: 'cmn_en',
            fallbackLanguage: 'zh_en',
            note: 'Using Speechmatics bilingual Mandarin-English pack.',
        };
    }

    if (normalized.length === 2 && has('en') && has('ms')) {
        return {
            language: 'en_ms',
            fallbackLanguage: 'en_ms',
            note: 'Using Speechmatics bilingual English-Malay pack.',
        };
    }

    const primaryLanguage = normalizeSpeechmaticsLanguage(normalized[0] || 'en');
    return {
        language: normalized[0] || 'en',
        fallbackLanguage: primaryLanguage,
        note: normalized.length > 1
            ? `Speechmatics public realtime API does not expose this language combination directly. Falling back to primary language "${primaryLanguage}".`
            : undefined,
    };
};

const getSpeechmaticsTranscriptLanguage = (
    message: AddPartialTranscript | AddTranscript,
    fallbackLanguage: string,
) => {
    for (const result of message.results) {
        for (const alternative of result.alternatives ?? []) {
            if (alternative.language) {
                return normalizeSpeechmaticsLanguage(alternative.language);
            }
        }
    }
    return fallbackLanguage;
};

const ELEVENLABS_SUPPORTED_SAMPLE_RATES = [8000, 16000, 22050, 24000, 44100, 48000] as const;

const resolveElevenLabsAudioFormat = (sampleRate: number) => {
    const rounded = Math.round(sampleRate);
    const exact = ELEVENLABS_SUPPORTED_SAMPLE_RATES.find((rate) => rate === rounded);
    if (exact) {
        return `pcm_${exact}`;
    }

    const closest = ELEVENLABS_SUPPORTED_SAMPLE_RATES.reduce((best, candidate) => {
        return Math.abs(candidate - rounded) < Math.abs(best - rounded) ? candidate : best;
    });

    if (Math.abs(closest - rounded) <= 400) {
        return `pcm_${closest}`;
    }

    return null;
};

wss.on('connection', (clientWs) => {
    let sttWs: WebSocket | null = null;
    let speechmaticsClient: RealtimeClient | null = null;
    let isClientConnected = true;
    let abortController: AbortController | null = null;
    let currentModel: SttModel = 'gladia';
    let currentSampleRate = 16000;
    let selectedLanguages: string[] = [];
    let translateModel: TranslateModel = 'claude-haiku-4-5';
    let translationEnabled = true;

    const gladiaApiKey = process.env.GLADIA_API_KEY;
    const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
    const fireworksApiKey = process.env.FIREWORKS_API_KEY;
    const googleCloudProjectId = process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GCP_PROJECT_ID;
    const sonioxApiKey = process.env.SONIOX_API_KEY;
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    const speechmaticsApiKey = process.env.SPEECHMATICS_API_KEY;
    const speechmaticsRegion = process.env.SPEECHMATICS_REGION as 'eu' | 'usa' | 'au' | undefined;
    const speechmaticsRtUrl = process.env.SPEECHMATICS_RT_URL;

    const cleanup = () => {
        isClientConnected = false;
        
        // 진행 중인 fetch 요청 취소
        if (abortController) {
            abortController.abort();
            abortController = null;
        }
        
        // STT WebSocket 연결 정리 (모든 상태에서)
        if (sttWs) {
            if (sttWs.readyState === WebSocket.OPEN || sttWs.readyState === WebSocket.CONNECTING) {
                sttWs.close();
            }
            sttWs = null;
        }

        if (speechmaticsClient) {
            void speechmaticsClient.stopRecognition({ noTimeout: true }).catch(() => undefined);
            speechmaticsClient = null;
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
                    clientWs.send(JSON.stringify({ status: 'ready' }));
                } else {
                    sttWs?.close();
                }
            };

            sttWs.onmessage = (event) => {
                if (isClientConnected) {
                    const raw = event.data.toString();
                    clientWs.send(raw);

                    // Gladia-STT (번역 미사용) 모드에서 GPT 번역 적용
                    if (!enableTranslation && translationEnabled && selectedLanguages.length > 0) {
                        try {
                            const msg = JSON.parse(raw);
                            if (msg.type === 'transcript' && msg.data?.is_final && msg.data?.utterance?.text) {
                                translateText(msg.data.utterance.text, msg.data.utterance.language || 'en', selectedLanguages, clientWs);
                            }
                        } catch { /* ignore parse errors for non-JSON messages */ }
                    }
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
                    clientWs.send(JSON.stringify({ status: 'ready' }));
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

                                    if (isFinal && selectedLanguages.length > 0) {
                                        translateText(transcript, detectedLang, selectedLanguages, clientWs);
                                    }
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
                    clientWs.send(JSON.stringify({ status: 'ready' }));
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

                                    if (isFinal && selectedLanguages.length > 0) {
                                        translateText(transcript, detectedLang, selectedLanguages, clientWs);
                                    }
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
                    clientWs.send(JSON.stringify({ status: 'ready' }));
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

                            if (isFinal && selectedLanguages.length > 0) {
                                translateText(text, language, selectedLanguages, clientWs);
                            }
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

    // ===== CHIRP 3 연결 =====
    const startChirp3Connection = async (_config: ClientConfig) => {
        void _config;
        console.error(
            '[model-test] chirp-3 is not wired yet. Chirp 3 requires Google Cloud Speech-to-Text V2 authentication (ADC/service account), not GEMINI_API_KEY.',
        );
        console.error(
            '[model-test] Set GOOGLE_APPLICATION_CREDENTIALS and Google Cloud project credentials before enabling this model.',
        );

        if (!googleCloudProjectId) {
            console.error('[model-test] GOOGLE_CLOUD_PROJECT_ID or GCP_PROJECT_ID is missing.');
        }

        clientWs.close(
            1011,
            'Chirp 3 is not yet connected. Google Cloud Speech-to-Text V2 auth is required.',
        );
    };

    // ===== ELEVENLABS 연결 =====
    const startElevenLabsConnection = async (config: ClientConfig) => {
        if (!elevenLabsApiKey) {
            console.error("ELEVENLABS_API_KEY environment variable not set!");
            clientWs.close(1011, "Server configuration error: ElevenLabs API key not found.");
            return;
        }

        try {
            const audioFormat = resolveElevenLabsAudioFormat(config.sample_rate);
            let detectedLanguage = 'unknown';
            let lastCommittedText = '';
            let readySent = false;

            const wsUrl = new URL(ELEVENLABS_WS_URL);
            wsUrl.searchParams.set('model_id', 'scribe_v2_realtime');
            wsUrl.searchParams.set('include_timestamps', 'true');
            wsUrl.searchParams.set('include_language_detection', 'true');
            wsUrl.searchParams.set('commit_strategy', 'vad');
            wsUrl.searchParams.set('vad_silence_threshold_secs', '0.6');
            if (audioFormat) {
                wsUrl.searchParams.set('audio_format', audioFormat);
            }

            sttWs = new WebSocket(wsUrl.toString(), {
                headers: {
                    'xi-api-key': elevenLabsApiKey,
                },
            });

            sttWs.onopen = () => {
                if (!audioFormat) {
                    console.warn(
                        `[ElevenLabs] unsupported sample rate ${config.sample_rate}; sending chunk sample_rate only`,
                    );
                }
            };

            sttWs.onmessage = (event) => {
                if (!isClientConnected) return;

                try {
                    const raw = event.data.toString();
                    console.log(`[ElevenLabs] inbound ${raw}`);
                    const msg = JSON.parse(raw) as Record<string, unknown>;
                    const messageType = typeof msg.message_type === 'string' ? msg.message_type : '';
                    const messageLanguageCode = typeof msg.language_code === 'string'
                        ? msg.language_code.trim()
                        : '';

                    if (messageType === 'session_started') {
                        if (!readySent) {
                            readySent = true;
                            clientWs.send(JSON.stringify({ status: 'ready' }));
                        }
                        return;
                    }

                    if (messageType === 'partial_transcript') {
                        const text = typeof msg.text === 'string' ? msg.text.trim() : '';
                        if (!text) return;

                        clientWs.send(JSON.stringify({
                            type: 'transcript',
                            data: {
                                is_final: false,
                                utterance: {
                                    text,
                                    language: detectedLanguage,
                                },
                            },
                        }));
                        return;
                    }

                    if (messageType === 'committed_transcript') {
                        // When timestamps are enabled, ElevenLabs also sends
                        // committed_transcript_with_timestamps with language_code.
                        // Ignore the plain committed event so we do not lock in
                        // an "unknown" language before the richer event arrives.
                        return;
                    }

                    if (messageType === 'committed_transcript_with_timestamps') {
                        const text = typeof msg.text === 'string' ? msg.text.trim() : '';
                        if (!text) return;
                        if (text === lastCommittedText) return;
                        lastCommittedText = text;

                        if (messageLanguageCode) {
                            detectedLanguage = messageLanguageCode;
                        }

                        clientWs.send(JSON.stringify({
                            type: 'transcript',
                            data: {
                                is_final: true,
                                utterance: {
                                    text,
                                    language: detectedLanguage,
                                },
                            },
                        }));

                        if (translationEnabled && selectedLanguages.length > 0) {
                            translateText(text, detectedLanguage, selectedLanguages, clientWs);
                        }
                        return;
                    }

                    if (messageType.includes('error')) {
                        const errorMessage = typeof msg.error === 'string'
                            ? msg.error
                            : typeof msg.detail === 'string'
                                ? msg.detail
                                : messageType;
                        console.error(`[ElevenLabs] ${messageType}: ${errorMessage}`);
                        clientWs.close(1011, `ElevenLabs error: ${errorMessage}`);
                    }
                } catch (parseError) {
                    console.error('Error parsing ElevenLabs message:', parseError);
                }
            };

            sttWs.onerror = (error) => {
                console.error('ElevenLabs WebSocket error:', error);
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
            console.error('Error starting ElevenLabs connection:', error);
            if (isClientConnected) {
                clientWs.close(1011, 'Failed to connect to ElevenLabs transcription service.');
            }
        }
    };

    // ===== SPEECHMATICS 연결 =====
    const startSpeechmaticsConnection = async (config: ClientConfig) => {
        if (!speechmaticsApiKey) {
            console.error("SPEECHMATICS_API_KEY environment variable not set!");
            clientWs.close(1011, "Server configuration error: Speechmatics API key not found.");
            return;
        }

        const sessionConfig = resolveSpeechmaticsSessionConfig(config.languages);
        if (sessionConfig.note) {
            console.log(`[Speechmatics] ${sessionConfig.note}`);
        }

        try {
            const jwt = await createSpeechmaticsJWT({
                type: 'rt',
                apiKey: speechmaticsApiKey,
                ttl: SPEECHMATICS_JWT_TTL_SEC,
                ...(speechmaticsRegion ? { region: speechmaticsRegion } : {}),
            });

            if (!isClientConnected) return;

            const realtimeClient = new RealtimeClient(
                speechmaticsRtUrl ? { url: speechmaticsRtUrl } : undefined,
            );
            speechmaticsClient = realtimeClient;

            realtimeClient.addEventListener('receiveMessage', ({ data }) => {
                if (!isClientConnected) return;

                if (data.message === 'AddPartialTranscript' || data.message === 'AddTranscript') {
                    const text = data.metadata?.transcript?.trim();
                    if (!text) return;

                    const detectedLanguage = getSpeechmaticsTranscriptLanguage(
                        data,
                        sessionConfig.fallbackLanguage,
                    );

                    clientWs.send(JSON.stringify({
                        type: 'transcript',
                        data: {
                            is_final: data.message === 'AddTranscript',
                            utterance: {
                                text,
                                language: detectedLanguage,
                            },
                        },
                    }));

                    if (data.message === 'AddTranscript' && selectedLanguages.length > 0) {
                        translateText(text, detectedLanguage, selectedLanguages, clientWs);
                    }
                    return;
                }

                if (data.message === 'Warning') {
                    console.warn(`[Speechmatics] Warning (${data.type}): ${data.reason}`);
                    return;
                }

                if (data.message === 'Error') {
                    console.error(`[Speechmatics] Error (${data.type}): ${data.reason}`);
                    clientWs.close(1011, `Speechmatics error: ${data.type}`);
                }
            });

            await realtimeClient.start(jwt, {
                audio_format: {
                    type: 'raw',
                    encoding: 'pcm_s16le',
                    sample_rate: config.sample_rate,
                },
                transcription_config: {
                    language: sessionConfig.language,
                    ...(sessionConfig.domain ? { domain: sessionConfig.domain } : {}),
                    enable_partials: true,
                    max_delay: 0.7,
                    operating_point: 'enhanced',
                    conversation_config: {
                        end_of_utterance_silence_trigger: 0.4,
                    },
                },
            });

            if (isClientConnected) {
                clientWs.send(JSON.stringify({ status: 'ready' }));
            } else {
                void realtimeClient.stopRecognition({ noTimeout: true }).catch(() => undefined);
            }
        } catch (error) {
            console.error('Error starting Speechmatics connection:', error);
            if (isClientConnected) {
                clientWs.close(1011, 'Failed to connect to Speechmatics transcription service.');
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

            // 토큰 누적 상태 (Soniox는 토큰 단위로 반환)
            let finalizedText = '';
            let detectedLang = config.languages[0] || 'en';
            let hadNonFinal = false;
            let lastPartialTranslateTime = 0;
            let partialTranslateInFlight = false;

            sttWs.onopen = () => {
                const sonioxConfig = {
                    api_key: sonioxApiKey,
                    model: 'stt-rt-v4',
                    audio_format: 'pcm_s16le',
                    sample_rate: config.sample_rate,
                    num_channels: 1,
                    language_hints: config.languages,
                    language_hints_strict: config.lang_hints_strict !== false,
                    enable_endpoint_detection: true,
                    enable_language_identification: true,
                    enable_speaker_diarization: true,
                    max_endpoint_delay_ms: 500,
                };
                sttWs!.send(JSON.stringify(sonioxConfig));

                if (isClientConnected) {
                    clientWs.send(JSON.stringify({ status: 'ready' }));
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

                    const tokens = msg.tokens || [];
                    if (tokens.length === 0) return;

                    let newFinalText = '';
                    let nonFinalText = '';

                    for (const token of tokens) {
                        if (token.language) {
                            detectedLang = token.language;
                        }
                        if (token.is_final) {
                            newFinalText += token.text;
                        } else {
                            nonFinalText += token.text;
                        }
                    }

                    finalizedText += newFinalText;

                    if (nonFinalText) {
                        hadNonFinal = true;
                        // 부분 결과: 확정된 텍스트 + 미확정 텍스트
                        const fullText = finalizedText + nonFinalText;
                        const partialMsg = {
                            type: 'transcript',
                            data: {
                                is_final: false,
                                utterance: {
                                    text: fullText.trim(),
                                    language: detectedLang,
                                },
                            },
                        };
                        clientWs.send(JSON.stringify(partialMsg));

                        // 부분 번역: ~1.5초마다 중간 번역 실행
                        const now = Date.now();
                        if (selectedLanguages.length > 0 && !partialTranslateInFlight && now - lastPartialTranslateTime > 1500 && fullText.trim().length > 3) {
                            partialTranslateInFlight = true;
                            lastPartialTranslateTime = now;
                            translateText(fullText.trim(), detectedLang, selectedLanguages, clientWs, true).finally(() => {
                                partialTranslateInFlight = false;
                            });
                        }
                    } else if (newFinalText && hadNonFinal) {
                        // 모델이 엔드포인트를 감지하여 토큰을 확정함 → 발화 완료
                        const finalText = finalizedText.trim();
                        const finalMsg = {
                            type: 'transcript',
                            data: {
                                is_final: true,
                                utterance: {
                                    text: finalText,
                                    language: detectedLang,
                                },
                            },
                        };
                        clientWs.send(JSON.stringify(finalMsg));

                        if (selectedLanguages.length > 0) {
                            translateText(finalText, detectedLang, selectedLanguages, clientWs);
                        }

                        finalizedText = '';
                        hadNonFinal = false;
                        lastPartialTranslateTime = 0;
                        partialTranslateInFlight = false;
                    }
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
                // 남은 텍스트가 있으면 마지막 발화로 전송
                if (isClientConnected && finalizedText) {
                    const remainingText = finalizedText.trim();
                    const finalMsg = {
                        type: 'transcript',
                        data: {
                            is_final: true,
                            utterance: {
                                text: remainingText,
                                language: detectedLang,
                            },
                        },
                    };
                    clientWs.send(JSON.stringify(finalMsg));

                    if (selectedLanguages.length > 0) {
                        translateText(remainingText, detectedLang, selectedLanguages, clientWs);
                    }

                    finalizedText = '';
                }
                if (isClientConnected) {
                    clientWs.close();
                }
            };

        } catch (error) {
            console.error('Error starting Soniox connection:', error);
            if (isClientConnected) {
                clientWs.close(1011, 'Failed to connect to Soniox service.');
            }
        }
    };

    // ===== GPT 번역 =====
    const LANG_NAMES: Record<string, string> = {
        en: 'English', ko: 'Korean', zh: 'Chinese', ja: 'Japanese',
        es: 'Spanish', fr: 'French', de: 'German', ru: 'Russian',
        pt: 'Portuguese', ar: 'Arabic', hi: 'Hindi', vi: 'Vietnamese',
        it: 'Italian', id: 'Indonesian', tr: 'Turkish', pl: 'Polish',
        nl: 'Dutch', sv: 'Swedish', th: 'Thai', ms: 'Malay',
    };

    const translateText = async (text: string, sourceLang: string, targetLangs: string[], ws: WebSocket, isPartial = false) => {
        if (!translationEnabled) return;
        const langs = targetLangs.filter(l => l !== sourceLang);
        if (langs.length === 0 || !text.trim()) return;

        const langList = langs.map(l => `${l} (${LANG_NAMES[l] || l})`).join(', ');
        const systemPrompt = `You are a translator. Translate the given text into the requested languages. Respond ONLY with a JSON object mapping language codes to translations. No extra text.`;
        const userPrompt = `Translate to ${langList}:\n"${text}"`;

        try {
            let content: string | undefined;

            if (translateModel === 'claude-haiku-4-5') {
                const resp = await anthropic.messages.create({
                    model: 'claude-haiku-4-5-20251001',
                    max_tokens: 1024,
                    system: systemPrompt,
                    messages: [{ role: 'user', content: userPrompt }],
                });
                const block = resp.content[0];
                if (block.type === 'text') content = block.text.trim();
            } else if (translateModel === 'gemini-2.5-flash-lite' || translateModel === 'gemini-3-flash-preview') {
                const model = genAI.getGenerativeModel({
                    model: translateModel,
                    systemInstruction: systemPrompt,
                });
                const result = await model.generateContent(userPrompt);
                content = result.response.text()?.trim();
            } else {
                const resp = await openai.chat.completions.create({
                    model: 'gpt-5-nano',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    temperature: 0.1,
                });
                content = resp.choices[0]?.message?.content?.trim();
            }

            if (!content) return;

            // parse JSON (handle possible markdown code fences)
            const jsonStr = content.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
            const translations: Record<string, string> = JSON.parse(jsonStr);

            for (const lang of langs) {
                let translated = translations[lang];
                if (translated && ws.readyState === WebSocket.OPEN) {
                    // Clean <end> tokens from translation output
                    translated = translated.replace(/<\/?end>/gi, '').trim();
                    if (!translated) continue;
                    ws.send(JSON.stringify({
                        type: 'translation',
                        data: {
                            target_language: lang,
                            translated_utterance: { text: translated },
                            is_partial: isPartial,
                        },
                    }));
                }
            }
        } catch (err) {
            console.error('Translation error:', err);
        }
    };

    // ===== 클라이언트 메시지 핸들러 =====
    clientWs.onmessage = (event) => {
        const message = event.data.toString();
        const data = JSON.parse(message);

        if (data.sample_rate && data.languages) {
            currentModel = data.stt_model || 'gladia';
            currentSampleRate = data.sample_rate;
            translateModel = data.translate_model || 'claude-haiku-4-5';
            translationEnabled = data.translation_enabled !== false;
            selectedLanguages = translationEnabled ? data.languages : [];

            console.log(
                `[model-test] config model=${currentModel} sampleRate=${currentSampleRate} translationEnabled=${translationEnabled} sttLanguages=${data.languages.join(',')} translationTargets=${selectedLanguages.join(',') || '-'}`,
            );
            
            if (currentModel === 'deepgram') {
                startDeepgramConnection(data as ClientConfig);
            } else if (currentModel === 'deepgram-multi') {
                startDeepgramMultiConnection(data as ClientConfig);
            } else if (currentModel === 'fireworks') {
                startFireworksConnection(data as ClientConfig);
            } else if (currentModel === 'chirp-3') {
                startChirp3Connection(data as ClientConfig);
            } else if (currentModel === 'elevenlabs') {
                startElevenLabsConnection(data as ClientConfig);
            } else if (currentModel === 'speechmatics') {
                startSpeechmaticsConnection(data as ClientConfig);
            } else if (currentModel === 'soniox') {
                startSonioxConnection(data as ClientConfig);
            } else if (currentModel === 'gladia-stt') {
                startGladiaConnection(data as ClientConfig, false);
            } else {
                startGladiaConnection(data as ClientConfig, translationEnabled);
            }
        } else if (currentModel === 'speechmatics' && speechmaticsClient?.socketState === 'open') {
            if (data.type === 'audio_chunk' && data.data?.chunk) {
                const pcmData = Buffer.from(data.data.chunk, 'base64');
                speechmaticsClient.sendAudio(pcmData);
            }
        } else if (currentModel === 'elevenlabs' && sttWs?.readyState === WebSocket.OPEN) {
            if (data.type === 'audio_chunk' && data.data?.chunk) {
                sttWs.send(JSON.stringify({
                    message_type: 'input_audio_chunk',
                    audio_base_64: data.data.chunk,
                    sample_rate: currentSampleRate,
                }));
            }
        } else if (sttWs && sttWs.readyState === WebSocket.OPEN) {
            // 오디오 프레임 전송
            if (
                currentModel === 'deepgram'
                || currentModel === 'deepgram-multi'
                || currentModel === 'fireworks'
                || currentModel === 'soniox'
            ) {
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

    clientWs.onclose = () => {
        cleanup();
    };
});

server.listen(PORT, '0.0.0.0');
