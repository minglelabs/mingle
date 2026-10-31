import {
  VoiceApiError,
  buildVoicePath,
  buildVoiceUrl,
  classifyErrorResponse,
  createVoiceApi,
} from './voiceApi';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('path building', () => {
  it('includes the versioned namespace', () => {
    expect(buildVoicePath('ios/v2.3.0', 'conv_1', '')).toBe('/api/ios/v2.3.0/conversations/conv_1/voice');
    expect(buildVoicePath('android/v2.3.0', 'conv_1', '/token')).toBe('/api/android/v2.3.0/conversations/conv_1/voice/token');
  });
  it('falls back to the base route when namespace is empty', () => {
    expect(buildVoicePath('', 'conv_1', '/leave')).toBe('/api/conversations/conv_1/voice/leave');
  });
  it('encodes the conversation id', () => {
    expect(buildVoicePath('', 'a/b c', '')).toBe('/api/conversations/a%2Fb%20c/voice');
  });
  it('joins base url without trailing slash', () => {
    expect(buildVoiceUrl({ baseUrl: 'https://x.app/', apiNamespace: 'ios/v2.3.0' }, 'c', '/token')).toBe(
      'https://x.app/api/ios/v2.3.0/conversations/c/voice/token',
    );
  });
});

describe('classifyErrorResponse', () => {
  it('maps 409 voice_room_full', () => {
    const e = classifyErrorResponse(409, { error: 'voice_room_full' });
    expect(e.kind).toBe('voice_room_full');
  });
  it('maps 403 to forbidden', () => {
    expect(classifyErrorResponse(403, {}).kind).toBe('forbidden');
  });
  it('maps other statuses to http', () => {
    expect(classifyErrorResponse(500, {}).kind).toBe('http');
  });
});

describe('createVoiceApi', () => {
  it('getStatus returns null call when none live', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ call: null }));
    const api = createVoiceApi({ baseUrl: 'https://x.app', apiNamespace: 'ios/v2.3.0', fetchImpl });
    await expect(api.getStatus('c1')).resolves.toEqual({ call: null });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://x.app/api/ios/v2.3.0/conversations/c1/voice',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('requestToken posts lang/interpret and returns the token payload', async () => {
    const payload = { url: 'wss://voice.minglelabs.app', token: 'jwt', room: 'voice-c1', identity: 'u1', call: { id: 'call1', status: 'live', room: 'voice-c1', startedAt: 't', maxParticipants: 8, participants: [] } };
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(payload));
    const api = createVoiceApi({ baseUrl: 'https://x.app', apiNamespace: '', fetchImpl });
    const res = await api.requestToken('c1', { lang: 'ja', interpret: true });
    expect(res.token).toBe('jwt');
    const [, init] = fetchImpl.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ lang: 'ja', interpret: true });
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('requestToken throws typed voice_room_full on 409', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ error: 'voice_room_full' }, 409));
    const api = createVoiceApi({ baseUrl: 'https://x.app', apiNamespace: '', fetchImpl });
    await expect(api.requestToken('c1', { lang: 'ja' })).rejects.toMatchObject({ kind: 'voice_room_full', status: 409 });
  });

  it('requestToken throws forbidden on 403', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({}, 403));
    const api = createVoiceApi({ baseUrl: 'https://x.app', apiNamespace: '', fetchImpl });
    await expect(api.requestToken('c1', { lang: 'ja' })).rejects.toMatchObject({ kind: 'forbidden' });
  });

  it('wraps network errors', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('offline'));
    const api = createVoiceApi({ baseUrl: 'https://x.app', apiNamespace: '', fetchImpl });
    await expect(api.getStatus('c1')).rejects.toBeInstanceOf(VoiceApiError);
    await expect(api.getStatus('c1')).rejects.toMatchObject({ kind: 'network' });
  });

  it('leave coerces the response booleans', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ ok: true, ended: false }));
    const api = createVoiceApi({ baseUrl: 'https://x.app', apiNamespace: '', fetchImpl });
    await expect(api.leave('c1')).resolves.toEqual({ ok: true, ended: false });
  });

  it('omits interpret when undefined', async () => {
    const payload = { url: 'u', token: 't', room: 'r', identity: 'i', call: { id: '1', status: 'live', room: 'r', startedAt: 's', maxParticipants: 8, participants: [] } };
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(payload));
    const api = createVoiceApi({ baseUrl: 'https://x.app', apiNamespace: '', fetchImpl });
    await api.requestToken('c1', { lang: 'ko' });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ lang: 'ko' });
  });
});
