import {
  createVoiceController,
  ROOM_EVENTS,
  type LkParticipant,
  type LkPublication,
  type LkRoom,
} from './src/nativeVoice';
import type { VoiceApi, VoiceTokenResponse } from './src/voice/voiceApi';

// Jest runs on Node, which has TextEncoder; the RN tsconfig has no DOM lib.
declare const TextEncoder: { new (): { encode: (s: string) => Uint8Array } };

function pub(partial: Partial<LkPublication>): LkPublication {
  return {
    kind: 'audio',
    isSubscribed: false,
    track: { kind: 'audio', setVolume: jest.fn() },
    setSubscribed: jest.fn(function (this: LkPublication, want: boolean) {
      this.isSubscribed = want;
    }),
    ...partial,
  };
}

function participant(identity: string, attrs: Record<string, string>, pubs: LkPublication[]): LkParticipant {
  const map = new Map<string, LkPublication>();
  pubs.forEach((p, i) => map.set(`${identity}:${i}`, p));
  return {
    identity,
    name: identity,
    attributes: attrs,
    trackPublications: map,
    setMicrophoneEnabled: jest.fn().mockResolvedValue(undefined),
    setAttributes: jest.fn().mockResolvedValue(undefined),
  };
}

type Handlers = Record<string, (...args: unknown[]) => void>;

function makeFakeRoom(remote: LkParticipant[]): { room: LkRoom; handlers: Handlers } {
  const handlers: Handlers = {};
  const remoteMap = new Map<string, LkParticipant>();
  remote.forEach((p) => remoteMap.set(p.identity, p));
  const local = participant('me', { lang: 'ja', role: 'speaker' }, []);
  const room: LkRoom = {
    name: 'voice-c1',
    localParticipant: local,
    remoteParticipants: remoteMap,
    activeSpeakers: [],
    on(event, cb) {
      handlers[event] = cb;
      return room;
    },
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    startAudio: jest.fn().mockResolvedValue(undefined),
  };
  return { room, handlers };
}

const tokenRes: VoiceTokenResponse = {
  url: 'wss://voice.minglelabs.app',
  token: 'jwt',
  room: 'voice-c1',
  identity: 'me',
  call: { id: 'call1', status: 'live', room: 'voice-c1', startedAt: 't', maxParticipants: 8, participants: [] },
};

function fakeApi(): VoiceApi {
  return {
    getStatus: jest.fn().mockResolvedValue({ call: tokenRes.call }),
    requestToken: jest.fn().mockResolvedValue(tokenRes),
    leave: jest.fn().mockResolvedValue({ ok: true, ended: false }),
  } as unknown as VoiceApi;
}

