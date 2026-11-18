import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
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
} from '@livekit/rtc-node';
import { env, missingProviderKeys } from '../env';
import { encodeWav, isVoiced, parseWavOrPcm } from '../audio';
import { createJoinToken } from '../token';
import { CAPTION_TOPIC, LANE_TRACK_PREFIX, ensureInterpreter } from '../interpreter';

// Headless end-to-end run: a "speaker" bot publishes synthesized Korean speech
// into a room, a "listener" bot (Japanese, interpretation on) subscribes to the
// interpreter's tr:ja track, and we time speech end -> translated audio onset
// as heard by the listener. Speech comes from macOS `say` (voice Yuna).
const SENTENCES = [
    '안녕하세요, 오늘 저녁에 시간 괜찮으세요?',
    '제가 강남역 근처에 맛있는 라멘집을 알고 있어요.',
    '일곱 시쯤 역 앞에서 만나는 건 어때요?',
    '혹시 매운 음식도 잘 드세요?',
    '좋아요, 그럼 이따가 봬요.',
];
const SPEAKER_LANG = 'ko';
const LISTENER_LANG = (process.env.BENCH_LISTENER_LANG || 'ja').trim();
const RATE = 16000;
const FRAME = RATE / 100; // 10 ms
const GAP_MS = 4500;
const CACHE_DIR = path.join(__dirname, '..', '.cache');
// BENCH_ROOM joins a room the POC server already interprets (e.g. one open
// in a browser) instead of running a private interpreter in this process.
const SHARED_ROOM = (process.env.BENCH_ROOM || '').trim();
const ROOM = SHARED_ROOM || `bench-${Date.now().toString(36)}`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function synthesizeSentence(text: string, index: number): Int16Array {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const wav = path.join(CACHE_DIR, `say-${index}.wav`);
    if (!fs.existsSync(wav)) {
        const aiff = path.join(CACHE_DIR, `say-${index}.aiff`);
        execFileSync('say', ['-v', 'Yuna', '-o', aiff, text]);
        execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${RATE}`, '-c', '1', aiff, wav]);
        fs.unlinkSync(aiff);
    }
    return parseWavOrPcm(fs.readFileSync(wav), RATE).samples;
}

// Handlers are attached before connecting so tracks that already exist (a
// shared room's lanes) aren't subscribed before anyone is listening.
async function join(identity: string, lang: string, setup: (room: Room) => void = () => undefined): Promise<Room> {
    const room = new Room();
    setup(room);
    const token = await createJoinToken({ room: ROOM, identity, name: identity, attributes: { lang, interpret: 'on' } });
    await room.connect(env.livekitUrl, token, { autoSubscribe: true, dynacast: false });
    return room;
}

async function main(): Promise<void> {
    const missing = missingProviderKeys();
    if (missing.length) throw new Error(`missing keys: ${missing.join(', ')}`);
    const clips = SENTENCES.map(synthesizeSentence);

    const interpreter = SHARED_ROOM ? null : await ensureInterpreter(ROOM);
    // Listener: record the lane and note each onset of translated audio.
    const onsets: number[] = [];
    const received: Int16Array[] = [];
    const captions: Array<Record<string, any>> = [];
    let laneReady: () => void = () => undefined;
    const laneSubscribed = new Promise<void>((resolve) => { laneReady = resolve; });
    const listen = (listener: Room) => listener.on(RoomEvent.TrackSubscribed, (track, publication) => {
        if (track.kind !== TrackKind.KIND_AUDIO || publication.name !== `${LANE_TRACK_PREFIX}${LISTENER_LANG}`) return;
        laneReady();
        void (async () => {
            let silentSince = Date.now();
            let inSpeech = false;
            for await (const frame of new AudioStream(track, { sampleRate: 24000, numChannels: 1 })) {
                received.push(new Int16Array(frame.data));
                const voiced = isVoiced(frame.data, 600);
                const now = Date.now();
                if (voiced) {
                    if (!inSpeech && now - silentSince > 300) onsets.push(now);
                    inSpeech = true;
                } else if (inSpeech) {
                    inSpeech = false;
                    silentSince = now;
                }
            }
        })();
    }).on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
        if (topic !== CAPTION_TOPIC) return;
        const message = JSON.parse(new TextDecoder().decode(payload));
        if (message.type !== 'partial' && message.type !== 'lane') captions.push(message);
    });
    const listener = await join('listener', LISTENER_LANG, listen);
    const speaker = await join('speaker', SPEAKER_LANG);

    // Speaker: one mic-like track, real-time paced, silence between lines.
    const source = new AudioSource(RATE, 1, 100);
    const track = LocalAudioTrack.createAudioTrack('mic', source);
    await speaker.localParticipant!.publishTrack(track, new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }));
    await Promise.race([laneSubscribed, sleep(10_000)]);
    await sleep(1500);

    const speechEnds: number[] = [];
    const startedAt = Date.now();
    let sent = 0;
    const pushSamples = async (samples: Int16Array) => {
        for (let offset = 0; offset < samples.length; offset += FRAME) {
            const chunk = new Int16Array(FRAME);
            chunk.set(samples.subarray(offset, offset + FRAME));
            const due = startedAt + sent * 10;
            const wait = due - Date.now();
            if (wait > 0) await sleep(wait);
            await source.captureFrame(new AudioFrame(chunk, RATE, 1, FRAME));
            sent++;
        }
    };
    for (const [index, clip] of clips.entries()) {
        await pushSamples(clip);
        speechEnds.push(Date.now());
        console.log(`spoke #${index + 1} (${Math.round(clip.length / 16)}ms)`);
        await pushSamples(new Int16Array((RATE * GAP_MS) / 1000));
    }
    await pushSamples(new Int16Array(RATE * 3));

    // Pair each speech end with the first translated onset after it.
    console.log('\n#  speech end -> heard  | endpoint  translate  tts-1st  queue | text');
    const rows = speechEnds.map((end, index) => {
        const onset = onsets.find((at) => at > end && (index + 1 >= speechEnds.length || at < speechEnds[index + 1] + 4000));
        const play = captions.filter((c) => c.type === 'play')[index];
        const m = play?.metrics || {};
        const heard = onset ? onset - end : NaN;
        console.log(`${index + 1}  ${String(heard).padStart(6)}ms           | ${String(m.endpointMs).padStart(6)}  ${String(m.translateMs).padStart(8)}  ${String(m.ttsFirstAudioMs).padStart(7)}  ${String(m.queueMs).padStart(4)} | ${SENTENCES[index]} -> ${play?.text ?? '(none)'}`);
        return heard;
    });
    const valid = rows.filter(Number.isFinite).sort((a, b) => a - b);
    console.log(`\nheard ${valid.length}/${rows.length}; median ${valid[Math.floor(valid.length / 2)]}ms, min ${valid[0]}ms, max ${valid[valid.length - 1]}ms`);
    if (interpreter) console.log(`interpreter stats ${JSON.stringify(interpreter.stats)}`);

    const total = received.reduce((sum, chunk) => sum + chunk.length, 0);
    const all = new Int16Array(total);
    let offset = 0;
    for (const chunk of received) { all.set(chunk, offset); offset += chunk.length; }
    const out = path.join(CACHE_DIR, `bench-${LISTENER_LANG}.wav`);
    fs.writeFileSync(out, encodeWav({ samples: all, sampleRate: 24000 }));
    console.log(`listener audio saved to ${out}`);

    await speaker.disconnect();
    await listener.disconnect();
    await interpreter?.close();
    process.exit(0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
