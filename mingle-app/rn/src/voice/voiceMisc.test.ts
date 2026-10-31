import { resolveVoiceConfig } from './voiceConfig';

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
