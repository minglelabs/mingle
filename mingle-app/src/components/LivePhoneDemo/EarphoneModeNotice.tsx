'use client'

import { useId } from 'react'
import LanguageRadioOption from './LanguageRadioOption'
import {
  formatLivePhoneDemoEarphoneModeReadLanguageNotice,
  type LivePhoneDemoEarphoneModeCopy,
} from '@/i18n/live-phone-demo-earphone-mode-copy'
import { getSttLanguageDisplayName } from '@/lib/stt-languages'

// Body of the notice shown on every off -> on. The language list is the
// room's display-language list (same languages, names and rows); picking
// one changes what this session reads and the sentence above it at once.
export default function EarphoneModeNoticeContent({
  uiLocale,
  copy,
  earphonesConnected,
  languages,
  readLanguage,
  onSelectReadLanguage,
  onConfirm,
}: {
  uiLocale: string
  copy: LivePhoneDemoEarphoneModeCopy
  earphonesConnected: boolean
  // The room's languages, in the order its display-language page lists them.
  languages: readonly string[]
  // The session's read language (L), one of `languages`.
  readLanguage: string | null
  onSelectReadLanguage: (language: string) => void
  onConfirm: () => void
}) {
  const languageListLabelId = useId()

  return (
    <div data-qa="live-demo-earphone-mode-notice">
      <p className="text-sm font-semibold text-gray-900">{copy.label}</p>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">{copy.noticeBody}</p>
      {readLanguage && (
        <p data-earphone-mode-read-language-notice className="mt-2 text-sm leading-relaxed text-gray-600">
          {formatLivePhoneDemoEarphoneModeReadLanguageNotice(uiLocale, readLanguage)}
        </p>
      )}
      {!earphonesConnected && (
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{copy.noticeNotConnectedBody}</p>
      )}
      {languages.length > 0 && (
        <>
          <p id={languageListLabelId} className="mt-4 text-sm font-semibold text-gray-900">
            {copy.readLanguageLabel}
          </p>
          <div role="radiogroup" aria-labelledby={languageListLabelId} className="mt-2 space-y-2">
            {languages.map((language) => (
              <LanguageRadioOption
                key={language}
                language={language}
                label={getSttLanguageDisplayName(language, uiLocale) || language}
                selected={readLanguage === language}
                onSelect={onSelectReadLanguage}
              />
            ))}
          </div>
        </>
      )}
      <button
        type="button"
        onClick={onConfirm}
        className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg text-sm font-semibold text-white transition-colors"
        style={{ backgroundImage: 'linear-gradient(90deg, #f59e0b 0%, #f97316 100%)' }}
      >
        {copy.noticeConfirmLabel}
      </button>
    </div>
  )
}
