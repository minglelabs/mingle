import { readPreferredRuntimeValue } from '../src/runtimeConfig';

describe('runtimeConfig', () => {
  it('prefers native runtime values over JS env values', () => {
    expect(readPreferredRuntimeValue('android/v1.0.11', 'ios/v1.0.11')).toBe(
      'android/v1.0.11',
    );
  });

  it('falls back to the JS env value when the native value is blank', () => {
    expect(readPreferredRuntimeValue('', 'android/v1.0.11')).toBe(
      'android/v1.0.11',
    );
  });

  it('trims surrounding whitespace', () => {
    expect(readPreferredRuntimeValue('  android/v1.0.11  ', '  ios/v1.0.11  ')).toBe(
      'android/v1.0.11',
    );
  });
});
