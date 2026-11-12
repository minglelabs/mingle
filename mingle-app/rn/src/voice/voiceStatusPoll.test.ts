import { createVoiceStatusPoll } from './voiceStatusPoll';
import type { VoiceApi, VoiceCall } from './voiceApi';

function fakeApi(getStatus: jest.Mock): VoiceApi {
  return { getStatus, requestToken: jest.fn(), leave: jest.fn() } as unknown as VoiceApi;
}

const liveCall: VoiceCall = {
  id: 'call1', status: 'live', room: 'voice-c1', startedAt: 't', maxParticipants: 8, participants: [],
};

describe('createVoiceStatusPoll', () => {
  it('fetches immediately on start and on each interval tick', async () => {
    const getStatus = jest.fn().mockResolvedValue({ call: liveCall });
    const onUpdate = jest.fn();
    const holder: { tick: (() => void) | null } = { tick: null };
    const poll = createVoiceStatusPoll({
      api: fakeApi(getStatus),
      conversationId: 'c1',
      onUpdate,
      setInterval: (cb) => { holder.tick = cb; return 1; },
      clearInterval: () => undefined,
    });
    poll.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(liveCall);

    holder.tick?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(getStatus).toHaveBeenCalledTimes(2);
  });

  it('does not deliver updates after stop', async () => {
    const holder: { resolve: ((v: { call: VoiceCall | null }) => void) | null } = { resolve: null };
    const getStatus = jest.fn().mockImplementation(() => new Promise((r) => { holder.resolve = r as (v: { call: VoiceCall | null }) => void; }));
    const onUpdate = jest.fn();
    const poll = createVoiceStatusPoll({
      api: fakeApi(getStatus),
      conversationId: 'c1',
      onUpdate,
      setInterval: () => 1,
      clearInterval: () => undefined,
    });
    poll.start();
    poll.stop();
    holder.resolve?.({ call: liveCall });
    await Promise.resolve();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('reports errors via onError', async () => {
    const getStatus = jest.fn().mockRejectedValue(new Error('boom'));
    const onError = jest.fn();
    const poll = createVoiceStatusPoll({
      api: fakeApi(getStatus),
      conversationId: 'c1',
      onUpdate: jest.fn(),
      onError,
      setInterval: () => 1,
      clearInterval: () => undefined,
    });
    await poll.refresh();
    expect(onError).toHaveBeenCalled();
  });
});
