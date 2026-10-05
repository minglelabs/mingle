'use client'

import { useId } from 'react'
import { Check, Mic, MonitorSpeaker, type LucideIcon } from 'lucide-react'
import LanguageRadioOption from './LanguageRadioOption'
import {
  formatLivePhoneDemoEarphoneModeReadLanguageNotice,
  type LivePhoneDemoEarphoneModeCopy,
} from '@/i18n/live-phone-demo-earphone-mode-copy'
import { getSttLanguageDisplayName } from '@/lib/stt-languages'
import type { SttCaptureSource } from '@/lib/native-device-audio'

// One row of the "what to translate" choice. Same shape as a language row,
// with an icon where the flag sits.
function CaptureSourceRadioOption({
  source,
  icon: Icon,
  label,
  selected,
  onSelect,
}: {
  source: SttCaptureSource
  icon: LucideIcon
  label: string
  selected: boolean
  onSelect: (source: SttCaptureSource) => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-capture-source={source}
      onClick={() => onSelect(source)}
      className={`flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80 ${
        selected
          ? 'border-amber-300 bg-amber-50/70'
          : 'border-gray-200 bg-white hover:bg-gray-50'
      }`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-50 text-gray-600">
        <Icon size={20} strokeWidth={2.15} />
      </span>
      <span className="min-w-0 flex-1 text-[0.98rem] font-semibold text-gray-900">
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

// Body of the notice shown on every off -> on. The language list is the
// room's display-language list (same languages, names and rows); picking
// one changes what this session reads and the sentence above it at once.
// On a shell that can capture device audio, a second choice picks what gets
// translated: the microphone, or the sound other apps play on this device.
export default function EarphoneModeNoticeContent({
  uiLocale,
  copy,
  earphonesConnected,
  languages,
  readLanguage,
  onSelectReadLanguage,
  captureSource,
  onSelectCaptureSource,
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
  // The session's capture source; undefined hides the choice (the shell can
  // only capture the microphone).
  captureSource?: SttCaptureSource
  onSelectCaptureSource?: (source: SttCaptureSource) => void
  onConfirm: () => void
}) {
  const languageListLabelId = useId()
  const captureSourceLabelId = useId()

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
      {captureSource && onSelectCaptureSource && (
        <>
          <p id={captureSourceLabelId} className="mt-4 text-sm font-semibold text-gray-900">
            {copy.captureSourceLabel}
          </p>
          <div
            role="radiogroup"
            aria-labelledby={captureSourceLabelId}
            data-qa="live-demo-capture-source"
            className="mt-2 space-y-2"
          >
            <CaptureSourceRadioOption
              source="microphone"
              icon={Mic}
              label={copy.captureSourceMicrophoneLabel}
              selected={captureSource === 'microphone'}
              onSelect={onSelectCaptureSource}
            />
            <CaptureSourceRadioOption
              source="device_audio"
              icon={MonitorSpeaker}
              label={copy.captureSourceDeviceAudioLabel}
              selected={captureSource === 'device_audio'}
              onSelect={onSelectCaptureSource}
            />
          </div>
          {captureSource === 'device_audio' && (
            <p data-capture-source-hint className="mt-2 text-sm leading-relaxed text-gray-600">
              {copy.captureSourceDeviceAudioHint}
            </p>
          )}
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
