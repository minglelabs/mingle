import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Own .env.local first, then the repo root's (where SONIOX/OPENAI/GEMINI keys
// live in the main checkout). VOICE_POC_ENV_FILE points at any other file,
// e.g. the main checkout's .env.local when running from a worktree.
const candidates = [
    process.env.VOICE_POC_ENV_FILE,
    path.join(__dirname, '.env.local'),
    path.join(__dirname, '..', '.env.local'),
].filter((file): file is string => !!file);
for (const file of candidates) {
    if (fs.existsSync(file)) dotenv.config({ path: file, override: false, quiet: true });
}

function readInt(name: string, fallback: number): number {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export const env = {
    port: readInt('VOICE_POC_PORT', 4100),
    // Local `livekit-server --dev` defaults. Set all three for LiveKit Cloud.
    livekitUrl: (process.env.LIVEKIT_URL || 'ws://127.0.0.1:7880').trim(),
    livekitApiKey: (process.env.LIVEKIT_API_KEY || 'devkey').trim(),
    livekitApiSecret: (process.env.LIVEKIT_API_SECRET || 'secret').trim(),
    sonioxApiKey: (process.env.SONIOX_API_KEY || '').trim(),
    sonioxMaxEndpointDelayMs: Math.max(500, Math.min(3000, readInt('VOICE_SONIOX_MAX_ENDPOINT_DELAY_MS', 1500))),
    openaiApiKey: (process.env.OPENAI_API_KEY || '').trim(),
    openaiBaseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').trim().replace(/\/$/, ''),
    translateProvider: (process.env.VOICE_TRANSLATE_PROVIDER || 'openai').trim().toLowerCase(),
    translateModel: (process.env.VOICE_TRANSLATE_MODEL || 'gpt-6-luna').trim(),
    geminiTranslateModel: (process.env.VOICE_GEMINI_TRANSLATE_MODEL || 'gemini-2.5-flash-lite').trim(),
    geminiApiKey: (process.env.GEMINI_API_KEY || '').trim(),
    ttsModel: (process.env.VOICE_TTS_MODEL || 'gemini-3.8-flash-lite-tts').trim(),
};

export function isLocalLivekit(): boolean {
    return /^wss?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(env.livekitUrl);
}

export function missingProviderKeys(): string[] {
    const missing: string[] = [];
    if (!env.sonioxApiKey) missing.push('SONIOX_API_KEY');
    if (!env.geminiApiKey) missing.push('GEMINI_API_KEY');
    return missing;
}
