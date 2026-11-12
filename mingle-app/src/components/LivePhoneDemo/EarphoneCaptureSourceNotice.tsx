'use client'

import { useId, useState } from 'react'
import { Mic, MonitorSpeaker } from 'lucide-react'
import { CaptureSourceRadioOption } from './EarphoneModeNotice'
import type { LivePhoneDemoEarphoneModeCopy } from '@/i18n/live-phone-demo-earphone-mode-copy'
import type { SttCaptureSource } from '@/lib/native-device-audio'

// Asked when earphones go in while a microphone-only session runs: other
// apps' sound has moved into the earphones, out of the microphone's reach.
// Same choice and hint as page 2 of the earphone-mode notice, with the same
// default (this device's sound too).
export default function EarphoneCaptureSourceNoticeContent({
  copy,
  deviceAudioViaBroadcast = false,
  initialSource = 'device_audio',
  onConfirm,
}: {
  copy: LivePhoneDemoEarphoneModeCopy
  deviceAudioViaBroadcast?: boolean
  initialSource?: SttCaptureSource
  onConfirm: (source: SttCaptureSource) => void
}) {
  const labelId = useId()
  const [source, setSource] = useState<SttCaptureSource>(initialSource)
  return (
    <div data-qa="live-demo-earphone-capture-source-notice">
      <h2 className="text-xl font-bold leading-tight text-gray-900">{copy.earphoneCaptureNoticeTitle}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{copy.earphoneCaptureNoticeBody}</p>
      <p id={labelId} className="mt-4 text-sm font-semibold text-gray-900">
        {copy.captureSourceLabel}
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="mt-2 space-y-2">
        <CaptureSourceRadioOption
          source="microphone"
          icon={Mic}
          label={copy.captureSourceMicrophoneLabel}
          selected={source === 'microphone'}
          onSelect={setSource}
        />
        <CaptureSourceRadioOption
          source="device_audio"
          icon={MonitorSpeaker}
          label={copy.captureSourceDeviceAudioLabel}
          selected={source === 'device_audio'}
          onSelect={setSource}
        />
      </div>
      {source === 'device_audio' && (
        <p data-capture-source-hint className="mt-2 text-sm leading-relaxed text-gray-600">
          {deviceAudioViaBroadcast ? copy.captureSourceDeviceAudioHintIos : copy.captureSourceDeviceAudioHint}
        </p>
      )}
      <button
        type="button"
        data-earphone-capture-source-confirm
        onClick={() => onConfirm(source)}
        className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg text-sm font-semibold text-white transition-colors"
        style={{ backgroundImage: 'linear-gradient(90deg, #f59e0b 0%, #f97316 100%)' }}
      >
        {copy.noticeConfirmLabel}
      </button>
    </div>
  )
}
