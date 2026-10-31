import { describe, expect, it } from 'vitest'
import {
  DEVICE_AUDIO_CAPTURE_ENABLED_ENV_KEY,
  DEVICE_AUDIO_CAPTURE_PLATFORM_ENV_KEYS,
  DEVICE_AUDIO_CAPTURE_SWITCH_DEFAULT,
  isDeviceAudioCaptureSwitchedOn,
  resolveDeviceAudioCaptureSwitch,
} from './device-audio-capture-switch'

describe('device-audio capture kill switch', () => {
  it('names the env variables the server reads', () => {
    expect(DEVICE_AUDIO_CAPTURE_ENABLED_ENV_KEY).toBe('DEVICE_AUDIO_CAPTURE_ENABLED')
    expect(DEVICE_AUDIO_CAPTURE_PLATFORM_ENV_KEYS).toEqual({
      ios: 'DEVICE_AUDIO_CAPTURE_ENABLED_IOS',
      android: 'DEVICE_AUDIO_CAPTURE_ENABLED_ANDROID',
    })
  })

  it('is on everywhere when nothing is set', () => {
    expect(resolveDeviceAudioCaptureSwitch({})).toEqual({ ios: true, android: true })
    expect(resolveDeviceAudioCaptureSwitch({
      DEVICE_AUDIO_CAPTURE_ENABLED: '',
      DEVICE_AUDIO_CAPTURE_ENABLED_IOS: '  ',
      DEVICE_AUDIO_CAPTURE_ENABLED_ANDROID: undefined,
    })).toEqual({ ios: true, android: true })
    expect(DEVICE_AUDIO_CAPTURE_SWITCH_DEFAULT).toEqual({ ios: true, android: true })
  })

  it.each(['0', 'false', 'off', 'no', 'FALSE', ' Off ', 'No'])('turns every platform off with %j', (value) => {
    expect(resolveDeviceAudioCaptureSwitch({ DEVICE_AUDIO_CAPTURE_ENABLED: value })).toEqual({ ios: false, android: false })
  })

  it.each(['1', 'true', 'on', 'yes', 'enabled', 'maybe'])('stays on with %j', (value) => {
    expect(resolveDeviceAudioCaptureSwitch({ DEVICE_AUDIO_CAPTURE_ENABLED: value })).toEqual({ ios: true, android: true })
  })

  it('turns one platform off with its own variable', () => {
    expect(resolveDeviceAudioCaptureSwitch({ DEVICE_AUDIO_CAPTURE_ENABLED_ANDROID: 'false' })).toEqual({ ios: true, android: false })
    expect(resolveDeviceAudioCaptureSwitch({ DEVICE_AUDIO_CAPTURE_ENABLED_IOS: '0' })).toEqual({ ios: false, android: true })
    expect(resolveDeviceAudioCaptureSwitch({
      DEVICE_AUDIO_CAPTURE_ENABLED_IOS: 'off',
      DEVICE_AUDIO_CAPTURE_ENABLED_ANDROID: 'off',
    })).toEqual({ ios: false, android: false })
  })

  it('lets off win: a platform variable cannot re-enable what the shared one turned off', () => {
    expect(resolveDeviceAudioCaptureSwitch({
      DEVICE_AUDIO_CAPTURE_ENABLED: 'false',
      DEVICE_AUDIO_CAPTURE_ENABLED_IOS: 'true',
      DEVICE_AUDIO_CAPTURE_ENABLED_ANDROID: '1',
    })).toEqual({ ios: false, android: false })
    expect(resolveDeviceAudioCaptureSwitch({
      DEVICE_AUDIO_CAPTURE_ENABLED: 'true',
      DEVICE_AUDIO_CAPTURE_ENABLED_ANDROID: 'false',
    })).toEqual({ ios: true, android: false })
  })

  it('reads process.env by default, at call time', () => {
    const previous = process.env.DEVICE_AUDIO_CAPTURE_ENABLED_ANDROID
    try {
      delete process.env.DEVICE_AUDIO_CAPTURE_ENABLED_ANDROID
      expect(resolveDeviceAudioCaptureSwitch().android).toBe(resolveDeviceAudioCaptureSwitch(process.env).android)
      process.env.DEVICE_AUDIO_CAPTURE_ENABLED_ANDROID = 'off'
      expect(resolveDeviceAudioCaptureSwitch().android).toBe(false)
    } finally {
      if (previous === undefined) delete process.env.DEVICE_AUDIO_CAPTURE_ENABLED_ANDROID
      else process.env.DEVICE_AUDIO_CAPTURE_ENABLED_ANDROID = previous
    }
  })

  it('answers per platform', () => {
    const androidOff = { ios: true, android: false }
    expect(isDeviceAudioCaptureSwitchedOn(androidOff, 'ios')).toBe(true)
    expect(isDeviceAudioCaptureSwitchedOn(androidOff, 'android')).toBe(false)
    expect(isDeviceAudioCaptureSwitchedOn(DEVICE_AUDIO_CAPTURE_SWITCH_DEFAULT, 'android')).toBe(true)
  })
})
