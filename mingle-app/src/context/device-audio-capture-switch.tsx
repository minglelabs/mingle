'use client'

import { createContext, useContext, useMemo, type PropsWithChildren } from 'react'
import {
  DEVICE_AUDIO_CAPTURE_SWITCH_DEFAULT,
  type DeviceAudioCaptureSwitch,
} from '@/lib/device-audio-capture-switch'

// Carries the server's device-audio kill switch (resolved by the root layout
// on each document request) to every room. Outside the provider the feature
// is on, the same as an unset env.
const DeviceAudioCaptureSwitchContext = createContext<DeviceAudioCaptureSwitch>(
  DEVICE_AUDIO_CAPTURE_SWITCH_DEFAULT,
)

export function DeviceAudioCaptureSwitchProvider({
  value,
  children,
}: PropsWithChildren<{ value: DeviceAudioCaptureSwitch }>) {
  // The layout sends a fresh object on every server render; keep the context
  // value stable while the flags stay the same.
  const stableValue = useMemo<DeviceAudioCaptureSwitch>(
    () => ({ ios: value.ios, android: value.android }),
    [value.ios, value.android],
  )
  return (
    <DeviceAudioCaptureSwitchContext.Provider value={stableValue}>
      {children}
    </DeviceAudioCaptureSwitchContext.Provider>
  )
}

export function useDeviceAudioCaptureSwitch(): DeviceAudioCaptureSwitch {
  return useContext(DeviceAudioCaptureSwitchContext)
}
