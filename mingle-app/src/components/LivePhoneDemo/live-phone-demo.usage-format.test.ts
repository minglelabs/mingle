import { describe, expect, it } from 'vitest'
import {
  formatLivePhoneDemoMessageCount,
  formatLivePhoneDemoUsageDuration,
} from './live-phone-demo.usage-format'

describe('formatLivePhoneDemoUsageDuration', () => {
  it('keeps second-only output below one minute', () => {
    expect(formatLivePhoneDemoUsageDuration(59)).toBe('59s')
  })

  it('shows minutes and seconds at one minute or more', () => {
    expect(formatLivePhoneDemoUsageDuration(60)).toBe('1m 0s')
    expect(formatLivePhoneDemoUsageDuration(141)).toBe('2m 21s')
  })

  it('shows hours, minutes, and seconds at one hour or more', () => {
    expect(formatLivePhoneDemoUsageDuration(14_534)).toBe('4h 2m 14s')
  })

  it('floors decimals and clamps invalid values to zero', () => {
    expect(formatLivePhoneDemoUsageDuration(3.9)).toBe('3s')
    expect(formatLivePhoneDemoUsageDuration(-5)).toBe('0s')
    expect(formatLivePhoneDemoUsageDuration(Number.NaN)).toBe('0s')
    expect(formatLivePhoneDemoUsageDuration(null)).toBe('0s')
  })

  it('formats compact saved message counts', () => {
    expect(formatLivePhoneDemoMessageCount(0)).toBe('0 msgs')
    expect(formatLivePhoneDemoMessageCount(1)).toBe('1 msg')
    expect(formatLivePhoneDemoMessageCount(3.9)).toBe('3 msgs')
    expect(formatLivePhoneDemoMessageCount(-1)).toBe('0 msgs')
    expect(formatLivePhoneDemoMessageCount(null)).toBe('0 msgs')
  })
})
