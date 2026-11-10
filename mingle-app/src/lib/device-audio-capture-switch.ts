// Server-controlled kill switch for device-audio capture (transcribing the
// sound other apps play instead of the microphone, in earphone mode).
//
// A shell reports whether it *can* capture device audio (`deviceAudioCapture`
// in its capabilities message, see native-device-audio.ts); this switch
// decides whether the web *offers* it, so the feature can be turned off
// without a store release. The root layout resolves it from the server env on
// every document request (it is never a NEXT_PUBLIC_ build-time inline) and
// hands it to the client through DeviceAudioCaptureSwitchProvider. A change
// reaches a running app on its next page load (app launch or WebView reload).
//
//   DEVICE_AUDIO_CAPTURE_ENABLED           every platform
//   DEVICE_AUDIO_CAPTURE_ENABLED_IOS       iOS shells only
//   DEVICE_AUDIO_CAPTURE_ENABLED_ANDROID   Android shells only
//
// Unset, empty or any other value = on. 0 / false / off / no (any case) = off.
// Off wins: the shared variable turns every platform off whatever the platform
// variables say, and a platform variable turns only its own platform off.

export type DeviceAudioCapturePlatform = 'ios' | 'android'

export type DeviceAudioCaptureSwitch = Readonly<Record<DeviceAudioCapturePlatform, boolean>>

export const DEVICE_AUDIO_CAPTURE_ENABLED_ENV_KEY = 'DEVICE_AUDIO_CAPTURE_ENABLED'

export const DEVICE_AUDIO_CAPTURE_PLATFORM_ENV_KEYS: Readonly<Record<DeviceAudioCapturePlatform, string>> = {
  ios: 'DEVICE_AUDIO_CAPTURE_ENABLED_IOS',
  android: 'DEVICE_AUDIO_CAPTURE_ENABLED_ANDROID',
}

// What an unset env resolves to, and what a render outside the provider sees.
export const DEVICE_AUDIO_CAPTURE_SWITCH_DEFAULT: DeviceAudioCaptureSwitch = Object.freeze({
  ios: true,
  android: true,
})

const DISABLED_FLAG_VALUES = new Set(['0', 'false', 'off', 'no'])

function isFlagOff(rawValue: string | undefined): boolean {
  return DISABLED_FLAG_VALUES.has((rawValue ?? '').trim().toLowerCase())
}

export function resolveDeviceAudioCaptureSwitch(
  env: Record<string, string | undefined> = process.env,
): DeviceAudioCaptureSwitch {
  const allOff = isFlagOff(env[DEVICE_AUDIO_CAPTURE_ENABLED_ENV_KEY])
  return {
    ios: !allOff && !isFlagOff(env[DEVICE_AUDIO_CAPTURE_PLATFORM_ENV_KEYS.ios]),
    android: !allOff && !isFlagOff(env[DEVICE_AUDIO_CAPTURE_PLATFORM_ENV_KEYS.android]),
  }
}

export function isDeviceAudioCaptureSwitchedOn(
  deviceAudioCaptureSwitch: DeviceAudioCaptureSwitch,
  platform: DeviceAudioCapturePlatform,
): boolean {
  return deviceAudioCaptureSwitch[platform] !== false
}
