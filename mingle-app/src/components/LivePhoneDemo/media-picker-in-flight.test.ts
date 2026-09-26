import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MEDIA_PICKER_IN_FLIGHT_TIMEOUT_MS,
  beginMediaPickerInFlight,
  endMediaPickerInFlight,
  isMediaPickerInFlight,
  subscribeMediaPickerInFlight,
} from './media-picker-in-flight'

afterEach(() => {
  endMediaPickerInFlight()
  vi.useRealTimers()
})

describe('media-picker-in-flight signal', () => {
  it('starts cleared and toggles on begin/end', () => {
    expect(isMediaPickerInFlight()).toBe(false)
    beginMediaPickerInFlight(0)
    expect(isMediaPickerInFlight()).toBe(true)
    endMediaPickerInFlight()
    expect(isMediaPickerInFlight()).toBe(false)
  })

  it('notifies subscribers only on real transitions', () => {
    const seen: boolean[] = []
    const unsubscribe = subscribeMediaPickerInFlight(v => seen.push(v))
    beginMediaPickerInFlight(0)
    beginMediaPickerInFlight(0) // no-op: already in flight
    endMediaPickerInFlight()
    endMediaPickerInFlight() // no-op: already cleared
    unsubscribe()
    expect(seen).toEqual([true, false])
  })

  it('auto-clears after the safety timeout so a missed close cannot wedge it on', () => {
    vi.useFakeTimers()
    beginMediaPickerInFlight()
    expect(isMediaPickerInFlight()).toBe(true)
    vi.advanceTimersByTime(MEDIA_PICKER_IN_FLIGHT_TIMEOUT_MS - 1)
    expect(isMediaPickerInFlight()).toBe(true)
    vi.advanceTimersByTime(1)
    expect(isMediaPickerInFlight()).toBe(false)
  })

  it('re-arms the timeout on a repeated begin', () => {
    vi.useFakeTimers()
    beginMediaPickerInFlight()
    vi.advanceTimersByTime(MEDIA_PICKER_IN_FLIGHT_TIMEOUT_MS - 10)
    beginMediaPickerInFlight() // re-arm
    vi.advanceTimersByTime(20)
    expect(isMediaPickerInFlight()).toBe(true)
    vi.advanceTimersByTime(MEDIA_PICKER_IN_FLIGHT_TIMEOUT_MS)
    expect(isMediaPickerInFlight()).toBe(false)
  })

  it('isolates listener errors from other subscribers', () => {
    const good: boolean[] = []
    const unsubBad = subscribeMediaPickerInFlight(() => { throw new Error('boom') })
    const unsubGood = subscribeMediaPickerInFlight(v => good.push(v))
    expect(() => beginMediaPickerInFlight(0)).not.toThrow()
    unsubBad()
    unsubGood()
    expect(good).toEqual([true])
  })
})

describe('composer marks a picker in flight around the file input', () => {
  const composer = readFileSync(new URL('./ConversationImageComposer.tsx', import.meta.url), 'utf8')

  it('begins the in-flight window right before every native chooser open', () => {
    expect(composer).toContain("import { beginMediaPickerInFlight, endMediaPickerInFlight } from './media-picker-in-flight'")
    // Both click paths route through openFilePicker, never a raw input.current?.click() call.
    expect(composer).toContain('const openFilePicker = useCallback(() => {')
    expect(composer).toContain('beginMediaPickerInFlight()')
    expect(composer.includes('input.current?.click()')).toBe(true)
    // The two USER-triggered open sites must both use openFilePicker.
    expect(composer).toContain('if (!onCloseKeyboard) {\n      openFilePicker()')
    expect(composer).toContain("stopPropagation(); openFilePicker() }")
  })

  it('clears the in-flight window on change and on focus/visibility return', () => {
    expect(composer).toContain('onChange={event => {\n        endMediaPickerInFlight()')
    expect(composer).toContain("window.addEventListener('focus', handleReturn)")
    expect(composer).toContain("document.addEventListener('visibilitychange', handleReturn)")
  })
})

describe('STT background recovery yields to an in-flight picker', () => {
  const hook = readFileSync(new URL('./use-realtime-stt.ts', import.meta.url), 'utf8')

  it('imports the shared signal', () => {
    expect(hook).toContain("import { isMediaPickerInFlight } from './media-picker-in-flight'")
  })

  it('skips background mark and recovery in all three return handlers while a picker is in flight', () => {
    const start = hook.indexOf('const handleVisibilityChange = () => {')
    const end = hook.indexOf('const handleFocus = () => {', start)
    const focusEnd = hook.indexOf('}', hook.indexOf('const handleFocus = () => {'))
    const region = hook.slice(start, focusEnd + 1)
    // visibility, pageshow, focus each guard on isMediaPickerInFlight()
    const guards = region.match(/if \(isMediaPickerInFlight\(\)\) return/g) ?? []
    expect(guards.length).toBeGreaterThanOrEqual(2)
    expect(hook.slice(start).includes('if (isMediaPickerInFlight()) return')).toBe(true)
    // Guard sits before the background mark in the visibility handler.
    const visRegion = hook.slice(start, end)
    expect(visRegion.indexOf('if (isMediaPickerInFlight()) return'))
      .toBeLessThan(visRegion.indexOf('wasBackgroundedRef.current = true'))
  })
})
