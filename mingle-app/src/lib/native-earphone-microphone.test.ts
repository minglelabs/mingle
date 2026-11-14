import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import EarphoneMicrophoneNoticeContent from '@/components/LivePhoneDemo/EarphoneMicrophoneNotice'
import { resolveLivePhoneDemoEarphoneModeCopy } from '@/i18n/live-phone-demo-earphone-mode-copy'
import {
  DEFAULT_EARPHONE_MICROPHONE_PICK,
  EARPHONE_MICROPHONE_PICK_STORAGE_KEY,
  getEarphoneMicrophonePickSnapshot,
  parseNativeEarphoneMicrophoneChoiceCapability,
  readEarphoneMicrophonePick,
  resetNativeEarphoneMicrophoneStoresForTests,
  resolveEarphoneMicrophoneEnabled,
  subscribeEarphoneMicrophonePick,
  writeEarphoneMicrophonePick,
} from './native-earphone-microphone'

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    values,
  }
}

afterEach(() => {
  resetNativeEarphoneMicrophoneStoresForTests()
})

describe('earphone microphone choice', () => {
  it('reads the shell flag only from a capabilities message', () => {
    expect(parseNativeEarphoneMicrophoneChoiceCapability({ type: 'capabilities', earphoneMicrophoneChoice: true })).toBe(true)
    expect(parseNativeEarphoneMicrophoneChoiceCapability({ type: 'capabilities' })).toBe(false)
    expect(parseNativeEarphoneMicrophoneChoiceCapability({ type: 'status', earphoneMicrophoneChoice: true })).toBeNull()
    expect(parseNativeEarphoneMicrophoneChoiceCapability(null)).toBeNull()
  })

  it('never asks in the room: the pick lives in the menus only', async () => {
    const { readFileSync } = await import('node:fs')
    const room = readFileSync(new URL('../components/LivePhoneDemo/LivePhoneDemo.tsx', import.meta.url), 'utf8')
    expect(room).not.toContain('EarphoneMicrophoneNoticeContent')
    expect(room).not.toContain('microphoneNoticeTitle')
  })

  it('uses the phone unless the earphones were picked', () => {
    expect(DEFAULT_EARPHONE_MICROPHONE_PICK).toBe('phone')
    expect(resolveEarphoneMicrophoneEnabled(null)).toBe(false)
    expect(resolveEarphoneMicrophoneEnabled('phone')).toBe(false)
    expect(resolveEarphoneMicrophoneEnabled('earphone')).toBe(true)
  })

  it('keeps the pick per device and tells every listener', () => {
    const storage = memoryStorage({ [EARPHONE_MICROPHONE_PICK_STORAGE_KEY]: 'nonsense' })
    expect(readEarphoneMicrophonePick(storage)).toBeNull()
    let calls = 0
    const unsubscribe = subscribeEarphoneMicrophonePick(() => { calls += 1 })
    writeEarphoneMicrophonePick('earphone', storage)
    expect(storage.values.get(EARPHONE_MICROPHONE_PICK_STORAGE_KEY)).toBe('earphone')
    expect(readEarphoneMicrophonePick(storage)).toBe('earphone')
    expect(getEarphoneMicrophonePickSnapshot()).toBe('earphone')
    writeEarphoneMicrophonePick('earphone', storage)
    expect(calls).toBe(1)
    unsubscribe()
  })
})

describe('earphone microphone notice', () => {
  it('shows both microphones with the phone picked and a confirm button', () => {
    const copy = resolveLivePhoneDemoEarphoneModeCopy('ko')
    const html = renderToStaticMarkup(createElement(EarphoneMicrophoneNoticeContent, { copy, onConfirm: () => {} }))
    expect(copy.microphonePhoneLabel).toBe('폰 마이크')
    expect(copy.microphonePhoneDescription).toBe('오프라인 인식을 위해 폰 마이크를 씁니다')
    expect(copy.microphoneEarphoneLabel).toBe('이어폰 마이크')
    expect(copy.microphoneEarphoneDescription).toBe('이어폰 마이크를 쓰면 앱이 내 목소리만 잘 듣고 다른 소리는 거의 인식하지 못합니다')
    expect(html).toContain(copy.microphonePhoneDescription)
    expect(html).toContain(copy.microphoneEarphoneDescription)
    expect(html).toMatch(/aria-checked="true" data-earphone-microphone="phone"/)
    expect(html).toMatch(/aria-checked="false" data-earphone-microphone="earphone"/)
    expect(html).toContain('data-earphone-microphone-confirm')
    expect(html).toContain(copy.noticeConfirmLabel)
  })
})

describe('earphone microphone setting rows', () => {
  it('names the current pick and sits in the room menu and on my page', async () => {
    const { readFileSync } = await import('node:fs')
    const { earphoneMicrophonePickLabel } = await import('@/components/LivePhoneDemo/EarphoneMicrophoneSetting')
    const copy = resolveLivePhoneDemoEarphoneModeCopy('ko')
    expect(copy.microphoneMenuLabel).toBe('이어폰 착용 시 마이크')
    expect(earphoneMicrophonePickLabel(copy, 'phone')).toBe('폰 마이크')
    expect(earphoneMicrophonePickLabel(copy, 'earphone')).toBe('이어폰 마이크')
    const room = readFileSync(new URL('../components/LivePhoneDemo/LivePhoneDemo.tsx', import.meta.url), 'utf8')
    const myPage = readFileSync(new URL('../components/my-page.tsx', import.meta.url), 'utf8')
    expect(room).toContain('data-qa="live-demo-menu-earphone-microphone"')
    expect(myPage).toContain('data-testid="menu-earphone-microphone"')
  })
})
