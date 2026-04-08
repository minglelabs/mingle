import { readPreferredRuntimeValue } from '../src/runtimeConfig';

describe('runtimeConfig', () => {
  it('prefers native runtime values over JS env values', () => {
    expect(readPreferredRuntimeValue('android/v1.0.12', 'ios/v1.0.12')).toBe(
      'android/v1.0.12',
    );
  });

  it('falls back to the JS env value when the native value is blank', () => {
    expect(readPreferredRuntimeValue('', 'android/v1.0.12')).toBe(
      'android/v1.0.12',
    );
  });

  it('trims surrounding whitespace', () => {
    expect(readPreferredRuntimeValue('  android/v1.0.12  ', '  ios/v1.0.12  ')).toBe(
      'android/v1.0.12',
    );
  });
});
