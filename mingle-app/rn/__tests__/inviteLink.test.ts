import {
  buildNativeInviteEventScript,
  parseInstallReferrerInvite,
  parseNativeInviteLink,
} from '../src/inviteLink';

const ORIGIN = 'https://app.example.com';

describe('inviteLink', () => {
  it('reads the invite code from the https invite link of the web host only', () => {
    expect(parseNativeInviteLink('https://app.example.com/i/ab3de', ORIGIN)).toEqual({ code: 'ab3de', source: 'link' });
    expect(parseNativeInviteLink('https://app.example.com/i/AB3DE/?x=1', ORIGIN)).toEqual({ code: 'ab3de', source: 'link' });
    expect(parseNativeInviteLink('https://evil.example.com/i/ab3de', ORIGIN)).toBeNull();
    expect(parseNativeInviteLink('https://app.example.com/p/ab3de', ORIGIN)).toBeNull();
    expect(parseNativeInviteLink('https://app.example.com/i/toolongcode', ORIGIN)).toBeNull();
  });

  it('reads the custom-scheme invite link', () => {
    expect(parseNativeInviteLink('mingle://invite/ab3de', ORIGIN)).toEqual({ code: 'ab3de', source: 'link' });
    expect(parseNativeInviteLink('mingle://invite/ab3de?linkNonce=1', ORIGIN)).toEqual({ code: 'ab3de', source: 'link' });
    expect(parseNativeInviteLink('mingle://profile/ab3de', ORIGIN)).toBeNull();
    expect(parseNativeInviteLink('mingle://invite/nope', ORIGIN)).toBeNull();
  });

  it('reads the invite code from the Play install referrer', () => {
    expect(parseInstallReferrerInvite('invite=ab3de')).toEqual({ code: 'ab3de', source: 'install_referrer' });
    expect(parseInstallReferrerInvite('utm_source=x&invite=ab3de&utm_medium=y')).toEqual({ code: 'ab3de', source: 'install_referrer' });
    expect(parseInstallReferrerInvite('utm_source=google-play&utm_medium=organic')).toBeNull();
    expect(parseInstallReferrerInvite('invite=<script>')).toBeNull();
    expect(parseInstallReferrerInvite(null)).toBeNull();
  });

  it('builds a script that stores and dispatches the invite', () => {
    const script = buildNativeInviteEventScript({ code: 'ab3de', source: 'link' });
    expect(script).toContain('"__MINGLE_PENDING_NATIVE_INVITE"');
    expect(script).toContain('"mingle:native-invite"');
    expect(script).toContain('{"code":"ab3de","source":"link"}');
  });
});
