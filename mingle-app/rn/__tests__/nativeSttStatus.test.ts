import {
  isNativeSttServerReadyMessage,
  resolveNativeSttStatusAfterStart,
} from '../src/nativeSttStatus';

describe('native STT status helpers', () => {
  it('does not overwrite a server-confirmed ready status when start resolves later', () => {
    expect(resolveNativeSttStatusAfterStart('ready')).toBe('ready');
    expect(resolveNativeSttStatusAfterStart('running')).toBe('running');
    expect(resolveNativeSttStatusAfterStart('starting')).toBe('running');
  });

  it('recognizes only explicit server ready payloads', () => {
    expect(isNativeSttServerReadyMessage('{"status":"ready"}')).toBe(true);
    expect(isNativeSttServerReadyMessage('{"status":"READY"}')).toBe(true);
    expect(isNativeSttServerReadyMessage('{"status":"running"}')).toBe(false);
    expect(isNativeSttServerReadyMessage('not-json')).toBe(false);
  });
});
