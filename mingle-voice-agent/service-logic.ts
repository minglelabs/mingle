// Pure helpers for the production interpreter service. No LiveKit imports, so
// they can be unit tested without the native rtc-node module.

export const VOICE_ROOM_PREFIX = 'voice-';
export const INTERPRETER_IDENTITY_PREFIX = 'interpreter-';

// Interpreted audio actually played, for billing. byListener credits every
// listener who had that language lane on (interpret not "off") when it played.
export type InterpreterUsage = {
    totalMs: number;
    byLang: Record<string, number>;
    byListener: Record<string, number>;
};

export function addUsage(usage: InterpreterUsage, lang: string, listeners: string[], audioMs: number): void {
    if (!(audioMs > 0)) return;
    usage.totalMs += audioMs;
    usage.byLang[lang] = (usage.byLang[lang] || 0) + audioMs;
    for (const listener of listeners) usage.byListener[listener] = (usage.byListener[listener] || 0) + audioMs;
}

export type RoomSnapshot = { name: string; participantIdentities: string[] };

export function isHumanIdentity(identity: string): boolean {
    return !!identity && !identity.startsWith(INTERPRETER_IDENTITY_PREFIX);
}

// Rooms that need an interpreter: app voice rooms with at least one human.
export function roomsNeedingInterpreter(rooms: RoomSnapshot[]): string[] {
    return rooms
        .filter((room) => room.name.startsWith(VOICE_ROOM_PREFIX))
        .filter((room) => room.participantIdentities.some(isHumanIdentity))
        .map((room) => room.name);
}

export type UsageReport = {
    room: string;
    startedAt: string;
    endedAt: string;
    interpretedMs: number;
    byLang: Record<string, number>;
    byListener: Record<string, number>;
    stats: { segments: number; interpreted: number; echoSuppressed: number; errors: number };
};

export function buildUsageReport(input: {
    room: string;
    startedAtMs: number;
    endedAtMs: number;
    usage: InterpreterUsage;
    stats: UsageReport['stats'];
}): UsageReport {
    return {
        room: input.room,
        startedAt: new Date(input.startedAtMs).toISOString(),
        endedAt: new Date(input.endedAtMs).toISOString(),
        interpretedMs: input.usage.totalMs,
        byLang: { ...input.usage.byLang },
        byListener: { ...input.usage.byListener },
        stats: { ...input.stats },
    };
}

// LiveKit's RoomServiceClient talks HTTP(S); the agent config holds ws(s).
export function toHttpUrl(livekitUrl: string): string {
    return livekitUrl.replace(/^ws(s?):\/\//i, 'http$1://');
}
