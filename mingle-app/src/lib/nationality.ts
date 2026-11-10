/**
 * 국적 (nationality): an ISO 3166-1 alpha-2 country, stored upper case in
 * `app_users.nationality_country`. It is separate from the languages a user
 * speaks: onboarding only asks the language, the country is mapped from it
 * (`defaultNationalityForLanguage`), and the user can change it on My page.
 * The legacy `app_users.nationality` column still holds a language code.
 */
const ISO_COUNTRY_CODES = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ "
  + "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR "
  + "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP "
  + "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT "
  + "MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW "
  + "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG "
  + "UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");

export const NATIONALITY_COUNTRY_CODES: readonly string[] = ISO_COUNTRY_CODES;
const COUNTRY_CODE_SET = new Set(ISO_COUNTRY_CODES);

export function normalizeNationalityCountry(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return COUNTRY_CODE_SET.has(code) ? code : null;
}

export function countryFlagEmoji(countryCode: string): string {
  const code = normalizeNationalityCountry(countryCode);
  if (!code) return "🌐";
  return String.fromCodePoint(...[...code].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
}

/**
 * The country onboarding assumes for each selectable language: the one its
 * flag shows in the language pickers (stt-languages.ts; kept equal by a test).
 * Base codes only; regional tags fall back to their base (pt-BR → pt).
 */
const LANGUAGE_DEFAULT_COUNTRY: Record<string, string> = {
  af: "ZA", sq: "AL", ar: "SA", az: "AZ", eu: "ES", be: "BY", bn: "BD", bs: "BA", bg: "BG", ca: "ES",
  zh: "CN", "zh-cn": "CN", "zh-tw": "TW", "zh-hk": "HK", hr: "HR", cs: "CZ", da: "DK", nl: "NL", en: "US", et: "EE",
  fi: "FI", fr: "FR", gl: "ES", de: "DE", el: "GR", gu: "IN", he: "IL", hi: "IN", hu: "HU", id: "ID",
  it: "IT", ja: "JP", kn: "IN", kk: "KZ", ko: "KR", lv: "LV", lt: "LT", mk: "MK", ms: "MY", ml: "IN",
  mr: "IN", no: "NO", fa: "IR", pl: "PL", pt: "PT", pa: "IN", ro: "RO", ru: "RU", sr: "RS", sk: "SK",
  sl: "SI", es: "ES", sw: "TZ", sv: "SE", tl: "PH", ta: "IN", te: "IN", th: "TH", tr: "TR", uk: "UA",
  ur: "PK", vi: "VN", cy: "GB",
};

/** The country onboarding assumes for a language (en → US, ko → KR). */
export function defaultNationalityForLanguage(language: string | null | undefined): string | null {
  if (typeof language !== "string") return null;
  const tag = language.trim().toLowerCase().replace(/_/g, "-");
  if (!tag) return null;
  return LANGUAGE_DEFAULT_COUNTRY[tag] ?? LANGUAGE_DEFAULT_COUNTRY[tag.split("-")[0]] ?? null;
}

/** The stored country, else the one mapped from the first primary language. */
export function resolveNationalityCountry(
  stored: string | null | undefined,
  primaryLanguages: readonly string[] | null | undefined,
): string | null {
  return normalizeNationalityCountry(stored) ?? defaultNationalityForLanguage(primaryLanguages?.[0]);
}

export function getCountryDisplayName(countryCode: string, locale = "en"): string {
  const code = normalizeNationalityCountry(countryCode);
  if (!code) return countryCode;
  for (const candidate of [locale, "en"]) {
    try {
      const name = new Intl.DisplayNames([candidate], { type: "region" }).of(code);
      if (name && name !== code) return name;
    } catch {
      // Unsupported locale tag: try the next one.
    }
  }
  return code;
}
