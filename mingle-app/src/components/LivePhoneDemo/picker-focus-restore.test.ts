import { describe, expect, it, vi } from 'vitest'
import {
  PICKER_FOCUS_RESTORE_DELAY_MS,
  captureRestorableFocus,
  scheduleFocusRestore,
} from './picker-focus-restore'

function makeControl(tagName: string, extra: Record<string, unknown> = {}) {
  return {
    tagName,
    isConnected: true,
    focus: vi.fn(),
    ...extra,
  }
}

function makeTimers() {
  const pending = new Map<number, () => void>()
  let nextId = 1
  return {
    pending,
    setTimeout: vi.fn((handler: () => void) => {
      const id = nextId++
      pending.set(id, handler)
      return id
    }),
    clearTimeout: vi.fn((id: never) => {
      pending.delete(id as unknown as number)
    }),
    flush() {
      for (const [id, handler] of [...pending]) {
        pending.delete(id)
        handler()
      }
    },
  }
}

describe('captureRestorableFocus', () => {
  it('captures a focused textarea', () => {
    const textarea = makeControl('TEXTAREA')
    expect(captureRestorableFocus({ activeElement: textarea })).toBe(textarea)
  })

  it('captures text-like inputs but not the file input itself', () => {
    expect(captureRestorableFocus({ activeElement: makeControl('INPUT', { type: 'text' }) })).not.toBeNull()
    expect(captureRestorableFocus({ activeElement: makeControl('INPUT', { type: 'file' }) })).toBeNull()
  })

  it('ignores buttons, the body, and a missing document (voice mode)', () => {
    expect(captureRestorableFocus({ activeElement: makeControl('BUTTON') })).toBeNull()
    expect(captureRestorableFocus({ activeElement: makeControl('BODY') })).toBeNull()
    expect(captureRestorableFocus({ activeElement: null })).toBeNull()
    expect(captureRestorableFocus(null)).toBeNull()
  })
})

describe('scheduleFocusRestore', () => {
  it('refocuses after the iOS delay without scrolling', () => {
    const textarea = makeControl('TEXTAREA')
    const timers = makeTimers()
    const doc = { activeElement: null as unknown }
    scheduleFocusRestore(textarea, { doc, timers })

    expect(timers.setTimeout).toHaveBeenCalledWith(expect.any(Function), PICKER_FOCUS_RESTORE_DELAY_MS)
    expect(textarea.focus).not.toHaveBeenCalled()
    timers.flush()
    expect(textarea.focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('skips a control that left the DOM (switched to voice mode) or already has focus', () => {
    const detached = makeControl('TEXTAREA', { isConnected: false })
    const timers = makeTimers()
    scheduleFocusRestore(detached, { doc: { activeElement: null }, timers })
    timers.flush()
    expect(detached.focus).not.toHaveBeenCalled()

    const focused = makeControl('TEXTAREA')
    scheduleFocusRestore(focused, { doc: { activeElement: focused }, timers })
    timers.flush()
    expect(focused.focus).not.toHaveBeenCalled()
  })

  it('skips the refocus when focus already moved to another element', () => {
    const textarea = makeControl('TEXTAREA')
    const other = makeControl('INPUT', { type: 'search' })
    const body = makeControl('BODY')
    const timers = makeTimers()
    scheduleFocusRestore(textarea, { doc: { activeElement: other, body }, timers })
    timers.flush()
    expect(textarea.focus).not.toHaveBeenCalled()
  })

  it('still refocuses when only the body or document element holds focus', () => {
    const body = makeControl('BODY')
    const documentElement = makeControl('HTML')
    const timers = makeTimers()

    const fromBody = makeControl('TEXTAREA')
    scheduleFocusRestore(fromBody, { doc: { activeElement: body, body, documentElement }, timers })
    timers.flush()
    expect(fromBody.focus).toHaveBeenCalledWith({ preventScroll: true })

    const fromRoot = makeControl('TEXTAREA')
    scheduleFocusRestore(fromRoot, { doc: { activeElement: documentElement, body, documentElement }, timers })
    timers.flush()
    expect(fromRoot.focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('can be cancelled before it fires', () => {
    const textarea = makeControl('TEXTAREA')
    const timers = makeTimers()
    const cancel = scheduleFocusRestore(textarea, { doc: { activeElement: null }, timers })
    cancel()
    timers.flush()
    expect(textarea.focus).not.toHaveBeenCalled()
    expect(timers.clearTimeout).toHaveBeenCalled()
  })
})
