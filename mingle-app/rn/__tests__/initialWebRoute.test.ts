import {
  namespaceSupportsPostingFeed,
  resolveInitialWebRoute,
} from '../src/initialWebRoute';

describe('namespaceSupportsPostingFeed', () => {
  it('accepts v2.1.0 and above on both platforms', () => {
    expect(namespaceSupportsPostingFeed('ios/v2.1.0')).toBe(true);
    expect(namespaceSupportsPostingFeed('android/v2.1.0')).toBe(true);
    expect(namespaceSupportsPostingFeed('ios/v2.1.3')).toBe(true);
    expect(namespaceSupportsPostingFeed('android/v3.0.0')).toBe(true);
    expect(namespaceSupportsPostingFeed('/ios/v2.1.0/')).toBe(true);
  });

  it('rejects versions below v2.1.0', () => {
    expect(namespaceSupportsPostingFeed('ios/v2.0.0')).toBe(false);
    expect(namespaceSupportsPostingFeed('android/v2.0.9')).toBe(false);
    expect(namespaceSupportsPostingFeed('ios/v1.1.4')).toBe(false);
  });

  it('rejects empty or malformed namespaces (conservative fallback)', () => {
    expect(namespaceSupportsPostingFeed('')).toBe(false);
    expect(namespaceSupportsPostingFeed('  ')).toBe(false);
    expect(namespaceSupportsPostingFeed('ios/2.1.0')).toBe(false);
    expect(namespaceSupportsPostingFeed('web/v2.1.0')).toBe(false);
    expect(namespaceSupportsPostingFeed('ios/vX.Y.Z')).toBe(false);
  });
});

describe('resolveInitialWebRoute', () => {
  it('lands on the feed for posting-capable builds', () => {
    expect(resolveInitialWebRoute('ios/v2.1.0')).toBe('feed');
    expect(resolveInitialWebRoute('android/v2.1.0')).toBe('feed');
  });

  it('stays on the conversation list for older or unknown namespaces', () => {
    expect(resolveInitialWebRoute('ios/v2.0.0')).toBe('conversations');
    expect(resolveInitialWebRoute('')).toBe('conversations');
    expect(resolveInitialWebRoute('garbage')).toBe('conversations');
  });
});
