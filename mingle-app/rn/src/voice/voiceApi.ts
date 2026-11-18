// Voice-room REST client.
//
// The RN shell is otherwise a pure WebView host, so this is the first native
// REST caller in the app. It reuses the shell's resolved web app base URL and
// the validated versioned API namespace (ios/vX.Y.Z | android/vX.Y.Z) so the
// request path matches exactly what the web layer hits, and forwards the
// authenticated session (cookies) the WebView already established.
//
// Against the FIXED backend contract:
//   GET    /api/conversations/{id}/voice           -> { call: VoiceCall | null }
//   POST   /api/conversations/{id}/voice/token     -> { url, token, room, identity, call }
//   POST   /api/conversations/{id}/voice/leave     -> { ok, ended }

export type VoiceParticipant = {
  userId: string;
  name: string;
  image: string | null;
  interpretOn: boolean;
  speechLanguage: string | null;
  joinedAt: string;
};

export type VoiceCall = {
  id: string;
  status: 'live' | 'ended' | string;
  room: string;
  startedAt: string;
  maxParticipants: number;
  participants: VoiceParticipant[];
};

export type VoiceStatusResponse = { call: VoiceCall | null };

export type VoiceTokenResponse = {
  url: string;
  token: string;
  room: string;
  identity: string;
  call: VoiceCall;
};

export type VoiceLeaveResponse = { ok: boolean; ended: boolean };

export type VoiceApiErrorKind = 'voice_room_full' | 'forbidden' | 'network' | 'http' | 'bad_response';

export class VoiceApiError extends Error {
  readonly kind: VoiceApiErrorKind;
  readonly status: number;
  constructor(kind: VoiceApiErrorKind, message: string, status = 0) {
    super(message);
    this.name = 'VoiceApiError';
    this.kind = kind;
    this.status = status;
  }
}

export type VoiceApiConfig = {
  /** Resolved web app origin, no trailing slash, e.g. https://app.example.com */
  baseUrl: string;
  /** Validated namespace, e.g. 'ios/v2.3.0'. Empty = hit the un-namespaced base route. */
  apiNamespace: string;
  /** Injected for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
};

export type VoiceTokenRequest = {
  /** The language this user listens in / speaks (BCP-47-ish short code). */
  lang: string;
  /** Initial interpret state; omitted => backend default (ON). */
  interpret?: boolean;
};

/**
 * Builds the `/api/[{namespace}/]conversations/{id}/voice[...]` path. The web
 * layer mounts the versioned namespace under /api, so a namespace of
 * `ios/v2.3.0` yields `/api/ios/v2.3.0/conversations/{id}/voice`.
 */
export function buildVoicePath(
  apiNamespace: string,
  conversationId: string,
  suffix: '' | '/token' | '/leave',
): string {
  const ns = apiNamespace.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  const id = encodeURIComponent(conversationId);
  const nsSegment = ns ? `/${ns}` : '';
  return `/api${nsSegment}/conversations/${id}/voice${suffix}`;
}

export function buildVoiceUrl(
  config: Pick<VoiceApiConfig, 'baseUrl' | 'apiNamespace'>,
  conversationId: string,
  suffix: '' | '/token' | '/leave',
): string {
  const base = config.baseUrl.trim().replace(/\/+$/, '');
  return base + buildVoicePath(config.apiNamespace, conversationId, suffix);
}

function resolveFetch(config: VoiceApiConfig): typeof fetch {
  const impl = config.fetchImpl ?? (globalThis as { fetch?: typeof fetch }).fetch;
  if (!impl) throw new VoiceApiError('network', 'fetch is not available in this runtime');
  return impl;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new VoiceApiError('bad_response', `invalid JSON (status ${response.status})`, response.status);
  }
}

/** Maps a non-OK HTTP response to the typed error the UI reacts to. */
export function classifyErrorResponse(status: number, body: unknown): VoiceApiError {
  const errorCode = (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string')
    ? (body as { error: string }).error
    : '';
  if (status === 409 && errorCode === 'voice_room_full') {
    return new VoiceApiError('voice_room_full', 'voice_room_full', status);
  }
  if (status === 403) {
    return new VoiceApiError('forbidden', errorCode || 'forbidden', status);
  }
  return new VoiceApiError('http', errorCode || `http_${status}`, status);
}

export function createVoiceApi(config: VoiceApiConfig) {
  const doFetch = resolveFetch(config);

  async function request(
    suffix: '' | '/token' | '/leave',
    conversationId: string,
    init: RequestInit,
  ): Promise<unknown> {
    const url = buildVoiceUrl(config, conversationId, suffix);
    let response: Response;
    try {
      response = await doFetch(url, {
        credentials: 'include',
        ...init,
        headers: {
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init.headers ?? {}),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new VoiceApiError('network', message);
    }
    if (!response.ok) {
      const body = await readJson(response).catch(() => null);
      throw classifyErrorResponse(response.status, body);
    }
    return readJson(response);
  }

  return {
    async getStatus(conversationId: string): Promise<VoiceStatusResponse> {
      const body = await request('', conversationId, { method: 'GET' });
      const call = (body && typeof body === 'object') ? (body as VoiceStatusResponse).call ?? null : null;
      return { call };
    },

    async requestToken(
      conversationId: string,
      req: VoiceTokenRequest,
    ): Promise<VoiceTokenResponse> {
      const body = await request('/token', conversationId, {
        method: 'POST',
        body: JSON.stringify({ lang: req.lang, ...(req.interpret === undefined ? {} : { interpret: req.interpret }) }),
      });
      if (!body || typeof body !== 'object') {
        throw new VoiceApiError('bad_response', 'empty token response');
      }
      const typed = body as Partial<VoiceTokenResponse>;
      if (!typed.token || !typed.url || !typed.room) {
        throw new VoiceApiError('bad_response', 'token response missing url/token/room');
      }
      return typed as VoiceTokenResponse;
    },

    async leave(conversationId: string): Promise<VoiceLeaveResponse> {
      const body = await request('/leave', conversationId, { method: 'POST' });
      const typed = (body && typeof body === 'object') ? (body as Partial<VoiceLeaveResponse>) : {};
      return { ok: Boolean(typed.ok), ended: Boolean(typed.ended) };
    },
  };
}

export type VoiceApi = ReturnType<typeof createVoiceApi>;
