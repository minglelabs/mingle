"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import FlagEmoji from "@/components/flag-emoji";
import type { ProfileNationalityCopy } from "@/i18n/profile-nationality-copy";
import {
  NATIONALITY_COUNTRY_CODES,
  countryFlagEmoji,
  defaultNationalityForLanguage,
  getCountryDisplayName,
} from "@/lib/nationality";

/**
 * 국적 field of profile edit: the chosen country as one row; tapping it opens
 * a searchable list. The countries of the user's languages come first.
 */
export default function ProfileNationalityPicker({
  value,
  onChange,
  copy,
  locale,
  suggestedLanguages = [],
  disabled = false,
}: {
  value: string | null;
  onChange: (country: string) => void;
  copy: ProfileNationalityCopy;
  locale: string;
  /** The user's primary languages; their countries are listed first. */
  suggestedLanguages?: readonly string[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const countries = useMemo(() => {
    const collator = new Intl.Collator(locale);
    return NATIONALITY_COUNTRY_CODES
      .map((code) => ({ code, name: getCountryDisplayName(code, locale) }))
      .sort((a, b) => collator.compare(a.name, b.name));
  }, [locale]);

  const visibleCountries = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale);
    if (needle) {
      return countries.filter(({ code, name }) => (
        name.toLocaleLowerCase(locale).includes(needle)
        || getCountryDisplayName(code, "en").toLowerCase().includes(needle)
        || code.toLowerCase() === needle
      ));
    }
    const suggested = [...new Set([
      value,
      ...suggestedLanguages.map((language) => defaultNationalityForLanguage(language)),
    ].filter((code): code is string => Boolean(code)))];
    const suggestedSet = new Set(suggested);
    return [
      ...suggested.map((code) => countries.find((country) => country.code === code)).filter((country) => country !== undefined),
      ...countries.filter(({ code }) => !suggestedSet.has(code)),
    ];
  }, [countries, locale, query, suggestedLanguages, value]);

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-12 w-full items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 text-left transition active:bg-gray-100 disabled:opacity-60"
      >
        {value ? <FlagEmoji emoji={countryFlagEmoji(value)} className="text-[1.35rem] leading-none" /> : null}
        <span className="min-w-0 flex-1 truncate text-[15px] text-slate-900">
          {value ? getCountryDisplayName(value, locale) : "—"}
        </span>
        <ChevronDown size={18} className={`shrink-0 text-gray-400 transition ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open ? (
        <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <label className="flex items-center gap-2 border-b border-gray-100 px-3">
            <Search size={16} className="shrink-0 text-gray-400" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.searchPlaceholder}
              autoCorrect="off"
              spellCheck={false}
              className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none"
            />
          </label>
          <ul role="listbox" aria-label={copy.label} className="max-h-64 overflow-y-auto overscroll-contain py-1">
            {visibleCountries.length === 0 ? (
              <li className="px-4 py-3 text-[13px] text-gray-400">{copy.noResults}</li>
            ) : visibleCountries.map(({ code, name }) => {
              const selected = code === value;
              return (
                <li key={code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(code);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition active:bg-gray-50 ${selected ? "bg-amber-50" : ""}`}
                  >
                    <FlagEmoji emoji={countryFlagEmoji(code)} className="text-[1.25rem] leading-none" />
                    <span className="min-w-0 flex-1 truncate text-[15px] text-slate-900">{name}</span>
                    {selected ? <Check size={16} className="shrink-0 text-amber-600" aria-hidden="true" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <p className="mt-2 text-[12px] leading-relaxed text-gray-400">{copy.hint}</p>
    </div>
  );
}
