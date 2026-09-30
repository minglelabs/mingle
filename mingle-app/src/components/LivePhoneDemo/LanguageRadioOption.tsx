'use client'

import { Check } from 'lucide-react'
import LanguageFlag from '@/components/language-flag'

// One row of a single-choice language list: flag, name and check mark. The
// room's display-language page and the earphone-mode notice share it, so the
// two lists look and behave the same.
export default function LanguageRadioOption({
  language,
  label,
  selected,
  onSelect,
}: {
  language: string
  label: string
  selected: boolean
  onSelect: (language: string) => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(language)}
      className={`flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80 ${
        selected
          ? 'border-amber-300 bg-amber-50/70'
          : 'border-gray-200 bg-white hover:bg-gray-50'
      }`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-50 text-[1.45rem]">
        <LanguageFlag language={language} className="text-[1.45rem] leading-none" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[0.98rem] font-semibold text-gray-900">
        {label}
      </span>
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
        selected ? 'bg-amber-500 text-white' : 'bg-gray-100 text-transparent'
      }`}>
        <Check size={14} strokeWidth={2.8} />
      </span>
    </button>
  )
}
