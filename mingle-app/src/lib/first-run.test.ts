import { describe, expect, it } from 'vitest'
import {
  clearDiscoveryPromptDue,
  completeFirstSpeak,
  isDiscoveryPromptDue,
  isFirstSpeakPending,
  markFirstSpeakPending,
  isDocumentLoadedOnFeed,
  shouldOpenConversationsInsteadOfFeed,
} from '@/lib/first-run'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

describe('first run flags', () => {
  it('is not pending on a device that never ran the short onboarding', () => {
    const storage = memoryStorage()
    expect(isFirstSpeakPending(storage)).toBe(false)
    expect(completeFirstSpeak(storage)).toBe(false)
    expect(isDiscoveryPromptDue(storage)).toBe(false)
  })

  it('ends once on the first translation and makes the discovery question due', () => {
    const storage = memoryStorage()
    markFirstSpeakPending(storage)
    expect(isFirstSpeakPending(storage)).toBe(true)
    expect(completeFirstSpeak(storage)).toBe(true)
    expect(isFirstSpeakPending(storage)).toBe(false)
    expect(isDiscoveryPromptDue(storage)).toBe(true)
    expect(completeFirstSpeak(storage)).toBe(false)
    clearDiscoveryPromptDue(storage)
    expect(isDiscoveryPromptDue(storage)).toBe(false)
  })

  it('survives a storage that throws', () => {
    const broken = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
    }
    expect(() => markFirstSpeakPending(broken)).not.toThrow()
    expect(isFirstSpeakPending(broken)).toBe(false)
  })
})

describe('shouldOpenConversationsInsteadOfFeed', () => {
  const base = { isNativeApp: true, launchedOnFeed: true, onboardingConfirmed: false, firstSpeakPending: false, hasPostTarget: false }

  it('sends a brand-new app install to the conversation list', () => {
    expect(shouldOpenConversationsInsteadOfFeed(base)).toBe(true)
  })

  it('keeps sending it there until the first translation', () => {
    expect(shouldOpenConversationsInsteadOfFeed({ ...base, onboardingConfirmed: true, firstSpeakPending: true })).toBe(true)
  })

  it('leaves the feed as home once the first run is over, and for existing users', () => {
    expect(shouldOpenConversationsInsteadOfFeed({ ...base, onboardingConfirmed: true })).toBe(false)
  })

  it('never moves a launch that points at a post', () => {
    expect(shouldOpenConversationsInsteadOfFeed({ ...base, hasPostTarget: true })).toBe(false)
  })

  it('leaves the web feed alone', () => {
    expect(shouldOpenConversationsInsteadOfFeed({ ...base, isNativeApp: false })).toBe(false)
  })

  it('never moves the Home tab or a back step during the first run', () => {
    expect(shouldOpenConversationsInsteadOfFeed({ ...base, firstSpeakPending: true, launchedOnFeed: false })).toBe(false)
  })
})

describe('isDocumentLoadedOnFeed', () => {
  it('is true only for a page that was loaded on the feed', () => {
    expect(isDocumentLoadedOnFeed('https://x.app/ko/feed?nativeUi=1', '/ko/feed')).toBe(true)
    expect(isDocumentLoadedOnFeed('https://x.app/ko/conversations?nativeUi=1', '/ko/feed')).toBe(false)
    expect(isDocumentLoadedOnFeed('https://x.app/ko/users/abc', '/ko/feed')).toBe(false)
  })

  it('falls back to the current path without a navigation entry', () => {
    expect(isDocumentLoadedOnFeed(null, '/ko/feed')).toBe(true)
    expect(isDocumentLoadedOnFeed(null, '/ko/posts/1')).toBe(false)
  })
})
