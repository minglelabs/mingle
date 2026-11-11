import {
    AudioFrame,
    AudioSource,
    AudioStream,
    LocalAudioTrack,
    Room,
    RoomEvent,
    TrackKind,
    TrackPublishOptions,
    TrackSource,
    type RemoteParticipant,
    type RemoteTrack,
} from '@livekit/rtc-node';
import { env } from './env';
import { textSimilarity } from './audio';
import { ChunkQueue } from './chunk-queue';
import { SonioxStream, type SttPartial, type SttSegment } from './soniox-stream';
import { translateUtterance, type TranslateTurn } from './translate';
import { synthesizeStream, TTS_SAMPLE_RATE } from './tts';
import { createJoinToken, INTERPRETER_ROLE } from './token';
import { addUsage, readersOf, type InterpreterUsage } from './service-logic';
import { newLineId, reportCaption, reportPlayback } from './app-report';

const LANE_SAMPLE_RATE = TTS_SAMPLE_RATE;
const FRAME_MS = 20;
const SAMPLES_PER_FRAME = (LANE_SAMPLE_RATE * FRAME_MS) / 1000;
const STT_SAMPLE_RATE = 16000;
// A line heard within this window that matches what a lane just played (or
// what another speaker just said) is the speaker's mic picking up the call
// audio, not new speech.
const ECHO_WINDOW_MS = 12_000;
const ECHO_SIMILARITY = 0.6;
const RECENT_TURNS = 4;
const PARTIAL_THROTTLE_MS = 150;
const IDLE_LEAVE_MS = 30_000;
export const CAPTION_TOPIC = 'interpreter';
export const LANE_TRACK_PREFIX = 'tr:';

type Recent = { text: string; at: number };

// One published track per listening language. Lines are played strictly in
// the order they were finalized; translation and TTS run ahead in parallel.
type Lane = {
    lang: string;
    source: AudioSource;
    chain: Promise<void>;
    recent: Recent[];
};

type Speaker = {
    identity: string;
    name: string;
    lang: string;
    stt: SonioxStream;
    stream: AudioStream;
    recent: Recent[];
    partialSeq: number;
    lastPartialAt: number;
    stopped: boolean;
};

export type InterpreterStats = { segments: number; interpreted: number; echoSuppressed: number; errors: number };



export function normalizeLang(value: string | null | undefined): string | null {
    const base = (value || '').trim().toLowerCase().replace(/_/g, '-').split('-')[0];
    return base || null;
}

function isInterpreter(participant: RemoteParticipant): boolean {
    return participant.attributes.role === INTERPRETER_ROLE;
}

/** The app sets `interpret` to "on" only for a person who turned interpretation on. */
function isInterpreting(participant: RemoteParticipant): boolean {
    return participant.attributes.interpret === 'on';
}

function pruneRecent(list: Recent[], now: number): void {
    while (list.length && now - list[0].at > ECHO_WINDOW_MS) list.shift();
}

export class Interpreter {
    readonly room = new Room();
    readonly stats: InterpreterStats = { segments: 0, interpreted: 0, echoSuppressed: 0, errors: 0 };
    readonly usage: InterpreterUsage = { totalMs: 0, byLang: {}, byListener: {} };
    readonly startedAt = Date.now();
    private lanes = new Map<string, Lane>();
    private speakers = new Map<string, Speaker>();
    private turns: TranslateTurn[] = [];
    private segmentSeq = 0;
    private idleTimer: NodeJS.Timeout | null = null;
    private closed = false;
    onClose: (() => void) | null = null;

    constructor(readonly roomName: string) {}

    async start(): Promise<void> {
        const token = await createJoinToken({
            room: this.roomName,
            identity: `interpreter-${this.roomName}`,
            name: '통역',
            attributes: { role: INTERPRETER_ROLE },
            agent: true,
        });
        this.room
            .on(RoomEvent.TrackSubscribed, (track, _publication, participant) => this.onTrackSubscribed(track, participant))
            .on(RoomEvent.TrackUnsubscribed, (_track, _publication, participant) => this.stopSpeaker(participant.identity))
            .on(RoomEvent.ParticipantConnected, () => this.refreshParticipants())
            .on(RoomEvent.ParticipantDisconnected, (participant) => {
                this.stopSpeaker(participant.identity);
                this.refreshParticipants();
            })
            .on(RoomEvent.ParticipantAttributesChanged, (_changed, participant) => {
                const speaker = this.speakers.get(participant.identity);
                const lang = normalizeLang(participant.attributes.lang);
                if (speaker && lang) speaker.lang = lang;
                this.refreshParticipants();
            })
            .on(RoomEvent.Disconnected, () => this.close());
        await this.room.connect(env.livekitUrl, token, { autoSubscribe: true, dynacast: false });
        console.log(`[interpreter:${this.roomName}] joined`);
        this.refreshParticipants();
    }

