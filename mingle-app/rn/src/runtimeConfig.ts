function decodeQuotedRuntimeValue(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') {
        return parsed.trim();
      }
    } catch {
      return trimmed.slice(1, -1).trim();
    }
  }

  return trimmed;
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
