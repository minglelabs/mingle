'use client'

import { useId, useState } from 'react'
import { Check, HeadphoneOff, Headphones, Mic, MonitorSpeaker, type LucideIcon } from 'lucide-react'
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

// Notice header, the same on both pages: a large title, the one-line rule
// (earphones or a headset only) and the live earphone connection state.
function EarphoneModeNoticeHeader({
  copy,
  earphonesConnected,
  stepLabel,
}: {
  copy: LivePhoneDemoEarphoneModeCopy
  earphonesConnected: boolean
  stepLabel: string | null
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-bold leading-tight text-gray-900">{copy.label}</h2>
        {stepLabel && (
          <span data-earphone-mode-notice-step-indicator className="mt-1 shrink-0 text-xs font-semibold text-gray-500">
            {stepLabel}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{copy.noticeBody}</p>
      <div
        data-earphone-status={earphonesConnected ? 'connected' : 'disconnected'}
        role="status"
        className={`mt-3 flex items-center gap-3 rounded-2xl border px-3.5 py-3 ${
          earphonesConnected
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-gray-200 bg-gray-50 text-gray-500'
        }`}
      >
        <span className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          earphonesConnected ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-400'
        }`}>
          {earphonesConnected
            ? <Headphones size={20} strokeWidth={2.15} />
            : <HeadphoneOff size={20} strokeWidth={2.15} />}
          <span
            aria-hidden="true"
            className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white ${
              earphonesConnected ? 'bg-emerald-400' : 'bg-gray-300'
            }`}
          />
        </span>
        <span className="text-[0.98rem] font-semibold">
          {earphonesConnected ? copy.earphoneStatusConnectedLabel : copy.earphoneStatusDisconnectedLabel}
        </span>
      </div>
    </div>
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
  deviceAudioViaBroadcast = false,
  onConfirm,
  coinCostNotice,
  initialStep = 1,
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
  // iOS captures through a screen broadcast; the hint under the choice
  // explains its sheet.
  deviceAudioViaBroadcast?: boolean
  onConfirm: () => void
  // Coins: reading translations aloud costs more than recognition alone. Null while billing is off.
  coinCostNotice?: string | null
  // Which page opens first (tests render page 2 directly).
  initialStep?: 1 | 2
}) {
  const languageListLabelId = useId()
  const captureSourceLabelId = useId()
  // With a capture-source choice the notice has two pages: the read language
  // first, then what to translate. Picks survive going back and forth.
  const hasCaptureSourceStep = Boolean(captureSource && onSelectCaptureSource)
  const totalSteps = hasCaptureSourceStep ? 2 : 1
  const [step, setStep] = useState<1 | 2>(hasCaptureSourceStep ? initialStep : 1)
  const currentStep = hasCaptureSourceStep ? step : 1

  if (currentStep === 2 && captureSource && onSelectCaptureSource) {
    return (
      <div data-qa="live-demo-earphone-mode-notice" data-earphone-mode-notice-step="2">
        <EarphoneModeNoticeHeader copy={copy} earphonesConnected={earphonesConnected} stepLabel={`2/${totalSteps}`} />
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
            {deviceAudioViaBroadcast ? copy.captureSourceDeviceAudioHintIos : copy.captureSourceDeviceAudioHint}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            data-earphone-mode-notice-back
            onClick={() => setStep(1)}
            className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            {copy.noticeBackLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex h-10 flex-1 items-center justify-center rounded-lg text-sm font-semibold text-white transition-colors"
            style={{ backgroundImage: 'linear-gradient(90deg, #f59e0b 0%, #f97316 100%)' }}
          >
            {copy.noticeConfirmLabel}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div data-qa="live-demo-earphone-mode-notice" data-earphone-mode-notice-step="1">
      <EarphoneModeNoticeHeader
        copy={copy}
        earphonesConnected={earphonesConnected}
        stepLabel={hasCaptureSourceStep ? `1/${totalSteps}` : null}
      />
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
        data-earphone-mode-notice-next={hasCaptureSourceStep ? '' : undefined}
        onClick={hasCaptureSourceStep ? () => setStep(2) : onConfirm}
        className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg text-sm font-semibold text-white transition-colors"
        style={{ backgroundImage: 'linear-gradient(90deg, #f59e0b 0%, #f97316 100%)' }}
      >
        {hasCaptureSourceStep ? copy.noticeNextLabel : copy.noticeConfirmLabel}
      </button>
    </div>
  )
}
