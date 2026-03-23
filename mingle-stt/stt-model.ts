export const SUPPORTED_STT_MODELS = [
    'gladia',
    'gladia-stt',
    'deepgram',
    'deepgram-multi',
    'fireworks',
    'soniox',
] as const;

export type SttModel = (typeof SUPPORTED_STT_MODELS)[number];

export function isSttModel(value: string): value is SttModel {
    return SUPPORTED_STT_MODELS.includes(value as SttModel);
}

export function resolveSttModel(input: unknown, fallback: SttModel): SttModel {
    if (typeof input !== 'string') return fallback;
    const normalized = input.trim();
    if (!normalized) return fallback;
    return isSttModel(normalized) ? normalized : fallback;
}
