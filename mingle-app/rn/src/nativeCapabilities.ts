/**
 * The `capabilities` message the shell sends on the `mingle:native-stt`
 * channel at every WebView load end. `audioRoute` (earphone mode contract
 * A.1) is true only when this shell can report earphones; absent or false
 * means the web must treat earphones as unknown (= not connected).
 * `deviceAudioCapture` is true only when this shell can transcribe the sound
 * other apps play on the device (`captureSource: 'device_audio'` on
 * `native_stt_start`); absent or false means microphone only.
 */
export type NativeShellCapabilities = {
  type: 'capabilities';
  openAppSettings: boolean;
  audioRoute: boolean;
  deviceAudioCapture: boolean;
};

// The capabilities message is sent once per load end and a room usually mounts
// later, so the page also keeps the last one here for late readers.
export const NATIVE_SHELL_CAPABILITIES_STATE_KEY = '__MINGLE_NATIVE_SHELL_CAPABILITIES';

export function buildNativeShellCapabilities(options: {
  audioRoute: boolean;
  deviceAudioCapture?: boolean;
}): NativeShellCapabilities {
  return {
    type: 'capabilities',
    openAppSettings: true,
    audioRoute: options.audioRoute === true,
    deviceAudioCapture: options.deviceAudioCapture === true,
  };
}
