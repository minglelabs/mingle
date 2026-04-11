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
