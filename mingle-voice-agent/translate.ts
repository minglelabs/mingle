import { env } from './env';

const LANGUAGE_NAMES: Record<string, string> = {
    ko: 'Korean', en: 'English', ja: 'Japanese', zh: 'Chinese (Simplified)', es: 'Spanish',
    fr: 'French', de: 'German', vi: 'Vietnamese', th: 'Thai', id: 'Indonesian', pt: 'Portuguese', ru: 'Russian',
};

export function languageName(code: string): string {
    return LANGUAGE_NAMES[code] || code;
}

export type TranslateTurn = { text: string; lang: string };

// The line to translate is the whole user message. Recent turns go into the
// system prompt: Gemini Flash-Lite echoed the source back when they shared
// the user message with it.
function buildPrompts(input: TranslateInput): { system: string; user: string } {
    const source = languageName(input.sourceLang);
    const target = languageName(input.targetLang);
    const context = input.recentTurns.length
        ? ` Recent lines of this call, for context only (never translate or repeat them):\n${input.recentTurns.map((turn) => `- [${turn.lang}] ${turn.text}`).join('\n')}`
        : '';
    return {
        system: `You are a simultaneous interpreter on a live voice call. Interpret the user message from ${source} into ${target}. Output only the ${target} translation in a natural spoken style, same tone and politeness, fixing obvious speech-recognition slips. No quotes, notes or romanization.${context}`,
        user: input.text,
    };
}

type TranslateInput = {
    text: string;
    sourceLang: string;
    targetLang: string;
    recentTurns: TranslateTurn[];
};

// Same OpenAI request shape as mingle-app's translate-texts (fast tier, no
// reasoning), but plain-text output for a single target: an interpreter
// speaks one line, not a JSON map.
async function translateWithOpenAI(input: TranslateInput): Promise<string> {
    const prompts = buildPrompts(input);
    const response = await fetch(`${env.openaiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.openaiApiKey}` },
        body: JSON.stringify({
            model: env.translateModel,
            messages: [
                { role: 'system', content: prompts.system },
                { role: 'user', content: prompts.user },
            ],
            temperature: 0,
            reasoning_effort: 'none',
            service_tier: 'priority',
        }),
        signal: AbortSignal.timeout(8000),
    });
    if (response.status === 401) throw new AuthError('OpenAI rejected OPENAI_API_KEY (401)');
    if (!response.ok) throw new Error(`openai ${response.status}: ${(await response.text()).slice(0, 160)}`);
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return (data.choices?.[0]?.message?.content || '').trim();
}

// mingle-app's production default (TRANSLATE_PROVIDER=gemini) on the
// Priority tier.
async function translateWithGemini(input: TranslateInput): Promise<string> {
    const prompts = buildPrompts(input);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiTranslateModel}:generateContent`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'x-goog-api-key': env.geminiApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: prompts.system }] },
            contents: [{ role: 'user', parts: [{ text: prompts.user }] }],
            generationConfig: { temperature: 0 },
            serviceTier: 'priority',
        }),
        signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`gemini ${response.status}: ${(await response.text()).slice(0, 160)}`);
    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return (data.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('').trim();
}

class AuthError extends Error {}

let openaiDisabled = false;

export type TranslationResult = { text: string; provider: 'openai' | 'gemini' };

const SCRIPTS: Record<string, RegExp> = {
    ko: /\p{Script=Hangul}/u,
    ja: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,
    zh: /\p{Script=Han}/u,
    th: /\p{Script=Thai}/u,
    ru: /\p{Script=Cyrillic}/u,
};
const LATIN = /\p{Script=Latin}/u;
const LATIN_LANGS = new Set(['en', 'es', 'fr', 'de', 'vi', 'id', 'pt']);

// Rough check that a line is written in the target language's script and not
// left in the source's (Hangul in a Japanese line means it wasn't translated).
function inTargetScript(text: string, sourceLang: string, targetLang: string): boolean {
    const target = SCRIPTS[targetLang] || (LATIN_LANGS.has(targetLang) ? LATIN : null);
    if (target && !target.test(text)) return false;
    const source = SCRIPTS[sourceLang];
    if (source && source !== target && !(targetLang === 'ja' && sourceLang === 'zh')) {
        const sourceChars = [...text].filter((char) => source.test(char)).length;
        if (sourceChars > text.length * 0.3) return false;
    }
    return true;
}

// A line that comes back untranslated (echoed, or answered in the source
// language) is retried once without the recent-turn context, which is what
// pulls Gemini Flash-Lite into replying instead of interpreting.
export async function translateUtterance(input: TranslateInput): Promise<TranslationResult> {
    const first = await translateOnce(input);
    if (input.sourceLang === input.targetLang || inTargetScript(first.text, input.sourceLang, input.targetLang)) return first;
    console.warn(`[translate] ${first.provider} returned "${first.text}" for ${input.targetLang}; retrying without context`);
    return translateOnce({ ...input, recentTurns: [] });
}

// GPT first (VOICE_TRANSLATE_PROVIDER=openai, the default); a rejected key
// switches the process to Gemini for good, other failures retry on Gemini once.
async function translateOnce(input: TranslateInput): Promise<TranslationResult> {
    const useOpenAI = env.translateProvider === 'openai' && !!env.openaiApiKey && !openaiDisabled;
    if (useOpenAI) {
        try {
            return { text: await translateWithOpenAI(input), provider: 'openai' };
        } catch (error) {
            if (error instanceof AuthError) {
                openaiDisabled = true;
                console.warn(`[translate] ${error.message}; using Gemini from now on`);
            } else {
                console.warn(`[translate] openai failed, retrying on Gemini: ${error instanceof Error ? error.message : error}`);
            }
        }
    }
    if (!env.geminiApiKey) throw new Error('no usable translation provider (OPENAI_API_KEY / GEMINI_API_KEY)');
    // Flash-Lite answers instead of interpreting when it sees the context.
    return { text: await translateWithGemini({ ...input, recentTurns: [] }), provider: 'gemini' };
}
