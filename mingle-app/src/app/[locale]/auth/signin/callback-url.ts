import { resolveSafeCallbackPath } from "@/lib/native-auth-bridge";

/** Where sign-in lands when the requested callback is missing or refused. */
export const DEFAULT_SIGNIN_CALLBACK_PATH = "/";

/**
 * Sign-in `callbackUrl` guard (open-redirect fix).
 *
 * Only a same-origin relative path is accepted: it must start with a single
 * `/` and not with `//` or `/\` (both are protocol-relative to a browser).
 * Absolute URLs (even same-host), `javascript:` / `data:` and any other scheme,
 * control characters and empty input all fall back to the root path.
 *
 * The app's own callbacks — the feed (`/{locale}/feed?post=…`), compose
 * (`/{locale}/compose`) and the native bridge (`/api/native-auth/complete?…`)
 * — are relative and pass through unchanged.
 */
export function resolveSignInCallbackUrl(rawValue: string | null | undefined): string {
  const trimmed = (rawValue ?? "").trim();
  if (!trimmed) return DEFAULT_SIGNIN_CALLBACK_PATH;
  if (!trimmed.startsWith("/")) return DEFAULT_SIGNIN_CALLBACK_PATH;
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) return DEFAULT_SIGNIN_CALLBACK_PATH;
  // Browsers strip tab/newline inside URLs, which can turn "/\t/evil" into "//evil".
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return DEFAULT_SIGNIN_CALLBACK_PATH;
  return resolveSafeCallbackPath(trimmed, DEFAULT_SIGNIN_CALLBACK_PATH);
}
