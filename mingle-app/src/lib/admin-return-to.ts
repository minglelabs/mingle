/**
 * `returnTo` guard for admin server actions (open-redirect fix).
 *
 * Admin forms post a hidden `returnTo` so the action can send the operator
 * back to the list they came from. The value is attacker-controllable form
 * input, so only a same-origin relative path under `/admin` is accepted:
 *
 * - it must start with a single `/` (not `//` or `/\`), contain no control
 *   characters, and still resolve to this origin;
 * - its normalized path must be `/admin` or below `/admin/` (so `/admin/../x`
 *   and `/administrator` are refused);
 * - the hash is dropped, and a `result` query parameter is removed so the
 *   action's own status is the only one appended.
 *
 * Anything else becomes `fallback`.
 */
const PARSE_ORIGIN = "https://mingle.local";

export function sanitizeAdminReturnTo(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return fallback;
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) return fallback;
  // Browsers strip tab/newline inside URLs, which can turn "/\t/evil" into "//evil".
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(trimmed, PARSE_ORIGIN);
  } catch {
    return fallback;
  }
  if (parsed.origin !== PARSE_ORIGIN) return fallback;
  if (parsed.pathname !== "/admin" && !parsed.pathname.startsWith("/admin/")) return fallback;
  if (parsed.pathname.startsWith("//")) return fallback;

  parsed.searchParams.delete("result");
  const query = parsed.searchParams.toString();
  return query ? `${parsed.pathname}?${query}` : parsed.pathname;
}
