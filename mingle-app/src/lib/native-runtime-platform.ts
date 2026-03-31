export type NativeRuntimePlatform = "ios" | "android";

export function takeFirstSearchParamValue(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

export function resolveNativeRuntimePlatform(rawValue: unknown): NativeRuntimePlatform | null {
  if (typeof rawValue !== "string") return null;
  const normalized = rawValue.trim().toLowerCase();
  if (normalized === "ios" || normalized === "android") {
    return normalized;
  }
  return null;
}

export function resolveNativeRuntimePlatformFromSearchParam(
  value: string | string[] | undefined,
): NativeRuntimePlatform | null {
  return resolveNativeRuntimePlatform(takeFirstSearchParamValue(value));
}

export function resolveNativeRuntimePlatformFromUserAgent(rawValue: unknown): NativeRuntimePlatform | null {
  if (typeof rawValue !== "string") return null;
  const normalized = rawValue.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("android")) return "android";
  if (
    normalized.includes("iphone")
    || normalized.includes("ipad")
    || normalized.includes("ipod")
    || normalized.includes("ios")
  ) {
    return "ios";
  }
  return null;
}
