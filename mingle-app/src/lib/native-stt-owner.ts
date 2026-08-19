/**
 * There is exactly one microphone, and the native bridge routes every STT
 * event to whoever last called `native_stt_start`. Both the interpreter room
 * and a direct-message composer can be mounted at once, so each claims this
 * token before starting and ignores bridge events while it does not hold it.
 */
let activeOwnerKey: string | null = null;

export function claimNativeSttOwner(ownerKey: string): void {
  activeOwnerKey = ownerKey;
}

export function releaseNativeSttOwner(ownerKey: string): void {
  if (activeOwnerKey !== ownerKey) return;
  activeOwnerKey = null;
}

export function isNativeSttOwner(ownerKey: string): boolean {
  return activeOwnerKey === ownerKey;
}

/** Whether anyone at all currently holds the microphone. */
export function hasNativeSttOwner(): boolean {
  return activeOwnerKey !== null;
}