    async close(): Promise<void> {
        if (this.closed) return;
        this.closed = true;
        if (this.idleTimer) clearTimeout(this.idleTimer);
        for (const identity of [...this.speakers.keys()]) this.stopSpeaker(identity);
        for (const lane of this.lanes.values()) await lane.source.close().catch(() => undefined);
        await this.room.disconnect().catch(() => undefined);
        console.log(`[interpreter:${this.roomName}] left ${JSON.stringify(this.stats)}`);
        this.onClose?.();
    }

    private humans(): RemoteParticipant[] {
        return [...this.room.remoteParticipants.values()].filter((participant) => !isInterpreter(participant));
    }

    // Lanes are published as soon as a language is present, so the first
    // translated line doesn't wait for a track negotiation.
    // Only the languages someone listens in get a lane; the interpreter
    // leaves a while after the last person turned interpretation off.
    private refreshParticipants(): void {
        const readers = this.humans().filter(isInterpreting);
        for (const participant of readers) {
            const lang = normalizeLang(participant.attributes.lang);
            if (lang) void this.ensureLane(lang);
        }
        if (readers.length === 0 && !this.idleTimer) {
            this.idleTimer = setTimeout(() => void this.close(), IDLE_LEAVE_MS);
        } else if (readers.length > 0 && this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
    }

    private ensureLane(lang: string): Lane {
        const existing = this.lanes.get(lang);
        if (existing) return existing;
        const source = new AudioSource(LANE_SAMPLE_RATE, 1, 1000);
        const lane: Lane = { lang, source, chain: Promise.resolve(), recent: [] };
        this.lanes.set(lang, lane);
        const track = LocalAudioTrack.createAudioTrack(`${LANE_TRACK_PREFIX}${lang}`, source);
        const options = new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE });
        this.room.localParticipant?.publishTrack(track, options)
            .then(() => console.log(`[interpreter:${this.roomName}] lane ${lang} published`))
            .catch((error) => console.warn(`[interpreter:${this.roomName}] lane ${lang} publish failed`, error));
        return lane;
    }

    private onTrackSubscribed(track: RemoteTrack, participant: RemoteParticipant): void {
        if (track.kind !== TrackKind.KIND_AUDIO || isInterpreter(participant)) return;
        this.stopSpeaker(participant.identity);
        const lang = normalizeLang(participant.attributes.lang) || 'en';
        const stream = new AudioStream(track, { sampleRate: STT_SAMPLE_RATE, numChannels: 1 });
        const stt = new SonioxStream(lang, participant.identity);
        const speaker: Speaker = {
            identity: participant.identity,
            name: participant.name || participant.identity,
            lang,
            stt,
            stream,
            recent: [],
            partialSeq: 0,
            lastPartialAt: 0,
            stopped: false,
        };
        this.speakers.set(participant.identity, speaker);
        stt.on('partial', (partial: SttPartial) => this.onPartial(speaker, partial));
        stt.on('segment', (segment: SttSegment) => this.onSegment(speaker, segment));
        stt.start();
        console.log(`[interpreter:${this.roomName}] listening to ${speaker.name} (${lang})`);
        void (async () => {
            try {
                // Breaking out releases the reader and cancels the stream.
                for await (const frame of stream) {
                    if (speaker.stopped) break;
                    stt.write(frame.data);
                }
            } catch (error) {
                if (!speaker.stopped) console.warn(`[interpreter] audio stream ended`, error);
            }
        })();
    }

    private stopSpeaker(identity: string): void {
        const speaker = this.speakers.get(identity);
        if (!speaker) return;
        this.speakers.delete(identity);
        speaker.stopped = true;
        speaker.stt.stop();
    }

    private targetsFor(speakerIdentity: string, sourceLang: string): string[] {
        const targets = new Set<string>();
        for (const participant of this.humans()) {
            if (participant.identity === speakerIdentity) continue;
            if (!isInterpreting(participant)) continue;
            const lang = normalizeLang(participant.attributes.lang);
            if (lang && lang !== sourceLang) targets.add(lang);
        }
        return [...targets];
    }

    private listenersFor(lang: string): string[] {
        return this.humans()
            .filter((participant) => isInterpreting(participant) && normalizeLang(participant.attributes.lang) === lang)
            .map((participant) => participant.identity);
    }

    private findEcho(speaker: Speaker, text: string, lang: string): string | null {
        const now = Date.now();
        const lane = this.lanes.get(lang);
        const candidates: Recent[] = [];
        if (lane) {
            pruneRecent(lane.recent, now);
            candidates.push(...lane.recent);
        }
        for (const other of this.speakers.values()) {
            if (other === speaker) continue;
            pruneRecent(other.recent, now);
            candidates.push(...other.recent);
        }
        for (const candidate of candidates) {
            if (textSimilarity(candidate.text, text) >= ECHO_SIMILARITY) return candidate.text;
        }
        return null;
    }

    private onPartial(speaker: Speaker, partial: SttPartial): void {
        const now = Date.now();
        if (now - speaker.lastPartialAt < PARTIAL_THROTTLE_MS) return;
        speaker.lastPartialAt = now;
        this.send({
            type: 'partial',
            id: `${speaker.identity}#${speaker.partialSeq}`,
            speaker: speaker.identity,
            speakerName: speaker.name,
            lang: normalizeLang(partial.lang) || speaker.lang,
            text: partial.text,
        }, false);
    }

    private onSegment(speaker: Speaker, segment: SttSegment): void {
        const partialId = `${speaker.identity}#${speaker.partialSeq++}`;
        ++this.segmentSeq;
        const id = newLineId(this.roomName);
        // Written down only for someone else who reads it: a line nobody else
        // has interpretation on for is dropped (not saved, not paid).
        const readers = readersOf({
            speaker: speaker.identity,
            interpreting: this.humans().filter(isInterpreting).map((participant) => participant.identity),
        });
        if (readers.length === 0) return;
        const sourceLang = normalizeLang(segment.lang) || speaker.lang;
        this.stats.segments++;
        const echo = this.findEcho(speaker, segment.text, sourceLang);
        if (echo) {
            this.stats.echoSuppressed++;
            console.log(`[interpreter:${this.roomName}] echo suppressed from ${speaker.name}: "${segment.text}" ~ "${echo}"`);
            this.send({ type: 'echo', id, partialId, speaker: speaker.identity, speakerName: speaker.name, lang: sourceLang, text: segment.text, matched: echo });
            return;
        }
        speaker.recent.push({ text: segment.text, at: Date.now() });
        const recentTurns = this.turns.slice(-RECENT_TURNS);
        this.turns.push({ text: segment.text, lang: sourceLang });
        if (this.turns.length > 20) this.turns.shift();
        const targets = this.targetsFor(speaker.identity, sourceLang);
        console.log(`[interpreter:${this.roomName}] ${speaker.name} [${sourceLang}] "${segment.text}" -> ${targets.join(',') || '(no listeners)'} endpoint=${segment.finalizedAt - segment.speechEndAt}ms`);
        this.send({
            type: 'final',
            id,
            partialId,
            speaker: speaker.identity,
            speakerName: speaker.name,
            lang: sourceLang,
            text: segment.text,
            targets,
            speechEndAt: segment.speechEndAt,
            finalizedAt: segment.finalizedAt,
        });
        const translated = targets.map((target) => this.interpret(id, segment, sourceLang, target, recentTurns)
            .then((text) => [target, text] as const));
        // The room message waits for the translations (they run in parallel,
        // ahead of the read-aloud), so a reader's bubble has their language.
        void Promise.all(translated).then((pairs) => reportCaption({
            room: this.roomName,
            id,
            speaker: speaker.identity,
            lang: sourceLang,
            text: segment.text,
            translations: Object.fromEntries(pairs.filter(([, text]) => !!text)),
            durationMs: segment.durationMs,
        }));
    }

    /** Translates and queues the line on its lane; resolves with the translation ('' when it failed). */
    private interpret(id: string, segment: SttSegment, sourceLang: string, targetLang: string, recentTurns: TranslateTurn[]): Promise<string> {
        let resolveTranslation: (text: string) => void = () => undefined;
        const translation = new Promise<string>((resolve) => { resolveTranslation = resolve; });
        const lane = this.ensureLane(targetLang);
        // Translation and TTS start now, in parallel with whatever the lane is
        // still playing; audio is buffered until this line's turn.
        const audio = new ChunkQueue<Int16Array>();
        const meta = { translation: '', provider: '', translatedAt: 0, firstAudioAt: 0 };
        void (async () => {
            const result = await translateUtterance({ text: segment.text, sourceLang, targetLang, recentTurns });
            resolveTranslation(result.text);
            meta.translation = result.text;
            meta.provider = result.provider;
            meta.translatedAt = Date.now();
            this.send({ type: 'translation', id, lang: targetLang, text: result.text, provider: result.provider });
            if (!result.text) return audio.end();
            await synthesizeStream(result.text, targetLang, (samples) => {
                if (!meta.firstAudioAt) meta.firstAudioAt = Date.now();
                audio.push(samples);
            });
            audio.end();
        })().catch((error) => {
            resolveTranslation('');
            audio.fail(error);
        });

        // Keep the lane's chain non-rejecting; failures are reported per line.
        lane.chain = lane.chain.then(async () => {
            let playAt = 0;
            let played = 0;
            try {
                for await (const samples of audio) {
                    if (!playAt) {
                        playAt = Date.now();
                        const metrics = {
                            endpointMs: segment.finalizedAt - segment.speechEndAt,
                            translateMs: meta.translatedAt - segment.finalizedAt,
                            ttsFirstAudioMs: meta.firstAudioAt - meta.translatedAt,
                            queueMs: playAt - meta.firstAudioAt,
                            speechEndToPlayMs: playAt - segment.speechEndAt,
                            translator: meta.provider,
                        };
                        this.stats.interpreted++;
                        lane.recent.push({ text: meta.translation, at: playAt });
                        console.log(`[interpreter:${this.roomName}] ${id} -> ${targetLang} "${meta.translation}" ${JSON.stringify(metrics)}`);
                        this.send({ type: 'play', id, lang: targetLang, text: meta.translation, playAt, metrics });
                        this.send({ type: 'lane', lang: targetLang, playing: true });
                    }
                    played += await this.capture(lane, samples);
                }
                if (playAt) {
                    await this.capture(lane, new Int16Array(0), true);
                    await lane.source.waitForPlayout();
                }
            } catch (error) {
                this.stats.errors++;
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`[interpreter:${this.roomName}] ${id} -> ${targetLang} failed: ${message}`);
                this.send({ type: 'error', id, lang: targetLang, message });
            } finally {
                if (playAt) {
                    const audioMs = Math.round((played / LANE_SAMPLE_RATE) * 1000);
                    const listeners = this.listenersFor(targetLang);
                    addUsage(this.usage, targetLang, listeners, audioMs);
                    this.send({ type: 'lane', lang: targetLang, playing: false, audioMs });
                    void reportPlayback({ room: this.roomName, id, lang: targetLang, listeners, audioMs });
                }
            }
        });
        return translation;
    }

    private carry = new Map<Lane, Int16Array>();

    // Feeds whole 20 ms frames; the remainder waits for the next chunk (or is
    // zero-padded on flush).
    private async capture(lane: Lane, samples: Int16Array, flush = false): Promise<number> {
        const pending = this.carry.get(lane) || new Int16Array(0);
        const joined = new Int16Array(pending.length + samples.length);
        joined.set(pending);
        joined.set(samples, pending.length);
        let offset = 0;
        for (; offset + SAMPLES_PER_FRAME <= joined.length; offset += SAMPLES_PER_FRAME) {
            await lane.source.captureFrame(new AudioFrame(joined.slice(offset, offset + SAMPLES_PER_FRAME), LANE_SAMPLE_RATE, 1, SAMPLES_PER_FRAME));
        }
        const rest = joined.slice(offset);
        if (flush && rest.length) {
            const last = new Int16Array(SAMPLES_PER_FRAME);
            last.set(rest);
            await lane.source.captureFrame(new AudioFrame(last, LANE_SAMPLE_RATE, 1, SAMPLES_PER_FRAME));
            this.carry.delete(lane);
        } else {
            this.carry.set(lane, rest);
        }
        return samples.length;
    }

    private send(payload: Record<string, unknown>, reliable = true): void {
        const participant = this.room.localParticipant;
        if (!participant || this.closed) return;
        const data = new TextEncoder().encode(JSON.stringify({ ...payload, at: Date.now() }));
        participant.publishData(data, { reliable, topic: CAPTION_TOPIC }).catch(() => undefined);
    }
}

