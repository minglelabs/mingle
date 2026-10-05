/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

// Records what App injects into the WebView. (jest.mock factories may only
// reference variables whose names start with `mock`.)
const mockInjectedScripts: string[] = [];

jest.mock('react-native-webview', () => {
  const MockReact = require('react');
  const WebView = MockReact.forwardRef((props: { children?: unknown }, ref: unknown) => {
    MockReact.useImperativeHandle(ref, () => ({
      goBack: jest.fn(),
      injectJavaScript: (script: string) => {
        mockInjectedScripts.push(script);
      },
      reload: jest.fn(),
      stopLoading: jest.fn(),
    }));
    return MockReact.createElement('WebView', props, props.children);
  });
  return { WebView };
});

const ReactNative = jest.requireMock('react-native') as {
  NativeModules: Record<string, unknown> & { NativeSTTModule: { start: jest.Mock } };
  Platform: { OS: string; Version: string | number };
};

const PAGE_URL = 'https://mingle.example/ko/conversations';
const CAPABILITIES_STATE_KEY = '__MINGLE_NATIVE_SHELL_CAPABILITIES';

type DispatchedEvent = { type: string; detail: Record<string, unknown>; window: Record<string, unknown> };

function runScript(script: string): DispatchedEvent[] {
  const fakeWindow: Record<string, unknown> = {};
  const events: DispatchedEvent[] = [];
  class FakeCustomEvent {
    type: string;
    detail: Record<string, unknown>;
    constructor(type: string, init?: { detail?: Record<string, unknown> }) {
      this.type = type;
      this.detail = init?.detail ?? {};
    }
  }
  fakeWindow.dispatchEvent = (event: FakeCustomEvent) => {
    events.push({ type: event.type, detail: event.detail, window: { ...fakeWindow } });
    return true;
  };
  // eslint-disable-next-line no-new-func
  new Function('window', 'CustomEvent', script)(fakeWindow, FakeCustomEvent);
  return events;
}

function sttEvents(type: string): DispatchedEvent[] {
  return mockInjectedScripts
    .filter((script) => script.includes(JSON.stringify('mingle:native-stt')))
    .flatMap((script) => runScript(script))
    .filter((event) => event.type === 'mingle:native-stt' && event.detail.type === type);
}

async function flushMicrotasks() {
  await ReactTestRenderer.act(async () => {
    for (let index = 0; index < 5; index += 1) {
      await Promise.resolve();
    }
  });
}

describe('App device-audio bridge wiring', () => {
  let consoleErrorSpy: jest.SpyInstance;
  const startMock = ReactNative.NativeModules.NativeSTTModule.start;
  const originalPlatform = { ...ReactNative.Platform };

  beforeEach(() => {
    jest.useFakeTimers();
    mockInjectedScripts.length = 0;
    startMock.mockClear();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      const [firstArg] = args;
      if (typeof firstArg === 'string') {
        if (firstArg.includes('react-test-renderer is deprecated')) return;
        if (firstArg.includes('The current testing environment is not configured to support act')) return;
      }
      console.warn(...args);
    });
  });

  afterEach(() => {
    ReactNative.Platform.OS = originalPlatform.OS;
    ReactNative.Platform.Version = originalPlatform.Version;
    startMock.mockReset();
    startMock.mockImplementation(async () => ({ sampleRate: 16000 }));
    consoleErrorSpy.mockRestore();
    jest.useRealTimers();
  });

  async function renderLoadedApp() {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    await flushMicrotasks();
    const created = renderer as unknown as ReactTestRenderer.ReactTestRenderer;
    const webView = created.root.findByType('WebView' as unknown as React.ElementType);
    await ReactTestRenderer.act(async () => {
      webView.props.onLoadEnd({ nativeEvent: { url: PAGE_URL } });
    });
    await flushMicrotasks();
    return { renderer: created, webView };
  }

  async function postFromWeb(webView: ReactTestRenderer.ReactTestInstance, message: unknown) {
    await ReactTestRenderer.act(async () => {
      webView.props.onMessage({ nativeEvent: { data: JSON.stringify(message), url: PAGE_URL } });
    });
    await flushMicrotasks();
  }

  function startPayload(extra: Record<string, unknown> = {}) {
    return {
      type: 'native_stt_start',
      payload: {
        conversationId: 'conversation-1',
        sessionId: 'session-1',
        wsUrl: 'wss://stt.mingle.example/ws',
        sttModel: 'soniox',
        aecEnabled: false,
        ...extra,
      },
    };
  }

  it('reports device-audio capture on Android and keeps the message for late readers', async () => {
    ReactNative.Platform.OS = 'android';
    ReactNative.Platform.Version = 34;
    const { renderer } = await renderLoadedApp();

    const [capabilities] = sttEvents('capabilities');
    expect(capabilities.detail).toMatchObject({ type: 'capabilities', deviceAudioCapture: true });
    // Cached before the event is dispatched, for rooms that mount later.
    expect(capabilities.window[CAPABILITIES_STATE_KEY]).toEqual(capabilities.detail);

    await ReactTestRenderer.act(async () => { renderer.unmount(); });
  });

  it('reports no device-audio capture on iOS', async () => {
    const { renderer } = await renderLoadedApp();
    const [capabilities] = sttEvents('capabilities');
    expect(capabilities.detail).toMatchObject({ type: 'capabilities', deviceAudioCapture: false });
    await ReactTestRenderer.act(async () => { renderer.unmount(); });
  });

  it('passes captureSource to the native module only for device audio', async () => {
    ReactNative.Platform.OS = 'android';
    ReactNative.Platform.Version = 34;
    const { renderer, webView } = await renderLoadedApp();

    await postFromWeb(webView, startPayload({ captureSource: 'device_audio' }));
    expect(startMock).toHaveBeenCalledTimes(1);
    expect(startMock.mock.calls[0][0]).toMatchObject({
      conversationId: 'conversation-1',
      wsUrl: 'wss://stt.mingle.example/ws',
      captureSource: 'device_audio',
    });

    startMock.mockClear();
    await postFromWeb(webView, startPayload({ sessionId: 'session-2', captureSource: 'screen' }));
    await postFromWeb(webView, startPayload({ sessionId: 'session-3' }));
    expect(startMock).toHaveBeenCalledTimes(2);
    for (const [options] of startMock.mock.calls) {
      expect(options).not.toHaveProperty('captureSource');
    }

    await ReactTestRenderer.act(async () => { renderer.unmount(); });
  });

  it('treats a declined screen-capture prompt as a cancel: idle, one attempt, coded error', async () => {
    ReactNative.Platform.OS = 'android';
    ReactNative.Platform.Version = 34;
    startMock.mockImplementation(async () => {
      throw Object.assign(new Error('device_audio_permission_denied'), { code: 'device_audio_permission' });
    });
    const { renderer, webView } = await renderLoadedApp();
    mockInjectedScripts.length = 0;

    await postFromWeb(webView, startPayload({ captureSource: 'device_audio' }));

    expect(startMock).toHaveBeenCalledTimes(1);
    const statuses = sttEvents('status').map((event) => event.detail.status);
    expect(statuses).toContain('idle');
    expect(statuses).not.toContain('failed');
    expect(sttEvents('error').map((event) => event.detail.code)).toEqual(['device_audio_permission']);
    // Not a microphone problem: the page must not be told the mic was denied.
    expect(sttEvents('permission').filter((event) => event.detail.permission === 'denied')).toEqual([]);

    await ReactTestRenderer.act(async () => { renderer.unmount(); });
  });
});
