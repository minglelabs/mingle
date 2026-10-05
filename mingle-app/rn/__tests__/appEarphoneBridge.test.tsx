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

type NativeListener = { eventName: string; handler: (payload: unknown) => void };

const ReactNative = jest.requireMock('react-native') as {
  NativeModules: Record<string, unknown> & { NativeTTSModule: { play: jest.Mock } };
  Platform: { OS: string; Version: string | number };
  NativeEventEmitter: { prototype: { addListener: (...args: unknown[]) => unknown } };
};

const PAGE_URL = 'https://mingle.example/ko/conversations';

function runScript(script: string) {
  const fakeWindow: Record<string, unknown> = {};
  const events: { type: string; detail: Record<string, unknown>; routeCacheAtDispatch: unknown }[] = [];
  class FakeCustomEvent {
    type: string;
    detail: Record<string, unknown>;
    constructor(type: string, init?: { detail?: Record<string, unknown> }) {
      this.type = type;
      this.detail = init?.detail ?? {};
    }
  }
  fakeWindow.dispatchEvent = (event: FakeCustomEvent) => {
    events.push({
      type: event.type,
      detail: event.detail,
      routeCacheAtDispatch: fakeWindow.__MINGLE_LAST_NATIVE_AUDIO_ROUTE,
    });
    return true;
  };
  // eslint-disable-next-line no-new-func
  new Function('window', 'CustomEvent', script)(fakeWindow, FakeCustomEvent);
  return events;
}

function dispatchedEvents(scripts: string[], eventName: string) {
  return scripts
    .filter((script) => script.includes(JSON.stringify(eventName)))
    .flatMap((script) => runScript(script))
    .filter((event) => event.type === eventName);
}

async function flushMicrotasks() {
  await ReactTestRenderer.act(async () => {
    for (let index = 0; index < 5; index += 1) {
      await Promise.resolve();
    }
  });
}

