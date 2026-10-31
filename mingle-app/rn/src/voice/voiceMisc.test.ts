import { fractionFromTouch, percentLabel } from './sliderMath';
import { resolveVoiceConfig } from './voiceConfig';
import { resolveVoiceStrings, voiceString } from './voiceStrings';

describe('fractionFromTouch', () => {
  it('clamps and maps to 0..1', () => {
    expect(fractionFromTouch(0, 200)).toBe(0);
    expect(fractionFromTouch(100, 200)).toBe(0.5);
    expect(fractionFromTouch(200, 200)).toBe(1);
    expect(fractionFromTouch(-10, 200)).toBe(0);
    expect(fractionFromTouch(999, 200)).toBe(1);
  });
  it('returns 0 for a zero/invalid width', () => {
    expect(fractionFromTouch(50, 0)).toBe(0);
    expect(fractionFromTouch(50, NaN)).toBe(0);
  });
});

describe('percentLabel', () => {
  it('formats a rounded percentage', () => {
    expect(percentLabel(0.25)).toBe('25%');
    expect(percentLabel(1)).toBe('100%');
    expect(percentLabel(1.4)).toBe('100%');
  });
});

describe('resolveVoiceConfig', () => {
  it('derives ko strings + lang from a Korean locale and trims base url', () => {
    const cfg = resolveVoiceConfig({
      webAppBaseUrl: 'https://x.app/',
      validatedApiNamespace: 'ios/v2.3.0',
      deviceLocaleTag: 'ko-KR',
    });
    expect(cfg).toEqual({ baseUrl: 'https://x.app', apiNamespace: 'ios/v2.3.0', primaryLocale: 'ko', myLang: 'ko' });
  });
  it('honors an explicit preferred language', () => {
    const cfg = resolveVoiceConfig({
      webAppBaseUrl: 'https://x.app',
      validatedApiNamespace: '',
      deviceLocaleTag: 'en-US',
      preferredLang: 'ja',
    });
    expect(cfg.myLang).toBe('ja');
    expect(cfg.primaryLocale).toBe('en');
  });
});

describe('voice strings', () => {
  it('is Korean-first and falls back to en for other locales', () => {
    expect(resolveVoiceStrings('ko')).toBe(resolveVoiceStrings('ko-KR'));
    expect(voiceString('ko', 'bannerJoin')).toBe('참여');
    expect(voiceString('fr', 'bannerJoin')).toBe('Join');
  });
});
