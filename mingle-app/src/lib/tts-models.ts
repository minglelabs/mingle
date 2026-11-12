// The one TTS model. There is no user choice and no fallback provider:
// every synthesis uses Gemini 3.8 Flash-Lite TTS, and a failed synthesis
// plays nothing.

export type TtsProviderId = 'gemini'

export const TTS_PROVIDER: TtsProviderId = 'gemini'
export const TTS_MODEL = 'gemini-3.8-flash-lite-tts'
