import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import EarphoneCaptureSourceNoticeContent from './EarphoneCaptureSourceNotice'
import { resolveLivePhoneDemoEarphoneModeCopy } from '@/i18n/live-phone-demo-earphone-mode-copy'

const liveDemoSource = readFileSync(new URL('./LivePhoneDemo.tsx', import.meta.url), 'utf8')

describe('capture-source question when earphones go in', () => {
  it('explains why, offers both sources with the microphone picked, and confirms', () => {
    const copy = resolveLivePhoneDemoEarphoneModeCopy('ko')
    const html = renderToStaticMarkup(createElement(EarphoneCaptureSourceNoticeContent, {
      copy,
      deviceAudioViaBroadcast: true,
      onConfirm: () => {},
    }))
    expect(html).toContain(copy.earphoneCaptureNoticeTitle)
    expect(html).toContain(copy.earphoneCaptureNoticeBody)
    expect(html).toMatch(/aria-checked="true" data-capture-source="microphone"/)
    expect(html).toMatch(/aria-checked="false" data-capture-source="device_audio"/)
    // The broadcast hint shows only once this device's sound is picked.
    expect(html).not.toContain(copy.captureSourceDeviceAudioHintIos)
    expect(html).toContain('data-earphone-capture-source-confirm')
  })

  it('puts the phone-microphone line, with Change, in the same notice', () => {
    const copy = resolveLivePhoneDemoEarphoneModeCopy('ko')
    const render = (props: { showMicrophone?: boolean; showCaptureSource?: boolean }) => renderToStaticMarkup(
      createElement(EarphoneCaptureSourceNoticeContent, { copy, onConfirm: () => {}, ...props }),
    )
    const both = render({ showMicrophone: true, showCaptureSource: true })
    expect(both).toContain(copy.microphoneHint)
    expect(both).toContain(copy.microphoneHintChangeLabel)
    expect(both).toContain('data-earphone-microphone-change')
    expect(both).toContain(copy.earphoneCaptureNoticeBody)
    const microphoneOnly = render({ showMicrophone: true, showCaptureSource: false })
    expect(microphoneOnly).toContain(copy.microphoneHint)
    expect(microphoneOnly).not.toContain('data-capture-source=')
    expect(render({ showCaptureSource: true })).not.toContain('data-earphone-microphone-hint')
    // One trigger for both: listening with earphones in, once ever.
    expect(liveDemoSource).toContain('const notice = resolveEarphoneListeningNotice({')
    expect(liveDemoSource).toContain('writeEarphoneListeningNoticeShown()')
    expect(liveDemoSource).not.toContain('HintToast')
  })

  it('switches a running session to device audio and listens again', () => {
    expect(liveDemoSource).toContain('deviceAudioOptIn,\n    pick: sttCaptureSourcePick,')
    expect(liveDemoSource).toContain('setDeviceAudioOptIn(true)')
    expect(liveDemoSource).toContain('captureSourceRestartPendingRef.current = isSttSessionRunning')
    // Every earphone-mode edge drops the opt-in with the pick.
    expect(liveDemoSource).toContain("setSttCaptureSourcePick('device_audio')\n    setDeviceAudioOptIn(false)")
  })
})
