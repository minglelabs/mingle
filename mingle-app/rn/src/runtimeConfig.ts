function decodeQuotedRuntimeValue(rawValue: string): string {
  let currentValue = rawValue.trim();
  if (!currentValue) {
    return '';
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!(currentValue.startsWith('"') && currentValue.endsWith('"'))) {
      break;
    }

    try {
      const parsed = JSON.parse(currentValue);
      if (typeof parsed !== 'string') {
        break;
      }
      currentValue = parsed.trim();
      continue;
    } catch {
      currentValue = currentValue.slice(1, -1).trim();
    }
  }

  return currentValue
    .replace(/\\\//g, '/')
    .trim();
}

export function readPreferredRuntimeValue(
  nativeValue: string | null | undefined,
  envValue: string | null | undefined,
): string {
  const normalizedNativeValue =
    typeof nativeValue === 'string' ? decodeQuotedRuntimeValue(nativeValue) : '';
  if (normalizedNativeValue) {
    return normalizedNativeValue;
  }

  return typeof envValue === 'string' ? decodeQuotedRuntimeValue(envValue) : '';
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
