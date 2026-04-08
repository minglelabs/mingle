import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  resolveKeyboardViewportInsetPx,
  resolveHydratedComposerOpenState,
  resolveLivePhoneDemoComposerCopy,
} from './LivePhoneDemo'

describe('live phone demo composer logic', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns localized composer copy for Korean locale', () => {
    expect(resolveLivePhoneDemoComposerCopy('ko')).toEqual({
      manualSpeakerLabel: '나',
      openKeyboardLabel: '텍스트 입력 열기',
      closeKeyboardLabel: '텍스트 입력 닫기',
      composerPlaceholder: '메시지를 입력하세요',
      sendMessageLabel: '메시지 보내기',
    })
  })

  it('falls back to English composer copy for unknown locales', () => {
    expect(resolveLivePhoneDemoComposerCopy('de')).toEqual({
      manualSpeakerLabel: 'You',
      openKeyboardLabel: 'Open text input',
      closeKeyboardLabel: 'Close text input',
      composerPlaceholder: 'Type a message',
      sendMessageLabel: 'Send message',
    })
  })

  it('derives keyboard inset from visual viewport shrink', () => {
    vi.stubGlobal('window', {
      innerHeight: 900,
    })

    expect(resolveKeyboardViewportInsetPx({
      height: 620,
      offsetTop: 12,
    } as VisualViewport)).toBe(268)
  })

  it('keeps the current composer state when no persisted input mode exists', () => {
    expect(resolveHydratedComposerOpenState({
      currentIsComposerOpen: true,
      persistedInputMode: null,
    })).toBe(true)

    expect(resolveHydratedComposerOpenState({
      currentIsComposerOpen: false,
      persistedInputMode: null,
    })).toBe(false)
  })

  it('restores the persisted input mode when one exists', () => {
    expect(resolveHydratedComposerOpenState({
      currentIsComposerOpen: false,
      persistedInputMode: 'text',
    })).toBe(true)

    expect(resolveHydratedComposerOpenState({
      currentIsComposerOpen: true,
      persistedInputMode: 'voice',
    })).toBe(false)
  })
})
