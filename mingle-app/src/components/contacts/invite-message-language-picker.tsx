"use client";

import { ChevronDown, Languages } from "lucide-react";
import { PRIMARY_UI_LANGUAGE_OPTIONS, isPrimaryUiLocale, type PrimaryUiLocale } from "@/i18n/mingle-locales";

type InviteMessageLanguagePickerProps = {
  value: PrimaryUiLocale;
  onChange: (locale: PrimaryUiLocale) => void;
  label: string;
  className?: string;
};

/** A one-line "message language [English ▾]" row; the native select keeps it small on a phone. */
export default function InviteMessageLanguagePicker({ value, onChange, label, className = "" }: InviteMessageLanguagePickerProps) {
  return (
    <div className={`flex items-center justify-between gap-2 ${className}`}>
      <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-gray-500">
        <Languages size={15} strokeWidth={2.2} className="shrink-0" aria-hidden="true" />
        <span className="truncate" data-qa-allow-truncate>{label}</span>
      </span>
      <label className="relative flex h-8 shrink-0 items-center rounded-full border border-gray-200 bg-white pl-3 pr-7 text-[13px] font-semibold text-slate-900">
        <span aria-hidden="true">
          {PRIMARY_UI_LANGUAGE_OPTIONS.find((option) => option.code === value)?.name ?? value}
        </span>
        <ChevronDown size={15} strokeWidth={2.2} className="pointer-events-none absolute right-2 text-gray-400" aria-hidden="true" />
        <select
          value={value}
          onChange={(event) => {
            if (isPrimaryUiLocale(event.target.value)) onChange(event.target.value);
          }}
          aria-label={label}
          data-testid="invite-message-language"
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
        >
          {PRIMARY_UI_LANGUAGE_OPTIONS.map((option) => (
            <option key={option.code} value={option.code}>{option.name}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
