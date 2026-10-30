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
// On a shell that can capture device audio, earphone mode always translates
// the microphone together with the sound other apps play; the notice says so
// and explains the system prompt Start opens.
export default function EarphoneModeNoticeContent({
  uiLocale,
  copy,
  earphonesConnected,
  languages,
  readLanguage,
  onSelectReadLanguage,
  deviceAudioCapture = false,
  deviceAudioViaBroadcast = false,
  onConfirm,
  coinCostNotice,
}: {
  uiLocale: string
  copy: LivePhoneDemoEarphoneModeCopy
  earphonesConnected: boolean
  // The room's languages, in the order its display-language page lists them.
  languages: readonly string[]
  // The session's read language (L), one of `languages`.
  readLanguage: string | null
  onSelectReadLanguage: (language: string) => void
  // The shell captures device audio, so earphone mode translates the
  // microphone plus other apps' sound; false hides that explanation.
  deviceAudioCapture?: boolean
  // iOS captures through a screen broadcast and reads the translation in the
  // left earphone only; the explanation says so.
  deviceAudioViaBroadcast?: boolean
  onConfirm: () => void
  // Coins: reading translations aloud costs more than recognition alone. Null while billing is off.
  coinCostNotice?: string | null
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
      {coinCostNotice && (
        <p data-earphone-mode-coin-notice className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">
          {coinCostNotice}
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
      {deviceAudioCapture && (
        <div data-qa="live-demo-capture-source">
          <p className="mt-4 text-sm font-semibold text-gray-900">
            {copy.captureSourceLabel}
          </p>
          <p data-capture-source-hint className="mt-2 text-sm leading-relaxed text-gray-600">
            {deviceAudioViaBroadcast ? copy.captureSourceDeviceAudioHintIos : copy.captureSourceDeviceAudioHint}
          </p>
        </div>
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
