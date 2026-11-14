'use client'

import { useId, useState } from 'react'
import { Check, Headphones, Smartphone, type LucideIcon } from 'lucide-react'
import type { LivePhoneDemoEarphoneModeCopy } from '@/i18n/live-phone-demo-earphone-mode-copy'
import {
  DEFAULT_EARPHONE_MICROPHONE_PICK,
  type EarphoneMicrophonePick,
} from '@/lib/native-earphone-microphone'

function MicrophoneRadioOption({
  pick,
  icon: Icon,
  label,
  description,
  selected,
  onSelect,
}: {
  pick: EarphoneMicrophonePick
  icon: LucideIcon
  label: string
  description: string
  selected: boolean
  onSelect: (pick: EarphoneMicrophonePick) => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-earphone-microphone={pick}
      onClick={() => onSelect(pick)}
      className={`flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80 ${
        selected
          ? 'border-amber-300 bg-amber-50/70'
          : 'border-gray-200 bg-white hover:bg-gray-50'
      }`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-50 text-gray-600">
        <Icon size={20} strokeWidth={2.15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.98rem] font-semibold text-gray-900">{label}</span>
        <span className="mt-0.5 block text-xs leading-snug text-gray-500">{description}</span>
      </span>
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
        selected ? 'bg-amber-500 text-white' : 'bg-gray-100 text-transparent'
      }`}>
        <Check size={14} strokeWidth={2.8} />
      </span>
    </button>
  )
}

// Asked once, the first time earphones are in: record from the phone (the
// default, so the people around are heard) or from the earphones.
export default function EarphoneMicrophoneNoticeContent({
  copy,
  initialPick = DEFAULT_EARPHONE_MICROPHONE_PICK,
  onConfirm,
}: {
  copy: LivePhoneDemoEarphoneModeCopy
  initialPick?: EarphoneMicrophonePick
  onConfirm: (pick: EarphoneMicrophonePick) => void
}) {
  const titleId = useId()
  const [pick, setPick] = useState<EarphoneMicrophonePick>(initialPick)
  return (
    <div data-qa="live-demo-earphone-microphone-notice">
      <h2 id={titleId} className="text-xl font-bold leading-tight text-gray-900">
        {copy.microphoneNoticeTitle}
      </h2>
      <div role="radiogroup" aria-labelledby={titleId} className="mt-4 space-y-2">
        <MicrophoneRadioOption
          pick="phone"
          icon={Smartphone}
          label={copy.microphonePhoneLabel}
          description={copy.microphonePhoneDescription}
          selected={pick === 'phone'}
          onSelect={setPick}
        />
        <MicrophoneRadioOption
          pick="earphone"
          icon={Headphones}
          label={copy.microphoneEarphoneLabel}
          description={copy.microphoneEarphoneDescription}
          selected={pick === 'earphone'}
          onSelect={setPick}
        />
      </div>
      <button
        type="button"
        data-earphone-microphone-confirm
        onClick={() => onConfirm(pick)}
        className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg text-sm font-semibold text-white transition-colors"
        style={{ backgroundImage: 'linear-gradient(90deg, #f59e0b 0%, #f97316 100%)' }}
      >
        {copy.noticeConfirmLabel}
      </button>
    </div>
  )
}
