type AppleNativeAuthEnv = {
  AUTH_APPLE_NATIVE_AUDIENCES?: string;
  AUTH_APPLE_NATIVE_ID?: string;
  AUTH_APPLE_BUNDLE_ID?: string;
  AUTH_APPLE_ID?: string;
  AUTH_SECRET?: string;
  NEXTAUTH_SECRET?: string;
};

function hasConfiguredAppleAudience(env: AppleNativeAuthEnv): boolean {
  return [
    env.AUTH_APPLE_NATIVE_AUDIENCES,
    env.AUTH_APPLE_NATIVE_ID,
    env.AUTH_APPLE_BUNDLE_ID,
    env.AUTH_APPLE_ID,
  ]
    .filter((value): value is string => typeof value === "string")
    .flatMap((value) => value.split(","))
    .some((value) => value.trim().length > 0);
}

function hasNativeAuthBridgeSecret(env: AppleNativeAuthEnv): boolean {
  return Boolean(
    (env.AUTH_SECRET || "").trim()
    || (env.NEXTAUTH_SECRET || "").trim(),
  );
}

export function isNativeAppleAuthConfiguredFromEnv(env: AppleNativeAuthEnv): boolean {
  return hasConfiguredAppleAudience(env) && hasNativeAuthBridgeSecret(env);
}
