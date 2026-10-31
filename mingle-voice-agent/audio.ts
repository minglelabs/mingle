// Small PCM16 helpers for the interpreter pipeline (mono only).

export type Pcm = { samples: Int16Array; sampleRate: number };

export function parseWavOrPcm(buffer: Buffer, fallbackSampleRate: number): Pcm {
    const isWav = buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE';
    if (!isWav) {
        const usable = buffer.length - (buffer.length % 2);
        const samples = new Int16Array(usable / 2);
        for (let i = 0; i < samples.length; i++) samples[i] = buffer.readInt16LE(i * 2);
        return { samples, sampleRate: fallbackSampleRate };
    }
    let offset = 12;
    let sampleRate = fallbackSampleRate;
    let channels = 1;
    while (offset + 8 <= buffer.length) {
        const id = buffer.toString('ascii', offset, offset + 4);
        const size = buffer.readUInt32LE(offset + 4);
        const body = offset + 8;
        if (id === 'fmt ') {
            channels = buffer.readUInt16LE(body + 2);
            sampleRate = buffer.readUInt32LE(body + 4);
        } else if (id === 'data') {
            const end = Math.min(buffer.length, body + size);
            const frames = Math.floor((end - body) / (2 * channels));
            const samples = new Int16Array(frames);
            for (let i = 0; i < frames; i++) {
                // Down-mix by taking the first channel; TTS output is mono anyway.
                samples[i] = buffer.readInt16LE(body + i * 2 * channels);
            }
            return { samples, sampleRate };
        }
        offset = body + size + (size % 2);
    }
    return { samples: new Int16Array(0), sampleRate };
}

export function encodeWav(pcm: Pcm): Buffer {
    const dataBytes = pcm.samples.length * 2;
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataBytes, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(pcm.sampleRate, 24);
    header.writeUInt32LE(pcm.sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataBytes, 40);
    return Buffer.concat([header, Buffer.from(pcm.samples.buffer, pcm.samples.byteOffset, dataBytes)]);
}

// Linear resampling is plenty for speech in a POC.
export function resample(pcm: Pcm, targetRate: number): Pcm {
    if (pcm.sampleRate === targetRate || pcm.samples.length === 0) return { samples: pcm.samples, sampleRate: targetRate };
    const ratio = pcm.sampleRate / targetRate;
    const length = Math.floor(pcm.samples.length / ratio);
    const out = new Int16Array(length);
    for (let i = 0; i < length; i++) {
        const position = i * ratio;
        const index = Math.floor(position);
        const next = Math.min(index + 1, pcm.samples.length - 1);
        const fraction = position - index;
        out[i] = Math.round(pcm.samples[index] * (1 - fraction) + pcm.samples[next] * fraction);
    }
    return { samples: out, sampleRate: targetRate };
}

// Drop leading/trailing near-silence (keeping a short pad) so playback starts
// on the first syllable instead of the model's lead-in.
export function trimSilence(pcm: Pcm, threshold = 400, padMs = 40): Pcm {
    const { samples, sampleRate } = pcm;
    let start = 0;
    while (start < samples.length && Math.abs(samples[start]) < threshold) start++;
    let end = samples.length - 1;
    while (end > start && Math.abs(samples[end]) < threshold) end--;
    if (start >= end) return pcm;
    const pad = Math.floor((sampleRate * padMs) / 1000);
    return { samples: samples.slice(Math.max(0, start - pad), Math.min(samples.length, end + pad)), sampleRate };
}

export function isVoiced(samples: Int16Array, threshold = 500): boolean {
    for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]) >= threshold) return true;
    return false;
}

// Character-bigram Dice similarity, used by the echo guard.
export function textSimilarity(a: string, b: string): number {
    const normalize = (value: string) => value.toLowerCase().replace(/[\s\p{P}]/gu, '');
    const x = normalize(a);
    const y = normalize(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    const grams = (value: string) => {
        const map = new Map<string, number>();
        for (let i = 0; i < value.length - 1; i++) {
            const gram = value.slice(i, i + 2);
            map.set(gram, (map.get(gram) || 0) + 1);
        }
        return map;
    };
    const gx = grams(x);
    const gy = grams(y);
    let overlap = 0;
    for (const [gram, count] of gx) overlap += Math.min(count, gy.get(gram) || 0);
    const total = Math.max(1, x.length - 1) + Math.max(1, y.length - 1);
    return (2 * overlap) / total;
}
