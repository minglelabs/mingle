export type NationalityOption = {
  code: string;
  label: string;
  flag: string;
};

export const NATIONALITY_OPTIONS: ReadonlyArray<NationalityOption> = [
  { code: "KR", label: "South Korea", flag: "🇰🇷" },
  { code: "JP", label: "Japan", flag: "🇯🇵" },
  { code: "US", label: "United States", flag: "🇺🇸" },
  { code: "CN", label: "China", flag: "🇨🇳" },
  { code: "TW", label: "Taiwan", flag: "🇹🇼" },
  { code: "FR", label: "France", flag: "🇫🇷" },
  { code: "DE", label: "Germany", flag: "🇩🇪" },
  { code: "ES", label: "Spain", flag: "🇪🇸" },
  { code: "BR", label: "Brazil", flag: "🇧🇷" },
  { code: "IT", label: "Italy", flag: "🇮🇹" },
  { code: "RU", label: "Russia", flag: "🇷🇺" },
  { code: "SA", label: "Saudi Arabia", flag: "🇸🇦" },
  { code: "IN", label: "India", flag: "🇮🇳" },
  { code: "TH", label: "Thailand", flag: "🇹🇭" },
  { code: "VN", label: "Vietnam", flag: "🇻🇳" },
  { code: "GB", label: "United Kingdom", flag: "🇬🇧" },
  { code: "CA", label: "Canada", flag: "🇨🇦" },
  { code: "AU", label: "Australia", flag: "🇦🇺" },
  { code: "NZ", label: "New Zealand", flag: "🇳🇿" },
  { code: "MX", label: "Mexico", flag: "🇲🇽" },
  { code: "AR", label: "Argentina", flag: "🇦🇷" },
  { code: "CL", label: "Chile", flag: "🇨🇱" },
  { code: "CO", label: "Colombia", flag: "🇨🇴" },
  { code: "PE", label: "Peru", flag: "🇵🇪" },
  { code: "NL", label: "Netherlands", flag: "🇳🇱" },
  { code: "BE", label: "Belgium", flag: "🇧🇪" },
  { code: "CH", label: "Switzerland", flag: "🇨🇭" },
  { code: "AT", label: "Austria", flag: "🇦🇹" },
  { code: "SE", label: "Sweden", flag: "🇸🇪" },
  { code: "NO", label: "Norway", flag: "🇳🇴" },
  { code: "DK", label: "Denmark", flag: "🇩🇰" },
  { code: "FI", label: "Finland", flag: "🇫🇮" },
  { code: "PL", label: "Poland", flag: "🇵🇱" },
  { code: "CZ", label: "Czech Republic", flag: "🇨🇿" },
  { code: "HU", label: "Hungary", flag: "🇭🇺" },
  { code: "RO", label: "Romania", flag: "🇷🇴" },
  { code: "GR", label: "Greece", flag: "🇬🇷" },
  { code: "TR", label: "Turkey", flag: "🇹🇷" },
  { code: "UA", label: "Ukraine", flag: "🇺🇦" },
  { code: "PT", label: "Portugal", flag: "🇵🇹" },
  { code: "IE", label: "Ireland", flag: "🇮🇪" },
  { code: "IL", label: "Israel", flag: "🇮🇱" },
  { code: "AE", label: "United Arab Emirates", flag: "🇦🇪" },
  { code: "EG", label: "Egypt", flag: "🇪🇬" },
  { code: "ZA", label: "South Africa", flag: "🇿🇦" },
  { code: "NG", label: "Nigeria", flag: "🇳🇬" },
  { code: "KE", label: "Kenya", flag: "🇰🇪" },
  { code: "MA", label: "Morocco", flag: "🇲🇦" },
  { code: "PK", label: "Pakistan", flag: "🇵🇰" },
  { code: "BD", label: "Bangladesh", flag: "🇧🇩" },
  { code: "ID", label: "Indonesia", flag: "🇮🇩" },
  { code: "MY", label: "Malaysia", flag: "🇲🇾" },
  { code: "SG", label: "Singapore", flag: "🇸🇬" },
  { code: "PH", label: "Philippines", flag: "🇵🇭" },
  { code: "HK", label: "Hong Kong", flag: "🇭🇰" },
  { code: "MN", label: "Mongolia", flag: "🇲🇳" },
  { code: "KZ", label: "Kazakhstan", flag: "🇰🇿" },
  { code: "UZ", label: "Uzbekistan", flag: "🇺🇿" },
  { code: "IR", label: "Iran", flag: "🇮🇷" },
  { code: "QA", label: "Qatar", flag: "🇶🇦" },
];

const LEGACY_NATIONALITY_CODE_MAP: Record<string, string> = {
  ko: "KR",
  ja: "JP",
  en: "US",
  zh: "CN",
  "zh-CN": "CN",
  "zh-TW": "TW",
  fr: "FR",
  de: "DE",
  es: "ES",
  pt: "BR",
  it: "IT",
  ru: "RU",
  ar: "SA",
  hi: "IN",
  th: "TH",
  vi: "VN",
};

const NATIONALITY_BY_CODE = new Map(
  NATIONALITY_OPTIONS.map((option) => [option.code, option] as const),
);

const NATIONALITY_CODE_BY_FLAG = new Map(
  NATIONALITY_OPTIONS.map((option) => [option.flag, option.code] as const),
);

export function resolveNationalityCode(rawValue: string | null | undefined): string | null {
  if (typeof rawValue !== "string") return null;

  const normalizedValue = rawValue.trim();
  if (!normalizedValue) return null;

  const legacyCode = LEGACY_NATIONALITY_CODE_MAP[normalizedValue];
  if (legacyCode) {
    return legacyCode;
  }

  const directCode = normalizedValue.toUpperCase();
  if (NATIONALITY_BY_CODE.has(directCode)) {
    return directCode;
  }

  return NATIONALITY_CODE_BY_FLAG.get(normalizedValue) ?? null;
}

export function resolveNationalityOption(
  rawValue: string | null | undefined,
): NationalityOption | null {
  const code = resolveNationalityCode(rawValue);
  if (!code) return null;

  return NATIONALITY_BY_CODE.get(code) ?? null;
}

export function resolveNationalityFlag(rawValue: string | null | undefined): string | null {
  return resolveNationalityOption(rawValue)?.flag ?? null;
}
