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
