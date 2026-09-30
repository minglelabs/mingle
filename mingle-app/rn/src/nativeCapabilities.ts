/**
 * The `capabilities` message the shell sends on the `mingle:native-stt`
 * channel at every WebView load end. `audioRoute` (earphone mode contract
 * A.1) is true only when this shell can report earphones; absent or false
 * means the web must treat earphones as unknown (= not connected).
 */
export type NativeShellCapabilities = {
  type: 'capabilities';
  openAppSettings: boolean;
  audioRoute: boolean;
};

export function buildNativeShellCapabilities(options: { audioRoute: boolean }): NativeShellCapabilities {
  return {
    type: 'capabilities',
    openAppSettings: true,
    audioRoute: options.audioRoute === true,
  };
}