const running = new Map<string, Promise<Interpreter>>();
const closeListeners = new Set<(interpreter: Interpreter) => void>();

// Called once per interpreter after it leaves its room (idle, kicked, or shutdown).
export function onInterpreterClosed(listener: (interpreter: Interpreter) => void): () => void {
    closeListeners.add(listener);
    return () => closeListeners.delete(listener);
}

export function runningRoomNames(): string[] {
    return [...running.keys()];
}

export async function closeAllInterpreters(): Promise<void> {
    const all = await Promise.allSettled([...running.values()]);
    await Promise.all(all.map((result) => (result.status === 'fulfilled' ? result.value.close() : undefined)));
}

// One interpreter per room, started on the first token request.
export function ensureInterpreter(roomName: string): Promise<Interpreter> {
    const existing = running.get(roomName);
    if (existing) return existing;
    const interpreter = new Interpreter(roomName);
    interpreter.onClose = () => {
        running.delete(roomName);
        for (const listener of closeListeners) {
            try {
                listener(interpreter);
            } catch (error) {
                console.warn(`[interpreter:${roomName}] close listener failed`, error);
            }
        }
    };
    const started = interpreter.start().then(() => interpreter);
    started.catch((error) => {
        console.warn(`[interpreter:${roomName}] failed to start`, error);
        running.delete(roomName);
    });
    running.set(roomName, started);
    return started;
}
