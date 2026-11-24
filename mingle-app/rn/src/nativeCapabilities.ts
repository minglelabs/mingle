/**
 * The `capabilities` message the shell sends on the `mingle:native-stt`
 * channel at every WebView load end. `audioRoute` (earphone mode contract
 * A.1) is true only when this shell can report earphones; absent or false
 * means the web must treat earphones as unknown (= not connected).
 * `deviceAudioCapture` is true only when this shell can transcribe the sound
 * other apps play on the device (`captureSource: 'device_audio'` on
 * `native_stt_start`); absent or false means microphone only.
 * `nativeTts` is true when the shell plays TTS clips sent as `native_tts_play`
 * (lowering other apps' volume meanwhile); absent or false means the web plays
 * them itself. iOS shells always played natively, so the web keeps doing that
 * there even when the flag is absent.
 * `contacts` is true when the shell can read the address book and open a
 * written text message (`native_contacts_request`, `native_sms_compose`);
 * absent or false means the contact-sync screen offers neither.
 * `faceCheck` is true when the shell looks for faces in a photo on the phone
 * (`native_face_check`, answered on `mingle:native-face-check`); absent or
 * false means the web cannot check, and a new profile photo is 'unchecked'.
 * `earphoneMicrophoneChoice` is true when the shell records from the phone's
 * microphone while earphones are in and takes the user's pick of the earphone
 * microphone instead (`earphoneMicrophone` on `native_stt_start`,
 * `native_stt_set_earphone_microphone`); absent or false means the web does
 * not ask.
 * `micPermissionRequest` is true when the shell asks for the microphone alone
 * (`native_mic_permission_request`, answered on the STT channel as
 * `{ type: 'permission', requestId }`); absent or false means only starting a
 * transcription asks.
 * `deviceId` with `deviceKind` is the value that tells the server two
 * installs are the same phone (one account per person): a random id kept in
 * the iOS keychain ('keychain') or Android's ANDROID_ID ('android_id'). Both
 * survive a reinstall. Absent when the shell has none; the web then sends no
 * device value. Never an advertising id.
 */
export type NativeShellCapabilities = {
  type: 'capabilities';
  openAppSettings: boolean;
  audioRoute: boolean;
  deviceAudioCapture: boolean;
  nativeTts: boolean;
  ttsStream: boolean;
  contacts: boolean;
  faceCheck: boolean;
  earphoneMicrophoneChoice: boolean;
  micPermissionRequest: boolean;
  deviceId?: string;
  deviceKind?: NativeDeviceKind;
};

export type NativeDeviceKind = 'keychain' | 'android_id';

/** The device value to send, or null when the native side gave none that the server would take (8 to 128 characters). */
export function resolveNativeDeviceIdentity(
  rawId: unknown,
  rawKind: unknown,
): { deviceId: string; deviceKind: NativeDeviceKind } | null {
  const deviceId = typeof rawId === 'string' ? rawId.trim() : '';
  if (deviceId.length < 8 || deviceId.length > 128) return null;
  if (rawKind !== 'keychain' && rawKind !== 'android_id') return null;
  return { deviceId, deviceKind: rawKind };
}

// The capabilities message is sent once per load end and a room usually mounts
// later, so the page also keeps the last one here for late readers.
export const NATIVE_SHELL_CAPABILITIES_STATE_KEY = '__MINGLE_NATIVE_SHELL_CAPABILITIES';

export function buildNativeShellCapabilities(options: {
  audioRoute: boolean;
  deviceAudioCapture?: boolean;
  nativeTts?: boolean;
  ttsStream?: boolean;
  contacts?: boolean;
  faceCheck?: boolean;
  earphoneMicrophoneChoice?: boolean;
  micPermissionRequest?: boolean;
  deviceId?: string | null;
  deviceKind?: string | null;
}): NativeShellCapabilities {
  const device = resolveNativeDeviceIdentity(options.deviceId, options.deviceKind);
  return {
    type: 'capabilities',
    openAppSettings: true,
    audioRoute: options.audioRoute === true,
    deviceAudioCapture: options.deviceAudioCapture === true,
    nativeTts: options.nativeTts === true,
    ttsStream: options.ttsStream === true,
    contacts: options.contacts === true,
    faceCheck: options.faceCheck === true,
    earphoneMicrophoneChoice: options.earphoneMicrophoneChoice === true,
    micPermissionRequest: options.micPermissionRequest === true,
    ...(device ?? {}),
  };
}