describe('App earphone-mode bridge wiring', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let addListenerSpy: jest.SpyInstance;
  let listeners: NativeListener[];
  let routeReads: unknown[];

  beforeEach(() => {
    jest.useFakeTimers();
    mockInjectedScripts.length = 0;
    listeners = [];
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      const [firstArg] = args;
      if (typeof firstArg === 'string') {
        if (firstArg.includes('react-test-renderer is deprecated')) return;
        if (firstArg.includes('The current testing environment is not configured to support act')) return;
      }
      console.warn(...args);
    });
    addListenerSpy = jest.spyOn(ReactNative.NativeEventEmitter.prototype, 'addListener')
      .mockImplementation((eventName: unknown, handler: unknown) => {
        listeners.push({ eventName: String(eventName), handler: handler as (payload: unknown) => void });
        return { remove: jest.fn() };
      });
    routeReads = [];
    ReactNative.NativeModules.NativeAudioRouteModule = {
      getAudioRoute: jest.fn(async () => routeReads.shift() ?? null),
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };
    ReactNative.NativeModules.NativeTTSModule.play.mockClear();
  });

  afterEach(() => {
    delete ReactNative.NativeModules.NativeAudioRouteModule;
    addListenerSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.useRealTimers();
  });

  function nativeListener(eventName: string): (payload: unknown) => void {
    const match = listeners.filter((listener) => listener.eventName === eventName).pop();
    if (!match) throw new Error(`no native listener for ${eventName}`);
    return match.handler;
  }

  async function renderApp() {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    await flushMicrotasks();
    const created = renderer as unknown as ReactTestRenderer.ReactTestRenderer;
    const webView = created.root.findByType('WebView' as unknown as React.ElementType);
    return { renderer: created, webView };
  }

  async function postFromWeb(webView: ReactTestRenderer.ReactTestInstance, message: unknown) {
    await ReactTestRenderer.act(async () => {
      webView.props.onMessage({ nativeEvent: { data: JSON.stringify(message), url: PAGE_URL } });
    });
    await flushMicrotasks();
  }

  it('sends audioRoute in capabilities and the route right after it at load end', async () => {
    routeReads.push({
      earphonesConnected: true,
      routeKind: 'bluetooth',
      outputTypes: ['BluetoothA2DPOutput'],
      monotonicMs: 10,
    });
    const { renderer, webView } = await renderApp();

    // The page is not ready yet, so the initial reading is held back.
    expect(dispatchedEvents(mockInjectedScripts, 'mingle:native-audio-route')).toEqual([]);

    await ReactTestRenderer.act(async () => {
      webView.props.onLoadEnd({ nativeEvent: { url: PAGE_URL } });
    });

    const capabilitiesIndex = mockInjectedScripts.findIndex((script) => script.includes('"type":"capabilities"'));
    const routeIndex = mockInjectedScripts.findIndex((script) => script.includes('mingle:native-audio-route'));
    expect(capabilitiesIndex).toBeGreaterThanOrEqual(0);
    expect(routeIndex).toBe(capabilitiesIndex + 1);

    const [capabilities] = runScript(mockInjectedScripts[capabilitiesIndex]);
    expect(capabilities.type).toBe('mingle:native-stt');
    expect(capabilities.detail).toEqual({ type: 'capabilities', openAppSettings: true, audioRoute: true, deviceAudioCapture: false });

    const [route] = runScript(mockInjectedScripts[routeIndex]);
    expect(route.detail).toEqual({
      type: 'audio_route',
      platform: 'ios',
      earphonesConnected: true,
      routeKind: 'bluetooth',
      outputTypes: ['BluetoothA2DPOutput'],
      reason: 'initial',
      atMs: expect.any(Number),
    });
    expect(route.routeCacheAtDispatch).toBe(route.detail);

    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
  });

  it('forwards a disconnect at once, debounces a reconnect and answers requests', async () => {
    routeReads.push({ earphonesConnected: true, routeKind: 'wired', outputTypes: ['Headphones'], monotonicMs: 10 });
    const { renderer, webView } = await renderApp();
    await ReactTestRenderer.act(async () => {
      webView.props.onLoadEnd({ nativeEvent: { url: PAGE_URL } });
    });
    const routeEvents = () => dispatchedEvents(mockInjectedScripts, 'mingle:native-audio-route').map((event) => event.detail);
    expect(routeEvents()).toHaveLength(1);

    const onRouteChanged = nativeListener('audioRouteChanged');
    await ReactTestRenderer.act(async () => {
      onRouteChanged({
        earphonesConnected: false,
        routeKind: 'speaker',
        outputTypes: ['Speaker'],
        reason: 'old_device_unavailable',
        monotonicMs: 20,
      });
    });
    expect(routeEvents()).toHaveLength(2);
    expect(routeEvents()[1]).toMatchObject({ earphonesConnected: false, routeKind: 'speaker', reason: 'old_device_unavailable' });

    await ReactTestRenderer.act(async () => {
      onRouteChanged({ earphonesConnected: true, routeKind: 'wired', outputTypes: ['Headphones'], monotonicMs: 30 });
    });
    expect(routeEvents()).toHaveLength(2);
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(250);
    });
    expect(routeEvents()).toHaveLength(3);
    expect(routeEvents()[2]).toMatchObject({ earphonesConnected: true, routeKind: 'wired' });

    routeReads.push({ earphonesConnected: true, routeKind: 'wired', outputTypes: ['Headphones'], monotonicMs: 40 });
    await postFromWeb(webView, { type: 'native_audio_route_request', payload: {} });
    expect(routeEvents()).toHaveLength(4);
    expect(routeEvents()[3]).toMatchObject({ earphonesConnected: true, reason: 'request' });

    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
  });

  it('correlates fresh route requests and refuses stale connected state on read failure', async () => {
    routeReads.push({ earphonesConnected: true, routeKind: 'bluetooth', outputTypes: ['BluetoothA2DP'], monotonicMs: 10 });
    const { renderer, webView } = await renderApp();
    await ReactTestRenderer.act(async () => {
      webView.props.onLoadEnd({ nativeEvent: { url: PAGE_URL } });
    });
    routeReads.push({ earphonesConnected: false, routeKind: 'speaker', outputTypes: ['Speaker'], monotonicMs: 20 });
    await postFromWeb(webView, { type: 'native_audio_route_request', payload: { requestId: 'check-1' } });
    const events = () => dispatchedEvents(mockInjectedScripts, 'mingle:native-audio-route').map((event) => event.detail);
    expect(events().pop()).toMatchObject({ requestId: 'check-1', earphonesConnected: false, reason: 'request' });
    // A later failed query must not replay a previously connected route as fresh.
    await ReactTestRenderer.act(async () => {
      nativeListener('audioRouteChanged')({ earphonesConnected: true, routeKind: 'bluetooth', outputTypes: ['BluetoothA2DP'], monotonicMs: 30 });
      jest.advanceTimersByTime(250);
    });
    await postFromWeb(webView, { type: 'native_audio_route_request', payload: { requestId: 'check-2' } });
    expect(events().pop()).toMatchObject({ requestId: 'check-2', earphonesConnected: false, reason: 'request_failed' });
    await ReactTestRenderer.act(async () => { renderer.unmount(); });
  });

  it('passes stopOnEarphoneDisconnect, emits tts_started and forwards the stop reason', async () => {
    const { renderer, webView } = await renderApp();
    await ReactTestRenderer.act(async () => {
      webView.props.onLoadEnd({ nativeEvent: { url: PAGE_URL } });
    });
    const ttsEvents = () => dispatchedEvents(mockInjectedScripts, 'mingle:native-tts').map((event) => event.detail);

    await postFromWeb(webView, {
      type: 'native_tts_play',
      payload: { utteranceId: 'utt-1', playbackId: 'pb-1', audioBase64: 'AAAA', stopOnEarphoneDisconnect: true },
    });
    expect(ReactNative.NativeModules.NativeTTSModule.play).toHaveBeenLastCalledWith({
      utteranceId: 'utt-1',
      playbackId: 'pb-1',
      audioBase64: 'AAAA',
      stopOnEarphoneDisconnect: true,
    });
    expect(ttsEvents()).toEqual([{ type: 'tts_started', playbackId: 'pb-1', utteranceId: 'utt-1' }]);

    await ReactTestRenderer.act(async () => {
      nativeListener('ttsPlaybackStopped')({ playbackId: 'pb-1', utteranceId: 'utt-1', reason: 'earphones_disconnected' });
    });
    expect(ttsEvents()[1]).toEqual({
      type: 'tts_stopped',
      utteranceId: 'utt-1',
      playbackId: 'pb-1',
      reason: 'earphones_disconnected',
    });

    ReactNative.NativeModules.NativeTTSModule.play.mockResolvedValueOnce({ ok: false, reason: 'earphones_disconnected' });
    await postFromWeb(webView, {
      type: 'native_tts_play',
      payload: { utteranceId: 'utt-2', playbackId: 'pb-2', audioBase64: 'BBBB', stopOnEarphoneDisconnect: true },
    });
    expect(ttsEvents().filter((event) => event.type === 'tts_started')).toHaveLength(1);

    await postFromWeb(webView, {
      type: 'native_tts_play',
      payload: { utteranceId: 'utt-3', audioBase64: 'CCCC' },
    });
    expect(ReactNative.NativeModules.NativeTTSModule.play).toHaveBeenLastCalledWith({
      utteranceId: 'utt-3',
      playbackId: 'utt-3',
      audioBase64: 'CCCC',
      stopOnEarphoneDisconnect: false,
    });
    expect(ttsEvents().pop()).toEqual({ type: 'tts_started', playbackId: 'utt-3', utteranceId: 'utt-3' });

    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
  });

  it('hides earphone mode on Android versions that cannot query the media output', async () => {
    const { OS, Version } = ReactNative.Platform;
    ReactNative.Platform.OS = 'android';
    ReactNative.Platform.Version = 32;
    try {
      routeReads.push({ earphonesConnected: true, routeKind: 'bluetooth', outputTypes: ['BluetoothA2DP'] });
      const { renderer, webView } = await renderApp();
      await ReactTestRenderer.act(async () => { webView.props.onLoadEnd({ nativeEvent: { url: PAGE_URL } }); });
      const capabilities = dispatchedEvents(mockInjectedScripts, 'mingle:native-stt')
        .map((event) => event.detail).filter((event) => event.type === 'capabilities');
      expect(capabilities).toEqual([{ type: 'capabilities', openAppSettings: true, audioRoute: false, deviceAudioCapture: true }]);
      expect(dispatchedEvents(mockInjectedScripts, 'mingle:native-audio-route')).toEqual([]);
      await ReactTestRenderer.act(async () => { renderer.unmount(); });
    } finally {
      ReactNative.Platform.OS = OS;
      ReactNative.Platform.Version = Version;
    }
  });

  it('reports no capability and sends no route events without the native module', async () => {
    delete ReactNative.NativeModules.NativeAudioRouteModule;
    const { renderer, webView } = await renderApp();
    await ReactTestRenderer.act(async () => {
      webView.props.onLoadEnd({ nativeEvent: { url: PAGE_URL } });
    });
    await postFromWeb(webView, { type: 'native_audio_route_request', payload: {} });

    const capabilities = dispatchedEvents(mockInjectedScripts, 'mingle:native-stt')
      .map((event) => event.detail)
      .filter((detail) => detail.type === 'capabilities');
    expect(capabilities).toEqual([{ type: 'capabilities', openAppSettings: true, audioRoute: false, deviceAudioCapture: false }]);
    expect(dispatchedEvents(mockInjectedScripts, 'mingle:native-audio-route')).toEqual([]);

    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
  });
});
