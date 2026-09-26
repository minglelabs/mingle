import { describe, expect, it } from 'vitest'

import { namespaceSupportsPostingFeed } from './api-contract'

describe('namespaceSupportsPostingFeed', () => {
  it('allows the plain web client, which calls the unversioned routes', () => {
    expect(namespaceSupportsPostingFeed('')).toBe(true)
    expect(namespaceSupportsPostingFeed('  ')).toBe(true)
  })

  it('refuses every app namespace before 2.1.0', () => {
    for (const namespace of ['ios/v2.0.4', 'android/v2.0.4', 'ios/v2.0.0', 'ios/v1.1.4', 'android/v1.0.0']) {
      expect(namespaceSupportsPostingFeed(namespace)).toBe(false)
    }
  })

  it('allows 2.1.0 and every later release on both platforms', () => {
    for (const namespace of ['ios/v2.1.0', 'android/v2.1.0', 'ios/v2.1.3', 'android/v2.2.0', 'ios/v3.0.0', '/ios/v2.1.0/']) {
      expect(namespaceSupportsPostingFeed(namespace)).toBe(true)
    }
  })

  it('refuses a malformed namespace rather than guessing', () => {
    expect(namespaceSupportsPostingFeed('web/v9.9.9')).toBe(false)
    expect(namespaceSupportsPostingFeed('ios/latest')).toBe(false)
  })
})
