export function readPreferredRuntimeValue(
  nativeValue: string | null | undefined,
  envValue: string | null | undefined,
): string {
  const normalizedNativeValue =
    typeof nativeValue === 'string' ? nativeValue.trim() : '';
  if (normalizedNativeValue) {
    return normalizedNativeValue;
  }

  return typeof envValue === 'string' ? envValue.trim() : '';
}

export function normalizeRuntimeBoolean(
  value: string | boolean | number | null | undefined,
): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return null;
    return value !== 0;
  }
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return null;
}

export function readPreferredRuntimeBoolean(
  nativeValue: string | boolean | number | null | undefined,
  envValue: string | boolean | number | null | undefined,
): boolean {
  const normalizedNativeValue = normalizeRuntimeBoolean(nativeValue);
  if (normalizedNativeValue !== null) {
    return normalizedNativeValue;
  }

  return normalizeRuntimeBoolean(envValue) ?? false;
}
