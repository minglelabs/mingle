import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyNativeAccountHint, parseAccountHint, saveNativeAccountHint } from '@/lib/account-hint'
import { readLastSignInMethod, saveLastSignInMethod } from '@/lib/last-sign-in-method'
import { isHaveAccountSkipPending } from '@/lib/onboarding-draft'
import { isSpeakTrialDone } from '@/lib/speak-trial'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const setHint = (value: unknown) => {
  (window as unknown as Record<string, unknown>).__MINGLE_NATIVE_ACCOUNT_HINT = value
}

// No browser in these tests: a window with a plain in-memory storage.
const memory = new Map<string, string>()
vi.stubGlobal('window', {
  localStorage: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, String(value)) },
    removeItem: (key: string) => { memory.delete(key) },
    clear: () => memory.clear(),
  },
})

describe('the keychain account note', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setHint(undefined)
  })

  it('reads only a known sign-in method', () => {
    expect(parseAccountHint('{"v":1,"method":"apple"}')).toEqual({ v: 1, method: 'apple' })
    expect(parseAccountHint('{"v":1,"method":"token"}')).toBeNull()
    expect(parseAccountHint('{"v":2,"method":"apple"}')).toBeNull()
    expect(parseAccountHint('{')).toBeNull()
    expect(parseAccountHint(undefined)).toBeNull()
  })

  it('sends a reinstall straight to sign-in, once, and checks the account afterwards', () => {
    setHint('{"v":1,"method":"google"}')
    const done = vi.fn()
    expect(applyNativeAccountHint(done)).toBe(true)
    expect(done).toHaveBeenCalledTimes(1)
    expect(readLastSignInMethod()).toBe('google')
    expect(isSpeakTrialDone()).toBe(true)
    expect(isHaveAccountSkipPending()).toBe(true)
    expect(applyNativeAccountHint(done)).toBe(false)
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('leaves an install that signed in here alone, and does nothing without a note', () => {
    const done = vi.fn()
    expect(applyNativeAccountHint(done)).toBe(false)
    saveLastSignInMethod('email')
    setHint('{"v":1,"method":"google"}')
    expect(applyNativeAccountHint(done)).toBe(false)
    expect(readLastSignInMethod()).toBe('email')
    expect(done).not.toHaveBeenCalled()
  })

  it('asks the shell to keep the note, and the shell keeps it in the keychain', () => {
    const postMessage = vi.fn()
    ;(window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView = { postMessage }
    saveNativeAccountHint('apple')
    saveNativeAccountHint(null)
    expect(postMessage).toHaveBeenCalledTimes(1)
    expect(JSON.parse(postMessage.mock.calls[0][0])).toEqual({ type: 'native_account_hint_save', payload: { hint: '{"v":1,"method":"apple"}' } })
    delete (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView
    expect(read('rn/ios/mingle/NativeSTTModule.swift')).toContain('"accountHint": readAccountHint()')
    expect(read('rn/App.tsx')).toContain("parsed.type === 'native_account_hint_save'")
    expect(read('src/components/conversation-list.tsx')).toContain('applyNativeAccountHint(() => markLanguageOnboardingConfirmed())')
  })
})
