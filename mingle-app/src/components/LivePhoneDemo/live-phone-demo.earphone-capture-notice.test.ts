import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import EarphoneCaptureSourceNoticeContent from './EarphoneCaptureSourceNotice'
import { resolveLivePhoneDemoEarphoneModeCopy } from '@/i18n/live-phone-demo-earphone-mode-copy'

const liveDemoSource = readFileSync(new URL('./LivePhoneDemo.tsx', import.meta.url), 'utf8')

describe('capture-source question when earphones go in', () => {
  it('explains why, offers both sources with this device picked, and confirms', () => {
    const copy = resolveLivePhoneDemoEarphoneModeCopy('ko')
    const html = renderToStaticMarkup(createElement(EarphoneCaptureSourceNoticeContent, {
      copy,
      deviceAudioViaBroadcast: true,
      onConfirm: () => {},
    }))
    expect(html).toContain(copy.earphoneCaptureNoticeTitle)
    expect(html).toContain(copy.earphoneCaptureNoticeBody)
    expect(html).toMatch(/aria-checked="false" data-capture-source="microphone"/)
    expect(html).toMatch(/aria-checked="true" data-capture-source="device_audio"/)
    expect(html).toContain(copy.captureSourceDeviceAudioHintIos)
    expect(html).toContain('data-earphone-capture-source-confirm')
  })

  it('switches a running session to device audio and listens again', () => {
    expect(liveDemoSource).toContain('deviceAudioOptIn,\n    pick: sttCaptureSourcePick,')
    expect(liveDemoSource).toContain('setDeviceAudioOptIn(true)')
    expect(liveDemoSource).toContain('captureSourceRestartPendingRef.current = isSttSessionRunning')
    // Every earphone-mode edge drops the opt-in with the pick.
    expect(liveDemoSource).toContain("setSttCaptureSourcePick('device_audio')\n    setDeviceAudioOptIn(false)")
  })
})
