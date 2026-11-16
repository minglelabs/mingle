'use client'

import { useId, useState } from 'react'
import { Headphones, Mic, MonitorSpeaker, Smartphone } from 'lucide-react'
import { CaptureSourceRadioOption } from './EarphoneModeNotice'
import { MicrophoneRadioOption } from './EarphoneMicrophoneNotice'
import type { LivePhoneDemoEarphoneModeCopy } from '@/i18n/live-phone-demo-earphone-mode-copy'
import type { SttCaptureSource } from '@/lib/native-device-audio'
import {
  DEFAULT_EARPHONE_MICROPHONE_PICK,
  type EarphoneMicrophonePick,
} from '@/lib/native-earphone-microphone'

export type EarphoneListeningNoticeResult = {
  source: SttCaptureSource
  microphonePick: EarphoneMicrophonePick
}

// Shown once per earphone connection, when STT listens with them in (see
// resolveEarphoneListeningNotice). Both parts start on the last answer. Up
// to two parts in one modal:
// - the phone's microphone still listens, with Change to pick the earphones';
// - other apps' sound now plays in the earphones only: keep the microphone
//   (first time) or translate this device's sound too.
export default function EarphoneCaptureSourceNoticeContent({
  copy,
  deviceAudioViaBroadcast = false,
  showMicrophone = false,
  showCaptureSource = true,
  initialSource = 'microphone',
  initialMicrophonePick = DEFAULT_EARPHONE_MICROPHONE_PICK,
  onConfirm,
}: {
  copy: LivePhoneDemoEarphoneModeCopy
  deviceAudioViaBroadcast?: boolean
  showMicrophone?: boolean
  showCaptureSource?: boolean
  initialSource?: SttCaptureSource
  initialMicrophonePick?: EarphoneMicrophonePick
  onConfirm: (result: EarphoneListeningNoticeResult) => void
}) {
  const sourceLabelId = useId()
  const microphoneLabelId = useId()
  const [source, setSource] = useState<SttCaptureSource>(initialSource)
  const [microphonePick, setMicrophonePick] = useState<EarphoneMicrophonePick>(initialMicrophonePick)
  // Last time the earphones were picked: show the choice, not the phone line.
  const [microphoneChoiceOpen, setMicrophoneChoiceOpen] = useState(initialMicrophonePick === 'earphone')
  return (
    <div data-qa="live-demo-earphone-capture-source-notice">
      <h2 className="text-xl font-bold leading-tight text-gray-900">{copy.earphoneCaptureNoticeTitle}</h2>
      {showMicrophone && (
        <div data-earphone-microphone-hint>
          <p id={microphoneLabelId} className="mt-1.5 text-sm leading-relaxed text-gray-600">
            {initialMicrophonePick === 'earphone' ? copy.microphoneMenuLabel : copy.microphoneHint}
            {!microphoneChoiceOpen && (
              <>
                {' · '}
                <button
                  type="button"
                  data-earphone-microphone-change
                  onClick={() => setMicrophoneChoiceOpen(true)}
                  className="font-semibold text-amber-600 underline-offset-2 hover:underline"
                >
                  {copy.microphoneHintChangeLabel}
                </button>
              </>
            )}
          </p>
          {microphoneChoiceOpen && (
            <div role="radiogroup" aria-labelledby={microphoneLabelId} className="mt-2 space-y-2">
              <MicrophoneRadioOption
                pick="phone"
                icon={Smartphone}
                label={copy.microphonePhoneLabel}
                description={copy.microphonePhoneDescription}
                selected={microphonePick === 'phone'}
                onSelect={setMicrophonePick}
              />
              <MicrophoneRadioOption
                pick="earphone"
                icon={Headphones}
                label={copy.microphoneEarphoneLabel}
                description={copy.microphoneEarphoneDescription}
                selected={microphonePick === 'earphone'}
                onSelect={setMicrophonePick}
              />
            </div>
          )}
        </div>
      )}
      {showCaptureSource && (
        <>
          <p className={`${showMicrophone ? 'mt-3' : 'mt-1.5'} text-sm leading-relaxed text-gray-600`}>
            {copy.earphoneCaptureNoticeBody}
          </p>
          <p id={sourceLabelId} className="mt-4 text-sm font-semibold text-gray-900">
            {copy.captureSourceLabel}
          </p>
          <div role="radiogroup" aria-labelledby={sourceLabelId} className="mt-2 space-y-2">
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
        </>
      )}
      <button
        type="button"
        data-earphone-capture-source-confirm
        onClick={() => onConfirm({ source: showCaptureSource ? source : 'microphone', microphonePick })}
        className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg text-sm font-semibold text-white transition-colors"
        style={{ backgroundImage: 'linear-gradient(90deg, #f59e0b 0%, #f97316 100%)' }}
      >
        {copy.noticeConfirmLabel}
      </button>
    </div>
  )
}