describe('voice controller LiveKit wiring', () => {
  it('subscribes only to my interpreter lane + all humans, and applies the volume mix', async () => {
    const humanKo = participant('u_ko', { lang: 'ko' }, [pub({ trackName: 'mic' })]);
    const agent = participant('interpreter-voice-c1', { role: 'interpreter' }, [
      pub({ trackName: 'tr:ja' }),
      pub({ trackName: 'tr:en' }),
    ]);
    const { room } = makeFakeRoom([humanKo, agent]);

    const controller = createVoiceController({
      api: fakeApi(),
      createRoom: () => room,
      myLang: 'ja',
      localUserId: 'me',
    });
    await controller.connect('c1');

    // Human mic subscribed; tr:ja subscribed; tr:en NOT subscribed.
    const humanPub = Array.from(humanKo.trackPublications.values())[0];
    const [trJa, trEn] = Array.from(agent.trackPublications.values());
    expect(humanPub.isSubscribed).toBe(true);
    expect(trJa.isSubscribed).toBe(true);
    expect(trEn.isSubscribed).toBe(false);

    // Volume: ko human ducked to static 0.25, agent lane at 1.0.
    expect(humanPub.track!.setVolume).toHaveBeenCalledWith(0.25);
    expect(trJa.track!.setVolume).toHaveBeenCalledWith(1);

    const snap = controller.getSnapshot();
    expect(snap.status).toBe('connected');
    // Interpreter excluded from the grid; local + ko human shown.
    expect(snap.members.map((m) => m.identity).sort()).toEqual(['me', 'u_ko']);
    expect(snap.participantCount).toBe(2);
  });

  it('interpret OFF unsubscribes the lane and restores full original volume', async () => {
    const humanKo = participant('u_ko', { lang: 'ko' }, [pub({ trackName: 'mic', isSubscribed: true })]);
    const agent = participant('interpreter-voice-c1', { role: 'interpreter' }, [pub({ trackName: 'tr:ja', isSubscribed: true })]);
    const { room } = makeFakeRoom([humanKo, agent]);
    const controller = createVoiceController({ api: fakeApi(), createRoom: () => room, myLang: 'ja', localUserId: 'me' });
    await controller.connect('c1');

    await controller.setInterpret(false);
    const trJa = Array.from(agent.trackPublications.values())[0];
    const humanPub = Array.from(humanKo.trackPublications.values())[0];
    expect(trJa.isSubscribed).toBe(false);
    // Original restored to full.
    expect(humanPub.track!.setVolume).toHaveBeenLastCalledWith(1);
    expect(controller.getSnapshot().interpretOn).toBe(false);
  });

  it('routes interpreter caption data into the snapshot and lane ducking in dynamic mode', async () => {
    const humanKo = participant('u_ko', { lang: 'ko' }, [pub({ trackName: 'mic' })]);
    const { room, handlers } = makeFakeRoom([humanKo]);
    const controller = createVoiceController({ api: fakeApi(), createRoom: () => room, myLang: 'ja', localUserId: 'me' });
    await controller.connect('c1');
    controller.setMode('dynamic');

    const send = (obj: unknown) =>
      handlers[ROOM_EVENTS.DataReceived](new TextEncoder().encode(JSON.stringify(obj)), humanKo, 0, 'interpreter');

    send({ type: 'final', id: 'f1', text: '안녕', lang: 'ko', speakerName: 'KoUser' });
    send({ type: 'translation', id: 'f1', lang: 'ja', text: 'こんにちは' });
    const snap = controller.getSnapshot();
    expect(snap.captions[0]).toMatchObject({ original: '안녕', translations: { ja: 'こんにちは' } });

    // lane playing -> ko human ducked to 0.15 in dynamic mode.
    const humanPub = Array.from(humanKo.trackPublications.values())[0];
    send({ type: 'lane', lang: 'ja', playing: true });
    expect(humanPub.track!.setVolume).toHaveBeenLastCalledWith(0.15);
  });

  it('ignores data on other topics', async () => {
    const { room, handlers } = makeFakeRoom([]);
    const controller = createVoiceController({ api: fakeApi(), createRoom: () => room, myLang: 'ja', localUserId: 'me' });
    await controller.connect('c1');
    handlers[ROOM_EVENTS.DataReceived](new TextEncoder().encode('{"type":"final","id":"x","text":"y"}'), null, 0, 'chat');
    expect(controller.getSnapshot().captions).toHaveLength(0);
  });

  it('falls back to listener-only when the mic is denied', async () => {
    const { room } = makeFakeRoom([]);
    (room.localParticipant.setMicrophoneEnabled as jest.Mock).mockRejectedValueOnce(new Error('denied'));
    const controller = createVoiceController({ api: fakeApi(), createRoom: () => room, myLang: 'ja', localUserId: 'me' });
    await controller.connect('c1');
    const snap = controller.getSnapshot();
    expect(snap.micAvailable).toBe(false);
    expect(snap.micOn).toBe(false);
  });

  it('surfaces a typed connect error', async () => {
    const api = fakeApi();
    (api.requestToken as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('full'), { kind: 'voice_room_full' }));
    const { room } = makeFakeRoom([]);
    const controller = createVoiceController({ api, createRoom: () => room, myLang: 'ja', localUserId: 'me' });
    await expect(controller.connect('c1')).rejects.toBeDefined();
    expect(controller.getSnapshot()).toMatchObject({ status: 'error', errorKind: 'voice_room_full' });
  });

  it('leave disconnects the room and calls the API', async () => {
    const api = fakeApi();
    const { room } = makeFakeRoom([]);
    const controller = createVoiceController({ api, createRoom: () => room, myLang: 'ja', localUserId: 'me' });
    await controller.connect('c1');
    await controller.leave();
    expect(room.disconnect).toHaveBeenCalled();
    expect(api.leave).toHaveBeenCalledWith('c1');
    expect(controller.getSnapshot().status).toBe('disconnected');
  });
});
