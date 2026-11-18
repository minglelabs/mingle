import { env } from './env';

const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse';
export const TTS_SAMPLE_RATE = 24000;
// Mirrors mingle-app's tts-provider defaults so the call sounds like
// earphone mode.
const LANGUAGE_VOICES: Record<string, string> = { ko: 'ko-kr-csagent-8' };
const DEFAULT_VOICE = 'Kore';
const LANGUAGE_STYLES: Record<string, string> = { ja: 'slightly faster than normal pace' };
const DEFAULT_STYLE = 'speaking rapidly';
const VOICED_THRESHOLD = 400;
const LEAD_PAD_SAMPLES = (TTS_SAMPLE_RATE * 40) / 1000;

type StreamEvent = {
    event_type?: string;
    delta?: { type?: string; data?: string; mime_type?: string; sample_rate?: string | number };
    error?: { message?: string };
};

function decodePcm(base64: string): Int16Array {
    const bytes = Buffer.from(base64, 'base64');
    const samples = new Int16Array(Math.floor(bytes.length / 2));
    for (let i = 0; i < samples.length; i++) samples[i] = bytes.readInt16LE(i * 2);
    return samples;
}

// Streams Gemini TTS (Interactions API, SSE) as 24 kHz mono PCM chunks. The
// model's leading silence is dropped (keeping a 40 ms pad) so the first chunk
// handed out is the first syllable.
export async function synthesizeStream(text: string, lang: string, onChunk: (samples: Int16Array) => void): Promise<void> {
    if (!env.geminiApiKey) throw new Error('GEMINI_API_KEY is missing');
    const response = await fetch(GEMINI_INTERACTIONS_URL, {
        method: 'POST',
        headers: { 'x-goog-api-key': env.geminiApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: env.ttsModel,
            input: [{
                type: 'user_input',
                content: [{
                    type: 'text',
                    text,
                    annotations: [{ type: 'speech_metadata', style: LANGUAGE_STYLES[lang] || DEFAULT_STYLE }],
                }],
            }],
            response_format: { type: 'audio' },
            generation_config: { speech_config: [{ voice: LANGUAGE_VOICES[lang] || DEFAULT_VOICE }] },
            store: false,
            stream: true,
        }),
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok || !response.body) throw new Error(`tts ${response.status}: ${(await response.text()).slice(0, 200)}`);

    let voiced = false;
    let lead = new Int16Array(0);
    const emit = (samples: Int16Array) => {
        if (voiced) return onChunk(samples);
        const first = samples.findIndex((sample) => Math.abs(sample) >= VOICED_THRESHOLD);
        if (first < 0) {
            const joined = new Int16Array(lead.length + samples.length);
            joined.set(lead);
            joined.set(samples, lead.length);
            lead = joined.slice(Math.max(0, joined.length - LEAD_PAD_SAMPLES));
            return;
        }
        voiced = true;
        const start = Math.max(0, first - LEAD_PAD_SAMPLES);
        const leadTail = lead.subarray(Math.max(0, lead.length - (LEAD_PAD_SAMPLES - (first - start))));
        const out = new Int16Array(leadTail.length + samples.length - start);
        out.set(leadTail);
        out.set(samples.subarray(start), leadTail.length);
        onChunk(out);
    };

    const decoder = new TextDecoder();
    let buffered = '';
    let sawAudio = false;
    for await (const part of response.body as unknown as AsyncIterable<Uint8Array>) {
        buffered += decoder.decode(part, { stream: true });
        let newline: number;
        while ((newline = buffered.indexOf('\n')) >= 0) {
            const line = buffered.slice(0, newline).trim();
            buffered = buffered.slice(newline + 1);
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            let event: StreamEvent;
            try {
                event = JSON.parse(payload);
            } catch {
                continue;
            }
            if (event.error) throw new Error(`tts stream error: ${event.error.message || 'unknown'}`);
            if (event.event_type !== 'step.delta' || event.delta?.type !== 'audio' || !event.delta.data) continue;
            const rate = Number(event.delta.sample_rate || TTS_SAMPLE_RATE);
            if (rate !== TTS_SAMPLE_RATE) throw new Error(`unexpected tts sample rate ${rate}`);
            sawAudio = true;
            emit(decodePcm(event.delta.data));
        }
    }
    if (!sawAudio) throw new Error('tts returned no audio');
}
