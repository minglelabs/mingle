import { describe, expect, it } from 'vitest'
import { namespaceSupportsSpeakerMode } from './api-contract'

describe('namespaceSupportsSpeakerMode', () => {
  it.each([
    ['ios/v2.3.2', true],
    ['android/v2.3.2', true],
    ['ios/v2.3.3', true],
    ['android/v2.4.0', true],
    ['ios/v3.0.0', true],
    ['ios/v2.3.1', false],
    ['android/v2.3.0', false],
    ['ios/v2.2.1', false],
    ['android/v2.1.0', false],
  ])('%s -> %s', (namespace, expected) => {
    expect(namespaceSupportsSpeakerMode(namespace)).toBe(expected)
  })

  it('is never on for plain web or an unreadable namespace', () => {
    expect(namespaceSupportsSpeakerMode('')).toBe(false)
    expect(namespaceSupportsSpeakerMode('web')).toBe(false)
    expect(namespaceSupportsSpeakerMode('ios/v2.3')).toBe(false)
  })
})
