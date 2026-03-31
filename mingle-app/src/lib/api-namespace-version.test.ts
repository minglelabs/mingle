import { describe, expect, it } from 'vitest'

import {
  isLegacySonioxSilenceSliderNamespace,
  parseApiNamespaceVersion,
} from './api-namespace-version'

describe('parseApiNamespaceVersion', () => {
  it('parses ios and android namespaces with trimming', () => {
    expect(parseApiNamespaceVersion(' /ios/v1.0.4/ ')).toEqual({
      platform: 'ios',
      version: [1, 0, 4],
    })

    expect(parseApiNamespaceVersion('android/v1.0.5')).toEqual({
      platform: 'android',
      version: [1, 0, 5],
    })
  })

  it('returns null for invalid namespaces', () => {
    expect(parseApiNamespaceVersion('')).toBeNull()
    expect(parseApiNamespaceVersion('web/v1.0.4')).toBeNull()
    expect(parseApiNamespaceVersion('ios/v1.0')).toBeNull()
  })
})

describe('isLegacySonioxSilenceSliderNamespace', () => {
  it('locks namespaces at or below v1.0.4', () => {
    expect(isLegacySonioxSilenceSliderNamespace('ios/v1.0.4')).toBe(true)
    expect(isLegacySonioxSilenceSliderNamespace('android/v1.0.3')).toBe(true)
  })

  it('does not lock namespaces above v1.0.4', () => {
    expect(isLegacySonioxSilenceSliderNamespace('ios/v1.0.5')).toBe(false)
    expect(isLegacySonioxSilenceSliderNamespace('android/v1.1.0')).toBe(false)
  })

  it('does not lock invalid namespaces', () => {
    expect(isLegacySonioxSilenceSliderNamespace('')).toBe(false)
    expect(isLegacySonioxSilenceSliderNamespace('web/v1.0.4')).toBe(false)
  })
})
