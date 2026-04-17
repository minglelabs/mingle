import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  resolveKeyboardViewportInsetPx,
  resolveHydratedComposerOpenState,
  resolveNativeBottomBannerOverlayInsetPx,
  resolveScrollToBottomButtonBottomPx,
  resizeComposerTextarea,
} from './LivePhoneDemo'
import { resolveLivePhoneDemoComposerCopy } from '@/i18n/live-phone-demo-composer-copy'

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

  it('falls back to English composer copy for locales outside the primary UI set', () => {
    expect(resolveLivePhoneDemoComposerCopy('pl')).toEqual({
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

  it('raises the scroll-to-bottom button above a bottom banner in native runtime', () => {
    expect(resolveScrollToBottomButtonBottomPx({
      baseBottomPx: 24,
      isNativeAppRuntime: true,
      displayedAdBannerPosition: 'bottom',
      bottomBannerInsetPx: 50,
    })).toBe(74)
  })

  it('keeps the scroll-to-bottom button at the base offset without a bottom banner', () => {
    expect(resolveScrollToBottomButtonBottomPx({
      baseBottomPx: 24,
      isNativeAppRuntime: true,
      displayedAdBannerPosition: 'top',
      bottomBannerInsetPx: 50,
    })).toBe(24)

    expect(resolveScrollToBottomButtonBottomPx({
      baseBottomPx: 24,
      isNativeAppRuntime: false,
      displayedAdBannerPosition: 'bottom',
      bottomBannerInsetPx: 50,
    })).toBe(24)
  })

  it('strips bottom bar clearance from the reported native bottom inset', () => {
    expect(resolveNativeBottomBannerOverlayInsetPx({
      isNativeAppRuntime: true,
      displayedAdBannerPosition: 'bottom',
      reportedBottomInsetPx: 154,
      bottomBarClearancePx: 104,
      estimatedBottomBannerInsetPx: 50,
    })).toBe(50)
  })

  it('falls back to the estimated banner height before clearance sync arrives', () => {
    expect(resolveNativeBottomBannerOverlayInsetPx({
      isNativeAppRuntime: true,
      displayedAdBannerPosition: 'bottom',
      reportedBottomInsetPx: 154,
      bottomBarClearancePx: null,
      estimatedBottomBannerInsetPx: 50,
    })).toBe(50)
  })

  it('keeps the reported inset when the native payload already excludes clearance', () => {
    expect(resolveNativeBottomBannerOverlayInsetPx({
      isNativeAppRuntime: true,
      displayedAdBannerPosition: 'bottom',
      reportedBottomInsetPx: 50,
      bottomBarClearancePx: 104,
      estimatedBottomBannerInsetPx: 50,
    })).toBe(50)
  })

  it('keeps a near-estimated Android bottom banner inset instead of subtracting bottom bar clearance again', () => {
    expect(resolveNativeBottomBannerOverlayInsetPx({
      isNativeAppRuntime: true,
      displayedAdBannerPosition: 'bottom',
      reportedBottomInsetPx: 56,
      bottomBarClearancePx: 54,
      estimatedBottomBannerInsetPx: 55,
    })).toBe(56)
  })

  it('shrinks the composer textarea height when content becomes shorter again', () => {
    const style = {
      height: '104px',
      lineHeight: '',
      overflowY: 'auto',
    } as unknown as CSSStyleDeclaration
    const textarea = {
      style,
      scrollHeight: 84,
    } as unknown as HTMLTextAreaElement

    expect(resizeComposerTextarea(textarea)).toBe(84)
    expect(style.height).toBe('84px')
    expect(style.overflowY).toBe('hidden')

    ;(textarea as { scrollHeight: number }).scrollHeight = 18

    expect(resizeComposerTextarea(textarea)).toBe(36)
    expect(style.height).toBe('36px')
    expect(style.overflowY).toBe('hidden')
  })

  it('caps composer textarea height and enables internal scrolling at the max height', () => {
    const style = {
      height: '',
      lineHeight: '',
      overflowY: 'hidden',
    } as unknown as CSSStyleDeclaration
    const textarea = {
      style,
      scrollHeight: 180,
    } as unknown as HTMLTextAreaElement

    expect(resizeComposerTextarea(textarea)).toBe(104)
    expect(style.height).toBe('104px')
    expect(style.overflowY).toBe('auto')
  })
})
