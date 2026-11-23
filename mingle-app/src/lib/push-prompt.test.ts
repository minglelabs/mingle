import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import { PUSH_PROMPT_COPY_LOCALES, resolvePushPromptCopy } from '@/i18n/push-prompt-copy'
import { LS_KEY_PUSH_PROMPT_HOLD_UNTIL, PUSH_PROMPT_HOLD_MS, holdPushPrompt, isPushPromptHeld, releasePushPrompt } from './push-prompt'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  }
}

// Owner decision, 2026-11-20: a new account lands on Home, and notifications
// are asked after the first conversation, with a reason.
describe('notification prompt timing', () => {
  it('holds a new device for a day, and never holds one that did not go through the onboarding here', () => {
    const storage = memoryStorage()
    expect(isPushPromptHeld(1_000, storage)).toBe(false)
    holdPushPrompt(1_000, storage)
    expect(isPushPromptHeld(1_000, storage)).toBe(true)
    expect(isPushPromptHeld(1_000 + PUSH_PROMPT_HOLD_MS - 1, storage)).toBe(true)
    // Never answered: the hold runs out and the app asks at launch as before.
    expect(isPushPromptHeld(1_000 + PUSH_PROMPT_HOLD_MS, storage)).toBe(false)
  })

  it('keeps the first hold and ends it on release', () => {
    const storage = memoryStorage()
    holdPushPrompt(1_000, storage)
    holdPushPrompt(50_000, storage)
    expect(storage.getItem(LS_KEY_PUSH_PROMPT_HOLD_UNTIL)).toBe(String(1_000 + PUSH_PROMPT_HOLD_MS))
    releasePushPrompt(storage)
    expect(isPushPromptHeld(2_000, storage)).toBe(false)
  })

  it('has the sheet in every app language', () => {
    expect([...PUSH_PROMPT_COPY_LOCALES].sort()).toEqual([...PRIMARY_UI_LOCALES].sort())
    for (const locale of PRIMARY_UI_LOCALES) {
      for (const [key, value] of Object.entries(resolvePushPromptCopy(locale))) expect(value.trim(), `${locale}.${key}`).not.toBe('')
    }
  })

  it('is wired: no system prompt while held, the sheet after leaving a room, then the system prompt on a tap', () => {
    const registration = read('../components/native-push-registration.tsx')
    expect(registration).toContain('if (!isPushPromptHeld()) postNativePushRegister();')
    expect(registration).toContain('document.visibilityState === "visible" && !isPushPromptHeld()')
    const list = read('../components/conversation-list.tsx')
    expect(list).toContain('holdPushPrompt();')
    expect(list).toContain('if (leftARoom && requestPushPrompt()) {')
    const sheet = read('../components/push-permission-prompt.tsx')
    expect(sheet).toContain('releasePushPrompt();')
    expect(sheet).toContain('postNativePushRegister();')
    expect(read('../app/layout.tsx')).toContain('<PushPermissionPrompt />')
  })

  it('sends a new account to Home after sign-in, with the say-something card there', () => {
    const list = read('../components/conversation-list.tsx')
    expect(list).toContain('router.replace(buildNativeAwareTabPath(homeHref(locale), params, { tabRoot: true }));')
    expect(list).toContain('if (params.get("firstSpeak") !== "1") return;')
    const home = read('../components/home/home-feed-layer.tsx')
    expect(home).toContain('data-qa="home-first-speak-card"')
    expect(home).toContain('firstSpeak=1`);')
    // Signing in can reload the page or bring it back to Chats: the move holds until Home is on screen.
    expect(list).toContain('if (activeConversation !== null || !shouldGoHomeAfterSignIn()) return;')
    expect(home).toContain('clearSignedOutHere();')
  })
})
