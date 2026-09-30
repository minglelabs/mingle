// Where the running native build was installed from. The RN shell detects it
// (NativeRuntimeConfigModule `runtimeConfig.installSource`) and forwards it in
// the native app-update snapshot; My Page and the room menu show it.
//
// This module is imported by the web app (`@/lib/native-app-install-source`)
// AND by the RN shell through a relative path
// (`mingle-app/rn/src/appUpdateStatus.ts`), so both sides accept exactly the
// same values. Keep it dependency-free: no `@/` imports, no DOM or RN APIs.
export const NATIVE_APP_INSTALL_SOURCES = [
  "app_store",
  "testflight",
  "play_store",
  "local",
  "other",
] as const;

export type NativeAppInstallSource = (typeof NATIVE_APP_INSTALL_SOURCES)[number];

// Returns the install source for a known value and `undefined` for anything
// else (missing, blank, not a string, unknown value). `undefined` means
// "unknown": callers show nothing rather than guessing.
export function normalizeInstallSource(
  raw: unknown,
): NativeAppInstallSource | undefined {
  if (typeof raw !== "string") return undefined;

  const normalized = raw.trim().toLowerCase();
  return NATIVE_APP_INSTALL_SOURCES.find(source => source === normalized);
}
