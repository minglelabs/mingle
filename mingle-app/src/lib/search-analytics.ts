type SearchAnalyticsProperty = string | number | boolean | null;

export type SearchAnalyticsProperties = Record<string, SearchAnalyticsProperty>;

function codePoint(value: string): number {
  return value.codePointAt(0) ?? 0;
}

function resolveCharacterScript(value: string): string {
  const point = codePoint(value);
  if ((point >= 0x41 && point <= 0x5a) || (point >= 0x61 && point <= 0x7a)) return "latin";
  if (point >= 0xac00 && point <= 0xd7a3) return "hangul";
  if (point >= 0x3040 && point <= 0x30ff) return "kana";
  if (point >= 0x3400 && point <= 0x9fff) return "cjk";
  if (point >= 0x30 && point <= 0x39) return "digit";
  return "other";
}

function isSingleCharacterToken(value: string): boolean {
  return ["latin", "hangul", "kana", "cjk"].includes(resolveCharacterScript(value));
}

export function resolveSearchAnalyticsProperties(rawQuery: string): SearchAnalyticsProperties {
  const query = rawQuery.trim();
  const characters = Array.from(query);
  const scripts = [...new Set(characters.map(resolveCharacterScript))];
  const script = scripts.length === 1 ? scripts[0] : "mixed";
  const handleQuery = query.startsWith("@") ? query.slice(1) : query;
  const queryShape = characters.length === 1
    ? `single_${script}_character`
    : /^[A-Za-z0-9._-]+$/.test(handleQuery) && handleQuery.length >= 3
      ? "handle_like"
      : "multi_character";

  return {
    query_length: characters.length,
    query_script: script,
    query_shape: queryShape,
    query_has_at_prefix: query.startsWith("@"),
    query_single_character: characters.length === 1 && isSingleCharacterToken(query) ? query : null,
  };
}

export async function digestAnalyticsValue(rawValue: string): Promise<string | null> {
  const value = rawValue.trim();
  if (!value || !globalThis.crypto?.subtle) return null;

  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildSearchAnalyticsProperties(rawQuery: string): Promise<SearchAnalyticsProperties> {
  const query = rawQuery.trim();
  return {
    ...resolveSearchAnalyticsProperties(query),
    query_digest: await digestAnalyticsValue(query),
  };
}
