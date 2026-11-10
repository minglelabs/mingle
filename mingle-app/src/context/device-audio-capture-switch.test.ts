import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  DeviceAudioCaptureSwitchProvider,
  useDeviceAudioCaptureSwitch,
} from './device-audio-capture-switch'

function SwitchProbe() {
  const deviceAudioCaptureSwitch = useDeviceAudioCaptureSwitch()
  return createElement('output', null, `ios=${deviceAudioCaptureSwitch.ios} android=${deviceAudioCaptureSwitch.android}`)
}

describe('DeviceAudioCaptureSwitchProvider', () => {
  it('reads as on outside the provider, the same as an unset env', () => {
    expect(renderToStaticMarkup(createElement(SwitchProbe))).toBe('<output>ios=true android=true</output>')
  })

  it('hands the server switch to everything below it', () => {
    const html = renderToStaticMarkup(createElement(
      DeviceAudioCaptureSwitchProvider,
      { value: { ios: true, android: false } },
      createElement(SwitchProbe),
    ))
    expect(html).toBe('<output>ios=true android=false</output>')
  })
})
