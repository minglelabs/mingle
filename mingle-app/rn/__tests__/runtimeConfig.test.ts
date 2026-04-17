import { readPreferredRuntimeValue } from '../src/runtimeConfig';

describe('runtimeConfig', () => {
  it('prefers native runtime values over JS env values', () => {
    expect(readPreferredRuntimeValue('android/v1.1.1', 'ios/v1.1.1')).toBe(
      'android/v1.1.1',
    );
  });

  it('falls back to the JS env value when the native value is blank', () => {
    expect(readPreferredRuntimeValue('', 'android/v1.1.1')).toBe(
      'android/v1.1.1',
    );
  });

  it('trims surrounding whitespace', () => {
    expect(readPreferredRuntimeValue('  android/v1.1.1  ', '  ios/v1.1.1  ')).toBe(
      'android/v1.1.1',
    );
  });

  it('decodes plist-style quoted URLs from the native runtime config', () => {
    expect(
      readPreferredRuntimeValue(
        '"wss:\\/\\/mingle-stt-devbox.photo-for-passport.com"',
        'wss://fallback.example.com',
      ),
    ).toBe('wss://mingle-stt-devbox.photo-for-passport.com');
  });
});
