export function resolveNativeSttStatusAfterStart(currentStatus: string): 'ready' | 'running' {
  return currentStatus.trim().toLowerCase() === 'ready' ? 'ready' : 'running';
}

export function isNativeSttServerReadyMessage(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const status = (parsed as { status?: unknown }).status;
    return typeof status === 'string' && status.trim().toLowerCase() === 'ready';
  } catch {
    return false;
  }
}
