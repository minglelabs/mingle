import type { RealtimeTokenPayload } from './realtime-token';
import { createHmac } from 'crypto';

export type LiveFrame = {
    type: 'utterance_preview'; sessionKey: string; revision: number; expiresAt: number;
    final: boolean; orderReceipt?: string; utterance: {
        id: string; originalText: string; originalLang: string; translations: Record<string, string>;
        speakerUserId: string; speakerName: string | null; createdAtMs: number;
    };
};

// Ephemeral, bounded state only. Persistence/translation retries stay in the
// app's durable outbox. A committed message fences out late partial frames.
export class LiveUtterances {
    private turns = new Map<string, { sequence: number; final: boolean; createdAtMs: number; until: number; committed?: boolean }>();

    commit(sessionKey: string, userId: string, id: string): void {
        this.prune();
        this.turns.set(JSON.stringify([sessionKey, userId, id]), {
            sequence: Infinity, final: true, committed: true, createdAtMs: Date.now(), until: Date.now() + 30 * 60_000,
        });
    }

    private prune(): void {
        for (const [key, value] of this.turns) if (value.until <= Date.now()) this.turns.delete(key);
        while (this.turns.size >= 10_000) this.turns.delete(this.turns.keys().next().value!);
    }

    accept(raw: unknown, writer: RealtimeTokenPayload, secret?: string): LiveFrame | null {
        if (!writer.liveWriter || writer.exp <= Date.now() || writer.sessionKey.startsWith('list:')) return null;
        if (!raw || typeof raw !== 'object') return null;
        const input = raw as Record<string, unknown>;
        const id = input.id;
        const text = input.originalText;
        const sequence = input.sequence;
        if (typeof id !== 'string' || !id || id.length > 128 || typeof text !== 'string'
            || !text.trim() || text.length > 20_000 || !Number.isSafeInteger(sequence) || Number(sequence) < 0) return null;
        this.prune();
        const key = JSON.stringify([writer.sessionKey, writer.userId, id]);
        const previous = this.turns.get(key);
        if (previous && (previous.committed || Number(sequence) <= previous.sequence || (previous.final && input.final !== true))) return null;
        const createdAtMs = previous?.createdAtMs ?? Date.now();
        const final = input.final === true;
        const expiresAt = Date.now() + (final ? 120_000 : 15_000);
        const translations: Record<string, string> = {};
        if (input.translations && typeof input.translations === 'object') {
            for (const [language, value] of Object.entries(input.translations).slice(0, 10)) {
                if (/^[a-zA-Z][a-zA-Z0-9-]{0,19}$/.test(language) && typeof value === 'string' && value.length <= 20_000) translations[language] = value;
            }
        }
        this.turns.set(key, { sequence: Number(sequence), final, createdAtMs, until: Date.now() + 30 * 60_000 });
        const body = Buffer.from(JSON.stringify({ userId: writer.userId, sessionKey: writer.sessionKey, clientMessageId: id, startedAtMs: createdAtMs })).toString('base64url');
        const orderReceipt = secret ? `${body}.${createHmac('sha256', secret).update(`mingle-voice-order-v1:${body}`).digest('base64url')}` : undefined;
        return { type: 'utterance_preview', sessionKey: writer.sessionKey, revision: Number(sequence), expiresAt, final, orderReceipt,
            utterance: { id, originalText: text, originalLang: typeof input.originalLang === 'string' ? input.originalLang.slice(0, 20) : 'unknown',
                translations, speakerUserId: writer.userId, speakerName: writer.liveWriter.name, createdAtMs } };
    }
}
